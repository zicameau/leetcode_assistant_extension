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
let lastMousePosition = { x: 0, y: 0 };

function ensureOverlay() {
  if (overlayBtn) {
    console.log("🔘 Using existing overlay button");
    return overlayBtn;
  }
  
  console.log("🔧 Creating new overlay button");
  overlayBtn = document.createElement("button");
  overlayBtn.type = "button";
  overlayBtn.textContent = "💬 Ask Assistant"; // more descriptive label
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
  console.log("📐 getSelectionRect called, selection:", {
    exists: !!sel,
    rangeCount: sel?.rangeCount || 0,
    isCollapsed: sel?.isCollapsed
  });
  
  if (!sel || sel.rangeCount === 0) {
    console.log("❌ No selection or no ranges");
    return null;
  }
  
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  console.log("📐 Range rect:", {
    rect: rect,
    width: rect.width,
    height: rect.height,
    left: rect.left,
    top: rect.top
  });
  
  // If rect has zero dimensions, try alternative methods
  if (!rect || (rect.width === 0 && rect.height === 0)) {
    console.log("⚠️ Zero dimensions, trying alternative methods...");
    
    // Method 1: Try to get rects from all ranges
    const rects = range.getClientRects();
    console.log("📐 Client rects:", rects);
    
    if (rects && rects.length > 0) {
      // Use the first non-zero rect
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.width > 0 || r.height > 0) {
          console.log("✅ Found valid client rect:", r);
          return r;
        }
      }
    }
    
    // Method 2: Try to get the container element and use its position
    const container = range.commonAncestorContainer;
    console.log("📐 Container:", container);
    
    if (container && container.nodeType === Node.ELEMENT_NODE) {
      const containerRect = container.getBoundingClientRect();
      console.log("📐 Container rect:", containerRect);
      
      if (containerRect.width > 0 && containerRect.height > 0) {
        // Use container position as fallback
        console.log("✅ Using container rect as fallback");
        return {
          left: containerRect.left,
          top: containerRect.top,
          width: Math.max(containerRect.width, 100), // minimum width
          height: Math.max(containerRect.height, 20), // minimum height
          right: containerRect.right,
          bottom: containerRect.bottom
        };
      }
    }
    
    // Method 3: Try to find the active element (cursor position)
    const activeElement = document.activeElement;
    if (activeElement && activeElement.getBoundingClientRect) {
      const activeRect = activeElement.getBoundingClientRect();
      console.log("📐 Active element rect:", activeRect);
      
      if (activeRect.width > 0 && activeRect.height > 0) {
        console.log("✅ Using active element rect as fallback");
        return {
          left: activeRect.left,
          top: activeRect.top,
          width: Math.max(activeRect.width, 100),
          height: Math.max(activeRect.height, 20),
          right: activeRect.right,
          bottom: activeRect.bottom
        };
      }
    }
    
    console.log("❌ All methods failed - no valid rect found");
    return null;
  }
  
  console.log("✅ Valid selection rect found");
  return rect;
}

function getSelectedText() {
  const sel = window.getSelection();
  if (!sel) {
    console.log("❌ No selection object");
    return "";
  }
  
  const text = sel.toString().trim();
  console.log("📝 getSelectedText result:", {
    hasSelection: !!text,
    text: text.slice(0, 30) + (text.length > 30 ? "..." : ""),
    rangeCount: sel.rangeCount,
    isCollapsed: sel.isCollapsed
  });
  
  return text;
}

