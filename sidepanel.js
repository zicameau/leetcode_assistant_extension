const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const problemMetaEl = document.getElementById("problemMeta");
const openOptionsBtn = document.getElementById("openOptions");
const resetChatBtn = document.getElementById("resetChat");

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
  currentProblem = await loadProblemFromStorage();
  setProblemMeta(currentProblem);
  // Watch for problem changes from content script
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
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


