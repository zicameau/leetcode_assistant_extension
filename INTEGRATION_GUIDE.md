# Integration Guide - LeetCode Assistant

This guide explains how the browser extension integrates with the Flask backend for optional login + message storage + semantic search (RAG), while keeping the existing sidepanel UI intact.

## Overview

- Guest mode (default-allowed): No storage, no Pinecone, chat works as local only.
- Authenticated mode: After login/signup, messages are stored to DB; embeddings stored in Pinecone; RAG enhances prompts.

## File Map

Frontend (extension):
- `sidepanel.html` – main UI; includes `backend-integration.js`
- `sidepanel.js` – chat logic, auth modal, guest flow
- `sidepanel.css` – styles (auth modal is isolated)
- `backend-integration.js` – helper to store messages + use RAG when authenticated
- `options.html` / `options.js` – API key & settings (OpenAI key only; Pinecone removed)

Backend (Flask):
- `app.py` – all endpoints and models in one file
- `.env` – backend secrets (SECRET_KEY, Pinecone, etc.)

## Extension Auth Flow

1) On first open:
   - If guest flag is set → hide modal; chat works without storage
   - Else if token is valid → hide modal; storage enabled
   - Else → show login/signup modal

2) Guest button:
   - Sets `backendGuest=true` in `chrome.storage.local`
   - Hides modal and does not prompt for OpenAI key

3) Login/Signup:
   - On success, token is saved; modal hides
   - If OpenAI key is missing, a small `confirm()` invites to open Settings (no overlay lag)

## Message Sending

In `sidepanel.js` submit handler:

- Decide storage:
  - If `backendApiToken` exists and `backendGuest` is false and `window.sendToModelWithBackend` exists → use backend
  - Else → call local `sendToModel` (no storage)

`backend-integration.js` behavior (when using backend):

1) Stores user message via `POST /api/messages/send`
2) Fetches RAG context via `POST /api/rag/context`
3) Calls local `sendToModel([...rag, ...messages])` to get the assistant reply
4) Stores assistant reply via `POST /api/messages/send`

## Backend Keys

- Pinecone keys live only in `.env` (developer-provided)
- Users only input OpenAI key in extension Settings

## Quick Reinstall Steps

1) Backend:
   - Create venv, `pip install -r requirements.txt`
   - Create `.env` beside `app.py`
   - `python app.py` → check `/api/health`

2) Extension:
   - Load unpacked extension in Chrome (folder: `leetcode_assistant_extension`)
   - Open sidepanel
   - Choose Guest OR Login/Signup
   - Add OpenAI key in Settings (only needed for non-guest storage/workflows)

## Troubleshooting

- Modal won’t hide after guest:
  - Check `chrome.storage.local.get(['backendGuest'])` is `true`
  - Reload the sidepanel once

- No storage happening:
  - Confirm token present (`backendApiToken`) and `backendGuest` is false
  - Check Flask logs for `/api/messages/send`

- Pinecone errors:
  - Verify `.env` Pinecone keys, environment, and index name

This integration keeps the sidepanel UI unchanged and only adds optional persistence when desired.


