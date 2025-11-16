const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const problemMetaEl = document.getElementById("problemMeta");
const openOptionsBtn = document.getElementById("openOptions");
const resetChatBtn = document.getElementById("resetChat");
const modelSelectEl = document.getElementById("modelSelect");

// [ADDED] Auth modal elements
const authModal = document.getElementById("authModal");
const authUsernameEl = document.getElementById("authUsername");
const authEmailEl = document.getElementById("authEmail");
const authPasswordEl = document.getElementById("authPassword");
const authLoginBtn = document.getElementById("authLoginBtn");
const authSignupBtn = document.getElementById("authSignupBtn");
const authGuestBtn = document.getElementById("authGuestBtn");
const authStatusEl = document.getElementById("authStatus");
const openAuthBtn = document.getElementById("openAuth");

// [ADDED] Modal helpers
function setAuthModalVisible(visible) {
  if (!authModal) return;
  authModal.hidden = !visible;
  if (sendBtn) sendBtn.disabled = visible;
  if (promptEl) promptEl.disabled = visible;
  if (visible && authUsernameEl) authUsernameEl.focus();
}

async function verifyBackend() {
  try {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["backendGuest","backendApiToken"], (res) => resolve(res));
    });
    if (data.backendGuest === true || data.backendGuest === 'true') return true;
    const token = data.backendApiToken || null;
    if (!token) return false;
    const resp = await fetch('http://localhost:5000/api/auth/verify', {
      method: 'GET', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, credentials: 'include'
    });
    const json = await resp.json();
    return !!json?.authenticated;
  } catch (_) {
    return false;
  }
}

async function checkKeysAndPrompt() {
  try {
    const { openaiApiKey } = await new Promise((resolve) => {
      chrome.storage.local.get(["openaiApiKey"], (res) => resolve(res));
    });
    if (!openaiApiKey) {
      const shouldOpen = confirm("You’re almost set. Add your OpenAI API key in Settings now?");
      if (shouldOpen && chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
    }
  } catch (_) {}
}

// [ADDED] Login/Signup/Guest handlers
if (authLoginBtn) authLoginBtn.addEventListener('click', async () => {
  if (!authUsernameEl || !authPasswordEl) return;
  const username = authUsernameEl.value.trim();
  const password = authPasswordEl.value.trim();
  if (!username || !password) { if (authStatusEl) authStatusEl.textContent = 'Enter username and password.'; return; }
  authLoginBtn.disabled = true; if (authSignupBtn) authSignupBtn.disabled = true;
  if (authStatusEl) authStatusEl.textContent = 'Signing in...';
  try {
    const resp = await fetch('http://localhost:5000/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ username, password }) });
    const data = await resp.json();
    if (!resp.ok || !data?.success) throw new Error(data?.error || 'Login failed');
    if (data.user?.api_token) {
      await new Promise((resolve)=>chrome.storage.local.set({ backendApiToken: data.user.api_token, backendUserId: data.user.id, backendUsername: data.user.username, backendGuest: false }, resolve));
    }
    if (authStatusEl) authStatusEl.textContent = 'Signed in.';
    setAuthModalVisible(false);
    await checkKeysAndPrompt();
  } catch (err) {
    if (authStatusEl) authStatusEl.textContent = `Login error: ${err.message}`;
  } finally {
    authLoginBtn.disabled = false; if (authSignupBtn) authSignupBtn.disabled = false;
  }
});

if (authSignupBtn) authSignupBtn.addEventListener('click', async () => {
  if (!authUsernameEl || !authEmailEl || !authPasswordEl) return;
  const username = authUsernameEl.value.trim();
  const email = authEmailEl.value.trim();
  const password = authPasswordEl.value.trim();
  if (!username || !email || !password) { if (authStatusEl) authStatusEl.textContent = 'Enter username, email, and password.'; return; }
  authSignupBtn.disabled = true; if (authLoginBtn) authLoginBtn.disabled = true;
  if (authStatusEl) authStatusEl.textContent = 'Creating account...';
  try {
    const resp = await fetch('http://localhost:5000/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ username, email, password }) });
    const data = await resp.json();
    if (!resp.ok || !data?.success) throw new Error(data?.error || 'Registration failed');
    if (data.user?.api_token) {
      await new Promise((resolve)=>chrome.storage.local.set({ backendApiToken: data.user.api_token, backendUserId: data.user.id, backendUsername: data.user.username, backendGuest: false }, resolve));
    }
    if (authStatusEl) authStatusEl.textContent = 'Account created. Signed in.';
    setAuthModalVisible(false);
    await checkKeysAndPrompt();
  } catch (err) {
    if (authStatusEl) authStatusEl.textContent = `Signup error: ${err.message}`;
  } finally {
    authSignupBtn.disabled = false; if (authLoginBtn) authLoginBtn.disabled = false;
  }
});

if (authGuestBtn) authGuestBtn.addEventListener('click', async () => {
  await new Promise((resolve)=>chrome.storage.local.set({ backendGuest: true, backendApiToken: null, backendUserId: null }, resolve));
  if (authStatusEl) authStatusEl.textContent = 'Continuing as guest.';
  setAuthModalVisible(false);
});

if (openAuthBtn) openAuthBtn.addEventListener('click', async () => {
  await new Promise((resolve)=>chrome.storage.local.set({ backendGuest: false }, resolve));
  setAuthModalVisible(true);
});

// [ADDED] Hide modal if guest or when key saved in guest mode
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.backendGuest && (changes.backendGuest.newValue === true || changes.backendGuest.newValue === 'true')) {
    setAuthModalVisible(false);
  }
});

