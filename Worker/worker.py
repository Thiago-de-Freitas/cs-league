#!/usr/bin/env python3
"""Worker que processa demos CS2 da fila Redis."""

import json
import os
import re
import ssl
import sys
import time
import traceback
import uuid
import urllib.error
import urllib.request
from pathlib import Path

import psycopg2
import redis
from demoparser2 import DemoParser
from highlight_extraction import extract_highlights, _normalize_steam_id
from highlight_progress import set_highlight_progress
from highlight_renderer import HIGHLIGHT_RENDER_QUEUE, process_highlight_render_job

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://gamersleague:gamersleague@localhost:5432/gamersleague")
DEMO_STORAGE_PATH = os.environ.get("DEMO_STORAGE_PATH")
BACKEND_INTERNAL_URL = os.environ.get("BACKEND_INTERNAL_URL", "").rstrip("/")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")
DEMO_QUEUE = "demo:queue"
WORKER_HEARTBEAT_KEY = "demo:worker:heartbeat"
WORKER_STORAGE_KEY = "demo:worker:files_on_disk"


def highlights_feature_enabled() -> bool:
    raw = os.environ.get("HIGHLIGHTS_FEATURE_ENABLED", "").strip().lower()
    return raw in ("1", "true")
WORKER_STORAGE_PATH_KEY = "demo:worker:storage_path"
POLL_TIMEOUT = 5
HEARTBEAT_TTL = 90
WORKER_DIR = Path(__file__).resolve().parent
BACKEND_DEMOS = WORKER_DIR.parent / "Backend" / "data" / "demos"

CUID_PATTERN = re.compile(r"^c[a-z0-9]{20,}$", re.IGNORECASE)
UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def get_demo_storage_dir() -> Path:
    if DEMO_STORAGE_PATH:
        storage = Path(DEMO_STORAGE_PATH)
        if not storage.is_absolute():
            storage = (WORKER_DIR / storage).resolve()
    else:
        storage = BACKEND_DEMOS.resolve()
    storage.mkdir(parents=True, exist_ok=True)
    return storage


def is_valid_demo_id(demo_id: str) -> bool:
    if not demo_id or len(demo_id) > 64 or "\x00" in demo_id:
        return False
    return bool(CUID_PATTERN.match(demo_id) or UUID_PATTERN.match(demo_id))


def is_path_inside_base(resolved: Path, base: Path) -> bool:
    try:
        resolved.relative_to(base)
        return True
    except ValueError:
        return False


def resolve_demo_path(file_path: str) -> str | None:
    if not file_path or "\x00" in file_path:
        return None

    storage = get_demo_storage_dir()
    normalized = os.path.normpath(file_path)

    candidates: list[Path] = []
    if os.path.isabs(normalized):
        candidates.append(Path(normalized).resolve())
    else:
        candidates.append((storage / normalized).resolve())

    candidates.append((storage / Path(normalized).name).resolve())

    for candidate in candidates:
        if not is_path_inside_base(candidate, storage):
            continue
        if candidate.is_file():
            return str(candidate)

    return None


def record_worker_audit(
    action: str,
    entity_type: str,
    entity_id: str | None = None,
    parent_type: str | None = None,
    parent_id: str | None = None,
    before=None,
    after=None,
    metadata=None,
    success: bool = True,
    error_code: str | None = None,
) -> None:
    if not BACKEND_INTERNAL_URL or not INTERNAL_SERVICE_KEY:
        return
    if "${{" in INTERNAL_SERVICE_KEY:
        return

    payload = {
        "action": action,
        "entityType": entity_type,
        "entityId": entity_id,
        "parentType": parent_type,
        "parentId": parent_id,
        "before": before,
        "after": after,
        "metadata": metadata,
        "success": success,
        "errorCode": error_code,
    }
    url = f"{BACKEND_INTERNAL_URL}/api/internal/audit"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service-Key": INTERNAL_SERVICE_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15):
            pass
    except Exception as err:
        print(f"[audit] falha ao registrar {action}: {err}")


