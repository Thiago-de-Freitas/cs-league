"""Extração de destaques (highlights) a partir de demos CS2."""

from __future__ import annotations

from collections import defaultdict

from demoparser2 import DemoParser

CLIP_PADDING_TICKS = 64 * 5
MAX_HIGHLIGHTS = 20
TICK_RATE = 64


def _normalize_steam_id(steam_id) -> str:
    if steam_id is None:
        return ""
    value = str(steam_id).strip()
    if value.endswith(".0"):
        value = value[:-2]
    return value


def _matches_uploader_steam(highlight_steam_id, uploader_steam_id: str) -> bool:
    if not uploader_steam_id:
        return False
    return _normalize_steam_id(highlight_steam_id) == uploader_steam_id

def clip_ticks(center_tick: int) -> tuple[int, int]:
    if center_tick <= 0:
        return 0, 0
    start = max(0, center_tick - CLIP_PADDING_TICKS)
    end = center_tick + CLIP_PADDING_TICKS
    return start, end


def clip_ticks_for_kills(kill_ticks: list[int]) -> tuple[int, int]:
    """Intervalo do clipe cobrindo do primeiro ao último abate (com margem)."""
    ticks = sorted(int(t) for t in kill_ticks if int(t) > 0)
    if not ticks:
        return 0, 0
    return max(0, ticks[0] - CLIP_PADDING_TICKS), ticks[-1] + CLIP_PADDING_TICKS


def _row_team_num(row, prefix: str) -> int | None:
    for key in (f"{prefix}_team_num", f"{prefix}team_num"):
        value = row.get(key)
        if value is not None:
            try:
                parsed = int(value)
                if parsed > 0:
                    return parsed
            except (TypeError, ValueError):
                pass
    return None


