// Track side panel state
let sidePanelOpen = new Set();

// Track active LeetCode tabs
let activeLeetCodeTabs = new Set();
let currentActiveTab = null;

// Check if sidePanel API is available
function isSidePanelAvailable() {
  return chrome.sidePanel && typeof chrome.sidePanel.open === 'function';
}

// Check if a URL is a LeetCode URL
function isLeetCodeUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('leetcode.com') || urlObj.hostname.includes('leetcode.cn');
  } catch {
    return false;
  }
}

// Update active LeetCode tabs and manage storage based on current state
async function updateActiveLeetCodeTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    const leetCodeTabs = tabs.filter(tab => isLeetCodeUrl(tab.url));
    const leetCodeTabIds = new Set(leetCodeTabs.map(tab => tab.id));
    
    // Update our tracking set
    activeLeetCodeTabs = leetCodeTabIds;
    
    // Get the current active tab
    const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentActiveTab = activeTabs[0] || null;
    
    // Determine the current state
    const hasLeetCodeTabs = leetCodeTabIds.size > 0;
    const isOnLeetCodeTab = currentActiveTab && isLeetCodeUrl(currentActiveTab.url);
    
    console.log('Tab state update:', {
      hasLeetCodeTabs,
      isOnLeetCodeTab,
      currentActiveTabUrl: currentActiveTab?.url,
      leetCodeTabCount: leetCodeTabIds.size
    });
    
    if (!hasLeetCodeTabs) {
      // No LeetCode tabs at all - clear everything
      console.log('No LeetCode tabs active, clearing problem from storage');
      await chrome.storage.local.remove(['leetcodeProblem', 'tabState']);
    } else if (!isOnLeetCodeTab) {
      // Has LeetCode tabs but user is on a different tab
      console.log('User on non-LeetCode tab, storing "go back" state');
      await chrome.storage.local.set({ 
        tabState: { 
          hasLeetCodeTabs: true, 
          isOnLeetCodeTab: false,
          message: 'Go back to LeetCode'
        }
      });
    } else {
      // User is on a LeetCode tab - clear the tab state
      console.log('User on LeetCode tab, clearing tab state');
      await chrome.storage.local.remove(['tabState']);
    }
  } catch (error) {
    console.error('Error updating active LeetCode tabs:', error);
  }
}

// Handle extension icon click to toggle side panel
chrome.action.onClicked.addListener(async (tab) => {
  const tabId = tab.id;
  console.log('Extension icon clicked for tab:', tabId);
  
  if (!isSidePanelAvailable()) {
    console.log('SidePanel API not available, opening in new tab');
    // Fallback: open side panel in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('sidepanel.html'),
      active: true
    });
    return;
  }
  
  console.log('Current side panel state:', sidePanelOpen.has(tabId) ? 'Open' : 'Closed');
  
  try {
    if (sidePanelOpen.has(tabId)) {
      // Panel is open, close it
      console.log('Closing side panel...');
      await chrome.sidePanel.close({ tabId });
      sidePanelOpen.delete(tabId);
      console.log('Side panel closed');
    } else {
      // Panel is closed, open it
      console.log('Opening side panel...');
      await chrome.sidePanel.open({ tabId });
      sidePanelOpen.add(tabId);
      console.log('Side panel opened');
    }
  } catch (error) {
    console.error('Error toggling side panel:', error);
    // Fallback: open in new tab if side panel fails
    chrome.tabs.create({
      url: chrome.runtime.getURL('sidepanel.html'),
      active: true
    });
  }
});

// Listen for side panel events to track state (only if API is available)
if (isSidePanelAvailable() && chrome.sidePanel.onClosed) {
  chrome.sidePanel.onClosed.addListener(({ tabId }) => {
    sidePanelOpen.delete(tabId);
  });
}

// Listen for tab updates (URL changes, loading state changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when URL changes and tab is complete
  if (changeInfo.url && changeInfo.status === 'complete') {
    await updateActiveLeetCodeTabs();
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await updateActiveLeetCodeTabs();
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateActiveLeetCodeTabs();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  await updateActiveLeetCodeTabs();
});

// Initialize when extension is installed/enabled
chrome.runtime.onInstalled.addListener(async () => {
  await updateActiveLeetCodeTabs();
});

// Store last detected problem for sidepanel to read
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "leetcodeProblemDetected") {
    chrome.storage.local.set({ leetcodeProblem: message.payload });
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.type === "leetcodeSelectionToTextBox") {
    console.log("🔄 Background: Received leetcodeSelectionToTextBox message", message.payload);
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        console.log("🔄 Background: Tab ID:", tabId);
        // Store latest selection for the side panel to read
        await chrome.storage.local.set({ leetcodeLastSelection: message.payload });
        console.log("🔄 Background: Stored selection in storage");
        // Store a flag to indicate this is a text box population request
        await chrome.storage.local.set({ leetcodeSelectionToTextBox: true });
        
        // Check if side panel is already open for this tab
        if (isSidePanelAvailable() && sidePanelOpen.has(tabId)) {
          console.log("🔄 Background: Side panel already open, sending message directly");
          chrome.runtime.sendMessage({ type: 'leetcodeSelectionToTextBox' });
        } else {
          console.log("🔄 Background: Side panel not open, storing flag for when it opens");
          // Don't open anything - just store the flag
          // The side panel will check for this flag when it opens
        }
        sendResponse?.({ ok: true });
      } catch (err) {
        console.error("❌ Background: Error in leetcodeSelectionToTextBox handler:", err);
        sendResponse?.({ error: String(err?.message || err) });
      }
    })();
    return true;
  }
  if (message?.type === 'requestLeetcodeCode') {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) throw new Error('No active tab');
        const result = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, { type: 'getLeetcodeCode' }, (resp) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
            } else {
              resolve(resp);
            }
          });
        });
        if (result?.error) throw new Error(result.error);
        sendResponse?.(result || { code: '', language: null, length: 0 });
      } catch (err) {
        sendResponse?.({ error: String(err?.message || err) });
      }
    })();
    return true;
  }
  return false;
});

async function callOpenAI(messages) {
  const { openaiApiKey } = await chrome.storage.local.get(["openaiApiKey"]);
  if (!openaiApiKey) throw new Error("Missing API key");

  // Using Chat Completions format; replace with the GPT-5 endpoint you have
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini", // placeholder; adjust to your access (e.g., gpt-5)
      messages,
      temperature: 0.2,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI error ${resp.status}: ${text}`);
  }
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content || "";
  return { content };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "chatCompletion") {
    (async () => {
      try {
        const result = await callOpenAI(message.payload.messages);
        sendResponse(result);
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true; // async
  }
  
  if (message?.type === "debugTabState") {
    (async () => {
      try {
        await updateActiveLeetCodeTabs();
        const storage = await chrome.storage.local.get(['leetcodeProblem', 'tabState']);
        sendResponse({ 
          success: true, 
          storage,
          activeLeetCodeTabs: Array.from(activeLeetCodeTabs),
          currentActiveTab: currentActiveTab?.url
        });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true; // async
  }
  
  return false;
});


