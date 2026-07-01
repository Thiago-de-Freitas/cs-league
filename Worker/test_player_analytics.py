import unittest

from player_analytics import (
    _is_utility_weapon,
    _normalize_team_key,
    _normalize_steam_id,
)


class PlayerAnalyticsHelpersTest(unittest.TestCase):
    def test_normalize_steam_id(self):
        self.assertEqual(_normalize_steam_id("76561198000000000.0"), "76561198000000000")
        self.assertEqual(_normalize_steam_id(None), "")

    def test_normalize_team_key(self):
        self.assertEqual(_normalize_team_key(3, None), "CT")
        self.assertEqual(_normalize_team_key(2, None), "T")
        self.assertEqual(_normalize_team_key(None, "TERRORIST"), "T")

    def test_is_utility_weapon(self):
        self.assertEqual(_is_utility_weapon("weapon_hegrenade"), "he")
        self.assertEqual(_is_utility_weapon("inferno"), "molotov")
        self.assertEqual(_is_utility_weapon("flashbang"), "flash")
        self.assertIsNone(_is_utility_weapon("ak47"))


if __name__ == "__main__":
    unittest.main()
