import unittest
from unittest.mock import patch

from highlight_renderer import (
    _parse_kill_ticks,
    _tick_offset_seconds,
    resolve_render_mode,
)


class HighlightRendererTest(unittest.TestCase):
    def test_parse_kill_ticks(self):
        self.assertEqual(_parse_kill_ticks({"killTicks": [900, 500, 700]}), [500, 700, 900])
        self.assertEqual(_parse_kill_ticks({}), [])

    def test_tick_offset_seconds(self):
        self.assertAlmostEqual(_tick_offset_seconds(1000, 680), (1000 - 680) / 64)

    @patch("highlight_renderer.resolve_cs2_exe", return_value="C:/cs2.exe")
    def test_resolve_render_mode_auto_prefers_cs2(self, _mock):
        with patch("highlight_renderer.HIGHLIGHT_RENDER_MODE", "auto"):
            self.assertEqual(resolve_render_mode(), "cs2")

    @patch("highlight_renderer.resolve_cs2_exe", return_value=None)
    def test_resolve_render_mode_auto_fallback_card(self, _mock):
        with patch("highlight_renderer.HIGHLIGHT_RENDER_MODE", "auto"):
            self.assertEqual(resolve_render_mode(), "card")


if __name__ == "__main__":
    unittest.main()
