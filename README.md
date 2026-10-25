# Expense Assistant

**Track everyday spending through conversation, with approval before expenses change.**

Expense Assistant combines a FastAPI backend, a LangChain agent, and a lightweight web interface to help you record, review, update, and delete expenses in natural language. PostgreSQL stores account data, expenses, chat history, and agent checkpoints.

[Getting started](#getting-started) · [Architecture](#architecture) · [API reference](#api-reference)

> **Status:** Active development. Local setup requires PostgreSQL and a compatible model service.

## Features

- **Natural-language expense tracking:** Describe a purchase, such as “Spent ₹250 on lunch,” and let the agent extract the details.
- **Expense management:** Add, retrieve, edit, and delete expenses through dedicated agent tools.
- **Human approval:** Review proposed additions, edits, and deletions, then approve or reject them with feedback.
- **Account authentication:** Register and sign in with Argon2 password hashing and JWT access and refresh tokens.
- **Persistent conversations:** Reload saved messages and browse paginated chat history.
- **Spending overview:** View expenses alongside total spending, average expense, and the highest-spending category.
- **Simple frontend:** Responsive HTML, CSS, and vanilla JavaScript, served directly by FastAPI without a frontend build step.

## Architecture

```mermaid
flowchart TD
    U[Browser interface] --> A[FastAPI API]
    A --> Auth[JWT authentication]
    Auth --> Agent[LangChain agent / LangGraph state]
    Agent <--> LLM[OpenAI-compatible model service]
    Agent --> Read[Read expenses]
    Agent --> Review{Human approval}
    Review -->|Approve| Write[Add / edit / delete expenses]
    Review -->|Reject with feedback| Agent
    Read <--> DB[(PostgreSQL)]
    Write <--> DB
    Agent <--> CP[PostgreSQL checkpoints]
    A <--> History[Accounts and message history]
    History <--> DB
```

The backend derives the conversation ID from the authenticated user. Read operations can run immediately; configured write operations pause until the frontend submits an approval decision. Completed replies are saved to message history.

**Approval scope:** One decision currently applies to all actions in a pending batch, while the response exposes only the first action. Submit one expense at a time when you need to review each change separately.

## Technology stack

| Layer | Technologies |
| --- | --- |
| Interface | HTML, CSS, vanilla JavaScript |
| API and validation | FastAPI, Pydantic, Uvicorn |
| Agent orchestration | LangChain, LangGraph, human-in-the-loop middleware |
| Model connection | `ChatOpenAI` with an OpenAI-compatible endpoint |
| Persistence | PostgreSQL, SQLAlchemy, SQLModel, LangGraph PostgreSQL checkpointer |
| Authentication | JWT via `python-jose`, Argon2 via `pwdlib` |
| Environment | Python 3.12+, uv |
| Frontend testing | Node.js built-in test runner |

## Getting started

### Prerequisites

- Python **3.12 or newer** and **uv**.
- PostgreSQL with an existing database and a database user permitted to create tables.
- An OpenAI-compatible model service supporting tool calling.
- A modern browser; Node.js is needed only for frontend tests.

### 1. Clone and install

```sh
git clone https://github.com/safvenn/expense-Agent.git
cd expense-Agent
uv sync --frozen
```

Use `pyproject.toml` and `uv.lock` for dependency installation. The legacy `requirements.txt` contains only a subset of the application dependencies.

### 2. Configure environment variables

Create a `.env` file in the repository root:

```dotenv
DATABASE_URL=postgresql://expense_user:your_password@localhost:5432/expense_assistant
OPENAI_API_KEY=your_model_service_api_key
SECRET_KEY=replace_with_a_long_random_secret
ALGORITHM=HS256
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URI used by application storage and agent checkpoints |
| `OPENAI_API_KEY` | Credential for the configured model service |
| `SECRET_KEY` | Secret used to sign and verify JWTs |
| `ALGORITHM` | JWT signing algorithm; use `HS256` for this setup |

Use a plain `postgresql://` URI compatible with both SQLAlchemy and the checkpoint saver. Keep real credentials out of version control; `.env` is ignored by Git.

The model is currently configured in [`app/dependencies/lifespan.py`](app/dependencies/lifespan.py) with:

```python
model="auto"
base_url="http://localhost:20128/v1"
```

Start a compatible service at that address, or update the model name and base URL in that file. Setting `OPENAI_API_KEY` alone does not switch the backend to the public OpenAI endpoint.

### 3. Initialize application tables

The application models use a shared SQLAlchemy `Base`. Startup currently calls `SQLModel.metadata.create_all()`, which does not create those application tables. For a new database, run this once from the repository root:

```sh
uv run python -c "from app.dependencies.db import Base, engine; from app.models.users_model import UsersModel; from app.models.messages_model import MessageModel; from app.models.expenses_model import ExpenseModel; Base.metadata.create_all(bind=engine)"
```

Agent checkpoint tables are initialized separately during application startup. `create_all()` creates missing tables but does not migrate existing columns; existing databases require explicit schema migrations.

### 4. Start the application

```sh
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Alternatively, use the included launcher from the repository root:

```sh
uv run lanchain-project-1 --reload
```

The launcher also supports `--host`, `--port`, and `--help`, or can be invoked as `uv run python -m lanchain_project_1`. It requires the source checkout containing `app/` and `frontent/`.

| Destination | Local URL |
| --- | --- |
| Chat interface | [127.0.0.1:8000](http://127.0.0.1:8000/) |
| Expenses | [127.0.0.1:8000/expenses.html](http://127.0.0.1:8000/expenses.html) |
| Interactive API documentation | [127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) |
| Health check | [127.0.0.1:8000/Health](http://127.0.0.1:8000/Health) |

Open the served interface instead of opening the HTML file directly. Register an account to begin; the frontend signs you in after registration.

The frontend uses the page origin as its default API address. A saved **API connection** setting overrides it. Use either `127.0.0.1` or `localhost` consistently because browser storage is separate for each origin.

## Usage

Try these prompts after signing in:

```text
Spent 250 on lunch
Bought groceries for 1200
Show my expenses
Change my last expense amount to 300
Delete my last expense
```

When an approval card appears, inspect the proposed action and arguments before approving. To request a correction, reject it with feedback such as “The amount should be 150.” Check the Expenses page to review saved records and spending totals. The frontend formats amounts in INR (₹).

### Sessions and history

Access tokens last five minutes; refresh tokens last five days. After a protected request returns HTTP 401, the frontend attempts a token refresh and retries once. There is no periodic refresh timer.

Authentication is stored in `localStorage` under `expense-auth` and synchronized across tabs on the same origin. Chat cache and API preferences use per-tab `sessionStorage`; saved message history comes from the backend. Authentication does not use HttpOnly cookies.

## API reference

Protected endpoints require an `Authorization: Bearer <access_token>` header. For schemas and interactive requests, use the local [Swagger UI](http://127.0.0.1:8000/docs).

| Method | Endpoint | Input | Authentication |
| --- | --- | --- | --- |
| `GET` | `/Health` | None | Public |
| `POST` | `/signup` | JSON: `username`, `email`, `password` | Public |
| `POST` | `/login` | JSON: `email`, `password` | Public |
| `POST` | `/refresh` | Query: `token` | Refresh token |
| `POST` | `/chat` | Query: `prompt` | Bearer token |
| `POST` | `/approve` | JSON: `approve`, optional `interrupt_id` and `message` | Bearer token |
| `GET` | `/messages` | Query: `limit=10`, `offset=0` | Bearer token |
| `GET` | `/expenses` | None | Bearer token |

Example rejection body for `POST /approve`:

```json
{
  "approve": false,
  "interrupt_id": "returned-interrupt-id",
  "message": "The amount is incorrect. Please use 150."
}
```

Always send `approve` explicitly; its schema default is `true`. The current service resumes the user's pending state and does not use `interrupt_id` to select an individual action. Clients cannot select separate conversations with a `thread_id`.

`GET /messages` returns a `messages` array ordered by descending message ID. Each record includes `id`, `role`, `content`, and `date`. Content may be a JSON wrapper such as `{"content": "Hello"}`; the frontend normalizes supported formats and reverses fetched pages for conversation display.

## Project structure

```text
.
├── app/
│   ├── main.py                 # FastAPI application and frontend routes
│   ├── dependencies/           # Authentication, database, agent lifecycle
│   ├── models/                 # Account, expense, and message models
│   ├── reposetory/             # Message persistence (existing spelling)
│   ├── routers/                # Authentication, chat, and history endpoints
│   ├── schemas/                # Request schemas
│   ├── services/               # Chat execution and approval handling
│   └── tools/                  # Agent expense tools
├── frontent/                   # Web interface (existing spelling)
│   ├── index.html              # Chat interface
│   ├── expenses.html           # Expense overview
│   ├── app.js                  # UI, authentication, and API integration
│   ├── response.js             # Response normalization
│   ├── styles.css              # Shared styles
│   └── *.test.cjs              # Frontend regression tests
├── src/                        # Python package entry point
├── tests/                      # Backend test directory
├── pyproject.toml              # Project metadata and dependencies
├── uv.lock                     # Locked Python environment
├── render.yaml                 # Backend deployment configuration
├── vercel.json                 # Static frontend deployment configuration
└── DEPLOYMENT.md               # Deployment preparation notes
```

## Contributing

1. Create a branch for your change.
2. Keep changes focused and add regression coverage for behavior changes.
3. Run the relevant checks and document API or setup changes.
4. Open a pull request describing the problem, solution, and validation.

Keep credentials, tokens, and private expense data out of commits and test fixtures.

## License

No license file is currently included. An explicit license is needed before this project can be offered under open-source terms.
