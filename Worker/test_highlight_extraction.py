import unittest

from highlight_extraction import (
    clip_duration_seconds,
    clip_ticks,
    _normalize_team_key,
    _normalize_steam_id,
    _matches_uploader_steam,
)


class HighlightExtractionTest(unittest.TestCase):
    def test_clip_ticks_applies_padding(self):
        start, end = clip_ticks(1000)
        self.assertEqual(start, 680)
        self.assertEqual(end, 1320)

    def test_clip_ticks_zero_center(self):
        self.assertEqual(clip_ticks(0), (0, 0))

    def test_clip_duration_seconds_bounds(self):
        self.assertGreaterEqual(clip_duration_seconds(0, 64), 3)
        self.assertLessEqual(clip_duration_seconds(0, 64 * 100), 30)

    def test_normalize_team_key(self):
        self.assertEqual(_normalize_team_key(3, None), "CT")
        self.assertEqual(_normalize_team_key(2, None), "T")
        self.assertEqual(_normalize_team_key(None, "CT"), "CT")
        self.assertEqual(_normalize_team_key(None, "TERRORIST"), "T")

    def test_normalize_steam_id(self):
        self.assertEqual(_normalize_steam_id("76561198000000000"), "76561198000000000")
        self.assertEqual(_normalize_steam_id("76561198000000000.0"), "76561198000000000")
        self.assertEqual(_normalize_steam_id(None), "")
        self.assertTrue(
            _matches_uploader_steam("76561198000000000.0", "76561198000000000")
        )
        self.assertFalse(
            _matches_uploader_steam("76561198999999999", "76561198000000000")
        )


if __name__ == "__main__":
    unittest.main()