// ExpandableTextbox component instance
let expandableTextbox = null;

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
  'claude-3-5-haiku-20241022': 'Claude 3.5 Haiku (Latest)',
  'claude-3-5-haiku-20240620': 'Claude 3.5 Haiku',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
  'claude-3-haiku-20240307': 'Claude 3 Haiku',
  'claude-3-haiku-20240229': 'Claude 3 Haiku',
  'claude-3-7-sonnet-20240227': 'Claude 3.7 Sonnet',
  'claude-sonnet-4-20250514': 'Claude Sonnet 4',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
  'claude-3-5-haiku': 'Claude 3.5 Haiku',
  'claude-3-opus': 'Claude 3 Opus',
  'claude-3-sonnet': 'Claude 3 Sonnet',
  'claude-3-haiku': 'Claude 3 Haiku'
};

openOptionsBtn.addEventListener("click", async () => {
  if (chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
});

resetChatBtn?.addEventListener("click", () => {
  resetConversation({ keepProblem: true });
});

// Function to format markdown code blocks into styled boxes
function formatMessageWithCodeBlocks(content) {
  if (!content || typeof content !== 'string') return content;
  
  // Pattern to match markdown code blocks: ```language\ncode\n```
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;
  let match;
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text before the code block
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      if (textBefore.trim()) {
        parts.push({ type: 'text', content: textBefore });
      }
    }
    
    // Add the code block
    const language = match[1] || 'text';
    const code = match[2];
    parts.push({ type: 'code', language, code });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after the last code block
  if (lastIndex < content.length) {
    const textAfter = content.substring(lastIndex);
    if (textAfter.trim()) {
      parts.push({ type: 'text', content: textAfter });
    }
  }
  
  // If no code blocks found, return original content as text
  if (parts.length === 0) {
    parts.push({ type: 'text', content });
  }
  
  // Create DOM elements
  const container = document.createDocumentFragment();
  
  parts.forEach((part, index) => {
    if (part.type === 'code') {
      const codeContainer = document.createElement('div');
      codeContainer.className = 'code-block-container';
      
      const codeHeader = document.createElement('div');
      codeHeader.className = 'code-block-header';
      
      const languageLabel = document.createElement('span');
      languageLabel.className = 'code-block-language';
      languageLabel.textContent = part.language;
      
      const copyButton = document.createElement('button');
      copyButton.className = 'code-block-copy';
      copyButton.textContent = 'Copy';
      copyButton.setAttribute('aria-label', 'Copy code');
      copyButton.onclick = () => {
        navigator.clipboard.writeText(part.code).then(() => {
          copyButton.textContent = 'Copied!';
          setTimeout(() => {
            copyButton.textContent = 'Copy';
          }, 2000);
        });
      };
      
      codeHeader.appendChild(languageLabel);
      codeHeader.appendChild(copyButton);
      
      const codeElement = document.createElement('pre');
      codeElement.className = 'code-block';
      const codeInner = document.createElement('code');
      codeInner.textContent = part.code;
      codeElement.appendChild(codeInner);
      
      codeContainer.appendChild(codeHeader);
      codeContainer.appendChild(codeElement);
      container.appendChild(codeContainer);
    } else {
      // Format text with basic markdown (bold, italic, links)
      const textDiv = document.createElement('div');
      textDiv.className = 'message-text';
      // Convert basic markdown to HTML
      let html = part.content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
        .replace(/\n/g, '<br>');
      textDiv.innerHTML = html;
      container.appendChild(textDiv);
    }
  });
  
  return container;
}

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
  
  if (content instanceof Node) {
    bubbleEl.appendChild(content);
  } else if (typeof content === "string") {
    // Format content with code blocks for assistant messages
    if (role === "assistant") {
      const formatted = formatMessageWithCodeBlocks(content);
      bubbleEl.appendChild(formatted);
    } else {
      bubbleEl.textContent = content;
    }
  } else if (content != null) {
    bubbleEl.textContent = String(content);
  }
  
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return bubbleEl;
}

