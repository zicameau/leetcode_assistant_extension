const openaiApiKeyEl = document.getElementById('openaiApiKey');
const geminiApiKeyEl = document.getElementById('geminiApiKey');
const claudeApiKeyEl = document.getElementById('claudeApiKey');
const selectedModelEl = document.getElementById('selectedModel');
const saveBtn = document.getElementById('saveBtn');

// Available models for each provider
const modelsByProvider = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
  ],
  gemini: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Experimental)' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { value: 'gemini-pro', label: 'Gemini Pro' }
  ],
  claude: [
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
  ]
};

// Load saved API keys and selected model
chrome.storage.local.get(['openaiApiKey', 'geminiApiKey', 'claudeApiKey', 'selectedModel', 'availableModels'], (res) => {
  if (res.openaiApiKey) openaiApiKeyEl.value = res.openaiApiKey;
  if (res.geminiApiKey) geminiApiKeyEl.value = res.geminiApiKey;
  if (res.claudeApiKey) claudeApiKeyEl.value = res.claudeApiKey;
  
  // Populate dropdown with detected available models if available
  if (res.availableModels) {
    updateModelDropdownFromAvailable(res.availableModels);
  } else {
    // Fallback: show all models based on API keys
    updateModelDropdown({
      openaiApiKey: res.openaiApiKey,
      geminiApiKey: res.geminiApiKey,
      claudeApiKey: res.claudeApiKey
    });
  }
  
  // Set selected model if it exists
  if (res.selectedModel) {
    selectedModelEl.value = res.selectedModel;
  }
});

// Update dropdown when API keys change
function updateModelDropdown(keys) {
  // Clear existing options (except the first placeholder)
  selectedModelEl.innerHTML = '<option value="">-- Select a model --</option>';
  
  // Add OpenAI models if API key exists
  if (keys.openaiApiKey && keys.openaiApiKey.trim()) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'OpenAI';
    modelsByProvider.openai.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      optgroup.appendChild(option);
    });
    selectedModelEl.appendChild(optgroup);
  }
  
  // Add Gemini models if API key exists
  if (keys.geminiApiKey && keys.geminiApiKey.trim()) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Google Gemini';
    modelsByProvider.gemini.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      optgroup.appendChild(option);
    });
    selectedModelEl.appendChild(optgroup);
  }
  
  // Add Claude models if API key exists
  if (keys.claudeApiKey && keys.claudeApiKey.trim()) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Anthropic Claude';
    modelsByProvider.claude.forEach(model => {
      const option = document.createElement('option');
      option.value = model.value;
      option.textContent = model.label;
      optgroup.appendChild(option);
    });
    selectedModelEl.appendChild(optgroup);
  }
}

// Update dropdown preview when typing API keys
[openaiApiKeyEl, geminiApiKeyEl, claudeApiKeyEl].forEach(input => {
  input.addEventListener('input', () => {
    const currentSelectedModel = selectedModelEl.value;
    updateModelDropdown({
      openaiApiKey: openaiApiKeyEl.value,
      geminiApiKey: geminiApiKeyEl.value,
      claudeApiKey: claudeApiKeyEl.value
    });
    // Try to restore the previously selected model if it's still available
    if (currentSelectedModel && Array.from(selectedModelEl.options).some(opt => opt.value === currentSelectedModel)) {
      selectedModelEl.value = currentSelectedModel;
    }
  });
});

// Model labels
const MODEL_LABELS = {
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4': 'GPT-4',
  'gpt-3.5-turbo': 'GPT-3.5 Turbo',
  'gemini-2.0-flash-exp': 'Gemini 2.0 Flash (Experimental)',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-pro': 'Gemini Pro',
  'claude-3-5-sonnet-20241022': 'Claude 3.5 Sonnet (Latest)',
  'claude-3-5-sonnet-20240620': 'Claude 3.5 Sonnet',
  'claude-3-opus-20240229': 'Claude 3 Opus',
  'claude-3-sonnet-20240229': 'Claude 3 Sonnet',
  'claude-3-haiku-20240307': 'Claude 3 Haiku'
};

