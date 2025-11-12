console.log("✅ LeetCode Assistant: contentScript.js loaded at", window.location.href);

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
  overlayBtn.textContent = "💬 Ask Assistant";
  overlayBtn.setAttribute("aria-label", "Ask assistant about selection");
  overlayBtn.style.position = "fixed";
  overlayBtn.style.zIndex = "2147483646";
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
  overlayBtn.style.transform = "translate(0, 0)";
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
    e.preventDefault();
  });

  overlayBtn.addEventListener("click", async () => {
    const selected = getSelectedText();
    if (!selected) return hideOverlay();
    const info = getProblemInfoFromLocation();
    const payload = {
      text: selected.slice(0, 20000),
      problem: info,
      sourceUrl: location.href,
      ts: Date.now(),
    };
    console.log("📤 Sending selection to text box:", payload);
    try {
      chrome.runtime?.sendMessage?.({ type: "leetcodeSelectionToTextBox", payload }, (response) => {
        console.log("📥 Response from background:", response);
        if (chrome.runtime.lastError) {
          console.error("❌ Runtime error:", chrome.runtime.lastError);
        }
        // Hide overlay immediately after sending
        hideOverlay();
      });
    } catch (err) {
      console.error("❌ Error sending message:", err);
      hideOverlay();
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
  
  // If rect has zero dimensions, try alternative methods for code editors
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    // Try to get client rects (works better with code editors)
    const rects = range.getClientRects();
    if (rects && rects.length > 0) {
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.width > 0 || r.height > 0) {
          return r;
        }
      }
    }
    
    // Fallback: try to find Monaco editor and use its position
    const monacoEditor = document.querySelector('.monaco-editor .view-lines');
    if (monacoEditor) {
      const monacoRect = monacoEditor.getBoundingClientRect();
      if (monacoRect.width > 0 && monacoRect.height > 0) {
        // Return a rect in the middle of the editor
        return {
          left: monacoRect.left + monacoRect.width / 2 - 50,
          top: monacoRect.top + monacoRect.height / 2 - 10,
          width: 100,
          height: 20,
          right: monacoRect.left + monacoRect.width / 2 + 50,
          bottom: monacoRect.top + monacoRect.height / 2 + 10
        };
      }
    }
    
    return null;
  }
  
  return rect;
}

function getSelectedText() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const text = sel.toString();
  // Return the text even if it's just whitespace - let the overlay decide
  return text;
}

function positionOverlayNearSelection() {
  const rect = getSelectionRect();
  if (!rect) return hideOverlay();
  const btn = ensureOverlay();
  
  // Position at bottom-right of selection with minimal gap
  const x = rect.right;
  const y = rect.bottom;
  
  const buttonWidth = 130; // Approximate width of "💬 Ask Assistant" button
  const buttonHeight = 32;
  const horizontalGap = 8; // Gap from right edge
  const verticalGap = -4; // Slight overlap to keep it close
  
  // Position button at bottom-right, slightly overlapping the selection
  // Ensure it stays within viewport bounds
  const finalX = Math.min(Math.max(x - buttonWidth - horizontalGap, 8), window.innerWidth - buttonWidth - 8);
  const finalY = Math.min(Math.max(y + verticalGap, 8), window.innerHeight - buttonHeight - 8);
  
  btn.style.left = `${finalX}px`;
  btn.style.top = `${finalY}px`;
  
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
  
  // Check if there's any meaningful content (not just whitespace)
  const trimmedText = text.trim();
  if (trimmedText.length === 0) return hideOverlay();
  
  // Show overlay for any meaningful text selection
  positionOverlayNearSelection();
}

document.addEventListener("selectionchange", () => {
  clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(maybeShowOverlay, 60);
});

document.addEventListener("mouseup", () => {
  setTimeout(maybeShowOverlay, 0);
});

// Additional event listeners for code editors
document.addEventListener("mouseup", (e) => {
  // Check if we're in a code editor area
  const isCodeEditor = e.target.closest('[data-cy="code-editor"], .monaco-editor, .CodeMirror, [role="textbox"]');
  if (isCodeEditor) {
    console.log("📝 Code editor mouseup detected");
    // Use a longer delay for code editors to ensure selection is processed
    setTimeout(maybeShowOverlay, 150);
  }
}, true); // Use capture phase

