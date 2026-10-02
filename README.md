# Commonplace — personal knowledge assistant (RAG)

A small, self-hosted RAG app: build a library of notes, ask questions about
it, and get answers grounded only in what you've added — with the source
passages shown under every answer. Supports **Claude** and **Gemini 3.1**
as interchangeable answer models.

## How it works

- **Frontend** — `templates/index.html` + `static/` (plain HTML/CSS/JS, no
  build step).
- **Backend** — Flask (`app.py`) with three jobs:
  1. **Storage** (`storage.py`) — a SQLite file (`commonplace.db`) holding
     your library.
  2. **Retrieval** (`rag.py`) — splits each entry into passages and ranks
     them against your question with TF-IDF cosine similarity (via
     scikit-learn). This is the "R" in RAG.
  3. **Generation** (`llm.py`) — sends the top passages plus your question
     to whichever model you pick, and returns the grounded answer. This is
     the "AG" in RAG. Add a new provider by writing one `call_*()` function
     and one entry in `MODEL_REGISTRY`.

## Setup

```bash
cd commonplace-standalone
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# then edit .env and add ANTHROPIC_API_KEY and/or GOOGLE_API_KEY
```

You don't need both keys — the model dropdown in the UI disables whichever
provider has no key set.

- Anthropic key: https://console.anthropic.com/settings/keys
- Google AI Studio key: https://aistudio.google.com/apikey

## Run

```bash
python app.py
```

Open http://localhost:5000.

## Notes

- The SQLite file is created automatically on first run, next to `app.py`.
- Retrieval is TF-IDF (keyword-based), not embeddings — no extra API or
  vector database needed. It works best when your question shares
  vocabulary with your notes. Swapping in a real embedding model later only
  means changing `rag.py`.
- This is a development setup (`app.run(debug=True)`). For anything
  public-facing, put it behind a production WSGI server (gunicorn, etc.)
  and turn debug mode off.
