"""Métricas avançadas por jogador (inspirado em análises Leetify)."""

from __future__ import annotations

from collections import defaultdict

from demoparser2 import DemoParser

TRADE_WINDOW_TICKS = 64 * 3


def _normalize_steam_id(steam_id) -> str:
    if steam_id is None:
        return ""
    value = str(steam_id).strip()
    if value.endswith(".0"):
        value = value[:-2]
    return value


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


def _empty_side() -> dict:
    return {"kills": 0, "deaths": 0, "damage": 0, "rounds": 0}


def _side_bucket(analytics: dict, side: str | None) -> dict | None:
    if side not in ("T", "CT"):
        return None
    key = side.lower()
    sides = analytics.setdefault("sides", {})
    if key not in sides:
        sides[key] = _empty_side()
    return sides[key]


def _is_utility_weapon(weapon: str) -> str | None:
    lowered = weapon.lower()
    if "hegrenade" in lowered or lowered in ("he", "frag"):
        return "he"
    if "inferno" in lowered or "molotov" in lowered or "incgrenade" in lowered:
        return "molotov"
    if "flashbang" in lowered or lowered == "flash":
        return "flash"
    return None


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


def _finalize_side_rounds(analytics: dict) -> None:
    sides = analytics.get("sides")
    if not isinstance(sides, dict):
        return
    for side_data in sides.values():
        if isinstance(side_data, dict) and "rounds_set" in side_data:
            side_data["rounds"] = len(side_data.pop("rounds_set"))


def _ensure_player(store: dict[str, dict], steam_id: str) -> dict:
    if steam_id not in store:
        store[steam_id] = {
            "map": None,
            "sides": {},
            "utility": {
                "heDamage": 0,
                "molotovDamage": 0,
                "flashAssists": 0,
            },
            "combat": {
                "tradeKills": 0,
                "tradedDeaths": 0,
                "openingKills": 0,
                "openingDeaths": 0,
            },
        }
    return store[steam_id]


def extract_player_analytics(parser: DemoParser, map_name: str | None) -> dict[str, dict]:
    deaths = parser.parse_event(
        "player_death",
        player=["X", "Y"],
        other=[
            "attacker_steamid",
            "user_steamid",
            "assister_steamid",
            "headshot",
            "total_rounds_played",
            "tick",
            "attacker_team_num",
            "user_team_num",
            "attacker_team_name",
            "user_team_name",
            "weapon",
        ],
    )
    damages = parser.parse_event(
        "player_hurt",
        player=["X", "Y"],
        other=[
            "attacker_steamid",
            "user_steamid",
            "dmg_health",
            "weapon",
            "total_rounds_played",
            "attacker_team_num",
            "user_team_num",
            "attacker_team_name",
            "user_team_name",
        ],
    )

    freeze_end_by_round = _parse_freeze_end_by_round(parser)
    store: dict[str, dict] = {}

    deaths_by_round: dict[int, list[dict]] = defaultdict(list)
    pending_trades_by_round: dict[int, list[dict]] = defaultdict(list)

    if deaths is not None and len(deaths) > 0:
        for _, row in deaths.iterrows():
            attacker = _normalize_steam_id(row.get("attacker_steamid"))
            victim = _normalize_steam_id(row.get("user_steamid"))
            assister = _normalize_steam_id(row.get("assister_steamid"))
            round_num = int(row.get("total_rounds_played", 0) or 0)
            tick = int(row.get("tick", 0) or 0)
            attacker_side = _normalize_team_key(
                _row_team_num(row, "attacker"),
                _row_team_name(row, "attacker"),
            )
            victim_side = _normalize_team_key(
                _row_team_num(row, "user"),
                _row_team_name(row, "user"),
            )

            if victim and victim != "0":
                analytics = _ensure_player(store, victim)
                if map_name:
                    analytics["map"] = map_name
                side = _side_bucket(analytics, victim_side)
                if side is not None:
                    side["deaths"] += 1
                    if round_num > 0:
                        side.setdefault("rounds_set", set()).add(round_num)

            if attacker and attacker != "0" and victim and victim != "0" and attacker != victim:
                analytics = _ensure_player(store, attacker)
                if map_name:
                    analytics["map"] = map_name
                side = _side_bucket(analytics, attacker_side)
                if side is not None:
                    side["kills"] += 1
                    if round_num > 0:
                        side.setdefault("rounds_set", set()).add(round_num)

                if round_num > 0 and tick > 0:
                    freeze_end = freeze_end_by_round.get(round_num)
                    if freeze_end is None or tick >= freeze_end:
                        deaths_by_round[round_num].append(
                            {
                                "tick": tick,
                                "attacker": attacker,
                                "victim": victim,
                                "attacker_side": attacker_side,
                                "victim_side": victim_side,
                            }
                        )

                        for pending in list(pending_trades_by_round[round_num]):
                            if tick - pending["tick"] > TRADE_WINDOW_TICKS:
                                pending_trades_by_round[round_num].remove(pending)
                                continue
                            if (
                                pending["victim_side"]
                                and attacker_side == pending["victim_side"]
                                and attacker != pending["victim"]
                                and victim == pending["killer"]
                            ):
                                store[attacker]["combat"]["tradeKills"] += 1
                                store[pending["victim"]]["combat"]["tradedDeaths"] += 1

                        pending_trades_by_round[round_num].append(
                            {
                                "tick": tick,
                                "victim": victim,
                                "victim_side": victim_side,
                                "killer": attacker,
                            }
                        )

            if assister and assister != "0" and assister != attacker:
                analytics = _ensure_player(store, assister)
                weapon = str(row.get("weapon", "") or "")
                if _is_utility_weapon(weapon) == "flash":
                    analytics["utility"]["flashAssists"] += 1

    if damages is not None and len(damages) > 0:
        for _, row in damages.iterrows():
            attacker = _normalize_steam_id(row.get("attacker_steamid"))
            if not attacker or attacker == "0":
                continue
            dmg = int(row.get("dmg_health", 0) or 0)
            if dmg <= 0:
                continue
            weapon = str(row.get("weapon", "") or "")
            util_type = _is_utility_weapon(weapon)
            round_num = int(row.get("total_rounds_played", 0) or 0)
            attacker_side = _normalize_team_key(
                _row_team_num(row, "attacker"),
                _row_team_name(row, "attacker"),
            )

            analytics = _ensure_player(store, attacker)
            if map_name:
                analytics["map"] = map_name
            side = _side_bucket(analytics, attacker_side)
            if side is not None:
                side["damage"] += dmg
                if round_num > 0:
                    side.setdefault("rounds_set", set()).add(round_num)

            if util_type == "he":
                analytics["utility"]["heDamage"] += dmg
            elif util_type == "molotov":
                analytics["utility"]["molotovDamage"] += dmg

    for round_num, round_deaths in deaths_by_round.items():
        round_deaths.sort(key=lambda item: item["tick"])
        first = round_deaths[0]
        if first["attacker"]:
            _ensure_player(store, first["attacker"])["combat"]["openingKills"] += 1
        if first["victim"]:
            _ensure_player(store, first["victim"])["combat"]["openingDeaths"] += 1

    for analytics in store.values():
        _finalize_side_rounds(analytics)

    return store