def fetch_demo_from_api(demo_id: str) -> tuple[str | None, str | None]:
    url_error = validate_backend_internal_url(BACKEND_INTERNAL_URL)
    if url_error:
        return None, url_error

    if not INTERNAL_SERVICE_KEY:
        return None, "INTERNAL_SERVICE_KEY ausente no worker"
    if "${{" in INTERNAL_SERVICE_KEY:
        return None, "INTERNAL_SERVICE_KEY contém referência Railway não resolvida (${{...}})"

    cache_dir = get_demo_storage_dir() / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / f"{demo_id}.dem"

    if dest.is_file() and dest.stat().st_size > 0:
        return str(dest), None

    url = f"{BACKEND_INTERNAL_URL}/api/internal/demos/{demo_id}/file"
    print(f"Baixando demo {demo_id} da API ({BACKEND_INTERNAL_URL})...")
    req = urllib.request.Request(
        url,
        headers={"X-Internal-Service-Key": INTERNAL_SERVICE_KEY},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            data = resp.read()
        if not data:
            return None, "API retornou arquivo vazio"
        dest.write_bytes(data)
        print(f"Demo {demo_id} em cache ({len(data)} bytes): {dest}")
        return str(dest), None
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")[:300]
        if err.code == 403:
            return None, "API rejeitou a chave (403) — INTERNAL_SERVICE_KEY deve ser igual no back e no worker"
        if err.code == 503 and "INTERNAL_SERVICE_KEY" in body:
            return None, "API sem INTERNAL_SERVICE_KEY — configure no gamers-league-back e redeploy"
        if err.code == 404:
            return None, "Arquivo não encontrado na API (404) — demo pode ter sido enviada antes do volume /data"
        return None, f"Erro HTTP {err.code} ao baixar da API: {body}"
    except urllib.error.URLError as err:
        return None, f"Worker não alcança a API em {BACKEND_INTERNAL_URL}: {err.reason}"
    except Exception as err:
        return None, f"Erro ao baixar demo da API: {err}"


def ensure_demo_file(demo_id: str, file_path: str) -> tuple[str | None, str | None]:
    resolved = resolve_demo_path(file_path)
    if resolved:
        return resolved, None
    return fetch_demo_from_api(demo_id)


def parse_job_payload(payload: str) -> tuple[str, str] | None:
    try:
        job = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        return None

    if not isinstance(job, dict):
        return None

    demo_id = job.get("demoId")
    file_path = job.get("filePath")
    if not isinstance(demo_id, str) or not isinstance(file_path, str):
        return None
    if not is_valid_demo_id(demo_id):
        return None
    if not file_path.strip() or "\x00" in file_path:
        return None

    return demo_id, file_path


def try_extract_demo_id(payload: str) -> str | None:
    try:
        job = json.loads(payload)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(job, dict):
        return None
    demo_id = job.get("demoId")
    if isinstance(demo_id, str) and is_valid_demo_id(demo_id):
        return demo_id
    return None


def mask_redis_url(url: str) -> str:
    if "@" not in url:
        return url
    prefix, host = url.rsplit("@", 1)
    return f"{prefix.split('://')[0]}://***@{host}"


def validate_backend_internal_url(url: str) -> str | None:
    """Retorna mensagem de erro se BACKEND_INTERNAL_URL estiver mal configurada."""
    if not url:
        return "BACKEND_INTERNAL_URL não definido no worker"
    if "${{" in url:
        return "BACKEND_INTERNAL_URL contém referência Railway não resolvida (${{...}})"
    if "::" in url or url.rstrip("/").endswith(":"):
        return (
            f"BACKEND_INTERNAL_URL sem porta (valor: {url}). "
            "No gamers-league-worker use Add Reference → serviço gamers-league-back → "
            "RAILWAY_PRIVATE_DOMAIN e PORT. Ex.: http://gamers-league-back.railway.internal:8080"
        )
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return f"BACKEND_INTERNAL_URL inválida: {url}"
    if parsed.port is None:
        return (
            f"BACKEND_INTERNAL_URL sem porta (valor: {url}). "
            "Inclua a porta do gamers-league-back (geralmente ${{gamers-league-back.PORT}})."
        )
    if not parsed.hostname.endswith(".railway.internal"):
        print(f"AVISO: hostname {parsed.hostname} não parece rede privada Railway (.railway.internal)")
    return None


def verify_backend_connectivity() -> None:
    url_error = validate_backend_internal_url(BACKEND_INTERNAL_URL)
    if url_error:
        print(f"ERRO: {url_error}")
        return
    if not INTERNAL_SERVICE_KEY:
        print("AVISO: INTERNAL_SERVICE_KEY não definido no worker")
        return
    if "${{" in INTERNAL_SERVICE_KEY:
        print("ERRO: INTERNAL_SERVICE_KEY contém ${{...}} literal — use Shared Variable")
        return

    health_url = f"{BACKEND_INTERNAL_URL}/api/health"
    try:
        with urllib.request.urlopen(health_url, timeout=10) as resp:
            print(f"API acessível ({health_url}) — status {resp.status}")
    except Exception as err:
        print(f"ERRO: worker não alcança a API em {BACKEND_INTERNAL_URL}: {err}")


def log_startup_diagnostics(r: redis.Redis) -> None:
    storage = get_demo_storage_dir()
    print(f"REDIS_URL={mask_redis_url(REDIS_URL)}")
    print(f"BACKEND_INTERNAL_URL={BACKEND_INTERNAL_URL or '(não definido — só volume local)'}")
    print(f"INTERNAL_SERVICE_KEY={'set' if INTERNAL_SERVICE_KEY else 'missing'}")
    print(f"DEMO_STORAGE_PATH={storage}")
    print(f"Storage existe: {storage.exists()}")
    if storage.exists():
        dem_count = count_demo_files()
        print(f"Arquivos .dem no storage: {dem_count}")
    else:
        print("AVISO: diretório de demos inexistente — monte volume /data na API e no worker")

    try:
        r.ping()
        queue_len = r.llen(DEMO_QUEUE)
        print(f"Redis OK — fila {DEMO_QUEUE}: {queue_len} job(s) pendente(s)")
    except redis.RedisError as err:
        print(f"ERRO: Redis indisponível: {err}")
        sys.exit(1)

    try:
        conn = get_db_connection()
        conn.close()
        print("Postgres OK")
    except Exception as err:
        print(f"ERRO: Postgres indisponível: {err}")
        sys.exit(1)

    verify_backend_connectivity()


def create_redis_client():
    # socket_timeout=None evita TimeoutError no brpop quando a fila está vazia
    kwargs: dict = {
        "socket_connect_timeout": 10,
        "socket_timeout": None,
        "decode_responses": True,
        "health_check_interval": 30,
    }
    if REDIS_URL.startswith("rediss://"):
        kwargs["ssl_cert_reqs"] = ssl.CERT_NONE
    return redis.from_url(REDIS_URL, **kwargs)


def count_demo_files() -> int:
    storage = get_demo_storage_dir()
    if not storage.exists():
        return 0
    return sum(1 for _ in storage.glob("*.dem"))


def publish_worker_status(r: redis.Redis) -> None:
    storage = get_demo_storage_dir()
    now = str(time.time())
    pipe = r.pipeline()
    pipe.set(WORKER_HEARTBEAT_KEY, now, ex=HEARTBEAT_TTL)
    pipe.set(WORKER_STORAGE_KEY, str(count_demo_files()), ex=HEARTBEAT_TTL)
    pipe.set(WORKER_STORAGE_PATH_KEY, str(storage), ex=HEARTBEAT_TTL)
    pipe.execute()


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


def load_registered_steam_ids() -> set[str]:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT TRIM("steamId")
                FROM "User"
                WHERE "steamId" IS NOT NULL AND TRIM("steamId") <> ''
                """
            )
            registered: set[str] = set()
            for row in cur.fetchall():
                normalized = _normalize_steam_id(row[0])
                if normalized:
                    registered.add(normalized)
            return registered
    finally:
        conn.close()


def filter_stats_to_registered_players(stats: list[dict]) -> list[dict]:
    registered = load_registered_steam_ids()
    if not registered:
        return []
    return [
        stat
        for stat in stats
        if _normalize_steam_id(stat.get("steam_id")) in registered
    ]


def get_demo_meta(demo_id: str) -> dict | None:
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d."isPersonal", d."uploadedById", d."matchId", u."steamId"
                FROM "Demo" d
                JOIN "User" u ON u.id = d."uploadedById"
                WHERE d.id = %s
                """,
                (demo_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            return {
                "is_personal": bool(row[0]),
                "uploaded_by_id": row[1],
                "match_id": row[2],
                "uploader_steam_id": row[3],
            }
    finally:
        conn.close()


def post_demo_highlights(demo_id: str, highlights: list[dict]) -> dict:
    if not BACKEND_INTERNAL_URL or not INTERNAL_SERVICE_KEY:
        raise RuntimeError(
            "BACKEND_INTERNAL_URL ou INTERNAL_SERVICE_KEY ausente no worker — destaques não podem ser salvos"
        )
    if "${{" in INTERNAL_SERVICE_KEY:
        raise RuntimeError("INTERNAL_SERVICE_KEY contém referência Railway não resolvida (${{...}})")
    payload = {"highlights": highlights}
    url = f"{BACKEND_INTERNAL_URL}/api/internal/demos/{demo_id}/highlights"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service-Key": INTERNAL_SERVICE_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"API rejeitou destaques da demo ({err.code}): {detail}") from err
    except Exception as err:
        raise RuntimeError(f"Falha ao salvar destaques pessoais: {err}") from err


def post_match_highlights(match_id: str, demo_id: str, highlights: list[dict]) -> dict:
    if not BACKEND_INTERNAL_URL or not INTERNAL_SERVICE_KEY:
        raise RuntimeError(
            "BACKEND_INTERNAL_URL ou INTERNAL_SERVICE_KEY ausente no worker — destaques não podem ser salvos"
        )
    if "${{" in INTERNAL_SERVICE_KEY:
        raise RuntimeError("INTERNAL_SERVICE_KEY contém referência Railway não resolvida (${{...}})")
    payload = {
        "highlights": [
            {**h, "demoId": demo_id}
            for h in highlights
        ],
    }
    url = f"{BACKEND_INTERNAL_URL}/api/internal/matches/{match_id}/highlights"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service-Key": INTERNAL_SERVICE_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"API rejeitou destaques da partida ({err.code}): {detail}") from err
    except Exception as err:
        raise RuntimeError(f"Falha ao salvar destaques: {err}") from err


def save_and_extract_highlights(
    file_path: str,
    demo_id: str,
    meta: dict | None,
) -> None:
    if not highlights_feature_enabled():
        return
    is_personal = bool(meta and meta.get("is_personal"))
    uploader_steam = _normalize_steam_id(meta.get("uploader_steam_id") if meta else None)
    if is_personal and not uploader_steam:
        print(f"[highlights] demo pessoal {demo_id} sem Steam ID do uploader — destaques ignorados")
        return

    try:
        hl = extract_highlights(
            file_path,
            uploader_steam_id=uploader_steam or None,
            personal_demo=is_personal,
        )
        if not hl:
            return
        if meta and meta.get("match_id") and not is_personal:
            post_match_highlights(meta["match_id"], demo_id, hl)
        elif is_personal:
            post_demo_highlights(demo_id, hl)
    except Exception as err:
        print(f"[highlights] extração falhou: {err}")


HIGHLIGHT_EXTRACT_QUEUE = "highlight:extract:queue"


def process_highlight_extract_job(payload: str) -> None:
    if not highlights_feature_enabled():
        print("[highlights] extração ignorada — feature desabilitada")
        return
    job = json.loads(payload)
    demo_id = str(job.get("demoId", ""))
    file_path = str(job.get("filePath", ""))
    if not demo_id or not file_path:
        raise ValueError("Job de extração de destaques inválido")

    meta = get_demo_meta(demo_id)
    scope = "demo"
    parent_id = demo_id
    if meta and meta.get("match_id") and not meta.get("is_personal"):
        scope = "match"
        parent_id = str(meta["match_id"])

    try:
        set_highlight_progress(
            scope,
            parent_id,
            percent=5,
            phase="extracting",
            message="Carregando arquivo da demo...",
        )

        resolved, error = ensure_demo_file(demo_id, file_path)
        if error or not resolved:
            raise RuntimeError(error or "Arquivo da demo não encontrado")

        set_highlight_progress(
            scope,
            parent_id,
            percent=15,
            phase="extracting",
            message="Analisando jogadas (sem reprocessar estatísticas)...",
        )

        is_personal = bool(meta and meta.get("is_personal"))
        uploader_steam = _normalize_steam_id(meta.get("uploader_steam_id") if meta else None)
        if is_personal and not uploader_steam:
            set_highlight_progress(
                scope,
                parent_id,
                percent=100,
                phase="failed",
                message="Configure o Steam ID no perfil para gerar destaques pessoais.",
                error="Steam ID do uploader ausente",
            )
            print(f"[highlights] demo pessoal {demo_id} sem Steam ID do uploader")
            return

        hl = extract_highlights(
            resolved,
            uploader_steam_id=uploader_steam or None,
            personal_demo=is_personal,
        )

        set_highlight_progress(
            scope,
            parent_id,
            percent=45,
            phase="saving",
            message="Salvando destaques...",
        )

        if not hl:
            set_highlight_progress(
                scope,
                parent_id,
                percent=100,
                phase="completed",
                message="Nenhum destaque encontrado nesta demo.",
            )
            print(f"[highlights] nenhum destaque para demo {demo_id}")
            return

        if meta and meta.get("match_id") and not is_personal:
            post_match_highlights(meta["match_id"], demo_id, hl)
        elif is_personal:
            post_demo_highlights(demo_id, hl)
        else:
            post_demo_highlights(demo_id, hl)

        print(f"[highlights] extração sob demanda concluída para demo {demo_id} ({len(hl)} clips)")
    except Exception as err:
        message = str(err)[:500]
        set_highlight_progress(
            scope,
            parent_id,
            percent=100,
            phase="failed",
            message="Falha ao gerar destaques.",
            error=message,
        )
        raise


def extract_map_name(file_path: str) -> str | None:
    parser = DemoParser(file_path)
    header = parser.parse_header()
    if not header:
        return None
    map_name = header.get("map_name")
    if isinstance(map_name, str) and map_name.strip():
        return map_name.strip().lower()
    return None


def update_match_map_from_demo(demo_id: str, map_name: str | None):
    if not map_name:
        return
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE "Match" m
                SET map = %s
                FROM "Demo" d
                WHERE d.id = %s
                  AND d."matchId" = m.id
                  AND (m.map IS NULL OR m.map = '')
                """,
                (map_name, demo_id),
            )
        conn.commit()
    finally:
        conn.close()


def update_demo_status(demo_id: str, status: str, error_message: str | None = None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            if error_message:
                cur.execute(
                    'UPDATE "Demo" SET status = %s, "errorMessage" = %s, "updatedAt" = NOW() WHERE id = %s',
                    (status, error_message, demo_id),
                )
            else:
                cur.execute(
                    'UPDATE "Demo" SET status = %s, "errorMessage" = NULL, "updatedAt" = NOW() WHERE id = %s',
                    (status, demo_id),
                )
        conn.commit()
    finally:
        conn.close()


def save_player_stats(demo_id: str, stats: list[dict]):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute('DELETE FROM "MatchPlayerStat" WHERE "demoId" = %s', (demo_id,))
            for s in stats:
                cur.execute(
                    """
                    INSERT INTO "MatchPlayerStat"
                    (id, "demoId", "steamId", "playerName", kills, deaths, assists, damage, adr, "hsPercent", kast)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        demo_id,
                        s.get("steam_id"),
                        s["player_name"],
                        s["kills"],
                        s["deaths"],
                        s.get("assists", 0),
                        s.get("damage", 0),
                        s["adr"],
                        s["hs_percent"],
                        s["kast"],
                    ),
                )
        conn.commit()
    finally:
        conn.close()


