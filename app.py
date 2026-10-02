import os

from dotenv import load_dotenv

load_dotenv()

from flask import Flask, jsonify, render_template, request

from llm import MODEL_REGISTRY, generate, is_configured
from rag import chunk_text, retrieve
from storage import add_document, delete_document, init_db, list_documents

app = Flask(__name__)
init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/models", methods=["GET"])
def api_models():
    return jsonify(
        [
            {"key": key, "label": entry["label"], "configured": is_configured(key)}
            for key, entry in MODEL_REGISTRY.items()
        ]
    )


@app.route("/api/documents", methods=["GET"])
def api_list_documents():
    return jsonify(list_documents())


@app.route("/api/documents", methods=["POST"])
def api_add_document():
    data = request.get_json(force=True, silent=True) or {}
    title = (data.get("title") or "").strip()
    content = (data.get("content") or "").strip()
    if not title or not content:
        return jsonify({"error": "Title and content are both required."}), 400
    chunks = chunk_text(content)
    doc = add_document(title, content, chunks)
    return jsonify(doc), 201


@app.route("/api/documents/<doc_id>", methods=["DELETE"])
def api_delete_document(doc_id):
    delete_document(doc_id)
    return "", 204


@app.route("/api/query", methods=["POST"])
def api_query():
    data = request.get_json(force=True, silent=True) or {}
    question = (data.get("question") or "").strip()
    model_key = data.get("model") or "claude"

    if not question:
        return jsonify({"error": "A question is required."}), 400
    if model_key not in MODEL_REGISTRY:
        return jsonify({"error": "Unknown model: " + model_key}), 400
    if not is_configured(model_key):
        return jsonify({"error": MODEL_REGISTRY[model_key]["label"] + " is not configured (missing API key in .env)."}), 400

    docs = list_documents()
    if not docs:
        return jsonify({"error": "The library is empty. Add a document first."}), 400

    top = retrieve(question, docs, k=5)
    if not top:
        return jsonify(
            {
                "answer": "Nothing in the library looks relevant to that yet. Try adding a note about it, or rephrase the question.",
                "sources": [],
                "model": model_key,
            }
        )

    context_block = "\n\n".join(
        '[{}] (from "{}"): {}'.format(i + 1, chunk["doc_title"], chunk["text"])
        for i, chunk in enumerate(top)
    )
    prompt = (
        "You are Commonplace, a careful personal knowledge assistant. Answer the question using ONLY the "
        "numbered notes below, which are excerpts from the user's own library. Do not use outside knowledge. "
        "If the notes do not contain enough information to answer, say so plainly instead of guessing. "
        "When you use a note, refer to it inline by its bracket number, e.g. [1]. Keep the answer concise.\n\n"
        "Notes:\n" + context_block + "\n\n"
        "Question: " + question
    )

    try:
        answer = generate(model_key, prompt)
    except Exception as exc:  # noqa: BLE001 - surfaced to the caller, not swallowed
        return jsonify({"error": str(exc)}), 502

    sources = [
        {"index": i + 1, "title": chunk["doc_title"], "snippet": chunk["text"][:220]}
        for i, chunk in enumerate(top)
    ]
    return jsonify({"answer": answer, "sources": sources, "model": model_key})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, port=port)