function positionOverlayNearSelection() {
  const rect = getSelectionRect();
  console.log("🎯 positionOverlayNearSelection called, rect:", rect);
  
  if (!rect) {
    console.log("❌ No selection rect, hiding overlay");
    return hideOverlay();
  }
  
  const btn = ensureOverlay();
  console.log("🔘 Overlay button created/found:", !!btn);
  
  // Calculate position relative to viewport
  const x = rect.left + rect.width / 2;
  const y = rect.top; // above selection
  
  // Ensure button stays within viewport bounds
  const buttonWidth = 80; // approximate button width
  const buttonHeight = 32; // approximate button height
  
  const finalX = Math.min(Math.max(x - buttonWidth/2, 8), window.innerWidth - buttonWidth - 8);
  const finalY = Math.max(y - buttonHeight - 4, 8); // 4px gap above selection
  
  btn.style.left = `${finalX}px`;
  btn.style.top = `${finalY}px`;
  
  // Debug positioning for code blocks
  console.log("📍 Positioning overlay:", {
    selectionRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    finalPosition: { x: finalX, y: finalY },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    buttonStyles: {
      display: btn.style.display,
      opacity: btn.style.opacity,
      left: btn.style.left,
      top: btn.style.top
    }
  });
  
  if (!overlayVisible) {
    console.log("👁️ Making overlay visible");
    btn.style.display = "block";
    requestAnimationFrame(() => {
      btn.style.opacity = "1";
      console.log("✨ Overlay should now be visible");
    });
    overlayVisible = true;
  } else {
    console.log("👁️ Overlay already visible, just repositioning");
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
  // But allow single characters for code (like variable names)
  const cleanText = text.replace(/\s/g, "");
  if (cleanText.length < 1) return hideOverlay();
  
  // Debug logging for code selections
  console.log("🔍 Selection detected:", {
    text: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
    length: text.length,
    cleanLength: cleanText.length,
    isCode: /[{}();=<>]/.test(text) || text.includes('\n') || text.includes('\t')
  });
  
  // Try to position overlay, but if it fails, try alternative positioning
  const rect = getSelectionRect();
  if (!rect) {
    console.log("⚠️ No selection rect, trying alternative positioning...");
    
    // Alternative 1: Use mouse position (most accurate for user intent)
    if (lastMousePosition.x > 0 && lastMousePosition.y > 0) {
      console.log("📍 Using mouse position for positioning:", lastMousePosition);
      
      // Position the button near the mouse cursor, not at the top
      const fakeRect = {
        left: lastMousePosition.x - 60, // center around mouse
        top: lastMousePosition.y - 40,  // well above mouse to avoid overlap
        width: 120, // wider for "Ask Assistant" text
        height: 30,
        right: lastMousePosition.x + 60,
        bottom: lastMousePosition.y - 10
      };
      
      positionOverlayWithRect(fakeRect);
    } else {
      // Alternative 2: Use active element as last resort
      const activeElement = document.activeElement;
      if (activeElement && activeElement.getBoundingClientRect) {
        const activeRect = activeElement.getBoundingClientRect();
        console.log("📍 Using active element for positioning:", activeRect);
        
        // Position at the center of the active element, not the top
        const fakeRect = {
          left: activeRect.left + activeRect.width / 2 - 60,
          top: activeRect.top + activeRect.height / 2 - 40,
          width: 120, // wider for "Ask Assistant" text
          height: 30,
          right: activeRect.left + activeRect.width / 2 + 60,
          bottom: activeRect.top + activeRect.height / 2 - 10
        };
        
        positionOverlayWithRect(fakeRect);
      } else {
        console.log("❌ No fallback positioning available");
        return hideOverlay();
      }
    }
  } else {
    positionOverlayNearSelection();
  }
}

function positionOverlayWithRect(rect) {
  console.log("🎯 positionOverlayWithRect called, rect:", rect);
  
  const btn = ensureOverlay();
  console.log("🔘 Overlay button created/found:", !!btn);
  
  // Calculate position relative to viewport
  const x = rect.left + rect.width / 2;
  const y = rect.top; // above selection
  
  // Ensure button stays within viewport bounds
  const buttonWidth = 80; // approximate button width
  const buttonHeight = 32; // approximate button height
  
  const finalX = Math.min(Math.max(x - buttonWidth/2, 8), window.innerWidth - buttonWidth - 8);
  const finalY = Math.max(y - buttonHeight - 4, 8); // 4px gap above selection
  
  btn.style.left = `${finalX}px`;
  btn.style.top = `${finalY}px`;
  
  // Debug positioning
  console.log("📍 Positioning overlay with rect:", {
    selectionRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    finalPosition: { x: finalX, y: finalY },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    buttonStyles: {
      display: btn.style.display,
      opacity: btn.style.opacity,
      left: btn.style.left,
      top: btn.style.top
    }
  });
  
  if (!overlayVisible) {
    console.log("👁️ Making overlay visible");
    btn.style.display = "block";
    requestAnimationFrame(() => {
      btn.style.opacity = "1";
      console.log("✨ Overlay should now be visible");
    });
    overlayVisible = true;
  } else {
    console.log("👁️ Overlay already visible, just repositioning");
  }
}

// Enhanced selection detection for code editors
document.addEventListener("selectionchange", () => {
  console.log("🔄 Selection change event fired");
  // Debounce the reaction a bit for rapid changes
  clearTimeout(overlayHideTimer);
  overlayHideTimer = setTimeout(maybeShowOverlay, 60);
});

document.addEventListener("mouseup", (e) => {
  console.log("🖱️ Mouse up event fired", e.target);
  // Track mouse position for better fallback positioning
  lastMousePosition.x = e.clientX;
  lastMousePosition.y = e.clientY;
  console.log("📍 Mouse position recorded:", lastMousePosition);
  setTimeout(maybeShowOverlay, 0);
});

// Additional event listeners for code editors
document.addEventListener("mouseup", (e) => {
  // Track mouse position for better fallback positioning
  lastMousePosition.x = e.clientX;
  lastMousePosition.y = e.clientY;
  
  // Check if we're in a code editor area
  const isCodeEditor = e.target.closest('[data-cy="code-editor"], .monaco-editor, .CodeMirror, [role="textbox"]');
  if (isCodeEditor) {
    console.log("📝 Code editor mouseup detected at:", lastMousePosition);
    // Use a longer delay for code editors to ensure selection is processed
    setTimeout(maybeShowOverlay, 150);
  }
}, true); // Use capture phase

// Also track mousemove to get more accurate positioning
document.addEventListener("mousemove", (e) => {
  // Only update if we're in a code editor or text area
  const isCodeEditor = e.target.closest('[data-cy="code-editor"], .monaco-editor, .CodeMirror, [role="textbox"]');
  if (isCodeEditor) {
    lastMousePosition.x = e.clientX;
    lastMousePosition.y = e.clientY;
  }
});

document.addEventListener("keyup", (e) => {
  if (e.key === "Escape") hideOverlay();
});

window.addEventListener("scroll", () => {
  if (overlayVisible) positionOverlayNearSelection();
}, { passive: true });

// Global debug function - call this in console to test
window.debugLeetCodeAssistant = function() {
  console.log("🔧 Manual debug trigger");
  const sel = window.getSelection();
  console.log("Current selection:", {
    exists: !!sel,
    text: sel?.toString() || "none",
    rangeCount: sel?.rangeCount || 0,
    isCollapsed: sel?.isCollapsed,
    anchorNode: sel?.anchorNode,
    focusNode: sel?.focusNode
  });
  
  // Try to trigger overlay manually
  maybeShowOverlay();
  
  // Check if overlay exists
  const overlay = document.querySelector('button[aria-label="Ask assistant about selection"]');
  console.log("Overlay button exists:", !!overlay);
  if (overlay) {
    console.log("Overlay visible:", overlay.style.display !== "none");
    console.log("Overlay opacity:", overlay.style.opacity);
  }
};

console.log("🛠️ Debug function available: window.debugLeetCodeAssistant()");

