// IMMEDIATE LOG - Verify script is loading
console.log('🔵 [SCRIPT LOAD] sidepanel.js is loading...');
if (typeof window !== 'undefined') {
  window._sidepanelLoaded = true;
  console.log('🔵 [SCRIPT LOAD] window object available');
}

const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const problemMetaEl = document.getElementById("problemMeta");
const openOptionsBtn = document.getElementById("openOptions");
const resetChatBtn = document.getElementById("resetChat");
const modelSelectEl = document.getElementById("modelSelect");

console.log('🔵 [SCRIPT LOAD] DOM elements queried');
// Auth UI elements
const authSignedOutEl = document.getElementById("authSignedOut");
const authSignedInEl = document.getElementById("authSignedIn");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authSignInBtn = document.getElementById("authSignIn");
const authRegisterBtn = document.getElementById("authRegister");
const authSignOutBtn = document.getElementById("authSignOut");
const authUserEmailEl = document.getElementById("authUserEmail");
const emailVerificationStatusEl = document.getElementById("emailVerificationStatus");
const verificationStatusTextEl = document.getElementById("verificationStatusText");
const resendVerificationBtn = document.getElementById("resendVerificationBtn");
const checkVerificationBtn = document.getElementById("checkVerificationBtn");

// Log button element status
console.log('[Auth] Sign out button element:', authSignOutBtn);
if (!authSignOutBtn) {
  console.error('[Auth] ❌ Sign out button element not found!');
} else {
  console.log('[Auth] ✅ Sign out button element found:', {
    id: authSignOutBtn.id,
    type: authSignOutBtn.type,
    disabled: authSignOutBtn.disabled,
    style: authSignOutBtn.style.display,
    visible: authSignOutBtn.offsetParent !== null
  });
}

// ExpandableTextbox component instance
let expandableTextbox = null;

let currentProblem = null;
let selectionBuffer = null;
let currentChatId = null;
const MAX_HISTORY_MESSAGES = 20;
let verificationMessageShown = false; // Track if we've shown verification success message

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
  currentChatId = null;
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

function getProblemKeyFromCurrentProblem() {
  if (currentProblem?.slug) return `leetcode:${currentProblem.slug}`;
  return 'general';
}

async function loadChatIdForProblem(problemKey) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['chatIdByProblem'], (res) => {
      const map = res.chatIdByProblem || {};
      resolve(map[problemKey] || null);
    });
  });
}

async function saveChatIdForProblem(problemKey, chatId) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['chatIdByProblem'], (res) => {
      const map = res.chatIdByProblem || {};
      map[problemKey] = chatId;
      chrome.storage.local.set({ chatIdByProblem: map }, () => resolve());
    });
  });
}

async function getOrCreateCurrentChatId(selectedModel) {
  if (!window.firebaseClient?.auth?.currentUser) return null; // not signed in → no persistence
  if (currentChatId) return currentChatId;
  const problemKey = getProblemKeyFromCurrentProblem();
  const existing = await loadChatIdForProblem(problemKey);
  if (existing) {
    currentChatId = existing;
    return currentChatId;
  }
  // Create new chat
  if (!window.chatApi?.createChat) return null;
  const title = currentProblem?.slug ? currentProblem.slug.replace(/-/g, ' ') : 'General Chat';
  const problemUrl = currentProblem?.url || null;
  const resp = await window.chatApi.createChat({
    title,
    problemKey,
    problemUrl,
    model: selectedModel || null
  });
  currentChatId = resp.chatId;
  await saveChatIdForProblem(problemKey, currentChatId);
  return currentChatId;
}

