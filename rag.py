"""Retrieval half of RAG: split documents into passages, then rank passages
against a question with TF-IDF cosine similarity. No embedding API needed."""

import re

WORD_LIMIT = 110


def chunk_text(content):
    """Split content into ~WORD_LIMIT-word passages on paragraph/sentence
    boundaries, merging any short trailing fragment into its neighbor."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", content) if p.strip()]
    if not paras:
        paras = [content.strip()]

    chunks = []
    for para in paras:
        words = para.split()
        if len(words) <= WORD_LIMIT:
            chunks.append(para)
            continue

        sentences = re.findall(r"[^.!?]+[.!?]*", para) or [para]
        buf, count = [], 0
        for s in sentences:
            wc = len(s.split())
            if count + wc > WORD_LIMIT and buf:
                chunks.append(" ".join(buf).strip())
                buf, count = [], 0
            buf.append(s.strip())
            count += wc
        if buf:
            chunks.append(" ".join(buf).strip())

    merged = []
    for c in chunks:
        if merged and len(c.split()) < 12:
            merged[-1] = merged[-1] + " " + c
        else:
            merged.append(c)
    return [c for c in merged if c]


def retrieve(query, documents, k=5):
    """Rank all chunks across `documents` against `query`, return the top k
    as a list of {doc_id, doc_title, text} dicts. Pure TF-IDF, rebuilt fresh
    on every call for simplicity — fine at personal-library scale."""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity

    all_chunks = []
    for doc in documents:
        for text in doc.get("chunks") or []:
            all_chunks.append({"doc_id": doc["id"], "doc_title": doc["title"], "text": text})

    if not all_chunks:
        return []

    corpus = [c["text"] for c in all_chunks]
    vectorizer = TfidfVectorizer(stop_words="english")
    try:
        matrix = vectorizer.fit_transform(corpus)
        query_vec = vectorizer.transform([query])
    except ValueError:
        # e.g. query or corpus is entirely stopwords
        return []

    scores = cosine_similarity(query_vec, matrix)[0]
    ranked = sorted(zip(all_chunks, scores), key=lambda pair: pair[1], reverse=True)
    return [c for c, s in ranked if s > 0.01][:k]
