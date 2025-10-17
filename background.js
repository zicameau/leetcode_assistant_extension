// Track side panel state
let sidePanelOpen = new Set();

// Check if sidePanel API is available
function isSidePanelAvailable() {
  return chrome.sidePanel && typeof chrome.sidePanel.open === 'function';
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

// Store last detected problem for sidepanel to read
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "leetcodeProblemDetected") {
    chrome.storage.local.set({ leetcodeProblem: message.payload });
    sendResponse?.({ ok: true });
    return true;
  }
  if (message?.type === "leetcodeSelection") {
    (async () => {
      try {
        const tabId = sender?.tab?.id;
        // Store latest selection for the side panel to read
        await chrome.storage.local.set({ leetcodeLastSelection: message.payload });
        // Ensure side panel is open and focused
        if (isSidePanelAvailable() && tabId != null) {
          try { await chrome.sidePanel.open({ tabId }); } catch (_) {}
          sidePanelOpen.add(tabId);
        } else {
          // Fallback: open sidepanel page in a new tab
          chrome.tabs.create({ url: chrome.runtime.getURL('sidepanel.html'), active: true });
        }
        // Notify any sidepanel to pull the latest selection
        chrome.runtime.sendMessage({ type: 'leetcodeSelectionReady' });
        sendResponse?.({ ok: true });
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
  
  
  return false;
});


