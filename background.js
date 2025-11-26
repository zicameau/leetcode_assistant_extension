// Track side panel state using long-lived connections
// This is more reliable than manual tracking or onClosed events
let connectedSidePanels = new Set();

// Track when panels were recently closed (to prevent immediate reopen issues)
// Maps tabId to timestamp when it was closed
let recentlyClosed = new Map();

// Track tabs that should auto-open when navigating back to them
let autoOpenTabs = new Set();
// Track tabs that we are closing programmatically (so we don't remove them from autoOpenTabs)
let systemClosingTabs = new Set();

// Helper function to log side panel state
function logSidePanelState(context) {
  console.log(`🔵 [SIDE PANEL STATE] ${context} - Connected Panels:`, Array.from(connectedSidePanels));
  console.log(`🔵 [SIDE PANEL STATE] ${context} - Auto Open Tabs:`, Array.from(autoOpenTabs));
  console.log(`🔵 [SIDE PANEL STATE] ${context} - Set size:`, connectedSidePanels.size);
  console.log(`🔵 [SIDE PANEL STATE] ${context} - Recently closed:`, Array.from(recentlyClosed.entries()));
}

// Listen for connections from sidepanel.js
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    const tabId = port.sender?.tab?.id;
    if (tabId) {
      console.log(`🔌 [SIDE PANEL] Connected: tab ${tabId}`);
      connectedSidePanels.add(tabId);
      // If connected, it implies it's open, so it should be in autoOpenTabs
      autoOpenTabs.add(tabId);
      logSidePanelState('ON CONNECT');
      
      port.onDisconnect.addListener(() => {
        console.log(`🔌 [SIDE PANEL] Disconnected: tab ${tabId}`);
        connectedSidePanels.delete(tabId);
        
        if (systemClosingTabs.has(tabId)) {
          console.log(`🔒 [SIDE PANEL] System closed panel for tab ${tabId}, keeping in autoOpenTabs`);
          systemClosingTabs.delete(tabId);
        } else {
          console.log(`👤 [SIDE PANEL] User closed panel for tab ${tabId}, removing from autoOpenTabs`);
          autoOpenTabs.delete(tabId);
          // Track as recently closed only if user closed it
          recentlyClosed.set(tabId, Date.now());
          setTimeout(() => recentlyClosed.delete(tabId), 500);
        }
        
        logSidePanelState('ON DISCONNECT');
      });
    }
  }
});

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
    
    // If we are on a non-LeetCode tab (navigation within tab), ensure panel is closed
    if (isSidePanelAvailable() && !isOnLeetCodeTab && currentActiveTab?.id) {
      // Force close regardless of tracked state to ensure UI is clean
      try {
        console.log('🟡 [SIDE PANEL] URL changed to non-LeetCode, closing side panel for active tab:', currentActiveTab.id);
        await chrome.sidePanel.close({ tabId: currentActiveTab.id });
      } catch (error) {
        // Side panel might not be open, which is fine
      }
    }
    
    if (!hasLeetCodeTabs) {
      // No LeetCode tabs at all - clear everything and close all side panels
      console.log('No LeetCode tabs active, clearing problem from storage');
      await chrome.storage.local.remove(['leetcodeProblem', 'tabState']);
      
      // Close side panels for all tabs
      if (isSidePanelAvailable()) {
        for (const tabId of Array.from(connectedSidePanels)) {
          try {
            console.log('🟡 [SIDE PANEL] Closing side panel for tab (no LeetCode tabs):', tabId);
            logSidePanelState(`BEFORE close (no LeetCode tabs, tab ${tabId})`);
            await chrome.sidePanel.close({ tabId });
            // connectedSidePanels.delete(tabId); // Will happen on disconnect
            logSidePanelState(`AFTER close (no LeetCode tabs, tab ${tabId})`);
          } catch (error) {
            console.error('Error closing side panel for tab', tabId, ':', error);
          }
        }
      }
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
  logSidePanelState('BEFORE icon click');
  console.log('🔵 [SIDE PANEL] ========== Extension icon clicked ==========');
  console.log('🔵 [SIDE PANEL] Tab ID:', tabId);
  console.log('🔵 [SIDE PANEL] Tab URL:', tab.url);
  
  // Use connection state as source of truth
  const isConnected = connectedSidePanels.has(tabId);
  console.log('🔵 [SIDE PANEL] Is tabId in connectedSidePanels?', isConnected);
  
  if (!isSidePanelAvailable()) {
    console.log('⚠️ [SIDE PANEL] SidePanel API not available, opening in new tab');
    // Fallback: open side panel in a new tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('sidepanel.html'),
      active: true
    });
    return;
  }
  
  console.log('🔵 [SIDE PANEL] Action: Will', isConnected ? 'CLOSE' : 'OPEN', 'the side panel');
  
  try {
    if (isConnected) {
      // It is open (connected), so close it
      console.log('🔵 [SIDE PANEL] State says panel is OPEN (Connected), attempting to CLOSE...');
      try {
        // User is manually closing it, so stop auto-opening
        autoOpenTabs.delete(tabId);
        await chrome.sidePanel.close({ tabId });
        console.log('✅ [SIDE PANEL] Side panel close() call succeeded');
        // Don't manually remove from Set immediately - wait for disconnect event
        // But we can track it as "closing" if needed
      } catch (closeError) {
        console.warn('⚠️ [SIDE PANEL] Close failed:', closeError);
        // If close fails, maybe it wasn't open? Force remove from set to resync
        connectedSidePanels.delete(tabId);
      }
    } else {
      // It is closed (not connected), so open it
      console.log('🔵 [SIDE PANEL] State says panel is CLOSED (Not Connected), attempting to OPEN...');
      
      // User is manually opening it, so enable auto-open
      autoOpenTabs.add(tabId);
      
      // Check if this tab was recently closed (via Chrome's UI button or other means)
      const closedTimestamp = recentlyClosed.get(tabId);
      if (closedTimestamp) {
        const timeSinceClose = Date.now() - closedTimestamp;
        const cooldownMs = 300; // Wait 300ms after close before allowing open
        if (timeSinceClose < cooldownMs) {
          const waitTime = cooldownMs - timeSinceClose;
          console.log(`🔵 [SIDE PANEL] Panel was recently closed (${timeSinceClose}ms ago), waiting ${waitTime}ms before opening...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        recentlyClosed.delete(tabId);
      }

      try {
        await chrome.sidePanel.open({ tabId });
        console.log('✅ [SIDE PANEL] Side panel open() call succeeded');
        // Don't manually add to Set - wait for connect event from sidepanel.js
      } catch (openError) {
        console.error('❌ [SIDE PANEL] Open failed:', openError);
        // If open fails because it's "already open" (but we missed the connection?)
        // Try to close it to reset state?
        if (openError.message?.includes('already open')) {
             console.log('🔵 [SIDE PANEL] API says already open, attempting close to reset...');
             await chrome.sidePanel.close({ tabId });
        }
      }
    }
  } catch (error) {
    console.error('❌ [SIDE PANEL] Unexpected error toggling side panel:', error);
  }
  console.log('🔵 [SIDE PANEL] ========== Extension icon click handler complete ==========');
});

// Listen for side panel events to track state (only if API is available)
if (isSidePanelAvailable()) {
  // Use onClosed if available (Chrome 116+)
  if (chrome.sidePanel.onClosed) {
    chrome.sidePanel.onClosed.addListener(({ tabId }) => {
      console.log('🔴 [SIDE PANEL] ========== onClosed event fired ==========');
      console.log('🔴 [SIDE PANEL] Tab ID:', tabId);
      console.log('🔴 [SIDE PANEL] This event fires when panel is closed by ANY means (extension icon, Chrome UI button, etc.)');
      logSidePanelState('BEFORE onClosed delete');
      const wasInSet = connectedSidePanels.has(tabId);
      console.log('🔴 [SIDE PANEL] Was tabId in set?', wasInSet);
      // connectedSidePanels.delete(tabId); // Will be handled by disconnect event
      // Track that this tab was recently closed (for cooldown period)
      recentlyClosed.set(tabId, Date.now());
      // Clean up the "recently closed" entry after 500ms
      setTimeout(() => {
        recentlyClosed.delete(tabId);
        console.log('🔴 [SIDE PANEL] Cooldown period expired for tab:', tabId);
      }, 500);
      logSidePanelState('AFTER onClosed delete');
      console.log('🔴 [SIDE PANEL] ========== onClosed event handled ==========');
    });
    console.log('✅ [SIDE PANEL] onClosed listener registered');
  } else {
    console.warn('⚠️ [SIDE PANEL] chrome.sidePanel.onClosed not available - side panel state tracking may be less reliable');
  }
} else {
  console.warn('⚠️ [SIDE PANEL] SidePanel API not available');
}

// Listen for tab updates (URL changes, loading state changes)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Process when URL changes
  if (changeInfo.url) {
    const isLeetCode = isLeetCodeUrl(changeInfo.url);
    
    // If the tab is no longer a LeetCode URL, close the side panel immediately
    if (isSidePanelAvailable() && !isLeetCode) {
      try {
        console.log('🟡 [SIDE PANEL] URL changed to non-LeetCode, closing side panel for tab:', tabId);
        logSidePanelState(`BEFORE close (URL change, tab ${tabId})`);
        await chrome.sidePanel.close({ tabId });
        // connectedSidePanels.delete(tabId); // Handled by disconnect
        logSidePanelState(`AFTER close (URL change, tab ${tabId})`);
      } catch (error) {
        // Side panel might not be open, which is fine
        console.log('Side panel already closed or not open for tab:', tabId);
        // connectedSidePanels.delete(tabId);
      }
    }
    
    // Update state when tab is complete
    if (changeInfo.status === 'complete') {
      await updateActiveLeetCodeTabs();
    }
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  // Clean up sets
  autoOpenTabs.delete(tabId);
  systemClosingTabs.delete(tabId);
  recentlyClosed.delete(tabId);
  await updateActiveLeetCodeTabs();
});

// Listen for tab activation (when user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  await updateActiveLeetCodeTabs();
});

// Initialize on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('🟢 [SIDE PANEL] Extension startup - initializing...');
  logSidePanelState('ON STARTUP');
  await updateActiveLeetCodeTabs();
});

// Initialize when extension is installed/enabled
chrome.runtime.onInstalled.addListener(async () => {
  console.log('🟢 [SIDE PANEL] Extension installed/enabled - initializing...');
  logSidePanelState('ON INSTALLED');
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
        if (isSidePanelAvailable() && connectedSidePanels.has(tabId)) {
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

// Determine which provider to use based on the model name
function getProviderFromModel(model) {
  if (!model) return null;
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('claude-')) return 'claude';
  return null;
}

// All possible models for each provider
const ALL_MODELS = {
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo'
  ],
  gemini: [
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro',
    'gemini-pro-001',
    'gemini-1.5-pro-001'
  ],
  claude: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-5-haiku-20241022',
    'claude-3-5-haiku-20240620',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
    'claude-3-haiku-20240229',
    'claude-3-7-sonnet-20240227',
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
    'claude-3-opus',
    'claude-3-sonnet',
    'claude-3-haiku'
  ]
};

// Test a single model to see if it's available
async function testModel(provider, model, apiKey) {
  try {
    switch (provider) {
      case 'openai':
        const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [{ role: "user", content: "Hi" }],
            max_tokens: 5,
          }),
        });
        return openaiResp.ok;
        
      case 'gemini':
        // Try v1beta first, then fallback to v1
        let geminiResp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
              generationConfig: { maxOutputTokens: 5 }
            }),
          }
        );
        
        // If v1beta fails, try v1 API
        if (!geminiResp.ok && geminiResp.status === 404) {
          geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
                generationConfig: { maxOutputTokens: 5 }
              }),
            }
          );
        }
        
        if (!geminiResp.ok) {
          const errorText = await geminiResp.text();
          try {
            const errorJson = JSON.parse(errorText);
            console.error(`[Model Detection] Gemini ${model} error ${geminiResp.status}:`, errorJson.error?.message || errorText);
          } catch {
            console.error(`[Model Detection] Gemini ${model} error ${geminiResp.status}:`, errorText);
          }
        }
        return geminiResp.ok;
        
      case 'claude':
        const claudeResp = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "anthropic-dangerous-direct-browser-access": "true"
          },
          body: JSON.stringify({
            model: model,
            max_tokens: 5,
            messages: [{ role: 'user', content: 'Hi' }]
          }),
        });
        if (!claudeResp.ok) {
          const errorText = await claudeResp.text();
          try {
            const errorJson = JSON.parse(errorText);
            console.error(`[Model Detection] Claude ${model} error ${claudeResp.status}:`, errorJson.error?.message || errorJson.error?.type || errorText);
          } catch {
            console.error(`[Model Detection] Claude ${model} error ${claudeResp.status}:`, errorText);
          }
        }
        return claudeResp.ok;
        
      default:
        return false;
    }
  } catch (err) {
    console.error(`Error testing ${provider} model ${model}:`, err);
    return false;
  }
}

// List available Gemini models from the API
async function listGeminiModels(apiKey) {
  try {
    // Try to list models from the API
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      }
    );
    
    if (resp.ok) {
      const data = await resp.json();
      if (data.models && Array.isArray(data.models)) {
        const modelNames = data.models.map(m => m.name?.replace('models/', '') || m.name).filter(Boolean);
        console.log(`[Model Detection] Found ${modelNames.length} Gemini models from API:`, modelNames);
        return modelNames;
      }
    } else {
      const errorText = await resp.text();
      console.warn(`[Model Detection] Could not list Gemini models: ${resp.status}`, errorText);
    }
  } catch (err) {
    console.warn(`[Model Detection] Error listing Gemini models:`, err);
  }
  return null;
}

// Detect available models for a provider
async function detectAvailableModels(provider, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    return [];
  }
  
  // For Gemini, try to list available models first
  if (provider === 'gemini') {
    const apiModels = await listGeminiModels(apiKey);
    if (apiModels && apiModels.length > 0) {
      // Use models from API if available, otherwise fall back to testing
      const modelsToTest = apiModels.filter(m => 
        ALL_MODELS.gemini.some(testModel => m.includes(testModel.replace('gemini-', '').split('-')[0]))
      );
      if (modelsToTest.length > 0) {
        console.log(`[Model Detection] Using ${modelsToTest.length} models from API list`);
        // Test each model to confirm it works
        const availableModels = [];
        for (const model of modelsToTest) {
          const isAvailable = await testModel(provider, model, apiKey);
          if (isAvailable) {
            availableModels.push(model);
            console.log(`[Model Detection] ✅ ${model} - Available`);
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        console.log(`[Model Detection] Found ${availableModels.length}/${modelsToTest.length} available ${provider} models`);
        return availableModels;
      }
    }
  }
  
  const modelsToTest = ALL_MODELS[provider] || [];
  const availableModels = [];
  
  console.log(`[Model Detection] Testing ${modelsToTest.length} ${provider} models...`);
  
  for (const model of modelsToTest) {
    const isAvailable = await testModel(provider, model, apiKey);
    if (isAvailable) {
      availableModels.push(model);
      console.log(`[Model Detection] ✅ ${model} - Available`);
    } else {
      console.log(`[Model Detection] ❌ ${model} - Not available`);
    }
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`[Model Detection] Found ${availableModels.length}/${modelsToTest.length} available ${provider} models`);
  return availableModels;
}

async function callOpenAI(messages, model) {
  const { openaiApiKey } = await chrome.storage.local.get(["openaiApiKey"]);
  if (!openaiApiKey) throw new Error("Missing OpenAI API key");

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
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

async function callGemini(messages, model) {
  const { geminiApiKey } = await chrome.storage.local.get(["geminiApiKey"]);
  if (!geminiApiKey) throw new Error("Missing Gemini API key");

  // Convert OpenAI-style messages to Gemini format
  const systemInstruction = messages.find(m => m.role === 'system')?.content || '';
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const requestBody = {
    contents,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
    }
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  // Try v1beta first, then fallback to v1
  let resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );
  
  // If v1beta fails with 404, try v1 API
  if (!resp.ok && resp.status === 404) {
    resp = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model || 'gemini-1.5-flash'}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      }
    );
  }

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { content };
}

async function callClaude(messages, model) {
  const { claudeApiKey } = await chrome.storage.local.get(["claudeApiKey"]);
  if (!claudeApiKey) throw new Error("Missing Claude API key");

  // Extract system message and convert to Claude format
  const systemMessage = messages.find(m => m.role === 'system')?.content || '';
  const conversationMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role,
      content: m.content
    }));

  const requestBody = {
    model: model || "claude-3-haiku-20240307",
    max_tokens: 4096,
    temperature: 0.2,
    messages: conversationMessages
  };

  if (systemMessage) {
    requestBody.system = systemMessage;
  }

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": claudeApiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify(requestBody),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const content = data?.content?.[0]?.text || "";
  return { content };
}

async function callAI(messages) {
  const { selectedModel } = await chrome.storage.local.get(["selectedModel"]);
  
  if (!selectedModel) {
    throw new Error("Please select a model in the extension settings");
  }

  const provider = getProviderFromModel(selectedModel);
  
  if (!provider) {
    throw new Error("Invalid model selected");
  }

  switch (provider) {
    case 'openai':
      return await callOpenAI(messages, selectedModel);
    case 'gemini':
      return await callGemini(messages, selectedModel);
    case 'claude':
      return await callClaude(messages, selectedModel);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "chatCompletion") {
    (async () => {
      try {
        const result = await callAI(message.payload.messages);
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
  
  if (message?.type === "detectModels") {
    (async () => {
      try {
        const { provider, apiKey } = message.payload;
        const availableModels = await detectAvailableModels(provider, apiKey);
        sendResponse({ success: true, models: availableModels });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // async
  }
  
  return false;
});