function setProblemMeta(info) {
  if (!info || !info.slug) {
    // Don't automatically set "No problem detected" here - let updateTabState handle it
    // This prevents overriding the "Go back to LeetCode" message
    return;
  }
  const slug = info.slug.replace(/-/g, " ");
  problemMetaEl.textContent = `${slug}${info.questionId ? ` · #${info.questionId}` : ""}`;
}

async function updateTabState() {
  try {
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['tabState'], (res) => resolve(res));
    });
    
    console.log('Sidepanel updateTabState:', {
      tabState: result.tabState,
      currentProblem: currentProblem,
      problemMetaElText: problemMetaEl.textContent
    });
    
    if (result.tabState && !currentProblem) {
      // User is on non-LeetCode tab but LeetCode tabs exist
      problemMetaEl.textContent = result.tabState.message || "Go back to LeetCode";
      console.log('Set message to:', problemMetaEl.textContent);
    } else if (!currentProblem && !result.tabState) {
      // No LeetCode tabs at all
      problemMetaEl.textContent = "No problem detected";
      console.log('Set message to: No problem detected');
    }
  } catch (error) {
    console.error('Error updating tab state:', error);
  }
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
  // Use expandableTextbox to get value
  const content = expandableTextbox ? expandableTextbox.getValue().trim() : promptEl.value.trim();
  if (!content) return;
  
  // Clear textbox using expandableTextbox
  if (expandableTextbox) {
    expandableTextbox.setValue("");
  } else {
    promptEl.value = "";
  }
  
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
     // Show typing indicator while waiting for response
     const typing = document.createElement("span");
     typing.className = "typing";
     typing.innerHTML = "<span>.</span><span>.</span><span>.</span>";
     const placeholderBubble = addMessage("assistant", typing);

     const resp = await sendToModel([system, ...context, { role: "user", content }]);
     // Replace the typing indicator with formatted response
     placeholderBubble.innerHTML = '';
     const formatted = formatMessageWithCodeBlocks(resp.content || "(no response)");
     placeholderBubble.appendChild(formatted);
  } catch (err) {
    const lastAssistantBubble = messagesEl.querySelector('.msg:last-child .bubble.assistant');
    const errorMessage = `Error: ${err.message}`;
    if (lastAssistantBubble && lastAssistantBubble.querySelector('.typing')) {
      lastAssistantBubble.innerHTML = errorMessage;
    } else {
      addMessage("assistant", errorMessage);
    }
  } finally {
    sendBtn.disabled = false;
  }
});

// Listen for storage changes to update problem display
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== 'local') return;
  
  if (changes.leetcodeProblem) {
    const newProblem = changes.leetcodeProblem.newValue || null;
    const prevSlug = currentProblem?.slug;
    const newSlug = newProblem?.slug;
    const slugChanged = prevSlug && newSlug ? prevSlug !== newSlug : prevSlug !== newSlug;
    
    currentProblem = newProblem;
    setProblemMeta(currentProblem);
    
    // Always update tab state after setting problem meta
    updateTabState();
    
    if (slugChanged) {
      // Auto reset chat on problem change
      resetConversation({ keepProblem: true });
    }
  }
  
  if (changes.tabState) {
    console.log('Sidepanel: tabState changed:', changes.tabState);
    updateTabState();
  }
  
  // Watch for text box population requests
  if (changes.leetcodeSelectionToTextBox && changes.leetcodeSelectionToTextBox.newValue) {
    console.log("📥 Side panel: Storage change detected for text box population");
    void handleIncomingSelectionToTextBox();
    // Clear the flag
    chrome.storage.local.remove(['leetcodeSelectionToTextBox']);
  }
});

