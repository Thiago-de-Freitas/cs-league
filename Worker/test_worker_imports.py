import unittest


class TestWorkerImports(unittest.TestCase):
    def test_worker_module_imports(self):
        import worker  # noqa: F401

    def test_highlight_modules_import(self):
        from highlight_extraction import extract_highlights, _normalize_steam_id
        from highlight_progress import set_highlight_progress
        from highlight_renderer import HIGHLIGHT_RENDER_QUEUE, process_highlight_render_job

        self.assertTrue(callable(extract_highlights))
        self.assertTrue(callable(_normalize_steam_id))
        self.assertTrue(callable(set_highlight_progress))
        self.assertEqual(HIGHLIGHT_RENDER_QUEUE, "highlight:render:queue")
        self.assertTrue(callable(process_highlight_render_job))

    def test_highlight_render_queue_exported(self):
        from highlight_renderer import HIGHLIGHT_RENDER_QUEUE, process_highlight_render_job

        self.assertEqual(HIGHLIGHT_RENDER_QUEUE, "highlight:render:queue")
        self.assertTrue(callable(process_highlight_render_job))


if __name__ == "__main__":
    unittest.main()
