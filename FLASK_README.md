# Flask Backend - LeetCode Assistant

This backend powers optional account login, secure sessions, message storage and RAG (semantic search) for the LeetCode Assistant browser extension.

## Features

- User auth: register, login, logout, verify, token (HttpOnly cookies + token fallback)
- Message storage: store raw messages (user/assistant) in SQLAlchemy
- Vector embeddings: OpenAI `text-embedding-3-small` (1536 dims)
- Pinecone storage & semantic search (RAG)
- Ready for SQLite by default; can switch to any SQLAlchemy-supported DB

## Quick Start

1) Create and activate a Python venv

```bash
cd "/Users/simisolawinjobi/leetcode_assistant_extension"
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

2) Create `.env` beside `app.py`

```
SECRET_KEY=<64-hex from: python -c "import secrets; print(secrets.token_hex(32))">
FLASK_ENV=development
DATABASE_URL=sqlite:///leetcode_assistant.db

# OpenAI (developer or leave blank if user supplies in the extension only)
OPENAI_API_KEY=sk-...

# Pinecone (developer-provided)
PINECONE_API_KEY=pc-...
PINECONE_ENVIRONMENT=us-east-1
PINECONE_INDEX_NAME=sjsunlp
```

> Note: Keep `.env` out of git. Add:
> 
> ```
> .env
> .env.*
> !.env.example
> ```

3) Run

```bash
python app.py
```

Health check: `http://localhost:5000/api/health`

## API

Auth
- `POST /api/auth/register` `{ username, email, password }`
- `POST /api/auth/login` `{ username|email, password }`
- `POST /api/auth/logout`
- `GET /api/auth/verify` → `{ authenticated: true/false, user? }`
- `GET /api/auth/token` (requires session) → `{ api_token }`

Messages
- `POST /api/messages/send`
  - JSON: `{ role, content, problem_slug?, problem_id?, problem_url?, code_context?, model_used? }`
  - Stores message; for user messages, generates embedding and upserts to Pinecone
- `GET /api/messages/history?limit=50&offset=0&problem_slug=...`
- `GET /api/messages/<id>` (could be added similarly)

RAG
- `POST /api/rag/search` `{ query, top_k?, problem_slug? }`
  - Embeds query; searches Pinecone; returns the matched messages

## Security Notes

- `SECRET_KEY` must be long and random; rotation supported via `SECRET_KEY_FALLBACKS`
- Cookies are HttpOnly; `Secure` is enabled in production
- Token fallback (Authorization: Bearer <token>) for browser extension

## Pinecone & OpenAI

- Embeddings: `text-embedding-3-small` (1536)
- Pinecone index is created automatically if missing (1536/cosine)
- Guest mode in the extension never calls these endpoints (no storage)

## Production Tips

- Use a persistent database (Postgres/MySQL)
- Store secrets in your platform’s secret manager
- Enable HTTPS and set `FLASK_ENV=production`

---

If you need to re-initialize fast, follow the steps above in “Quick Start.”


