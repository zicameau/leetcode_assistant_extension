const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const problemMetaEl = document.getElementById("problemMeta");
const openOptionsBtn = document.getElementById("openOptions");
const resetChatBtn = document.getElementById("resetChat");

// [ADDED] ExpandableTextbox component instance
let expandableTextbox = null;

let currentProblem = null;
let selectionBuffer = null;

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
  
  if (content instanceof Node) {
    bubbleEl.appendChild(content);
  } else if (typeof content === "string") {
    bubbleEl.textContent = content;
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

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["openaiApiKey"], (res) => resolve(res.openaiApiKey || null));
  });
}

async function sendToModel(messages) {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("Set API key in options");
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
  // [MODIFIED] Use expandableTextbox to get value
  const content = expandableTextbox ? expandableTextbox.getValue().trim() : promptEl.value.trim();
  if (!content) return;
  
  // [MODIFIED] Clear textbox using expandableTextbox
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
     // show typing indicator while waiting for response
     const typing = document.createElement("span");
     typing.className = "typing";
     typing.innerHTML = "<span>.</span><span>.</span><span>.</span>";
     const placeholderBubble = addMessage("assistant", typing);

     const resp = await sendToModel([system, ...context, { role: "user", content }]);
     // Replace the typing indicator with the actual response
     placeholderBubble.innerHTML = resp.content || "(no response)";
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

// [ADDED] Initialize ExpandableTextbox component
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
    maxHeightRatio: 0.6, // [FIXED] 60% of viewport height (half to two-thirds range)
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
  formEl.insertBefore(expandableTextbox.getContainer(), sendBtn);
  
  // Update the promptEl reference to point to the new textarea
  window.promptEl = newTextarea;
}

// Init
(async function init() {
  // [ADDED] Initialize expandable textbox first
  initializeExpandableTextbox();
  
  currentProblem = await loadProblemFromStorage();
  setProblemMeta(currentProblem);
  await updateTabState();
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
  // [MODIFIED] Append to existing text in the text box using expandableTextbox
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
  // [MODIFIED] Focus the text box for better UX
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


