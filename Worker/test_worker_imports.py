import unittest


class TestWorkerImports(unittest.TestCase):
    def test_highlight_render_queue_exported(self):
        from highlight_renderer import HIGHLIGHT_RENDER_QUEUE, process_highlight_render_job

        self.assertEqual(HIGHLIGHT_RENDER_QUEUE, "highlight:render:queue")
        self.assertTrue(callable(process_highlight_render_job))


if __name__ == "__main__":
    unittest.main()
