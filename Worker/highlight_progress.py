"""Progresso de geração de destaques (Redis)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
PROGRESS_TTL_SEC = 30 * 60


def _redis_client() -> redis.Redis:
    kwargs: dict = {"decode_responses": True}
    if REDIS_URL.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = None
    return redis.from_url(REDIS_URL, **kwargs)


def _key(scope: str, parent_id: str) -> str:
    return f"highlight:progress:{scope}:{parent_id}"


def set_highlight_progress(
    scope: str,
    parent_id: str,
    *,
    percent: int,
    phase: str,
    message: str,
    render_total: int | None = None,
    render_completed: int | None = None,
    error: str | None = None,
) -> None:
    try:
        client = _redis_client()
        key = _key(scope, parent_id)
        existing = client.get(key)
        current = json.loads(existing) if existing else {}

        payload = {
            "scope": scope,
            "parentId": parent_id,
            "percent": max(0, min(100, int(percent))),
            "phase": phase,
            "message": message,
            "renderTotal": render_total if render_total is not None else current.get("renderTotal", 0),
            "renderCompleted": render_completed
            if render_completed is not None
            else current.get("renderCompleted", 0),
            "error": error,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }
        client.set(key, json.dumps(payload), ex=PROGRESS_TTL_SEC)
    except Exception as err:
        print(f"[highlights] falha ao salvar progresso: {err}")


def clear_highlight_progress(scope: str, parent_id: str) -> None:
    try:
        _redis_client().delete(_key(scope, parent_id))
    except Exception:
        pass
