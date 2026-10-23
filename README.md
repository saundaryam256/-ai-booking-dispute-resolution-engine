# Resolve — AI Booking Dispute & Resolution Engine

A local-first admin tool for investigating coworking marketplace booking disputes. FastAPI stores cases and review history in SQLite; a React/Vite interface displays evidence, marketplace policy, investigation output, and administrator decisions.

> **AI does not make or execute financial decisions.** An administrator records every final outcome. No payment or refund integrations are included.

## Requirements

- Windows 11 and PowerShell
- Python 3.10+
- Node.js 20+ and npm
- An OpenAI-compatible API key is optional. Without one the app clearly displays **DEMO MODE** and uses deterministic, conservative rules.

## Quick start (PowerShell)

Open two PowerShell terminals in the project directory.

### 1. Start the backend

```powershell
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
python -m uvicorn app.main:app --reload
```

If PowerShell prevents virtual-environment activation, run this once for the current terminal and activate again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

The API is at `http://127.0.0.1:8000`. Swagger UI: `http://127.0.0.1:8000/docs`. On first startup, `backend/disputes.db` is created and seeded with five sample disputes.

### 2. Start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. The frontend uses `http://127.0.0.1:8000` by default. To change the API address, create `frontend/.env.local` with `VITE_API_URL=http://127.0.0.1:8000`.

### Optional: configure an LLM provider

Set the key only in `backend/.env`; never put it in frontend variables:

```dotenv
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
AI_REQUEST_TIMEOUT_SECONDS=120
```

Restart the backend after editing `.env`. The provider must implement the OpenAI-compatible chat completions API and JSON-object response format. Provider errors, timeouts, malformed JSON, unknown policies, and invalid case IDs produce an API error; they do **not** silently fall back to demo output.

For local Ollama, install Ollama, download a model, and configure the OpenAI-compatible local endpoint instead:

```powershell
ollama pull qwen2.5:0.5b
```

```dotenv
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://127.0.0.1:11434/v1
OPENAI_MODEL=qwen2.5:0.5b
AI_REQUEST_TIMEOUT_SECONDS=180
```

The `ollama` value is a local placeholder, not a hosted API credential. Ollama must be running and the model must be installed before restarting the backend. A local model consumes system memory; choose a model suitable for the available RAM.

## Run the end-to-end demo

1. Start both processes using the commands above.
2. The Overview page loads database-backed counts and the seeded cases.
3. Open `DSP-2026-003` to review the cancellation case; run **Investigate with AI**. Its missing booking-time cancellation terms should result in manual investigation / insufficient evidence.
4. Review the separate case-record facts, customer and owner allegations, evidence gaps, and policy text.
5. Record an administrator decision, enter a reason, and save it. **Approve recommendation** saves a decision immediately with an explicit review reason; **Reject recommendation** preselects a different outcome for review.
6. Refresh or reopen the case. The investigation, decision history, and status persist in SQLite.
7. Use **New dispute** to verify required-field validation and persistence.

To confirm restart persistence, stop the backend with Ctrl+C, start it again from `backend`, and reload the UI. Seed data is inserted only when the disputes table is empty.

## Currency

Booking amounts use Indian rupees (INR) throughout the app. Existing database currency labels are normalized to INR at backend startup; numeric amounts are preserved and are not converted using an exchange rate.

## Automated API tests

The standard-library `unittest` suite uses an isolated temporary SQLite database and does not alter the app's demo database:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## REST API

Base URL: `http://127.0.0.1:8000`. Swagger UI provides interactive schemas and request testing.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/disputes` | List disputes; optional `?search=...&status=pending_review` |
| `GET` | `/disputes/stats` | Database-derived dashboard counts |
| `GET` | `/disputes/{case_id}` | Dispute, latest investigation, and decision history |
| `POST` | `/disputes` | Validate and create a dispute (`201`) |
| `POST` | `/disputes/{case_id}/investigate` | Investigate and persist a structured result |
| `GET` | `/disputes/{case_id}/investigation` | Retrieve the persisted investigation (`404` if absent) |
| `POST` | `/disputes/{case_id}/decision` | Save an administrator's decision (`409` until investigated) |
| `GET` | `/policies` | List the policy source of truth |
| `GET` | `/health` | API health and configured mode |

Example create request:

```powershell
$body = @{
  booking_id = "BK-30001"
  booking_amount = 120
  currency = "INR"
  listing_name = "Riverside Meeting Room"
  advertised_amenities = @("Projector", "Wi-Fi")
  customer_complaint = "The advertised projector did not work during our booking."
  owner_statement = "I checked the projector the prior day."
  booking_details = "Meeting room booked for 2 hours on 2026-10-20."
  cancellation_details = ""
  evidence_references = @("Customer screenshot reference")
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/disputes -ContentType "application/json" -Body $body
```

Example investigate and decision requests:

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/disputes/DSP-2026-003/investigate

$decision = @{
  outcome = "Manual investigation / insufficient evidence"
  reason = "The cancellation terms shown at booking are not available."
  reviewer = "Alex Morgan"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/disputes/DSP-2026-003/decision -ContentType "application/json" -Body $decision
```

Decisions are append-only records; rerunning an investigation replaces the current investigation while preserving the decision history. The API validates the outcome against the supported values and validates LLM output with Pydantic and known policy IDs.

## Policy, evidence, and AI limitations

- `backend/app/data/policies.json` is the policy source of truth. The AI receives the relevant policy text and returns policy IDs; only existing IDs are accepted.
- `backend/app/data/sample_disputes.json` contains five realistic starter cases.
- Intake statements and evidence references are not authenticated uploads. The UI labels statements as allegations and references as **REFERENCE ONLY**; demo output does not upgrade an unverified reference into proof.
- Demo mode is deterministic and deliberately conservative. It identifies the issue, separates submitted record details from each party's claims, lists missing evidence, and refers cases to an administrator when evidence or policy does not establish an outcome. It is not a simulated LLM response.
- LLM recommendations can be incorrect. The structured output is validated, but that does not make the underlying evidence true or the recommendation authoritative. A human reviewer must save the actual decision.
- No refund percentages are fabricated, and the app never sends payments or processes a refund.

## Project structure

```text
backend/
  app/
    data/          Policy and sample-case source JSON
    routers/       Dispute and policy endpoints
    services/      Investigation and policy retrieval
    database.py    SQLite engine and session
    models.py      SQLAlchemy persistence models
    schemas.py     Pydantic request and response validation
    main.py        FastAPI app, CORS, startup seeding
  requirements.txt
frontend/
  src/
    services/api.js
    App.jsx
    styles/app.css
  package.json
```

