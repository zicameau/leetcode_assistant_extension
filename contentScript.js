// Utility to parse LeetCode problem info from current URL and DOM
function getProblemInfoFromLocation() {
  const url = new URL(window.location.href);

  // Normalize hostname for leetcode.com / leetcode.cn and subdomains
  const hostname = url.hostname;

  // Supported URL patterns to extract slug
  // Examples:
  // - https://leetcode.com/problems/two-sum/
  // - https://leetcode.com/problems/two-sum/description/
  // - https://leetcode.com/problems/two-sum/solutions/...
  // - https://leetcode.cn/problems/two-sum/
  // - https://leetcode.com/studyplan/.../problems/two-sum/ (fallback by DOM)
  let slug = null;

  const path = url.pathname.replace(/\/+$/, ""); // trim trailing slash
  const parts = path.split("/").filter(Boolean);

  // Primary pattern: /problems/<slug>(/*)?
  const problemsIdx = parts.indexOf("problems");
  if (problemsIdx !== -1 && parts.length > problemsIdx + 1) {
    slug = parts[problemsIdx + 1];
  }

  // Fallback: GitHub-like discuss URL sometimes embeds slug differently; try DOM
  if (!slug) {
    const anchor = document.querySelector('a[href^="/problems/"]');
    if (anchor) {
      const m = anchor.getAttribute("href").match(/^\/problems\/([^\/]+)/);
      if (m) slug = m[1];
    }
  }

  // Try to get questionId from JSON embedded in the page if available (LeetCode often exposes this via Apollo/Next data or script tags)
  let questionId = null;
  try {
    // Approach 1: Look for a script tag containing __NEXT_DATA__ with questionId
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (nextDataEl?.textContent) {
      const nextData = JSON.parse(nextDataEl.textContent);
      // Known paths may vary; attempt common locations
      const possibleObjects = [
        nextData?.props?.pageProps?.dehydratedState,
        nextData?.props?.pageProps,
        nextData?.query,
      ].filter(Boolean);

      for (const obj of possibleObjects) {
        const jsonStr = JSON.stringify(obj);
        const idMatch = jsonStr.match(/"questionId"\s*:\s*"?(\d+)"?/);
        if (idMatch) {
          questionId = idMatch[1];
          break;
        }
      }
    }
  } catch (_) {
    // best-effort
  }

  return { slug, questionId, hostname, url: url.toString() };
}

function shallowEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

let lastDetected = null;

function detectAndNotify() {
  const info = getProblemInfoFromLocation();
  if (!info.slug) return; // not on a problem page
  if (shallowEqual(lastDetected, info)) return;
  lastDetected = info;

  // For now, just log to the console; later we can message background/popup
  console.log("LeetCode problem detected", info);

  // Example: send to extension runtime if needed
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "leetcodeProblemDetected", payload: info });
    // Also persist directly to storage for fast reads from side panel
    try { chrome.storage?.local?.set({ leetcodeProblem: info }); } catch (_) {}
  }
}

// Initial detection after DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", detectAndNotify, { once: true });
} else {
  detectAndNotify();
}

// Handle SPA navigations: intercept pushState/replaceState and popstate
(function patchHistoryMethods() {
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function patchedPushState(state, title, url) {
    const result = origPushState.apply(this, arguments);
    queueMicrotask(detectAndNotify);
    return result;
  };
  history.replaceState = function patchedReplaceState(state, title, url) {
    const result = origReplaceState.apply(this, arguments);
    queueMicrotask(detectAndNotify);
    return result;
  };
  window.addEventListener("popstate", () => {
    queueMicrotask(detectAndNotify);
  });
})();

// Also observe URL changes via MutationObserver as a backup when the app rerenders without history changes
const mo = new MutationObserver(() => detectAndNotify());
mo.observe(document.documentElement, { childList: true, subtree: true });


// ================= Selection Helper Overlay =================
// A lightweight floating button that appears near current selection to send text
// to the assistant. It stays non-intrusive and hides on clear/scroll.

let overlayBtn = null;
let overlayVisible = false;
let overlayHideTimer = null;