async function loadAndRenderHistoryForCurrentProblem() {
  try {
    if (!window.firebaseClient?.auth?.currentUser) return;
    const problemKey = getProblemKeyFromCurrentProblem();
    const existing = await loadChatIdForProblem(problemKey);
    if (!existing) return;
    currentChatId = existing;
    if (!window.chatApi?.listMessages) return;
    const msgs = await window.chatApi.listMessages(currentChatId);
    if (!Array.isArray(msgs) || msgs.length === 0) return;
    messagesEl.innerHTML = "";
    msgs.forEach((m) => {
      const role = m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'assistant' : 'user');
      addMessage(role, m.content || "");
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  } catch (e) {
    console.error('[History] Failed to load chat history:', e);
  }
}

async function buildHistoryMessagesForCurrentChat() {
  if (!currentChatId || !window.chatApi?.listMessages) return [];
  const msgs = await window.chatApi.listMessages(currentChatId, { max: 500 });
  if (!Array.isArray(msgs) || msgs.length === 0) return [];
  const mapped = msgs
    .filter(m => typeof m?.content === 'string' && m?.role)
    .map(m => ({ role: m.role, content: m.content }));
  if (mapped.length <= MAX_HISTORY_MESSAGES) return mapped;
  return mapped.slice(mapped.length - MAX_HISTORY_MESSAGES);
}

async function setAuthUi(user) {
  console.log('[Auth] setAuthUi called with user:', user ? { uid: user.uid, email: user.email } : null);
  
  if (user) {
    console.log('[Auth] Setting UI for signed-in user');
    if (authSignedOutEl) authSignedOutEl.style.display = 'none';
    if (authSignedInEl) authSignedInEl.style.display = '';
    if (authUserEmailEl) authUserEmailEl.textContent = user.email || '';
    
    // Log sign out button visibility
    if (authSignOutBtn) {
      console.log('[Auth] Sign out button should be visible:', {
        parentDisplay: authSignedInEl?.style.display,
        buttonDisplay: authSignOutBtn.style.display,
        buttonVisible: authSignOutBtn.offsetParent !== null,
        buttonDisabled: authSignOutBtn.disabled
      });
    }
    
    // Reset verification message flag if user changes
    const currentUserId = user.uid;
    if (window.lastVerifiedUserId !== currentUserId) {
      verificationMessageShown = false;
      window.lastVerifiedUserId = currentUserId;
    }
    
    // Update email verification status
    await updateEmailVerificationStatus(user);
  } else {
    console.log('[Auth] Setting UI for signed-out user');
    if (authSignedOutEl) authSignedOutEl.style.display = '';
    if (authSignedInEl) authSignedInEl.style.display = 'none';
    if (authUserEmailEl) authUserEmailEl.textContent = '';
    if (emailVerificationStatusEl) emailVerificationStatusEl.style.display = 'none';
    
    // Log sign out button visibility
    if (authSignOutBtn) {
      console.log('[Auth] Sign out button should be hidden:', {
        parentDisplay: authSignedInEl?.style.display,
        buttonDisplay: authSignOutBtn.style.display
      });
    }
    
    // Stop periodic checking when user signs out
    if (window.verificationCheckInterval) {
      clearInterval(window.verificationCheckInterval);
      window.verificationCheckInterval = null;
      console.log('[Email Verification] Stopped periodic verification checking');
    }
    // Reset verification message flag
    verificationMessageShown = false;
    window.lastVerifiedUserId = null;
  }
}

async function updateEmailVerificationStatus(user, skipReload = false) {
  console.log('[Email Verification] updateEmailVerificationStatus called for user:', { 
    uid: user?.uid, 
    email: user?.email, 
    emailVerified: user?.emailVerified 
  }, 'skipReload:', skipReload);
  
  if (!emailVerificationStatusEl || !verificationStatusTextEl) {
    console.warn('[Email Verification] ⚠️ UI elements not found');
    return;
  }
  
  try {
    // Check verification status (only reload if not skipping and not in token change)
    if (window.firebaseClient?.checkEmailVerified && !skipReload && !window._isProcessingTokenChange) {
      console.log('[Email Verification] checkEmailVerified function available, calling...');
      const isVerified = await window.firebaseClient.checkEmailVerified(false); // Don't force reload
      console.log('[Email Verification] Verification status result:', isVerified);
      user.emailVerified = isVerified;
    } else {
      if (skipReload) {
        console.log('[Email Verification] Skipping reload, using user.emailVerified directly:', user.emailVerified);
      } else {
        console.warn('[Email Verification] ⚠️ checkEmailVerified function not available or token change in progress');
        console.log('[Email Verification] Using user.emailVerified directly:', user.emailVerified);
      }
    }
    
    if (user.emailVerified) {
      console.log('[Email Verification] ✅ Email is verified, showing verified UI');
      emailVerificationStatusEl.style.display = 'flex';
      emailVerificationStatusEl.className = 'emailVerificationStatus verified';
      verificationStatusTextEl.textContent = '✓ Email verified';
      verificationStatusTextEl.className = 'verificationStatusText verified';
      if (resendVerificationBtn) resendVerificationBtn.style.display = 'none';
      if (checkVerificationBtn) checkVerificationBtn.style.display = 'none';
    } else {
      console.log('[Email Verification] ⚠️ Email is not verified, showing unverified UI');
      emailVerificationStatusEl.style.display = 'flex';
      emailVerificationStatusEl.className = 'emailVerificationStatus';
      verificationStatusTextEl.textContent = '⚠ Email not verified. Check your inbox.';
      verificationStatusTextEl.className = 'verificationStatusText unverified';
      if (resendVerificationBtn) resendVerificationBtn.style.display = 'block';
      if (checkVerificationBtn) checkVerificationBtn.style.display = 'block';
    }
  } catch (error) {
    console.error('[Email Verification] ❌ Error checking email verification:', error);
    console.error('[Email Verification] Error details:', {
      code: error?.code,
      message: error?.message,
      stack: error?.stack
    });
    // Default to showing unverified if we can't check
    emailVerificationStatusEl.style.display = 'flex';
    emailVerificationStatusEl.className = 'emailVerificationStatus';
    verificationStatusTextEl.textContent = '⚠ Email verification status unknown';
    verificationStatusTextEl.className = 'verificationStatusText unverified';
    if (resendVerificationBtn) resendVerificationBtn.style.display = 'block';
  }
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
    // Ensure chat exists for current problem (if signed in)
    const selectedModel = await getSelectedModel();
    const chatId = await getOrCreateCurrentChatId(selectedModel);
    if (chatId && window.chatApi?.addMessageToChat) {
      // Persist the user message before sending to model
      await window.chatApi.addMessageToChat({ chatId, role: 'user', content });
    }

    // Load prior chat history to include in prompt
    let priorHistory = [];
    try {
      priorHistory = await buildHistoryMessagesForCurrentChat();
    } catch (_) {}

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

    const resp = await sendToModel([system, ...context, ...priorHistory, { role: "user", content }]);
     // Replace the typing indicator with formatted response
     placeholderBubble.innerHTML = '';
     const formatted = formatMessageWithCodeBlocks(resp.content || "(no response)");
     placeholderBubble.appendChild(formatted);
     // Persist assistant response
     if (chatId && window.chatApi?.addMessageToChat) {
       const assistantText = typeof resp?.content === 'string' ? resp.content : String(resp?.content || '');
       if (assistantText) {
         await window.chatApi.addMessageToChat({ chatId, role: 'assistant', content: assistantText });
       }
     }
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

// Set up sign in button handler (always available, not dependent on Firebase loading)
if (authSignInBtn) {
  console.log('[Auth] Setting up sign in button event listener...');
  
  authSignInBtn.addEventListener('click', async (e) => {
    console.log('[Auth] ========== SIGN IN BUTTON CLICKED ==========');
    console.log('[Auth] Event:', e);
    console.log('[Auth] Button element:', authSignInBtn);
    console.log('[Auth] Button disabled?', authSignInBtn.disabled);
    
    // Prevent default if needed
    e.preventDefault();
    e.stopPropagation();
    
    const email = (authEmailInput?.value || '').trim();
    const password = (authPasswordInput?.value || '').trim();
    
    console.log('[Auth] Email provided:', email ? 'Yes' : 'No');
    console.log('[Auth] Password provided:', password ? 'Yes' : 'No');
    
    if (!email || !password) {
      console.warn('[Auth] ⚠️ Sign in skipped: empty email or password');
      addMessage('assistant', 'Please enter both email and password.');
      return;
    }
    
    authSignInBtn.disabled = true;
    authRegisterBtn && (authRegisterBtn.disabled = true);
    const originalSignInText = authSignInBtn.textContent;
    authSignInBtn.textContent = 'Signing in...';
    
    try {
      console.log('[Auth] Checking for sign in function...');
      console.log('[Auth] window.authApi:', window.authApi);
      console.log('[Auth] window.authApi?.signInWithEmailPassword:', window.authApi?.signInWithEmailPassword);
      console.log('[Auth] window.firebaseClient:', window.firebaseClient);
      console.log('[Auth] window.firebaseClient?.signInWithEmailPassword:', window.firebaseClient?.signInWithEmailPassword);
      
      // Try to set up window.authApi if it doesn't exist but firebaseClient is available
      if (!window.authApi && window.firebaseClient) {
        console.log('[Auth] window.authApi not set up, creating it from firebaseClient...');
        const { signInWithEmailPassword: firebaseSignIn, registerWithEmailPassword: firebaseRegister, signOutUser: firebaseSignOut } = window.firebaseClient;
        if (firebaseSignIn) {
          window.authApi = {
            signInWithEmailPassword: firebaseSignIn,
            registerWithEmailPassword: firebaseRegister,
            signOutUser: firebaseSignOut,
            sendVerificationEmail: window.firebaseClient?.sendVerificationEmail,
            checkEmailVerified: window.firebaseClient?.checkEmailVerified
          };
          console.log('[Auth] ✅ window.authApi created from firebaseClient');
        }
      }
      
      // Try window.authApi first, then fallback to window.firebaseClient
      let signInFn = window.authApi?.signInWithEmailPassword || window.firebaseClient?.signInWithEmailPassword;
      
      if (!signInFn) {
        console.error('[Auth] ❌ signInWithEmailPassword function not available');
        console.error('[Auth] window.authApi exists?', !!window.authApi);
        console.error('[Auth] window.firebaseClient exists?', !!window.firebaseClient);
        console.error('[Auth] Available in window.authApi:', Object.keys(window.authApi || {}));
        console.error('[Auth] Available in window.firebaseClient:', Object.keys(window.firebaseClient || {}));
        addMessage('assistant', 'Sign in failed: Authentication service not available. Please refresh the page.');
        return;
      }
      
      console.log('[Auth] ✅ Sign in function found:', signInFn);
      
      console.log('[Email Verification] Sign in attempt for:', email);
      console.log('[Auth] Calling signInWithEmailPassword with function:', signInFn);
      console.log('[Auth] Function type:', typeof signInFn);
      
      // Add timeout to prevent hanging
      console.log('[Auth] Starting sign in promise...');
      const signInPromise = signInFn(email, password);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign in timed out after 10 seconds')), 10000)
      );
      
      console.log('[Auth] Waiting for sign in to complete...');
      let userCredential;
      try {
        userCredential = await Promise.race([signInPromise, timeoutPromise]);
        console.log('[Auth] ✅ Sign in promise resolved');
      } catch (promiseError) {
        console.error('[Auth] ❌ Sign in promise error:', promiseError);
        throw promiseError;
      }
      
      console.log('[Email Verification] Sign in successful:', { 
        uid: userCredential?.user?.uid, 
        email: userCredential?.user?.email,
        emailVerified: userCredential?.user?.emailVerified
      });
      console.log('[Auth] ✅ Sign in function returned successfully');
      
      // Immediately reset button state (before UI might update via auth state change)
      if (authSignInBtn) {
        authSignInBtn.disabled = false;
        authSignInBtn.textContent = originalSignInText;
        console.log('[Auth] Sign in button state reset immediately after success');
      }
      if (authRegisterBtn) {
        authRegisterBtn.disabled = false;
      }
      
      // Immediately check Firebase auth state
      console.log('[Auth] Checking Firebase auth state immediately after sign in...');
      const immediateUser = window.firebaseClient?.auth?.currentUser;
      console.log('[Auth] Immediate current user:', immediateUser ? { uid: immediateUser.uid, email: immediateUser.email } : 'null');
      
      if (authPasswordInput) authPasswordInput.value = '';
      
      // Check and notify about verification status
      if (userCredential?.user && !userCredential.user.emailVerified) {
        console.log('[Email Verification] ⚠️ User signed in but email not verified');
        addMessage('assistant', '⚠️ Your email is not verified. Please check your inbox for the verification email, or click "Resend" to send a new one.');
      } else {
        console.log('[Email Verification] ✅ User signed in and email is verified');
      }
      
      // Wait for auth state change with multiple checks
      console.log('[Auth] Waiting for auth state change to process...');
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const currentUser = window.firebaseClient?.auth?.currentUser;
        console.log(`[Auth] Check ${i + 1}/10 - Current user:`, currentUser ? { uid: currentUser.uid, email: currentUser.email } : 'null');
        
        if (currentUser) {
          console.log('[Auth] ✅ User found in auth state, breaking wait loop');
          break;
        }
      }
      
      // Final check if user is actually signed in
      const finalUser = window.firebaseClient?.auth?.currentUser;
      console.log('[Auth] Final current user check:', finalUser ? { uid: finalUser.uid, email: finalUser.email } : 'null');
      
      if (!finalUser) {
        console.error('[Auth] ❌ User not signed in after sign in attempt!');
        console.error('[Auth] userCredential.user:', userCredential?.user);
        console.error('[Auth] window.firebaseClient:', window.firebaseClient);
        console.error('[Auth] window.firebaseClient.auth:', window.firebaseClient?.auth);
        console.error('[Auth] window.firebaseClient.auth.currentUser:', window.firebaseClient?.auth?.currentUser);
        
        // Try to manually trigger auth state update
        console.log('[Auth] Attempting to manually update UI...');
        if (userCredential?.user) {
          console.log('[Auth] Using userCredential.user to update UI');
          await setAuthUi(userCredential.user);
        } else {
          console.error('[Auth] No user in credential, cannot update UI');
          addMessage('assistant', 'Sign in completed but authentication state was not updated. Please refresh the page.');
        }
      } else {
        console.log('[Auth] ✅ User is signed in, UI should update via auth state listener');
      }
      
    } catch (e) {
      console.error('[Auth] ❌ Sign in error:', e);
      console.error('[Auth] Error type:', typeof e);
      console.error('[Auth] Error constructor:', e?.constructor?.name);
      console.error('[Auth] Error details:', {
        code: e?.code,
        message: e?.message,
        name: e?.name,
        stack: e?.stack
      });
      
      const errorMessage = e?.message || String(e);
      addMessage('assistant', `Sign in failed: ${errorMessage}`);
    } finally {
      // Always restore button state, even if there was an error
      // But only if buttons still exist and are visible (UI might have changed)
      if (authSignInBtn && authSignInBtn.offsetParent !== null) {
        authSignInBtn.disabled = false;
        authSignInBtn.textContent = originalSignInText;
        console.log('[Auth] Sign in button state restored in finally block');
      }
      if (authRegisterBtn && authRegisterBtn.offsetParent !== null) {
        authRegisterBtn.disabled = false;
      }
      console.log('[Auth] ========== SIGN IN HANDLER COMPLETE ==========');
    }
  });
  
  console.log('[Auth] ✅ Sign in button event listener attached');
} else {
  console.error('[Auth] ❌ Cannot set up sign in button - element not found');
}

