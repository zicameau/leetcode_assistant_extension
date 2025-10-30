const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const problemMetaEl = document.getElementById("problemMeta");
const openOptionsBtn = document.getElementById("openOptions");
const resetChatBtn = document.getElementById("resetChat");
const modelSelectEl = document.getElementById("modelSelect");

let currentProblem = null;
let selectionBuffer = null;

// Model labels
const MODEL_LABELS = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'gemini-2.0-flash-exp': 'Gemini 2.0 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-pro': 'Gemini Pro',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet (Latest)',
  'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
  'claude-3-haiku-20240307': 'Claude 3 Haiku'
};

openOptionsBtn.addEventListener("click", async () => {
  if (chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
});

resetChatBtn?.addEventListener("click", () => {
  resetConversation({ keepProblem: true });
});

function addMessage(role, content) {
  const msg = document.createElement("div");
  msg.className = "msg";
  msg.innerHTML = `
    <div class="avatar">${role === "assistant" ? "🤖" : "🧑"}</div>
    <div>
      <div class="role">${role}</div>
      <div class="bubble ${role}"></div>
    </div>
  `;
  messagesEl.appendChild(msg);
  const bubbleEl = msg.querySelector(".bubble");
  if (typeof content === "string") {
    bubbleEl.textContent = content;
  } else if (content instanceof Node) {
    bubbleEl.appendChild(content);
  } else if (content != null) {
    bubbleEl.textContent = String(content);
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubbleEl;
}

function setProblemMeta(info) {
  if (!info || !info.slug) {
    problemMetaEl.textContent = "No problem detected";
    return;
  }
  const slug = info.slug.replace(/-/g, " ");
  problemMetaEl.textContent = `${slug}${info.questionId ? ` · #${info.questionId}` : ""}`;
}

function resetConversation(options = {}) {
  const keepProblem = options.keepProblem === true;
  messagesEl.innerHTML = "";
  selectionBuffer = null;
  try { chrome.storage?.local?.remove?.(["leetcodeLastSelection"]); } catch (_) {}
  if (!keepProblem) {
    currentProblem = null;
    setProblemMeta(null);
  }
}

async function loadProblemFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["leetcodeProblem"], (res) => {
      resolve(res.leetcodeProblem || null);
    });
  });
}

async function saveConversationContext(ctx) {
  chrome.storage.local.set({ leetcodeConversationContext: ctx });
}

async function getSelectedModel() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["selectedModel"], (res) => resolve(res.selectedModel || null));
  });
}

async function updateModelDropdown() {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(['availableModels', 'selectedModel'], resolve);
  });
  
  console.log('[LeetCode Assistant] Available models:', data.availableModels);
  
  // Clear existing options
  modelSelectEl.innerHTML = '<option value="">⚡ Select model...</option>';
  
  let hasModels = false;
  
  if (data.availableModels) {
    // Add OpenAI models
    if (data.availableModels.openai && data.availableModels.openai.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'OpenAI';
      data.availableModels.openai.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = MODEL_LABELS[model] || model;
        optgroup.appendChild(option);
      });
      modelSelectEl.appendChild(optgroup);
      hasModels = true;
    }
    
    // Add Gemini models
    if (data.availableModels.gemini && data.availableModels.gemini.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Google Gemini';
      data.availableModels.gemini.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = MODEL_LABELS[model] || model;
        optgroup.appendChild(option);
      });
      modelSelectEl.appendChild(optgroup);
      hasModels = true;
    }
    
    // Add Claude models
    if (data.availableModels.claude && data.availableModels.claude.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = 'Anthropic Claude';
      data.availableModels.claude.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = MODEL_LABELS[model] || model;
        optgroup.appendChild(option);
      });
      modelSelectEl.appendChild(optgroup);
      hasModels = true;
    }
  }
  
  // Set selected model if it exists
  if (data.selectedModel) {
    modelSelectEl.value = data.selectedModel;
  }
  
  // If no models available, show helpful message
  if (!hasModels) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '⚠️ Save API keys in settings to detect models';
    option.disabled = true;
    modelSelectEl.appendChild(option);
    console.log('[LeetCode Assistant] No available models - save API keys in settings');
  } else {
    console.log('[LeetCode Assistant] Dropdown populated with available models');
  }
}

// Handle model selection change
modelSelectEl.addEventListener('change', async () => {
  const selectedModel = modelSelectEl.value;
  if (selectedModel) {
    await chrome.storage.local.set({ selectedModel });
  }
});

