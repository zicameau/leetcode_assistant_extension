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

> Users authenticate with **their own** OpenAI API key (we don’t pay or collect credentials). Optional **model selection** is supported.

---

## Key Features

- ✅ **Quick-access sidebar** on LeetCode pages (no tab/context switching).  
- ✅ **Minimal-change recommendations**: keep identifiers & style; propose surgical edits.  
- ✅ **Logic-first coaching**: explain approach & invariants before full solutions.  
- ✅ **Time/space complexity feedback** on your current approach and on suggested tweaks.  
- ✅ **Problem auto-detection & code parsing** (language-aware).  
- ✅ **User-provided OpenAI key**; we never proxy your usage by default.  
- ⬜ **Optional model selection** (choose from your available models).  

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
TBD
To be continued