// Set up sign out button handler (always available, not dependent on Firebase loading)
if (authSignOutBtn) {
  console.log('[Auth] Setting up sign out button event listener...');
  
  // Use capture phase to ensure we catch the event early
  authSignOutBtn.addEventListener('click', async (e) => {
    console.log('[Auth] ========== SIGN OUT BUTTON CLICKED ==========');
    console.log('[Auth] Event:', e);
    console.log('[Auth] Event target:', e.target);
    console.log('[Auth] Event currentTarget:', e.currentTarget);
    console.log('[Auth] Button element:', authSignOutBtn);
    console.log('[Auth] Button disabled?', authSignOutBtn.disabled);
    console.log('[Auth] Button parent:', authSignOutBtn.parentElement);
    console.log('[Auth] Button visible?', authSignOutBtn.offsetParent !== null);
    
    // Prevent default and stop propagation immediately
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Store button reference in case DOM changes
    const buttonElement = authSignOutBtn;
    const buttonParent = buttonElement.parentElement;
    
    try {
      console.log('[Auth] Checking for sign out functions...');
      console.log('[Auth] window.authApi:', window.authApi);
      console.log('[Auth] window.authApi?.signOutUser:', window.authApi?.signOutUser);
      console.log('[Auth] window.firebaseClient:', window.firebaseClient);
      console.log('[Auth] window.firebaseClient?.signOutUser:', window.firebaseClient?.signOutUser);
      
      // Try window.authApi first, then fallback to window.firebaseClient
      let signOutFn = window.authApi?.signOutUser || window.firebaseClient?.signOutUser;
      
      if (!signOutFn) {
        console.error('[Auth] ❌ signOutUser function not available');
        console.error('[Auth] Available in window.authApi:', Object.keys(window.authApi || {}));
        console.error('[Auth] Available in window.firebaseClient:', Object.keys(window.firebaseClient || {}));
        addMessage('assistant', 'Sign out failed: Authentication service not available. Please refresh the page.');
        return;
      }
      
      console.log('[Auth] ✅ Sign out function found:', signOutFn);
      console.log('[Auth] Calling signOutUser...');
      
      // Disable button during sign out to prevent multiple clicks
      if (buttonElement) {
        buttonElement.disabled = true;
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Signing out...';
        console.log('[Auth] Button disabled and text changed');
      }
      
      // Call sign out function with timeout
      console.log('[Auth] Calling signOutFn...');
      const signOutPromise = signOutFn();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Sign out timed out after 5 seconds')), 5000)
      );
      
      const result = await Promise.race([signOutPromise, timeoutPromise]);
      console.log('[Auth] ✅ Sign out function returned:', result);
      console.log('[Auth] Sign out successful');
      
      // Immediately reset button state before UI updates
      if (buttonElement && buttonElement.parentElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = 'Sign out';
        console.log('[Auth] Button state reset before UI update');
      }
      
      // Check if auth state actually changed
      console.log('[Auth] Checking current user after sign out...');
      const currentUserAfterSignOut = window.firebaseClient?.auth?.currentUser;
      console.log('[Auth] Current user after sign out:', currentUserAfterSignOut);
      
      // Wait a bit for auth state change to process
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // If user is still signed in, force UI update
      const stillSignedIn = window.firebaseClient?.auth?.currentUser;
      if (stillSignedIn) {
        console.warn('[Auth] ⚠️ User still signed in after sign out, forcing UI update');
        await setAuthUi(null);
      }
      
      console.log('[Auth] Sign out complete, UI should update via auth state listener');
      
      // The auth state change listener will handle UI updates
    } catch (e) {
      console.error('[Auth] ❌ Sign out error:', e);
      console.error('[Auth] Error type:', typeof e);
      console.error('[Auth] Error constructor:', e?.constructor?.name);
      console.error('[Auth] Error details:', {
        code: e?.code,
        message: e?.message,
        name: e?.name,
        stack: e?.stack
      });
      
      // Re-enable button on error
      if (buttonElement && buttonElement.parentElement) {
        buttonElement.disabled = false;
        buttonElement.textContent = 'Sign out';
        console.log('[Auth] Button re-enabled after error');
      } else {
        console.warn('[Auth] ⚠️ Cannot re-enable button - element or parent not found');
      }
      
      const errorMessage = e?.message || String(e);
      console.error('[Auth] Showing error message to user:', errorMessage);
      addMessage('assistant', `Sign out failed: ${errorMessage}`);
      
      // Try to check auth state even after error
      try {
        const currentUser = window.firebaseClient?.auth?.currentUser;
        console.log('[Auth] Current user after error:', currentUser);
        if (!currentUser) {
          console.log('[Auth] User actually signed out despite error, updating UI');
          await setAuthUi(null);
        }
      } catch (checkError) {
        console.error('[Auth] Error checking user state:', checkError);
      }
    }
    console.log('[Auth] ========== SIGN OUT HANDLER COMPLETE ==========');
  }, true); // Use capture phase
  
  console.log('[Auth] ✅ Sign out button event listener attached (capture phase)');
  
  // Also try mousedown as backup
  authSignOutBtn.addEventListener('mousedown', (e) => {
    console.log('[Auth] Sign out button mousedown event');
    e.preventDefault(); // Prevent any default behavior
  });
  
} else {
  console.error('[Auth] ❌ Cannot set up sign out button - element not found');
}