function ensureOverlay() {
  if (overlayBtn) return overlayBtn;
  overlayBtn = document.createElement("button");
  overlayBtn.type = "button";
  overlayBtn.textContent = "💬 Ask"; // compact label; can be A/B tested
  overlayBtn.setAttribute("aria-label", "Ask assistant about selection");
  overlayBtn.style.position = "fixed";
  overlayBtn.style.zIndex = "2147483646"; // just below devtools 2147483647
  overlayBtn.style.padding = "6px 8px";
  overlayBtn.style.fontSize = "12px";
  overlayBtn.style.border = "1px solid rgba(0,0,0,0.15)";
  overlayBtn.style.borderRadius = "8px";
  overlayBtn.style.boxShadow = "0 2px 10px rgba(0,0,0,0.15)";
  overlayBtn.style.background = "rgba(30, 30, 30, 0.9)";
  overlayBtn.style.color = "#fff";
  overlayBtn.style.cursor = "pointer";
  overlayBtn.style.userSelect = "none";
  overlayBtn.style.display = "none";
  overlayBtn.style.transform = "translate(-50%, -120%)"; // anchor above center
  overlayBtn.style.backdropFilter = "saturate(120%) blur(2px)";
  overlayBtn.style.transition = "opacity 120ms ease";
  overlayBtn.style.opacity = "0";
  overlayBtn.tabIndex = 0;
  overlayBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      overlayBtn.click();
    }
  });

  overlayBtn.addEventListener("mousedown", (e) => {
    // prevent selection from collapsing before we read it
    e.preventDefault();
  });

  overlayBtn.addEventListener("click", async () => {
    const selected = getSelectedText();
    if (!selected) return hideOverlay();
    const info = getProblemInfoFromLocation();
    const payload = {
      text: selected.slice(0, 20000), // safety cap
      problem: info,
      sourceUrl: location.href,
      ts: Date.now(),
    };
    // Visual feedback
    overlayBtn.textContent = "⏳";
    try {
      chrome.runtime?.sendMessage?.({ type: "leetcodeSelection", payload }, () => {
        // Reset label regardless of delivery path
        overlayBtn.textContent = "✔";
        setTimeout(hideOverlay, 500);
      });
    } catch (_) {
      overlayBtn.textContent = "!";
      setTimeout(hideOverlay, 800);
    }
  });

  document.documentElement.appendChild(overlayBtn);
  return overlayBtn;
}

function getSelectionRect() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return rect;
}

function getSelectedText() {
  const sel = window.getSelection();
  if (!sel) return "";
  return sel.toString().trim();
}

function positionOverlayNearSelection() {
  const rect = getSelectionRect();
  if (!rect) return hideOverlay();
  const btn = ensureOverlay();
  const x = rect.left + rect.width / 2;
  const y = rect.top; // above selection
  btn.style.left = `${Math.min(Math.max(x, 8), window.innerWidth - 8)}px`;
  btn.style.top = `${Math.min(Math.max(y, 8), window.innerHeight - 8)}px`;
  if (!overlayVisible) {
    btn.style.display = "block";
    requestAnimationFrame(() => {
      btn.style.opacity = "1";
    });
    overlayVisible = true;
  }
}

function hideOverlay() {
  if (!overlayBtn || !overlayVisible) return;
  overlayVisible = false;
  overlayBtn.style.opacity = "0";
  clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(() => {
    if (overlayBtn) overlayBtn.style.display = "none";
  }, 130);
}

function maybeShowOverlay() {
  const text = getSelectedText();
  if (!text) return hideOverlay();
  // Filter very short selections (single punctuation/whitespace)
  if (text.replace(/\s/g, "").length < 2) return hideOverlay();
  positionOverlayNearSelection();
}

document.addEventListener("selectionchange", () => {
  // Debounce the reaction a bit for rapid changes
  clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(maybeShowOverlay, 60);
});

document.addEventListener("mouseup", () => {
  setTimeout(maybeShowOverlay, 0);
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Escape") hideOverlay();
});

window.addEventListener("scroll", () => {
  if (overlayVisible) positionOverlayNearSelection();
}, { passive: true });

