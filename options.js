const apiKeyEl = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');

chrome.storage.local.get(['openaiApiKey'], (res) => {
  if (res.openaiApiKey) apiKeyEl.value = res.openaiApiKey;
});

saveBtn.addEventListener('click', () => {
  chrome.storage.local.set({ openaiApiKey: apiKeyEl.value.trim() }, () => {
    saveBtn.textContent = 'Saved!';
    setTimeout(() => saveBtn.textContent = 'Save', 1500);
  });
});