async function sendToModel(messages) {
  const selectedModel = await getSelectedModel();
  if (!selectedModel) {
    throw new Error("Please select a model from the dropdown below");
  }
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      type: "chatCompletion",
      payload: { messages, problem: currentProblem },
    }, (response) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (response?.error) return reject(new Error(response.error));
      resolve(response);
    });
  });
}

formEl.addEventListener("submit", async (e) => {
  e.preventDefault();
  const content = promptEl.value.trim();
  if (!content) return;
  promptEl.value = "";
  addMessage("user", content);
  sendBtn.disabled = true;
  try {
    // Try to capture current editor code from the active tab (best-effort)
    let codeContext = null;
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'requestLeetcodeCode' }, (resp) => resolve(resp));
      });
      if (res && !res.error && res.code && res.code.trim().length > 0) {
        codeContext = res;
      }
    } catch (_) {}

    const system = {
      role: "system",
      content: `You are a LeetCode assistant. Use the provided problem context when relevant. If the problem is unknown, ask for the slug or link.`,
    };
    const context = [];
    if (currentProblem) {
      context.push({ role: "system", content: `Current problem slug: ${currentProblem.slug}${currentProblem.questionId ? ` (id ${currentProblem.questionId})` : ""}. URL: ${currentProblem.url}` });
    }
    if (codeContext) {
      const lang = codeContext.language ? ` (${codeContext.language})` : "";
      context.push({ role: "system", content: `Current editor code${lang}:
\n\n${codeContext.code.slice(0, 30000)}` });
    }
    // show typing indicator while waiting for response
    const typing = document.createElement("span");
    typing.className = "typing";
    typing.innerHTML = "<span>.</span><span>.</span><span>.</span>";
    const placeholderBubble = addMessage("assistant", typing);

    const resp = await sendToModel([system, ...context, { role: "user", content }]);
    placeholderBubble.textContent = resp.content || "(no response)";
  } catch (err) {
    const lastAssistantBubble = messagesEl.querySelector('.msg:last-child .bubble.assistant');
    const errorMessage = `Error: ${err.message}`;
    if (lastAssistantBubble && lastAssistantBubble.querySelector('.typing')) {
      lastAssistantBubble.textContent = errorMessage;
    } else {
      addMessage("assistant", errorMessage);
    }
  } finally {
    sendBtn.disabled = false;
  }
});

// Init
(async function init() {
  // Initialize model dropdown
  await updateModelDropdown();
  
  currentProblem = await loadProblemFromStorage();
  setProblemMeta(currentProblem);
  // Watch for problem changes from content script
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    
    // Refresh dropdown when available models or model selection changes
    if (changes.availableModels || changes.selectedModel) {
      console.log('[LeetCode Assistant] Available models updated, refreshing dropdown');
      updateModelDropdown();
    }
    
    if (changes.leetcodeProblem) {
      const newProblem = changes.leetcodeProblem.newValue || null;
      const prevSlug = currentProblem?.slug;
      const newSlug = newProblem?.slug;
      const slugChanged = prevSlug && newSlug ? prevSlug !== newSlug : prevSlug !== newSlug;
      if (slugChanged) {
        currentProblem = newProblem;
        setProblemMeta(currentProblem);
        // Auto reset chat on problem change
        resetConversation({ keepProblem: true });
      }
    }
  });
  // If a selection was just sent, pull and auto-send
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'leetcodeSelectionReady') {
      void handleIncomingSelection();
    }
  });
  // Also check storage in case we opened before message arrived
  await handleIncomingSelection();
})();

async function handleIncomingSelection() {
  const { leetcodeLastSelection } = await new Promise((resolve) => {
    chrome.storage.local.get(["leetcodeLastSelection"], (res) => resolve(res));
  });
  if (!leetcodeLastSelection) return;
  if (selectionBuffer && selectionBuffer.ts === leetcodeLastSelection.ts) return; // already handled
  selectionBuffer = leetcodeLastSelection;
  if (leetcodeLastSelection.problem && (!currentProblem || currentProblem.slug !== leetcodeLastSelection.problem.slug)) {
    currentProblem = leetcodeLastSelection.problem;
    setProblemMeta(currentProblem);
  }
  const text = leetcodeLastSelection.text?.trim();
  if (!text) return;
  // Post the selection as a user message and auto-send
  promptEl.value = text;
  formEl.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
}


