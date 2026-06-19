#!/usr/bin/env python3
"""Worker que processa demos CS2 da fila Redis."""

import json
import os
import sys
import time
import traceback
import uuid

import psycopg2
import redis
from demoparser2 import DemoParser

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://csleague:csleague@localhost:5432/csleague")
DEMO_QUEUE = "demo:queue"
POLL_TIMEOUT = 5


def get_db_connection():
    return psycopg2.connect(DATABASE_URL)


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

    deaths = parser.parse_event("player_death", player=["X", "Y"], other=["attacker_steamid", "user_steamid"])
    damages = parser.parse_event("player_hurt", player=["X", "Y"], other=["attacker_steamid", "user_steamid", "dmg_health", "hitgroup"])
    rounds = parser.parse_event("round_end", player=["X", "Y"])

    total_rounds = max(len(rounds) if rounds is not None and len(rounds) > 0 else 1, 1)

    player_data: dict[str, dict] = {}

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
            attacker_name = str(row.get("attacker_name", attacker))
            victim_name = str(row.get("user_name", victim))

            if attacker and attacker != "0":
                ensure_player(attacker, attacker_name)
                player_data[attacker]["kills"] += 1
                if row.get("headshot") in (True, 1):
                    player_data[attacker]["headshot_kills"] += 1

            if victim and victim != "0":
                ensure_player(victim, victim_name)
                player_data[victim]["deaths"] += 1

    if damages is not None and len(damages) > 0:
        for _, row in damages.iterrows():
            attacker = str(row.get("attacker_steamid", ""))
            if attacker and attacker != "0":
                ensure_player(attacker)
                dmg = row.get("dmg_health", 0) or 0
                player_data[attacker]["total_damage"] += int(dmg)

    if deaths is not None and len(deaths) > 0:
        for tick, row in deaths.iterrows():
            round_num = row.get("total_rounds_played", tick)
            attacker = str(row.get("attacker_steamid", ""))
            if attacker and attacker != "0":
                ensure_player(attacker)
                player_data[attacker]["kast_rounds"].add(round_num)

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
    print(f"Processando demo {demo_id}: {file_path}")
    update_demo_status(demo_id, "PROCESSING")

    stats = parse_demo(file_path)
    save_player_stats(demo_id, stats)
    update_demo_status(demo_id, "COMPLETED")
    print(f"Demo {demo_id} processada com {len(stats)} jogadores")


def main():
    print("Worker iniciado, aguardando jobs...")
    r = redis.from_url(REDIS_URL)

    while True:
        try:
            result = r.brpop(DEMO_QUEUE, timeout=POLL_TIMEOUT)
            if result is None:
                continue

            _, payload = result
            job = json.loads(payload)
            demo_id = job["demoId"]
            file_path = job["filePath"]

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
            r = redis.from_url(REDIS_URL)
        except KeyboardInterrupt:
            print("Worker encerrado")
            sys.exit(0)
        except Exception as e:
            print(f"Erro inesperado: {e}")
            traceback.print_exc()
            time.sleep(2)


if __name__ == "__main__":
    main()
