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