def parse_demo(file_path: str) -> list[dict]:
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Arquivo não encontrado: {file_path}")

    parser = DemoParser(file_path)

    deaths = parser.parse_event(
        "player_death",
        player=["X", "Y"],
        other=["attacker_steamid", "user_steamid", "assister_steamid", "headshot", "total_rounds_played"],
    )
    damages = parser.parse_event(
        "player_hurt",
        player=["X", "Y"],
        other=["attacker_steamid", "user_steamid", "dmg_health", "hitgroup", "total_rounds_played"],
    )
    rounds = parser.parse_event("round_end", player=["X", "Y"])

    total_rounds = 1
    if rounds is not None and len(rounds) > 0 and "round" in rounds.columns:
        total_rounds = max(int(rounds["round"].max()), 1)
    elif deaths is not None and len(deaths) > 0 and "total_rounds_played" in deaths.columns:
        total_rounds = max(int(deaths["total_rounds_played"].max()), 1)

    player_data: dict[str, dict] = {}
    deaths_by_round: dict[int, set[str]] = {}

    def ensure_player(steam_id: str, name: str = "Unknown"):
        if steam_id not in player_data:
            player_data[steam_id] = {
                "steam_id": steam_id,
                "player_name": name,
                "kills": 0,
                "deaths": 0,
                "assists": 0,
                "total_damage": 0,
                "headshot_kills": 0,
                "kast_rounds": set(),
            }

    if deaths is not None and len(deaths) > 0:
        for _, row in deaths.iterrows():
            attacker = str(row.get("attacker_steamid", ""))
            victim = str(row.get("user_steamid", ""))
            assister = str(row.get("assister_steamid", ""))
            attacker_name = str(row.get("attacker_name", attacker))
            victim_name = str(row.get("user_name", victim))
            round_num = int(row.get("total_rounds_played", 0) or 0)

            if attacker and attacker != "0":
                ensure_player(attacker, attacker_name)
                player_data[attacker]["kills"] += 1
                if row.get("headshot") in (True, 1):
                    player_data[attacker]["headshot_kills"] += 1
                if round_num > 0:
                    player_data[attacker]["kast_rounds"].add(round_num)

            if assister and assister != "0":
                ensure_player(assister)
                if assister != attacker:
                    player_data[assister]["assists"] += 1
                if round_num > 0:
                    player_data[assister]["kast_rounds"].add(round_num)

            if victim and victim != "0":
                ensure_player(victim, victim_name)
                player_data[victim]["deaths"] += 1
                if round_num > 0:
                    deaths_by_round.setdefault(round_num, set()).add(victim)

    if damages is not None and len(damages) > 0:
        for _, row in damages.iterrows():
            attacker = str(row.get("attacker_steamid", ""))
            if attacker and attacker != "0":
                ensure_player(attacker)
                dmg = row.get("dmg_health", 0) or 0
                player_data[attacker]["total_damage"] += int(dmg)

    all_players = set(player_data.keys())
    for round_num, victims in deaths_by_round.items():
        for steam_id in all_players - victims:
            player_data[steam_id]["kast_rounds"].add(round_num)

    results = []
    for steam_id, data in player_data.items():
        kills = data["kills"]
        deaths = data["deaths"]
        adr = round(data["total_damage"] / total_rounds, 1)
        hs_percent = round((data["headshot_kills"] / kills * 100) if kills > 0 else 0, 1)
        kast_rounds = len(data["kast_rounds"])
        kast = round((kast_rounds / total_rounds * 100) if total_rounds > 0 else 0, 1)

        results.append({
            "steam_id": steam_id,
            "player_name": data["player_name"],
            "kills": kills,
            "deaths": deaths,
            "assists": data["assists"],
            "damage": data["total_damage"],
            "adr": adr,
            "hs_percent": hs_percent,
            "kast": kast,
        })

    if not results:
        try:
            ticks = parser.parse_ticks(["steamid", "name"])
            if ticks is not None and len(ticks) > 0:
                seen = set()
                for _, row in ticks.iterrows():
                    sid = str(row.get("steamid", ""))
                    if sid and sid not in seen:
                        seen.add(sid)
                        results.append({
                            "steam_id": sid,
                            "player_name": str(row.get("name", "Unknown")),
                            "kills": 0,
                            "deaths": 0,
                            "assists": 0,
                            "damage": 0,
                            "adr": 0.0,
                            "hs_percent": 0.0,
                            "kast": 0.0,
                        })
        except Exception:
            pass

    return results


