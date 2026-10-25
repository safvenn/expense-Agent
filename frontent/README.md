# Expense Assistant frontend

The frontend uses HTML, CSS, and vanilla JavaScript without a build step. See the root [README](../README.md) for database, model-service, and environment setup.

## Run

From the repository root:

```powershell
uv sync
uv run python -m uvicorn app.main:app --reload
```

Open [Expense Assistant](http://127.0.0.1:8000/). FastAPI serves the chat at `/`, the Expenses page at `/expenses.html`, and assets at `/style.css`, `/app.js`, and `/response.js`. The CSS route maps to the existing `styles.css` file. Opening HTML directly or using a separate static server does not provide these API and asset routes.

## Authentication

Signup uses a name, email, and password, then signs in automatically. Login uses email and password. Forms show loading and validation states, prevent duplicate submissions, and support keyboard navigation. Animations respect reduced-motion preferences. There are no default-account or manual-token shortcuts.

Tokens are stored in `localStorage` under `expense-auth`, sharing authentication between tabs on the same origin. Login, logout, and token changes synchronize across tabs. Use the same hostname and port in every tab: `localhost` and `127.0.0.1` do not share storage.

An API request returning HTTP 401 triggers a refresh attempt when a refresh token is available. A successful refresh retries that request once. Access tokens last five minutes; refresh tokens last five days. Refreshing is request-driven, not timer-driven.

Chat state and API connection preferences remain in per-tab `sessionStorage`. The API defaults to the page's origin unless a custom URL has been saved under **API connection**.

## Chat and approvals

Enter sends a message; Shift+Enter adds a line. Add, edit, and delete actions pause for approval. The current backend applies one decision to every action in a pending batch while exposing only the first action, so submit one expense at a time for individual review.

After approval, the assistant reply renders immediately while history refreshes. `/messages` supplies saved history, including completed approval replies. The frontend supports plain text, text-block arrays, `{content: ...}` wrappers, and older `user_prompt` / `assistant_response` fields, including serialized wrappers. History merging preserves local replies without duplicating persisted ones.

After an uncertain write outcome or timeout, check Expenses before resending the action. The frontend does not automatically repeat writes with unknown outcomes.

## API calls

| Endpoint | Purpose |
| --- | --- |
| `GET /Health` | Connectivity |
| `POST /signup`, `POST /login` | Account access using JSON |
| `POST /refresh?token=...` | Renew access token |
| `POST /chat?prompt=...` | Send a message |
| `POST /approve` | Submit approval or rejection as JSON |
| `GET /messages?limit=100&offset=0` | Paginated conversation history |
| `GET /expenses` | Expense list and summary totals |

The backend derives the conversation from the authenticated user. The local thread identifier does not create a separate server conversation.

## Checks

```powershell
node --check frontent/app.js
node --test frontent/auth.test.cjs frontent/history.test.cjs frontent/response.test.cjs
```

These tests use mocks and isolated JavaScript contexts. They cover parsing, authentication responses, history reconciliation, and immediate approval replies; they do not replace live database and model integration testing.