// Additional event listeners to catch more selection scenarios
document.addEventListener("mousedown", () => {
  // Clear any pending hide timer when user starts selecting
  clearTimeout(overlayHideTimer);
});

// Listen for keyboard selection (Shift + arrow keys, etc.)
document.addEventListener("keyup", (e) => {
  if (e.key === "Escape") {
    hideOverlay();
  } else if (e.shiftKey || e.ctrlKey || e.metaKey) {
    // User might be selecting with keyboard
    setTimeout(maybeShowOverlay, 50);
  }
});

// Periodic check to ensure overlay shows up (fallback for edge cases)
setInterval(() => {
  const text = getSelectedText();
  if (text && text.trim().length > 0 && !overlayVisible) {
    console.log("🔄 Periodic check: showing overlay for selection");
    maybeShowOverlay();
  }
}, 500);

window.addEventListener("scroll", () => {
  if (overlayVisible) positionOverlayNearSelection();
}, { passive: true });

// Global debug function
window.debugLeetCodeAssistant = function() {
  console.log("🔧 Manual debug trigger");
  const sel = window.getSelection();
  console.log("Current selection:", {
    exists: !!sel,
    text: sel?.toString() || "none",
    rangeCount: sel?.rangeCount || 0,
    isCollapsed: sel?.isCollapsed
  });
  
  maybeShowOverlay();
  
  const overlay = document.querySelector('button[aria-label="Ask assistant about selection"]');
  console.log("Overlay button exists:", !!overlay);
  if (overlay) {
    console.log("Overlay visible:", overlay.style.display !== "none");
    console.log("Overlay opacity:", overlay.style.opacity);
  }
};

console.log("🛠️ Debug function available: window.debugLeetCodeAssistant()");

// ================= Editor Code Capture Bridge =================
// Load a page-context script via src to satisfy CSP and access Monaco APIs.

(function injectEditorBridge() {
  try {
    const existing = document.getElementById('leetcode-editor-bridge');
    if (existing) return;
    const s = document.createElement('script');
    s.id = 'leetcode-editor-bridge';
    s.src = chrome.runtime.getURL('pageBridge.js');
    s.async = false;
    (document.head || document.documentElement).appendChild(s);
  } catch (_) {}
})();

function requestEditorCode({ timeoutMs = 1500 } = {}) {
  return new Promise((resolve, reject) => {
    const requestId = Math.random().toString(36).slice(2);
    let done = false;
    function cleanup() {
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
    }
    function onMessage(evt) {
      const data = evt?.data;
      if (!data || data.type !== 'leetcodeCodeResponse' || data.requestId !== requestId) return;
      done = true;
      cleanup();
      if (data.ok) {
        resolve({ code: data.code || '', language: data.language || null, source: data.source || null, length: data.length || 0 });
      } else {
        reject(new Error(data.error || 'Failed to capture code'));
      }
    }
    const timer = setTimeout(() => {
      if (done) return;
      cleanup();
      reject(new Error('Timed out capturing code'));
    }, timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ type: 'leetcodeCodeRequest', requestId }, '*');
  });
}

// Handle messages from extension asking for editor code
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'getLeetcodeCode') {
      (async () => {
        try {
          const res = await requestEditorCode({ timeoutMs: 2000 });
          sendResponse(res);
        } catch (err) {
          sendResponse({ error: String(err && err.message || err) });
        }
      })();
      return true; // async
    }
    return false;
  });
} catch (_) {}

// Expose a debug hook to test code capture from the page DevTools console
window.debugLeetCodeEditorCapture = async function() {
  try {
    const res = await requestEditorCode({ timeoutMs: 2000 });
    console.log('🧪 Captured editor code:', { language: res.language, length: res.length, preview: (res.code || '').slice(0, 200) });
    return res;
  } catch (err) {
    console.warn('🧪 Failed to capture editor code:', err);
    return null;
  }
};