// Initialize ExpandableTextbox component
function initializeExpandableTextbox() {
  // Remove existing textarea from form
  const existingTextarea = document.getElementById("prompt");
  if (existingTextarea) {
    existingTextarea.remove();
  }

  // Create new ExpandableTextbox instance
  expandableTextbox = new ExpandableTextbox({
    minHeight: 40,
    defaultHeight: 80,
    maxHeightRatio: 0.6, // 60% of viewport height (half to two-thirds range)
    autoExpand: true,
    smoothResize: true,
    preserveFormatting: true,
    enableKeyboardNav: true,
    announceChanges: true,
    preserveExistingStyles: true,
    themeAware: true
  });

  // Replace the textarea in the form
  const newTextarea = expandableTextbox.getTextarea();
  newTextarea.id = "prompt";
  newTextarea.setAttribute("required", "");
  
  // Get the composerContent to insert the ExpandableTextbox
  const composerContent = document.querySelector('.composerContent');
  
  // Insert the ExpandableTextbox container into composerContent (replacing the textarea)
  composerContent.insertBefore(expandableTextbox.getContainer(), composerContent.firstChild);
  
  // Update the promptEl reference to point to the new textarea
  window.promptEl = newTextarea;
  
  // [ADDED] Expose debugging methods globally
  window.testScrollbar = () => expandableTextbox.testScrollbarDetection();
  window.forceScrollbar = () => expandableTextbox.forceScrollbar();
  window.testScrollbarWithContent = () => {
    // Add lots of content to trigger scrollbar
    const longContent = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6\nLine 7\nLine 8\nLine 9\nLine 10\nLine 11\nLine 12\nLine 13\nLine 14\nLine 15\nLine 16\nLine 17\nLine 18\nLine 19\nLine 20";
    expandableTextbox.setValue(longContent);
    console.log('Added long content, check if scrollbar appears...');
  };
}

