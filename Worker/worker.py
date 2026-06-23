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

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://csleague:csleague@localhost:5432/csleague")
DEMO_STORAGE_PATH = os.environ.get("DEMO_STORAGE_PATH")
BACKEND_INTERNAL_URL = os.environ.get("BACKEND_INTERNAL_URL", "").rstrip("/")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")
DEMO_QUEUE = "demo:queue"
WORKER_HEARTBEAT_KEY = "demo:worker:heartbeat"
WORKER_STORAGE_KEY = "demo:worker:files_on_disk"
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
            return None, "API sem INTERNAL_SERVICE_KEY — configure no cs-league-back e redeploy"
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
            "No cs-league-worker use Add Reference → serviço cs-league-back → "
            "RAILWAY_PRIVATE_DOMAIN e PORT. Ex.: http://cs-league-back.railway.internal:8080"
        )
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return f"BACKEND_INTERNAL_URL inválida: {url}"
    if parsed.port is None:
        return (
            f"BACKEND_INTERNAL_URL sem porta (valor: {url}). "
            "Inclua a porta do cs-league-back (geralmente ${{cs-league-back.PORT}})."
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
                    (id, "demoId", "steamId", "playerName", kills, deaths, adr, "hsPercent", kast)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        str(uuid.uuid4()),
                        demo_id,
                        s.get("steam_id"),
                        s["player_name"],
                        s["kills"],
                        s["deaths"],
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

            if assister and assister != "0" and round_num > 0:
                ensure_player(assister)
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
        return

    file_path = resolved
    print(f"Processando demo {demo_id}: {file_path}")
    update_demo_status(demo_id, "PROCESSING")

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
            return

        player_steam_ids = {str(s.get("steam_id", "")).strip() for s in stats}
        if uploader_steam not in player_steam_ids:
            update_demo_status(
                demo_id,
                "FAILED",
                "Você não participou desta partida. Seu Steam ID não foi encontrado no arquivo da demo.",
            )
            return

        stats = [s for s in stats if str(s.get("steam_id", "")).strip() == uploader_steam]

    save_player_stats(demo_id, stats)
    if meta and meta.get("match_id"):
        update_match_map_from_demo(demo_id, map_name)
    update_demo_status(demo_id, "COMPLETED")
    print(f"Demo {demo_id} processada com {len(stats)} jogadores")


def main():
    print("Worker iniciado, aguardando jobs...")
    r = create_redis_client()
    log_startup_diagnostics(r)

    idle_ticks = 0
    while True:
        try:
            publish_worker_status(r)
            result = r.brpop(DEMO_QUEUE, timeout=POLL_TIMEOUT)
            if result is None:
                idle_ticks += 1
                if idle_ticks % 12 == 0:
                    qlen = r.llen(DEMO_QUEUE)
                    print(f"Aguardando jobs... fila {DEMO_QUEUE}: {qlen} item(s)")
                continue

            idle_ticks = 0
            _, payload = result
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
