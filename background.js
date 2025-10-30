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
    'gemini-pro'
  ],
  claude: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-sonnet-20240620',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307'
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
        const geminiResp = await fetch(
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
        return claudeResp.ok;
        
      default:
        return false;
    }
  } catch (err) {
    console.error(`Error testing ${provider} model ${model}:`, err);
    return false;
  }
}

// Detect available models for a provider
async function detectAvailableModels(provider, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    return [];
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

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-1.5-flash'}:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }
  );

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