// Init
(async function init() {
  // [ADDED] Initialize expandable textbox first
  initializeExpandableTextbox();
  
  // Initialize model dropdown
  await updateModelDropdown();
  
  // Initialize Firebase Auth (guarded; requires firebaseBundle.js to be built/loaded)
  try {
    if (window.firebaseClient) {
      const {
        initAuthPersistence,
        enableOfflinePersistenceSafe,
        onAuthChanged,
        onIdTokenChangedListener,
        signInWithEmailPassword,
        registerWithEmailPassword,
        signOutUser
      } = window.firebaseClient;
      
      await initAuthPersistence();
      await enableOfflinePersistenceSafe();
      
      // Listen for auth state changes
      const authStateUnsubscribe = onAuthChanged(async (user) => {
        console.log('[Auth] ========== AUTH STATE CHANGED ==========');
        console.log('[Auth] New user state:', user ? { uid: user.uid, email: user.email } : 'null (signed out)');
        console.log('[Auth] Stack trace:', new Error().stack);
        
        // Verify the user matches Firebase auth
        const firebaseUser = window.firebaseClient?.auth?.currentUser;
        console.log('[Auth] Firebase auth.currentUser:', firebaseUser ? { uid: firebaseUser.uid, email: firebaseUser.email } : 'null');
        console.log('[Auth] Users match?', (user?.uid === firebaseUser?.uid) || (!user && !firebaseUser));
        
        if (user) {
          console.log('[Email Verification] Auth state changed - user signed in:', { 
            uid: user.uid, 
            email: user.email, 
            emailVerified: user.emailVerified 
          });
          // Ensure user profile document exists and is updated
          window.firebaseClient.ensureUserProfile().catch((e) => {
            console.error('[Auth] ensureUserProfile failed:', e);
          });
          console.log('[Auth] Calling setAuthUi with user...');
          await setAuthUi(user);
          console.log('[Auth] setAuthUi completed');
          // After sign-in, try to load existing history for the current problem
          void loadAndRenderHistoryForCurrentProblem();
          
          // Start periodic checking if email is not verified
          if (!user.emailVerified) {
            startPeriodicVerificationCheck(user);
          }
        } else {
          console.log('[Email Verification] Auth state changed - user signed out');
          console.log('[Auth] Updating UI to signed-out state...');
          await setAuthUi(null);
          console.log('[Auth] UI updated to signed-out state');
        }
        console.log('[Auth] ========== AUTH STATE CHANGE HANDLED ==========');
      });
      
      // Store unsubscribe function for debugging
      window._authStateUnsubscribe = authStateUnsubscribe;
      console.log('[Auth] Auth state listener set up, unsubscribe function stored in window._authStateUnsubscribe');
      
      // Listen for ID token changes (fires when email is verified)
      // Add guard to prevent infinite loops
      let isProcessingTokenChange = false;
      window._isProcessingTokenChange = false; // Global flag for firebaseClient to check
      
      if (onIdTokenChangedListener) {
        onIdTokenChangedListener(async (user) => {
          // Prevent recursive calls
          if (isProcessingTokenChange || window._isProcessingTokenChange) {
            console.log('[Email Verification] ⚠️ Token change already being processed, skipping...');
            return;
          }
          
          if (user) {
            isProcessingTokenChange = true;
            window._isProcessingTokenChange = true;
            
            console.log('[Email Verification] ID token changed - checking verification status:', { 
              uid: user.uid, 
              email: user.email, 
              emailVerified: user.emailVerified 
            });
            
            try {
              // Use the user object directly from token change - DON'T reload (it causes infinite loop)
              const wasVerified = window.firebaseClient.lastKnownVerifiedStatus || false;
              const isVerified = user.emailVerified; // Use value from token change event
              window.firebaseClient.lastKnownVerifiedStatus = isVerified;
              
              console.log('[Email Verification] Verification status - was:', wasVerified, 'now:', isVerified);
              
              if (!wasVerified && isVerified) {
                console.log('[Email Verification] 🎉 Email verification detected! User just verified their email.');
                // Update UI immediately without reloading
                const currentUser = window.firebaseClient?.auth?.currentUser;
                if (currentUser) {
                  currentUser.emailVerified = true;
                  await updateEmailVerificationStatus(currentUser, true); // Skip reload
                  // Don't show message - user already knows their email is verified
                  verificationMessageShown = true;
                }
                
                // Stop periodic checking since email is now verified
                if (window.verificationCheckInterval) {
                  clearInterval(window.verificationCheckInterval);
                  window.verificationCheckInterval = null;
                  console.log('[Email Verification] Stopped periodic checking - email is now verified');
                }
              } else if (isVerified) {
                // Already verified, just update UI without reloading
                const currentUser = window.firebaseClient?.auth?.currentUser;
                if (currentUser) {
                  currentUser.emailVerified = true;
                  await updateEmailVerificationStatus(currentUser, true); // Skip reload
                }
              }
            } catch (error) {
              console.error('[Email Verification] Error checking verification on token change:', error);
            } finally {
              // Reset flag after a delay to allow the token change to complete
              setTimeout(() => {
                isProcessingTokenChange = false;
                window._isProcessingTokenChange = false;
              }, 1000);
            }
          } else {
            isProcessingTokenChange = false;
            window._isProcessingTokenChange = false;
          }
        });
      }
      
      // Temporary helpers for quick manual testing in the console
      window.authApi = {
        signInWithEmailPassword,
        registerWithEmailPassword,
        signOutUser,
        sendVerificationEmail: window.firebaseClient?.sendVerificationEmail,
        checkEmailVerified: window.firebaseClient?.checkEmailVerified
      };
      console.log('🧩 Auth helpers available: window.authApi');
      console.log('[Auth] window.authApi.signOutUser:', window.authApi.signOutUser);
      console.log('[Auth] Type of signOutUser:', typeof window.authApi.signOutUser);

      // Expose basic chat Firestore helpers for manual testing
      const {
        createChat,
        addMessageToChat,
        listChats,
        listMessages
      } = window.firebaseClient;
      window.chatApi = {
        createChat,
        addMessageToChat,
        listChats,
        listMessages
      };
      console.log('🧩 Chat helpers available: window.chatApi');

      // Note: Sign in button handler is set up outside this block to ensure it's always available

      authRegisterBtn?.addEventListener('click', async () => {
        const email = (authEmailInput?.value || '').trim();
        const password = (authPasswordInput?.value || '').trim();
        if (!email || !password) {
          console.log('[Email Verification] Registration skipped: empty email or password');
          return;
        }
        console.log('[Email Verification] Registration button clicked for:', email);
        authSignInBtn && (authSignInBtn.disabled = true);
        authRegisterBtn.disabled = true;
        try {
          console.log('[Email Verification] Calling registerWithEmailPassword...');
          const userCredential = await window.authApi.registerWithEmailPassword(email, password);
          console.log('[Email Verification] Registration successful:', { 
            uid: userCredential.user?.uid, 
            email: userCredential.user?.email,
            emailVerified: userCredential.user?.emailVerified
          });
          if (authPasswordInput) authPasswordInput.value = '';
          addMessage('assistant', 'Registration successful! A verification email has been sent to your inbox. Please check your email and click the verification link.');
        } catch (e) {
          console.error('[Email Verification] Registration error:', e);
          console.error('[Email Verification] Error details:', {
            code: e?.code,
            message: e?.message,
            stack: e?.stack
          });
          addMessage('assistant', `Registration failed: ${e?.message || e}`);
        } finally {
          authSignInBtn && (authSignInBtn.disabled = false);
          authRegisterBtn.disabled = false;
        }
      });

      // Note: Sign out button handler is set up outside this block to ensure it's always available

      // Handle check verification button
      checkVerificationBtn?.addEventListener('click', async () => {
        console.log('[Email Verification] Check verification button clicked');
        const currentUser = window.firebaseClient?.auth?.currentUser;
        if (!currentUser) {
          console.warn('[Email Verification] No user signed in');
          return;
        }
        
        checkVerificationBtn.disabled = true;
        checkVerificationBtn.textContent = 'Checking...';
        try {
          if (window.firebaseClient?.checkEmailVerified) {
            const wasVerified = currentUser.emailVerified;
            const isVerified = await window.firebaseClient.checkEmailVerified(true); // Force reload for manual check
            currentUser.emailVerified = isVerified;
            
            if (!wasVerified && isVerified) {
              console.log('[Email Verification] 🎉 Email verification detected!');
              // Don't show message - user already knows their email is verified
              verificationMessageShown = true;
            } else if (isVerified) {
              // Don't show message for verified email
            } else {
              addMessage('assistant', '⚠️ Your email is not yet verified. Please check your inbox and click the verification link.');
            }
            
            await updateEmailVerificationStatus(currentUser);
          } else {
            addMessage('assistant', 'Unable to check verification status. Please try again later.');
          }
        } catch (e) {
          console.error('[Email Verification] Error checking verification:', e);
          addMessage('assistant', `Error checking verification: ${e?.message || e}`);
        } finally {
          checkVerificationBtn.disabled = false;
          checkVerificationBtn.textContent = 'Check';
        }
      });

      // Handle resend verification email button
      resendVerificationBtn?.addEventListener('click', async () => {
        console.log('[Email Verification] Resend button clicked');
        if (!window.firebaseClient?.sendVerificationEmail) {
          console.error('[Email Verification] ❌ sendVerificationEmail function not available');
          return;
        }
        console.log('[Email Verification] sendVerificationEmail function available, proceeding...');
        resendVerificationBtn.disabled = true;
        try {
          console.log('[Email Verification] Calling sendVerificationEmail...');
          await window.firebaseClient.sendVerificationEmail();
          console.log('[Email Verification] ✅ Resend successful');
          addMessage('assistant', 'Verification email sent! Please check your inbox.');
          resendVerificationBtn.textContent = 'Sent!';
          setTimeout(() => {
            resendVerificationBtn.textContent = 'Resend';
            resendVerificationBtn.disabled = false;
          }, 3000);
        } catch (e) {
          console.error('[Email Verification] ❌ Resend error:', e);
          console.error('[Email Verification] Error details:', {
            code: e?.code,
            message: e?.message,
            stack: e?.stack
          });
          addMessage('assistant', `Failed to send verification email: ${e?.message || e}`);
          resendVerificationBtn.disabled = false;
        }
      });
    } else {
      console.warn('[Auth] firebaseBundle.js not loaded yet; skip auth init');
    }
  } catch (e) {
    console.error('[Auth] Initialization error:', e);
  }
  
  currentProblem = await loadProblemFromStorage();
  setProblemMeta(currentProblem);
  await updateTabState();
  await loadAndRenderHistoryForCurrentProblem();
  
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
        // Try to load existing history for this problem
        void loadAndRenderHistoryForCurrentProblem();
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

// Function to start periodic verification checking
function startPeriodicVerificationCheck(user) {
  // Stop any existing interval
  if (window.verificationCheckInterval) {
    clearInterval(window.verificationCheckInterval);
  }
  
  console.log('[Email Verification] Starting periodic verification check (every 10 seconds)');
  
  // Check every 10 seconds if email is not verified
  window.verificationCheckInterval = setInterval(async () => {
    const currentUser = window.firebaseClient?.auth?.currentUser;
    if (!currentUser || currentUser.uid !== user.uid) {
      // User changed or signed out, stop checking
      clearInterval(window.verificationCheckInterval);
      window.verificationCheckInterval = null;
      console.log('[Email Verification] Stopped periodic checking - user changed');
      return;
    }
    
    try {
      console.log('[Email Verification] Periodic check - verifying status...');
      if (window.firebaseClient?.checkEmailVerified) {
        const wasVerified = currentUser.emailVerified;
        const isVerified = await window.firebaseClient.checkEmailVerified();
        currentUser.emailVerified = isVerified;
        
        if (!wasVerified && isVerified) {
          console.log('[Email Verification] 🎉 Email verification detected during periodic check!');
          await updateEmailVerificationStatus(currentUser);
          
          // Don't show message - user already knows their email is verified
          verificationMessageShown = true;
          
          // Stop checking since email is now verified
          clearInterval(window.verificationCheckInterval);
          window.verificationCheckInterval = null;
          console.log('[Email Verification] Stopped periodic checking - email is now verified');
        } else if (isVerified) {
          // Already verified, just update UI and stop checking
          await updateEmailVerificationStatus(currentUser);
          clearInterval(window.verificationCheckInterval);
          window.verificationCheckInterval = null;
          console.log('[Email Verification] Stopped periodic checking - email is verified');
        }
      }
    } catch (error) {
      console.error('[Email Verification] Error during periodic check:', error);
    }
  }, 10000); // Check every 10 seconds
}

console.log("🛠️ Debug functions available: window.debugTabState()");


