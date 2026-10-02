"""Generation half of RAG: a small abstraction over two model providers so
the rest of the app doesn't care which one answered. Add a new provider by
writing one call_*() function and one MODEL_REGISTRY entry."""

import os


def call_claude(prompt, model="claude-sonnet-5"):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    from anthropic import Anthropic

    client = Anthropic(api_key=api_key)
    resp = client.messages.create(
        model=model,
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")


def call_gemini(prompt, model="gemini-3.1-pro-preview"):
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")
    from google import genai

    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(model=model, contents=prompt)
    return resp.text


# key -> { label shown in the UI, the function that answers, the env var
# that must be set for it to be usable, and the underlying model id }
MODEL_REGISTRY = {
    "claude": {
        "label": "Claude Sonnet 5",
        "fn": call_claude,
        "env": "ANTHROPIC_API_KEY",
        "model_id": "claude-sonnet-5",
    },
    "gemini": {
        "label": "Gemini 3.1 Pro",
        "fn": call_gemini,
        "env": "GOOGLE_API_KEY",
        "model_id": "gemini-3.1-pro-preview",
    },
}


def is_configured(model_key):
    entry = MODEL_REGISTRY.get(model_key)
    return bool(entry and os.environ.get(entry["env"]))


def generate(model_key, prompt):
    entry = MODEL_REGISTRY.get(model_key)
    if not entry:
        raise ValueError("Unknown model: " + model_key)
    return entry["fn"](prompt, entry["model_id"])