// Init
(async function init() {
  // [ADDED] Initialize expandable textbox first
  initializeExpandableTextbox();
  
  // Initialize model dropdown
  await updateModelDropdown();
  
  // [ADDED] Force modal by default unless a valid token exists (do not persist guest across opens)
  try {
    await new Promise((resolve) => chrome.storage.local.set({ backendGuest: false }, resolve));
  } catch (_) {}
  
  currentProblem = await loadProblemFromStorage();
  setProblemMeta(currentProblem);
  await updateTabState();
  
  // [ADDED] Explicit auth check on panel open to toggle modal
  try {
    const authed = await verifyBackend();
    setAuthModalVisible(!authed);
  } catch (_) {
    setAuthModalVisible(true);
  }
  
  // Handle incoming messages for text box population
  chrome.runtime.onMessage.addListener((message) => {
    console.log("📥 Side panel: Received message:", message);
    if (message?.type === 'leetcodeSelectionToTextBox') {
      console.log("📥 Side panel: Handling leetcodeSelectionToTextBox");
      void handleIncomingSelectionToTextBox();
    }
  });
  
  // Check for text box population requests when side panel loads
  const { leetcodeSelectionToTextBox } = await new Promise((resolve) => {
    chrome.storage.local.get(["leetcodeSelectionToTextBox"], (res) => resolve(res));
  });
  if (leetcodeSelectionToTextBox) {
    console.log("📥 Side panel: Found text box population flag on load");
    await handleIncomingSelectionToTextBox();
    chrome.storage.local.remove(['leetcodeSelectionToTextBox']);
  }
  
  // Also check when the side panel becomes visible (in case it was already open but hidden)
  document.addEventListener('visibilitychange', async () => {
    if (!document.hidden) {
      console.log("📥 Side panel: Became visible, checking for text box population flag");
      const { leetcodeSelectionToTextBox } = await new Promise((resolve) => {
        chrome.storage.local.get(["leetcodeSelectionToTextBox"], (res) => resolve(res));
      });
      if (leetcodeSelectionToTextBox) {
        console.log("📥 Side panel: Found text box population flag on visibility change");
        await handleIncomingSelectionToTextBox();
        chrome.storage.local.remove(['leetcodeSelectionToTextBox']);
      }
    }
  });
  
  // Watch for problem changes from content script
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    
    // Refresh dropdown when available models or model selection changes
    if (changes.availableModels || changes.selectedModel) {
      console.log('[LeetCode Assistant] Available models updated, refreshing dropdown');
      updateModelDropdown();
      
      // If selectedModel changed, update the dropdown value immediately
      if (changes.selectedModel && changes.selectedModel.newValue) {
        const newModel = changes.selectedModel.newValue;
        // Wait a bit for the dropdown to be updated, then set the value
        setTimeout(() => {
          if (modelSelectEl && Array.from(modelSelectEl.options).some(opt => opt.value === newModel)) {
            modelSelectEl.value = newModel;
            console.log('[LeetCode Assistant] Model selection updated to:', newModel);
          }
        }, 100);
      }
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
  
  // Periodic check as final fallback (less frequent)
  setInterval(async () => {
    const { leetcodeSelectionToTextBox } = await new Promise((resolve) => {
      chrome.storage.local.get(["leetcodeSelectionToTextBox"], (res) => resolve(res));
    });
    if (leetcodeSelectionToTextBox) {
      console.log("📥 Side panel: Found text box population flag in periodic check");
      await handleIncomingSelectionToTextBox();
      chrome.storage.local.remove(['leetcodeSelectionToTextBox']);
    }
  }, 2000);
})();


async function handleIncomingSelectionToTextBox() {
  console.log("🔄 Side panel: handleIncomingSelectionToTextBox called");
  const { leetcodeLastSelection } = await new Promise((resolve) => {
    chrome.storage.local.get(["leetcodeLastSelection"], (res) => resolve(res));
  });
  console.log("🔄 Side panel: Retrieved from storage:", leetcodeLastSelection);
  if (!leetcodeLastSelection) {
    console.log("❌ Side panel: No selection found in storage");
    return;
  }
  if (selectionBuffer && selectionBuffer.ts === leetcodeLastSelection.ts) {
    console.log("🔄 Side panel: Selection already handled, skipping");
    return; // already handled
  }
  selectionBuffer = leetcodeLastSelection;
  if (leetcodeLastSelection.problem && (!currentProblem || currentProblem.slug !== leetcodeLastSelection.problem.slug)) {
    currentProblem = leetcodeLastSelection.problem;
    setProblemMeta(currentProblem);
  }
  const text = leetcodeLastSelection.text?.trim();
  console.log("🔄 Side panel: Text to populate:", text);
  if (!text) {
    console.log("❌ Side panel: No text to populate");
    return;
  }
  // Append to existing text in the text box using expandableTextbox
  const currentText = expandableTextbox ? expandableTextbox.getValue().trim() : promptEl.value.trim();
  if (currentText) {
    const newText = currentText + "\n\n" + text;
    if (expandableTextbox) {
      expandableTextbox.setValue(newText);
    } else {
      promptEl.value = newText;
    }
  } else {
    if (expandableTextbox) {
      expandableTextbox.setValue(text);
    } else {
      promptEl.value = text;
    }
  }
  console.log("✅ Side panel: Text appended to text box");
  // Focus the text box for better UX
  if (expandableTextbox) {
    expandableTextbox.focus();
  } else {
    promptEl.focus();
  }
}

// Debug function to test tab state functionality
window.debugTabState = async function() {
  console.log('🔧 Debug Tab State');
  
  // Get sidepanel state
  const storage = await new Promise((resolve) => {
    chrome.storage.local.get(['leetcodeProblem', 'tabState'], (res) => resolve(res));
  });
  console.log('Sidepanel Storage:', storage);
  console.log('Current problem:', currentProblem);
  console.log('Problem meta element text:', problemMetaEl.textContent);
  
  // Get background script state
  const bgResponse = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'debugTabState' }, (response) => resolve(response));
  });
  console.log('Background Response:', bgResponse);
  
  await updateTabState();
  console.log('After updateTabState:', problemMetaEl.textContent);
};

console.log("🛠️ Debug functions available: window.debugTabState()");


