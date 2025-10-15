const messagesEl = document.getElementById("messages");
const formEl = document.getElementById("chatForm");
const promptEl = document.getElementById("prompt");
const sendBtn = document.getElementById("sendBtn");
const problemMetaEl = document.getElementById("problemMeta");
const openOptionsBtn = document.getElementById("openOptions");

let currentProblem = null;

openOptionsBtn.addEventListener("click", async () => {
  if (chrome.runtime?.openOptionsPage) chrome.runtime.openOptionsPage();
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
    const system = {
      role: "system",
      content: `You are a LeetCode assistant. Use the provided problem context when relevant. If the problem is unknown, ask for the slug or link.`,
    };
    const context = currentProblem ? [{ role: "system", content: `Current problem slug: ${currentProblem.slug}${currentProblem.questionId ? ` (id ${currentProblem.questionId})` : ""}. URL: ${currentProblem.url}` }] : [];
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
})();