def process_job(demo_id: str, file_path: str):
    resolved, fetch_error = ensure_demo_file(demo_id, file_path)
    if not resolved:
        update_demo_status(
            demo_id,
            "FAILED",
            fetch_error or "Arquivo da demo indisponível.",
        )
        record_worker_audit(
            "demo.processing.fail",
            "Demo",
            demo_id,
            metadata={"reason": fetch_error or "Arquivo da demo indisponível."},
            success=False,
            error_code="FILE_UNAVAILABLE",
        )
        return

    file_path = resolved
    print(f"Processando demo {demo_id}: {file_path}")
    update_demo_status(demo_id, "PROCESSING")
    record_worker_audit("demo.processing.start", "Demo", demo_id)

    meta = get_demo_meta(demo_id)
    if meta is None:
        print(f"Demo {demo_id} não encontrada no banco — job ignorado")
        return
    map_name = extract_map_name(file_path)
    stats = parse_demo(file_path)

    if meta and meta["is_personal"]:
        uploader_steam = (meta.get("uploader_steam_id") or "").strip()
        if not uploader_steam:
            update_demo_status(
                demo_id,
                "FAILED",
                "Configure seu Steam ID no perfil para enviar demo pessoal.",
            )
            record_worker_audit(
                "demo.processing.fail",
                "Demo",
                demo_id,
                metadata={"reason": "Steam ID do uploader ausente"},
                success=False,
                error_code="MISSING_STEAM_ID",
            )
            return

        player_steam_ids = {str(s.get("steam_id", "")).strip() for s in stats}
        if uploader_steam not in player_steam_ids:
            update_demo_status(
                demo_id,
                "FAILED",
                "Você não participou desta partida. Seu Steam ID não foi encontrado no arquivo da demo.",
            )
            record_worker_audit(
                "demo.processing.fail",
                "Demo",
                demo_id,
                metadata={"reason": "Uploader não encontrado na demo"},
                success=False,
                error_code="UPLOADER_NOT_IN_DEMO",
            )
            return

        stats = [s for s in stats if _normalize_steam_id(s.get("steam_id")) == uploader_steam]
    else:
        before = len(stats)
        stats = filter_stats_to_registered_players(stats)
        skipped = before - len(stats)
        if skipped:
            print(f"Demo {demo_id}: ignorados {skipped} jogador(es) sem cadastro no sistema")

    save_player_stats(demo_id, stats)
    if meta and meta.get("match_id"):
        update_match_map_from_demo(demo_id, map_name)
        record_worker_audit(
            "demo.match.map_update",
            "Match",
            meta.get("match_id"),
            parent_type="Demo",
            parent_id=demo_id,
            after={"map": map_name},
        )
    save_and_extract_highlights(file_path, demo_id, meta)
    update_demo_status(demo_id, "COMPLETED")
    record_worker_audit(
        "demo.processing.complete",
        "Demo",
        demo_id,
        after={"playerCount": len(stats), "map": map_name},
        metadata={"isPersonal": bool(meta.get("is_personal")), "matchId": meta.get("match_id")},
    )
    print(f"Demo {demo_id} processada com {len(stats)} jogadores")