def _row_team_name(row, prefix: str) -> str | None:
    for key in (f"{prefix}_team_name", f"{prefix}team_name", f"{prefix}_side", f"{prefix}side"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().upper()
    return None


def _normalize_team_key(team_num: int | None, team_name: str | None) -> str | None:
    if team_name in ("CT", "COUNTER-TERRORIST", "COUNTER_TERRORIST"):
        return "CT"
    if team_name in ("T", "TERRORIST"):
        return "T"
    if team_num == 3:
        return "CT"
    if team_num == 2:
        return "T"
    return None


def _build_highlight(
    *,
    round_num: int,
    tick: int,
    steam_id: str,
    player_name: str,
    htype: str,
    description: str,
    score: float,
    metadata: dict | None = None,
) -> dict:
    clip_start, clip_end = clip_ticks(tick)
    meta = dict(metadata or {})
    kill_ticks = meta.get("killTicks")
    if isinstance(kill_ticks, list) and kill_ticks:
        clip_start, clip_end = clip_ticks_for_kills(kill_ticks)

    return {
        "round": round_num,
        "tick": tick,
        "clipStartTick": clip_start,
        "clipEndTick": clip_end,
        "steamId": steam_id,
        "playerName": player_name,
        "type": htype,
        "description": description,
        "score": score,
        "metadata": meta,
    }


def _extract_multi_kills_and_aces(deaths) -> list[dict]:
    if deaths is None or len(deaths) == 0:
        return []

    kills_by_round: dict[int, dict[str, dict]] = {}
    for _, row in deaths.iterrows():
        attacker = str(row.get("attacker_steamid", ""))
        if not attacker or attacker == "0":
            continue
        round_num = int(row.get("total_rounds_played", 0) or 0)
        if round_num <= 0:
            continue
        name = str(row.get("attacker_name", attacker))
        tick = int(row.get("tick", 0) or 0)
        is_hs = row.get("headshot") in (True, 1)
        bucket = kills_by_round.setdefault(round_num, {})
        entry = bucket.setdefault(
            attacker,
            {"name": name, "kills": 0, "hs": 0, "last_tick": tick, "kill_ticks": []},
        )
        entry["kills"] += 1
        if is_hs:
            entry["hs"] += 1
        entry["last_tick"] = tick
        entry["kill_ticks"].append(tick)

    highlights: list[dict] = []
    for round_num, attackers in kills_by_round.items():
        for steam_id, data in attackers.items():
            kills = data["kills"]
            if kills < 3:
                continue
            htype = "ACE" if kills >= 5 else "MULTI_KILL"
            score = float(kills) + (0.5 if data["hs"] > 0 else 0)
            kill_ticks = sorted(int(t) for t in data["kill_ticks"] if int(t) > 0)
            highlights.append(
                _build_highlight(
                    round_num=round_num,
                    tick=int(data["last_tick"]),
                    steam_id=steam_id,
                    player_name=data["name"],
                    htype=htype,
                    description=f"{data['name']}: {kills} abates no round {round_num}",
                    score=score,
                    metadata={"kills": kills, "headshots": data["hs"], "killTicks": kill_ticks},
                )
            )
    return highlights


def _extract_opening_kills(deaths, freeze_end_by_round: dict[int, int]) -> list[dict]:
    if deaths is None or len(deaths) == 0:
        return []

    deaths_by_round: dict[int, list[dict]] = defaultdict(list)
    for _, row in deaths.iterrows():
        attacker = str(row.get("attacker_steamid", ""))
        victim = str(row.get("user_steamid", ""))
        if not attacker or attacker == "0" or not victim or victim == "0":
            continue
        if attacker == victim:
            continue
        round_num = int(row.get("total_rounds_played", 0) or 0)
        if round_num <= 0:
            continue
        tick = int(row.get("tick", 0) or 0)
        freeze_end = freeze_end_by_round.get(round_num)
        if freeze_end is not None and tick < freeze_end:
            continue
        deaths_by_round[round_num].append(
            {
                "tick": tick,
                "attacker": attacker,
                "attacker_name": str(row.get("attacker_name", attacker)),
                "victim": victim,
                "headshot": row.get("headshot") in (True, 1),
            }
        )

    highlights: list[dict] = []
    for round_num, round_deaths in deaths_by_round.items():
        round_deaths.sort(key=lambda item: item["tick"])
        first = round_deaths[0]
        score = 2.5 + (0.5 if first["headshot"] else 0)
        highlights.append(
            _build_highlight(
                round_num=round_num,
                tick=first["tick"],
                steam_id=first["attacker"],
                player_name=first["attacker_name"],
                htype="OPENING_KILL",
                description=f"{first['attacker_name']}: opening kill no round {round_num}",
                score=score,
                metadata={"victimSteamId": first["victim"], "headshot": first["headshot"], "killTicks": [first["tick"]]},
            )
        )
    return highlights


def _round_winner_team(round_end_row) -> str | None:
    winner = round_end_row.get("winner")
    if isinstance(winner, str) and winner.strip():
        normalized = winner.strip().upper()
        if normalized in ("CT", "COUNTER-TERRORIST", "COUNTER_TERRORIST"):
            return "CT"
        if normalized in ("T", "TERRORIST"):
            return "T"
    winner_num = round_end_row.get("winner_team_num")
    if winner_num is not None:
        try:
            return _normalize_team_key(int(winner_num), None)
        except (TypeError, ValueError):
            pass
    return None


def _extract_clutches(deaths, rounds_end) -> list[dict]:
    if deaths is None or len(deaths) == 0:
        return []

    winners_by_round: dict[int, str] = {}
    if rounds_end is not None and len(rounds_end) > 0:
        for _, row in rounds_end.iterrows():
            round_num = int(row.get("round", row.get("total_rounds_played", 0)) or 0)
            if round_num <= 0:
                continue
            winner = _round_winner_team(row)
            if winner:
                winners_by_round[round_num] = winner

    deaths_by_round: dict[int, list[dict]] = defaultdict(list)
    for _, row in deaths.iterrows():
        attacker = str(row.get("attacker_steamid", ""))
        victim = str(row.get("user_steamid", ""))
        if not victim or victim == "0":
            continue
        round_num = int(row.get("total_rounds_played", 0) or 0)
        if round_num <= 0:
            continue
        attacker_team = _normalize_team_key(
            _row_team_num(row, "attacker"),
            _row_team_name(row, "attacker"),
        )
        victim_team = _normalize_team_key(
            _row_team_num(row, "user"),
            _row_team_name(row, "user"),
        )
        deaths_by_round[round_num].append(
            {
                "tick": int(row.get("tick", 0) or 0),
                "attacker": attacker if attacker and attacker != "0" else None,
                "attacker_name": str(row.get("attacker_name", attacker or "Jogador")),
                "victim": victim,
                "attacker_team": attacker_team,
                "victim_team": victim_team,
            }
        )

    highlights: list[dict] = []
    for round_num, round_deaths in deaths_by_round.items():
        round_deaths.sort(key=lambda item: item["tick"])
        teams: dict[str, set[str]] = defaultdict(set)
        for death in round_deaths:
            if death["victim_team"]:
                teams[death["victim_team"]].add(death["victim"])
            if death["attacker"] and death["attacker_team"]:
                teams[death["attacker_team"]].add(death["attacker"])

        if len(teams) < 2:
            continue

        alive: dict[str, set[str]] = {team: set(players) for team, players in teams.items()}
        clutch_player: str | None = None
        clutch_name = "Jogador"
        clutch_team: str | None = None
        clutch_enemies = 0
        clutch_tick = 0

        for death in round_deaths:
            victim_team = death["victim_team"]
            attacker = death["attacker"]
            attacker_team = death["attacker_team"]
            if victim_team and death["victim"] in alive.get(victim_team, set()):
                alive[victim_team].discard(death["victim"])

            if not attacker or not attacker_team:
                continue

            allies_alive = len(alive.get(attacker_team, set()))
            enemy_count = sum(
                len(players)
                for team, players in alive.items()
                if team != attacker_team
            )

            if allies_alive == 1 and attacker in alive.get(attacker_team, set()) and enemy_count >= 2:
                clutch_player = attacker
                clutch_name = death["attacker_name"]
                clutch_team = attacker_team
                clutch_enemies = enemy_count
                clutch_tick = death["tick"]

        winner_team = winners_by_round.get(round_num)
        if not clutch_player or not clutch_team or not winner_team:
            continue
        if winner_team != clutch_team:
            continue
        if clutch_player not in alive.get(clutch_team, set()):
            continue

        score = 6.0 + float(clutch_enemies)
        highlights.append(
            _build_highlight(
                round_num=round_num,
                tick=clutch_tick,
                steam_id=clutch_player,
                player_name=clutch_name,
                htype="CLUTCH",
                description=f"{clutch_name}: clutch 1v{clutch_enemies} no round {round_num}",
                score=score,
                metadata={"enemies": clutch_enemies, "killTicks": [clutch_tick]},
            )
        )

    return highlights


def _parse_freeze_end_by_round(parser: DemoParser) -> dict[int, int]:
    freeze_end_by_round: dict[int, int] = {}
    try:
        freeze_events = parser.parse_event(
            "round_freeze_end",
            player=["X", "Y"],
            other=["total_rounds_played", "round", "tick"],
        )
    except Exception:
        return freeze_end_by_round

    if freeze_events is None or len(freeze_events) == 0:
        return freeze_end_by_round

    for _, row in freeze_events.iterrows():
        round_num = int(row.get("total_rounds_played", row.get("round", 0)) or 0)
        tick = int(row.get("tick", 0) or 0)
        if round_num > 0 and tick > 0:
            freeze_end_by_round[round_num] = tick
    return freeze_end_by_round


def extract_highlights(
    file_path: str,
    uploader_steam_id: str | None = None,
    *,
    personal_demo: bool = False,
) -> list[dict]:
    parser = DemoParser(file_path)
    deaths = parser.parse_event(
        "player_death",
        player=["X", "Y"],
        other=[
            "attacker_steamid",
            "attacker_name",
            "user_steamid",
            "user_name",
            "headshot",
            "total_rounds_played",
            "tick",
            "attacker_team_num",
            "user_team_num",
            "attacker_team_name",
            "user_team_name",
        ],
    )
    rounds_end = parser.parse_event("round_end", player=["X", "Y"])
    freeze_end_by_round = _parse_freeze_end_by_round(parser)

    highlights: list[dict] = []
    highlights.extend(_extract_multi_kills_and_aces(deaths))
    highlights.extend(_extract_opening_kills(deaths, freeze_end_by_round))
    highlights.extend(_extract_clutches(deaths, rounds_end))

    normalized_uploader = _normalize_steam_id(uploader_steam_id)
    if personal_demo:
        if not normalized_uploader:
            return []
        highlights = [
            h for h in highlights if _matches_uploader_steam(h.get("steamId"), normalized_uploader)
        ]
    elif normalized_uploader:
        highlights = [
            h for h in highlights if _matches_uploader_steam(h.get("steamId"), normalized_uploader)
        ]

    deduped: dict[tuple[int, str, str], dict] = {}
    for highlight in highlights:
        key = (highlight["round"], highlight["steamId"], highlight["type"])
        current = deduped.get(key)
        if current is None or highlight["score"] > current["score"]:
            deduped[key] = highlight

    merged = list(deduped.values())
    merged.sort(key=lambda item: (-item["score"], item["round"]))
    return merged[:MAX_HIGHLIGHTS]


def clip_duration_seconds(clip_start_tick: int, clip_end_tick: int, tick_rate: int = TICK_RATE) -> int:
    ticks = max(clip_end_tick - clip_start_tick, tick_rate * 3)
    return max(3, min(30, int(round(ticks / tick_rate))))
