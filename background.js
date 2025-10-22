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
  
  
  return false;
});


