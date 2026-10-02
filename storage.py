"""Persistence for the document library. Plain SQLite — no server, no
external dependency, just a file on disk next to the app."""

import json
import os
import sqlite3
import time
import uuid

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "commonplace.db")


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_conn()
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            chunks TEXT NOT NULL,
            created_at REAL NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


def _row_to_doc(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "content": row["content"],
        "chunks": json.loads(row["chunks"]),
        "created_at": row["created_at"],
    }


def list_documents():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM documents ORDER BY created_at DESC").fetchall()
    conn.close()
    return [_row_to_doc(r) for r in rows]


def add_document(title, content, chunks):
    doc_id = str(uuid.uuid4())
    created_at = time.time()
    conn = get_conn()
    conn.execute(
        "INSERT INTO documents (id, title, content, chunks, created_at) VALUES (?, ?, ?, ?, ?)",
        (doc_id, title, content, json.dumps(chunks), created_at),
    )
    conn.commit()
    conn.close()
    return {"id": doc_id, "title": title, "content": content, "chunks": chunks, "created_at": created_at}


def delete_document(doc_id):
    conn = get_conn()
    conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    conn.commit()
    conn.close()
