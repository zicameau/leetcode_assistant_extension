# LeetCode Helper — Chrome Extension

> **A quick-access LeetCode sidebar that debugs your code, explains logic step-by-step, and recommends **minimal** fixes without leaving the page.**  
> Short pitch: *Streamline asking an LLM about your in-progress LeetCode solution — no context juggling, no tab switching.*


---

## Table of Contents TO BE COMPLETED

- [Overview](#overview)  
- [Key Features](#key-features)  
- [Software Product Statement](#software-product-statement)  
- [User Stories](#user-stories)  
- [How It Works](#how-it-works)  
- [Architecture](#architecture)  
- [Permissions](#permissions)  
- [Getting Started](#getting-started)  
- [Configuration](#configuration)  
- [Usage](#usage)  
- [Prompts & Guardrails](#prompts--guardrails)  
- [Roadmap (8 weeks)](#roadmap-8-weeks)  
- [Contributing](#contributing)  
- [Security & Privacy](#security--privacy)  
- [License](#license)

---

## Overview

**LeetCode Helper** adds a right-side panel on problem pages that:
- Detects the **current problem** (title, URL, difficulty).
- Parses your **in-editor code** (language, content, runtime/compile messages where available).
- Lets you ask targeted questions like “why does this TLE on case X?” or “is there a simpler loop?”
- Returns **minimal diffs** that preserve your style and variable names, with explicit **time/space complexity** notes.
- Explains solution logic **before** revealing a full implementation (unless you ask for it).

> Users authenticate with **their own** API keys from OpenAI, Google Gemini, or Anthropic Claude. Choose your preferred AI model from the settings dropdown.

---

## Key Features

- ✅ **Quick-access sidebar** on LeetCode pages (no tab/context switching).  
- ✅ **Minimal-change recommendations**: keep identifiers & style; propose surgical edits.  
- ✅ **Logic-first coaching**: explain approach & invariants before full solutions.  
- ✅ **Time/space complexity feedback** on your current approach and on suggested tweaks.  
- ✅ **Problem auto-detection & code parsing** (language-aware).  
- ✅ **Multi-provider support**: OpenAI (GPT-4o, GPT-4, etc.), Google Gemini (1.5 Pro, 2.0 Flash, etc.), and Anthropic Claude (3.5 Sonnet, Opus, etc.)  
- ✅ **Automatic model detection**: Extension tests your API keys and only shows models you have access to
- ✅ **Smart model selection**: Dropdown automatically updates based on your account tier  
- ✅ **Guest mode**: use the extension without login; no DB/Pinecone writes  
- ✅ **Pinecone via backend**: keys live in server `.env`; users only add an OpenAI key in the extension  

---

## Authentication & Storage Flow

- Lightweight login/signup modal appears as soon as the sidepanel opens; existing chat UI styling is unchanged.
- Login message: “You must log in to enable the extension’s advanced features (like storing debugging history or searching past code).”
- After a successful login/sign‑up, if no OpenAI key is present, the extension shows a small prompt to open Settings and add one.
- Guest mode is treated as authenticated for UI access:
  - The login modal reliably disappears and stays hidden.
  - No prompts for keys.
  - No database writes and no Pinecone/RAG calls (pure local usage).
- Non‑guest (authenticated) mode:
  - Messages are stored in the backend database.
  - Embeddings are generated with OpenAI `text-embedding-3-small` and written to the Pinecone index `sjsunlp` (auto‑created if missing).
  - RAG endpoints are enabled for semantic search over prior messages.
- A quick “🔑” header button lets users open the login modal anytime to switch from guest to a logged‑in session.

---

## Software Product Statement

Our LeetCode extension, available in **8 weeks**, is a browser tool that enhances learning, helping students and coding interview candidates track their LeetCode progress, identify weaknesses, and **offer improvements on their code with minimal intervention**.

---

## User Stories

- **As a student**, I want the chatbot to assist with LeetCode problems **without copy-pasting** code into another tab. It should access what’s in my editor and help debug issues in place.  
- **As an interview-prep student**, I want to understand the solution **step-by-step** without spoiling the full solution unless I ask for it. I want to track **where I’m weak** over time.  
- **As a user**, I want a Chrome extension that **identifies the current problem**, **parses my code**, and lets me **ask where bugs or improvements might be**.

> We aim to **streamline** the process of asking an LLM about your code, **never leaving the LeetCode page**.

---

## How It Works

1. **Content Script** injects a sidebar on `leetcode.com` problem pages.  
2. On load / change, the script **reads problem metadata** and **extracts editor code**.  
3. The sidebar **renders a chat** (React) with our **custom prompts** & safety rails.  
4. When you ask for help, the extension sends a **structured prompt** (problem + code + intent) to the OpenAI API **using your key**.  
5. Responses are **post-processed** to:  
   - Highlight **minimal diffs** (patch blocks).  
   - Annotate **time/space complexity**.  
   - Prioritize **logic explanations** before code.  
6. You can **apply suggestions** manually or copy a patch snippet.

---

## Architecture

### File Structure
```
leetcode_assistant_extension/
├── manifest.json          # Extension configuration (Manifest V3)
├── contentScript.js       # Runs on LeetCode pages, detects problems
├── background.js          # Service worker, manages side panel & API
├── sidepanel.html         # Chat interface UI
├── sidepanel.js           # Chat logic and messaging
├── sidepanel.css          # Styling for side panel
├── options.html           # Settings page UI
├── options.js             # Settings page logic
├── chatapp2.py            # Standalone Streamlit chatbot (optional)
├── requirements.txt       # Python dependencies for Streamlit
├── leetcode-600x400.png   # Extension icon
└── README.md              # This file
```

### Component Flow

```
┌─────────────────────┐
│  LeetCode.com       │ ← User visits problem page
│  (Problem Page)     │
└──────────┬──────────┘
           │
           ↓ Detects problem & selections
┌─────────────────────┐
│  contentScript.js   │ • Extracts problem slug/ID
│                     │ • Monitors URL changes (SPA)
│                     │ • Shows "Ask Assistant" button on text selection
│                     │ • Sends messages to background
└──────────┬──────────┘
           │
           ↓ chrome.runtime.sendMessage()
┌─────────────────────┐
│  background.js      │ • Manages side panel state
│  (Service Worker)   │ • Stores data in chrome.storage
│                     │ • Makes OpenAI API calls
│                     │ • Routes messages between components
└──────────┬──────────┘
           │
           ↓ Opens & communicates with
┌─────────────────────┐
│  sidepanel.html/js  │ • Chat interface
│                     │ • Displays current problem
│                     │ • Sends user questions to OpenAI
│                     │ • Shows AI responses
│                     │ • Manages conversation history
└─────────────────────┘
           │
           ↓ API calls via background.js
┌─────────────────────┐
│  AI Provider APIs   │ • OpenAI (GPT-4o, GPT-4, GPT-3.5, etc.)
│  (User's Choice)    │ • Google Gemini (1.5 Pro, 2.0 Flash, etc.)
│                     │ • Anthropic Claude (3.5 Sonnet, Opus, etc.)
│                     │ • Uses LeetCode coaching system prompt
└─────────────────────┘
```

### Key Technologies
- **Manifest V3** - Latest Chrome extension standard
- **Vanilla JavaScript** - No frameworks for lightweight performance
- **Chrome APIs**: Storage, Side Panel, Scripting, Messaging
- **Multi-provider AI APIs**:
  - OpenAI Chat Completions API
  - Google Gemini API
  - Anthropic Claude Messages API
- **Monaco Editor Detection** - Handles LeetCode's code editor
- **MutationObserver** - Tracks DOM changes for SPA navigation

---

## Permissions

The extension requires the following Chrome permissions:

| Permission | Purpose |
|------------|---------|
| `sidePanel` | Display the chat interface as a side panel |
| `storage` | Store API key, problem data, and conversation history locally |
| `activeTab` | Read content from the current LeetCode tab |
| `scripting` | Inject content scripts into LeetCode pages |

### Host Permissions

| Host | Purpose |
|------|---------|
| `https://leetcode.com/*` | Access LeetCode.com pages |
| `https://*.leetcode.com/*` | Access LeetCode subdomains |
| `https://leetcode.cn/*` | Support Chinese LeetCode |
| `https://*.leetcode.cn/*` | Support Chinese LeetCode subdomains |
| `https://api.openai.com/*` | Make API calls to OpenAI |
| `https://generativelanguage.googleapis.com/*` | Make API calls to Google Gemini |
| `https://api.anthropic.com/*` | Make API calls to Anthropic Claude |

**Privacy Note**: All data stays local. We don't send anything to third-party servers except the AI provider you choose (OpenAI, Google, or Anthropic) using your own API key.

---

## Getting Started

### Prerequisites
- **Google Chrome** (version 114+) or **Chromium-based browser**
- **AI Provider API Key** (at least one):
  - **OpenAI**: Get one at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
  - **Google Gemini**: Get one at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
  - **Anthropic Claude**: Get one at [console.anthropic.com/account/keys](https://console.anthropic.com/account/keys)

### Installation

#### Option 1: Load Unpacked (Developer Mode)

1. **Clone or download** this repository:
   ```bash
   git clone https://github.com/yourusername/leetcode_assistant_extension.git
   cd leetcode_assistant_extension
   ```

2. **Open Chrome Extensions** page:
   - Navigate to `chrome://extensions/`
   - Or click Menu (⋮) → Extensions → Manage Extensions

3. **Enable Developer Mode**:
   - Toggle the switch in the top-right corner

4. **Load the extension**:
   - Click "Load unpacked"
   - Select the `leetcode_assistant_extension` folder

5. **Verify installation**:
   - You should see "LeetCode Assistant" in your extensions list
   - The extension icon should appear in your toolbar

#### Option 2: Chrome Web Store (Coming Soon)
*The extension will be published to the Chrome Web Store in the future.*

---

## Configuration

### Set Up Your API Keys and Model

1. **Open Extension Settings**:
   - **Method 1**: Right-click the extension icon → "Options"
   - **Method 2**: Go to `chrome://extensions/` → Click "Details" under LeetCode Assistant → "Extension options"
   - **Method 3**: Click the ⚙️ settings icon in the side panel

2. **Enter Your API Key(s)**:
   You can add one or more API keys from different providers:
   - **OpenAI API Key**: Paste your key (starts with `sk-...`)
   - **Google Gemini API Key**: Paste your key (starts with `AIza...`)
   - **Anthropic Claude API Key**: Paste your key (starts with `sk-ant-...`)

3. **Save and Auto-Detect Models**:
   - Click "Save" to test your API keys
   - The extension will automatically detect which models are available for your account
   - This process takes ~10-30 seconds depending on how many providers you use
   - You'll see progress: "Testing OpenAI models...", "Testing Gemini models...", etc.
   - Only minimal API calls (5 tokens each) are used to minimize costs

4. **Select Your Model**:
   - After detection, the dropdown shows **ONLY** models you have access to
   - Choose your preferred model from the dropdown
   - Models vary based on your API tier:
     - **OpenAI**: May show GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-4, GPT-3.5 Turbo
     - **Google Gemini**: May show Gemini 2.0 Flash, Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini Pro
     - **Anthropic Claude**: May show Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Sonnet, Claude 3 Haiku
   - If a model doesn't appear, your API key doesn't have access to it

5. **Security**:
   - All API keys are stored **locally** in your browser using `chrome.storage.local`
   - They're **never sent** to any server except the official API of the provider you selected
   - You can clear them anytime from the options page

---

## Usage

### Basic Workflow

1. **Visit a LeetCode problem**:
   - Go to any problem page, e.g., `https://leetcode.com/problems/two-sum/`

2. **Open the assistant**:
   - Click the extension icon in your toolbar
   - The side panel will open on the right side

3. **Verify problem detection**:
   - You should see the problem name at the top (e.g., "two sum · #1")
   - If not detected, refresh the page

4. **Ask questions**:
   - Type your question in the input box
   - Examples:
     - "Can you give me a hint for this problem?"
     - "What pattern should I use?"
     - "Explain the two pointers approach"
     - "What's the time complexity of a brute force solution?"

5. **Get contextual help**:
   - The AI knows which problem you're on
   - It provides hints before full solutions
   - Explanations include time/space complexity

### Advanced Features

#### Selection-Based Questions

1. **Select text or code** on the LeetCode page
2. Wait for the **"💬 Ask Assistant"** button to appear near your selection
3. Click it to send the selection to the chat
4. The side panel opens automatically with your selection ready to analyze

This is useful for:
- Getting explanations of specific code snippets
- Asking about error messages
- Understanding problem constraints
- Analyzing test cases

#### Resetting the Conversation

- Click the **↩️ Reset** button in the side panel header
- This clears the chat history but keeps the current problem context
- Useful when switching approaches or starting fresh

#### Navigation Handling

- The extension **automatically detects** when you navigate to a new problem
- The chat **auto-resets** when the problem changes
- Problem metadata updates in real-time

---

## Prompts & Guardrails

### System Prompt Philosophy

The assistant uses a carefully crafted system prompt that emphasizes:

1. **Educational Focus**:
   - Teach problem-solving patterns (two pointers, sliding window, DP, etc.)
   - Encourage understanding over memorization
   - Build algorithmic thinking skills

2. **Hints-First Approach**:
   - Provides **incremental hints** before revealing solutions
   - Uses Socratic questioning: "What if you kept a window invariant?"
   - Escalates only when needed: small hint → bigger hint → outline → full solution

3. **Structured Framework**:
   - Restate the problem clearly
   - Identify constraints and edge cases
   - Design examples (including tricky ones)
   - Start with brute force, then optimize
   - Explain correctness (invariants, proofs)
   - Analyze time/space complexity
   - Provide clean, commented code

4. **Code Quality**:
   - Readable variable names
   - Helper functions for clarity
   - Brief docstrings and inline comments
   - Handles edge cases explicitly

### Guardrails & Safety

The system prompt includes explicit boundaries:

- ❌ **No contest cheating**: Won't solve active contest problems in real-time
- ❌ **No plagiarism**: Encourages understanding, not copy-paste
- ❌ **No guarantees**: Reminds users that practice and judgment are required
- ✅ **Privacy-respecting**: Never requests sensitive personal data
- ✅ **Educational purpose**: Clear that it's a learning tool

### Pattern Categories Covered

The assistant is trained to explain these common patterns:
- Two pointers, sliding window, fast/slow pointers
- Prefix/suffix arrays, monotonic stack
- Heap/priority queue, binary search
- Intervals, graphs (BFS/DFS/Topo), union-find
- Backtracking, dynamic programming (1D/2D/knapsack)
- Trees, tries, segment trees, Fenwick trees
- Bit manipulation, mathematical patterns

---

## Roadmap (8 weeks)

### ✅ Completed (Weeks 1-2)
- [x] Basic extension structure (Manifest V3)
- [x] Problem detection on LeetCode pages
- [x] Side panel chat interface
- [x] OpenAI integration with user API keys
- [x] Selection helper for text/code
- [x] SPA navigation handling
- [x] LeetCode coaching system prompt

### 🚀 Recently Completed (Week 3)
- [x] Multi-provider support (OpenAI, Google Gemini, Anthropic Claude)
- [x] Model selection dropdown in sidepanel
- [x] Automatic model detection - tests API keys and shows only available models
- [x] Bidirectional sync between settings and sidepanel
- [x] Smart dropdown that adapts to account tier

### 💡 Long-term Ideas
- Visual algorithm animations
- Collaborative study features
- Mobile companion app
- Voice input/output
- Custom model parameters (temperature, max tokens)

---

## Contributing

We welcome contributions! Here's how you can help:

### Reporting Issues

1. Check if the issue already exists
2. Provide clear reproduction steps
3. Include:
   - Chrome version
   - Extension version
   - LeetCode URL where issue occurs
   - Console errors (if any)

### Suggesting Features

1. Open an issue with the `enhancement` label
2. Describe the use case and benefits
3. Consider implementation complexity

### Code Contributions

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes
4. **Test** thoroughly on LeetCode pages
5. **Commit**: `git commit -m "Add amazing feature"`
6. **Push**: `git push origin feature/amazing-feature`
7. **Open** a Pull Request

### Development Setup

```bash
# Clone your fork
git clone https://github.com/yourusername/leetcode_assistant_extension.git
cd leetcode_assistant_extension

# Make changes, then reload the extension in Chrome
# Go to chrome://extensions/ → Click reload icon
```

### Code Style

- Use **vanilla JavaScript** (no frameworks)
- Follow **modern ES6+ syntax**
- Add **comments** for complex logic
- Keep functions **small and focused**
- Use **meaningful variable names**

---

## Security & Privacy

### Data Handling

✅ **What we DO**:
- Store your API key **locally** in browser storage
- Store problem metadata and chat history **locally**
- Send API requests **directly** to OpenAI from your browser

❌ **What we DON'T do**:
- Collect or transmit your data to third-party servers
- Store data in the cloud
- Track your usage or analytics
- Share your code or conversations
- Require account registration

### API Key Security

- All API keys are stored using `chrome.storage.local`
- Only accessible by this extension
- Each key is transmitted **only** to its respective official API endpoint over HTTPS:
  - OpenAI keys → `api.openai.com`
  - Gemini keys → `generativelanguage.googleapis.com`
  - Claude keys → `api.anthropic.com`
- You can delete any or all keys anytime from the options page

### Permissions Justification

Every permission has a specific purpose (see [Permissions](#permissions) section). We request **only** what's necessary for functionality.

### Open Source

- All code is **publicly auditable**
- No obfuscation or hidden behavior
- Community can verify safety

### Recommendations

- Use **restricted API keys** with spending limits for each provider:
  - OpenAI: [platform.openai.com/usage](https://platform.openai.com/usage)
  - Google Gemini: [aistudio.google.com](https://aistudio.google.com)
  - Anthropic Claude: [console.anthropic.com](https://console.anthropic.com)
- Monitor your API usage regularly
- Don't share your API keys with others
- Review extension permissions before installing

---

## License

**MIT License**

Copyright (c) 2025 LeetCode Assistant Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## Acknowledgments

- **LeetCode** for providing an excellent platform for algorithm practice
- **OpenAI** for the powerful GPT models
- The **Chrome Extensions** team for the Side Panel API
- Our **contributors** and **users** for feedback and improvements

---

## Support

- 📧 **Issues**: [GitHub Issues](https://github.com/yourusername/leetcode_assistant_extension/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/yourusername/leetcode_assistant_extension/discussions)
- 📚 **Documentation**: This README

---

## Disclaimer

This extension is an **educational tool** designed to help you **learn** algorithms and data structures. It should be used to:

- ✅ Understand concepts and patterns
- ✅ Get hints when stuck
- ✅ Learn from explanations
- ✅ Practice problem-solving

It should **NOT** be used to:
- ❌ Cheat on interviews or assessments
- ❌ Submit AI-generated code as your own
- ❌ Bypass the learning process

**Use responsibly and ethically.** The goal is to improve your skills, not to shortcut the learning process.

---

**Made with ❤️ for LeetCode learners everywhere**

Happy coding! 🚀