def main():
    print("Worker iniciado, aguardando jobs...")
    r = create_redis_client()
    log_startup_diagnostics(r)

    idle_ticks = 0
    while True:
        try:
            publish_worker_status(r)
            result = r.brpop([DEMO_QUEUE, HIGHLIGHT_RENDER_QUEUE, HIGHLIGHT_EXTRACT_QUEUE], timeout=POLL_TIMEOUT)
            if result is None:
                idle_ticks += 1
                if idle_ticks % 12 == 0:
                    qlen = r.llen(DEMO_QUEUE)
                    render_len = r.llen(HIGHLIGHT_RENDER_QUEUE)
                    extract_len = r.llen(HIGHLIGHT_EXTRACT_QUEUE)
                    print(f"Aguardando jobs... demos={qlen} renders={render_len} extracts={extract_len}")
                continue

            idle_ticks = 0
            queue_name, payload = result
            if queue_name == HIGHLIGHT_RENDER_QUEUE:
                if not highlights_feature_enabled():
                    print("[highlights] render ignorado — feature desabilitada")
                    continue
                print(f"Job de renderização recebido ({len(payload)} bytes)")
                try:
                    process_highlight_render_job(payload)
                except Exception as err:
                    print(f"[highlights] job de render inválido: {err}")
                continue
            if queue_name == HIGHLIGHT_EXTRACT_QUEUE:
                if not highlights_feature_enabled():
                    print("[highlights] extração ignorada — feature desabilitada")
                    continue
                print(f"Job de extração de destaques recebido ({len(payload)} bytes)")
                try:
                    process_highlight_extract_job(payload)
                except Exception as err:
                    print(f"[highlights] extração sob demanda falhou: {err}")
                continue

            print(f"Job recebido da fila ({len(payload)} bytes)")
            parsed = parse_job_payload(payload)
            if not parsed:
                demo_id = try_extract_demo_id(payload)
                if demo_id:
                    update_demo_status(
                        demo_id,
                        "FAILED",
                        "Job da fila inválido ou caminho da demo rejeitado.",
                    )
                print(f"Job Redis inválido — descartado: {payload[:200]}")
                continue

            demo_id, file_path = parsed

            try:
                process_job(demo_id, file_path)
            except Exception as e:
                error_msg = str(e)[:500]
                print(f"Erro ao processar demo {demo_id}: {error_msg}")
                traceback.print_exc()
                update_demo_status(demo_id, "FAILED", error_msg)

        except redis.ConnectionError:
            print("Conexão Redis perdida, tentando reconectar em 5s...")
            time.sleep(5)
            r = create_redis_client()
        except redis.TimeoutError:
            # Fila vazia — brpop expirou; continua aguardando
            continue
        except KeyboardInterrupt:
            print("Worker encerrado")
            sys.exit(0)
        except Exception as e:
            print(f"Erro inesperado: {e}")
            traceback.print_exc()
            time.sleep(2)


if __name__ == "__main__":
    main()