// Update dropdown from detected available models
function updateModelDropdownFromAvailable(availableModels) {
  selectedModelEl.innerHTML = '<option value="">-- Select a model --</option>';
  
  let hasModels = false;
  
  // Add OpenAI models
  if (availableModels.openai && availableModels.openai.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'OpenAI';
    availableModels.openai.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = MODEL_LABELS[model] || model;
      optgroup.appendChild(option);
    });
    selectedModelEl.appendChild(optgroup);
    hasModels = true;
  }
  
  // Add Gemini models
  if (availableModels.gemini && availableModels.gemini.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Google Gemini';
    availableModels.gemini.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = MODEL_LABELS[model] || model;
      optgroup.appendChild(option);
    });
    selectedModelEl.appendChild(optgroup);
    hasModels = true;
  }
  
  // Add Claude models
  if (availableModels.claude && availableModels.claude.length > 0) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = 'Anthropic Claude';
    availableModels.claude.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = MODEL_LABELS[model] || model;
      optgroup.appendChild(option);
    });
    selectedModelEl.appendChild(optgroup);
    hasModels = true;
  }
  
  if (!hasModels) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '⚠️ No models available';
    option.disabled = true;
    selectedModelEl.appendChild(option);
  }
}

saveBtn.addEventListener('click', async () => {
  saveBtn.disabled = true;
  saveBtn.textContent = 'Detecting models...';
  
  const openaiKey = openaiApiKeyEl.value.trim();
  const geminiKey = geminiApiKeyEl.value.trim();
  const claudeKey = claudeApiKeyEl.value.trim();
  
  try {
    // Detect available models for each provider
    const availableModels = {
      openai: [],
      gemini: [],
      claude: []
    };
    
    if (openaiKey) {
      saveBtn.textContent = 'Testing OpenAI models...';
      const response = await chrome.runtime.sendMessage({
        type: 'detectModels',
        payload: { provider: 'openai', apiKey: openaiKey }
      });
      if (response.success) {
        availableModels.openai = response.models;
      }
    }
    
    if (geminiKey) {
      saveBtn.textContent = 'Testing Gemini models...';
      const response = await chrome.runtime.sendMessage({
        type: 'detectModels',
        payload: { provider: 'gemini', apiKey: geminiKey }
      });
      if (response.success) {
        availableModels.gemini = response.models;
      }
    }
    
    if (claudeKey) {
      saveBtn.textContent = 'Testing Claude models...';
      const response = await chrome.runtime.sendMessage({
        type: 'detectModels',
        payload: { provider: 'claude', apiKey: claudeKey }
      });
      if (response.success) {
        availableModels.claude = response.models;
      }
    }
    
    // Save everything including detected models
    const data = {
      openaiApiKey: openaiKey,
      geminiApiKey: geminiKey,
      claudeApiKey: claudeKey,
      availableModels: availableModels,
      selectedModel: selectedModelEl.value
    };
    
    chrome.storage.local.set(data, () => {
      // Update dropdown with detected models
      updateModelDropdownFromAvailable(availableModels);
      
      saveBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveBtn.textContent = 'Save';
        saveBtn.disabled = false;
      }, 1500);
    });
  } catch (err) {
    console.error('Error detecting models:', err);
    saveBtn.textContent = 'Error! Try again';
    setTimeout(() => {
      saveBtn.textContent = 'Save';
      saveBtn.disabled = false;
    }, 2000);
  }
});

// Listen for changes from other parts of the extension (like sidepanel)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  
  // Update selected model if changed from sidepanel
  if (changes.selectedModel && changes.selectedModel.newValue) {
    const newModel = changes.selectedModel.newValue;
    // Check if this model exists in our dropdown
    const modelExists = Array.from(selectedModelEl.options).some(opt => opt.value === newModel);
    if (modelExists) {
      selectedModelEl.value = newModel;
    }
  }
  
  // Update dropdown if available models changed
  if (changes.availableModels) {
    updateModelDropdownFromAvailable(changes.availableModels.newValue);
    
    // Try to preserve selection if it's still valid
    const currentSelectedModel = changes.selectedModel?.newValue || selectedModelEl.value;
    if (currentSelectedModel) {
      selectedModelEl.value = currentSelectedModel;
    }
  }
});
