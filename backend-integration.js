/**
 * [ADDED] Backend Integration Helpers
 * - Stores messages & embeddings when authenticated (non-guest)
 * - Falls back to normal send when guest
 */
const BACKEND_URL = 'http://localhost:5000';

async function bi_loadAuth() {
  return await new Promise((resolve) => {
    chrome.storage.local.get(['backendApiToken', 'backendGuest'], (res) => resolve(res));
  });
}

async function bi_sendMessageToBackend(messageData) {
  const { backendApiToken } = await bi_loadAuth();
  if (!backendApiToken) throw new Error('Not authenticated');
  const resp = await fetch(`${BACKEND_URL}/api/messages/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backendApiToken}`
    },
    body: JSON.stringify(messageData)
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Failed to store message');
  return data;
}

async function bi_getRagContext(query, topK = 3, problemSlug = null) {
  const { backendApiToken } = await bi_loadAuth();
  if (!backendApiToken) return { context: [] };
  const resp = await fetch(`${BACKEND_URL}/api/rag/context`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backendApiToken}`
    },
    body: JSON.stringify({ query, top_k: topK, problem_slug: problemSlug })
  });
  const data = await resp.json();
  if (!resp.ok || !data.success) return { context: [] };
  return data;
}

// Public: wraps existing sendToModel
async function sendToModelWithBackend(messages, problem) {
  // store user message
  const userMsg = messages[messages.length - 1];
  if (userMsg?.role === 'user') {
    try {
      await bi_sendMessageToBackend({
        role: 'user',
        content: userMsg.content,
        problem_slug: problem?.slug || null,
        problem_id: problem?.questionId || null,
        problem_url: problem?.url || null
      });
    } catch (_) {}
  }
  // enrich with RAG context
  let rag = [];
  if (userMsg?.role === 'user') {
    try {
      const res = await bi_getRagContext(userMsg.content, 3, problem?.slug || null);
      if (res?.context?.length) rag = res.context;
    } catch (_) {}
  }
  // call original model
  const resp = await sendToModel([...rag, ...messages]);
  // store assistant reply
  try {
    if (resp?.content) {
      await bi_sendMessageToBackend({
        role: 'assistant',
        content: resp.content,
        problem_slug: problem?.slug || null,
        problem_id: problem?.questionId || null,
        problem_url: problem?.url || null
      });
    }
  } catch (_) {}
  return resp;
}


