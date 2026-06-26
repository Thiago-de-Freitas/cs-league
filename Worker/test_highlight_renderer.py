import unittest
from unittest.mock import patch

from highlight_renderer import (
    _parse_kill_ticks,
    _sanitize_movie_basename,
    _tick_offset_seconds,
    resolve_cs2_csgo_dir,
    resolve_render_mode,
    resolve_steam_exe,
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

    def test_resolve_cs2_csgo_dir(self):
        csgo = resolve_cs2_csgo_dir(r"C:\Steam\game\bin\win64\cs2.exe")
        self.assertTrue(str(csgo).replace("\\", "/").endswith("game/csgo"))

    def test_sanitize_movie_basename(self):
        self.assertEqual(_sanitize_movie_basename("cmqv8wo6k00040w0gyjyb254o"), "cmqv8wo6k00040w0gyjyb254o")
        self.assertTrue(_sanitize_movie_basename("").startswith("csleague"))

    @patch("highlight_renderer.Path.is_file", return_value=True)
    def test_resolve_steam_exe_prefers_env(self, _mock):
        with patch("highlight_renderer.STEAM_EXE_PATH", r"D:\Steam\steam.exe"):
            self.assertEqual(resolve_steam_exe(), r"D:\Steam\steam.exe")


if __name__ == "__main__":
    unittest.main()
