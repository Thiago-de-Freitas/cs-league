"""Renderização de clipes MP4 para destaques de demo."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import urllib.request
from pathlib import Path

from highlight_extraction import clip_duration_seconds

WORKER_DIR = Path(__file__).resolve().parent
BACKEND_HIGHLIGHTS = WORKER_DIR.parent / "Backend" / "data" / "highlights"

HIGHLIGHT_RENDER_MODE = os.environ.get("HIGHLIGHT_RENDER_MODE", "card").strip().lower()
HIGHLIGHT_CLIPS_PATH = os.environ.get("HIGHLIGHT_CLIPS_PATH")
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")
CS2_EXE_PATH = os.environ.get("CS2_EXE_PATH", "").strip()
BACKEND_INTERNAL_URL = os.environ.get("BACKEND_INTERNAL_URL", "").rstrip("/")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")

HIGHLIGHT_RENDER_QUEUE = "highlight:render:queue"


def get_highlight_clips_dir() -> Path:
    if HIGHLIGHT_CLIPS_PATH:
        storage = Path(HIGHLIGHT_CLIPS_PATH)
        if not storage.is_absolute():
            storage = (WORKER_DIR / storage).resolve()
    else:
        storage = BACKEND_HIGHLIGHTS.resolve()
    storage.mkdir(parents=True, exist_ok=True)
    return storage


def _ffmpeg_available() -> bool:
    return shutil.which(FFMPEG_PATH) is not None


def _sanitize_drawtext(value: str) -> str:
    cleaned = value.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    cleaned = re.sub(r"[\r\n]+", " ", cleaned)
    return cleaned[:120]


def _type_label(highlight_type: str) -> str:
    labels = {
        "MULTI_KILL": "Multi-kill",
        "ACE": "ACE",
        "CLUTCH": "Clutch",
        "OPENING_KILL": "Opening kill",
    }
    return labels.get(highlight_type.upper(), highlight_type)


def render_card_clip(
    output_path: Path,
    *,
    player_name: str,
    description: str,
    highlight_type: str,
    round_num: int,
    clip_start_tick: int,
    clip_end_tick: int,
) -> None:
    if not _ffmpeg_available():
        raise RuntimeError("FFmpeg não encontrado no PATH")

    duration = clip_duration_seconds(clip_start_tick, clip_end_tick)
    title = _sanitize_drawtext("CS League")
    player = _sanitize_drawtext(player_name)
    label = _sanitize_drawtext(_type_label(highlight_type))
    desc = _sanitize_drawtext(description)
    round_text = _sanitize_drawtext(f"Round {round_num}")
    tick_text = _sanitize_drawtext(f"Ticks {clip_start_tick} → {clip_end_tick}")

    filter_graph = (
        f"drawtext=fontcolor=#ff6b2b:fontsize=52:text='{title}':x=(w-text_w)/2:y=70,"
        f"drawtext=fontcolor=white:fontsize=40:text='{player}':x=(w-text_w)/2:y=170,"
        f"drawtext=fontcolor=#ffb347:fontsize=30:text='{label}':x=(w-text_w)/2:y=240,"
        f"drawtext=fontcolor=#d0d4de:fontsize=26:text='{desc}':x=(w-text_w)/2:y=310,"
        f"drawtext=fontcolor=#9aa3b5:fontsize=24:text='{round_text}':x=(w-text_w)/2:y=380,"
        f"drawtext=fontcolor=#9aa3b5:fontsize=22:text='{tick_text}':x=(w-text_w)/2:y=430"
    )

    cmd = [
        FFMPEG_PATH,
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c=#12151c:s=1280x720:d={duration}",
        "-vf",
        filter_graph,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:] or "FFmpeg falhou ao gerar clipe")


def render_cs2_clip(
    output_path: Path,
    *,
    demo_path: str,
    clip_start_tick: int,
    clip_end_tick: int,
) -> None:
    if not CS2_EXE_PATH or not Path(CS2_EXE_PATH).is_file():
        raise RuntimeError("CS2_EXE_PATH não configurado para renderização GOTV")
    if not _ffmpeg_available():
        raise RuntimeError("FFmpeg necessário para converter frames do CS2")

    duration = clip_duration_seconds(clip_start_tick, clip_end_tick)
    temp_dir = output_path.parent / f".render-{output_path.stem}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    frame_prefix = temp_dir / "frame"

    cfg_path = temp_dir / "highlight.cfg"
    cfg_lines = [
        "demo_pauseafterinit 1",
        f"demo_gototick {clip_start_tick}",
        "demo_pause 1",
        "host_framerate 30",
        "host_timescale 1",
        f"startmovie {frame_prefix.as_posix()} tga",
        f"demo_gototick {clip_end_tick}",
        "endmovie",
        "quit",
    ]
    cfg_path.write_text("\n".join(cfg_lines), encoding="utf-8")

    cs2_cmd = [
        CS2_EXE_PATH,
        "-insecure",
        "-novid",
        "-console",
        "+playdemo",
        demo_path,
        "+exec",
        str(cfg_path),
    ]
    result = subprocess.run(cs2_cmd, capture_output=True, text=True, timeout=max(180, duration * 4))
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500] or "CS2 não concluiu a renderização")

    frames = sorted(temp_dir.glob("frame*.tga"))
    if not frames:
        raise RuntimeError("CS2 não gerou frames para o clipe")

    cmd = [
        FFMPEG_PATH,
        "-y",
        "-framerate",
        "30",
        "-i",
        str(temp_dir / "frame%04d.tga"),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    ffmpeg_result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if ffmpeg_result.returncode != 0:
        raise RuntimeError(ffmpeg_result.stderr[-500] or "FFmpeg falhou ao converter frames")

    for frame in frames:
        try:
            frame.unlink()
        except OSError:
            pass
    try:
        cfg_path.unlink()
        temp_dir.rmdir()
    except OSError:
        pass


def render_highlight_clip(job: dict) -> Path:
    highlight_id = str(job["highlightId"])
    output_path = get_highlight_clips_dir() / f"{highlight_id}.mp4"
    clip_start = int(job["clipStartTick"])
    clip_end = int(job["clipEndTick"])

    if HIGHLIGHT_RENDER_MODE == "cs2":
        render_cs2_clip(
            output_path,
            demo_path=str(job["demoPath"]),
            clip_start_tick=clip_start,
            clip_end_tick=clip_end,
        )
    else:
        render_card_clip(
            output_path,
            player_name=str(job.get("playerName", "Jogador")),
            description=str(job.get("description", "Destaque")),
            highlight_type=str(job.get("highlightType", "MULTI_KILL")),
            round_num=int(job.get("round", 0) or 0),
            clip_start_tick=clip_start,
            clip_end_tick=clip_end,
        )

    if not output_path.is_file() or output_path.stat().st_size <= 0:
        raise RuntimeError("Arquivo MP4 não foi gerado")

    return output_path


def post_render_result(
    *,
    scope: str,
    highlight_id: str,
    status: str,
    clip_video_path: str | None = None,
    error_message: str | None = None,
) -> None:
    if not BACKEND_INTERNAL_URL or not INTERNAL_SERVICE_KEY:
        return
    if "${{" in INTERNAL_SERVICE_KEY:
        return

    payload = {
        "scope": scope,
        "highlightId": highlight_id,
        "status": status,
        "clipVideoPath": clip_video_path,
        "errorMessage": error_message,
    }
    url = f"{BACKEND_INTERNAL_URL}/api/internal/highlights/render-result"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-Internal-Service-Key": INTERNAL_SERVICE_KEY,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30):
        pass


def process_highlight_render_job(payload: str) -> None:
    job = json.loads(payload)
    scope = str(job.get("scope", ""))
    highlight_id = str(job.get("highlightId", ""))
    if scope not in ("match", "demo") or not highlight_id:
        raise ValueError("Job de renderização inválido")

    post_render_result(scope=scope, highlight_id=highlight_id, status="PROCESSING")

    try:
        output_path = render_highlight_clip(job)
        post_render_result(
            scope=scope,
            highlight_id=highlight_id,
            status="COMPLETED",
            clip_video_path=output_path.name,
        )
        print(f"[highlights] clipe renderizado: {output_path}")
    except Exception as err:
        message = str(err)[:500]
        post_render_result(
            scope=scope,
            highlight_id=highlight_id,
            status="FAILED",
            error_message=message,
        )
        print(f"[highlights] render falhou ({highlight_id}): {message}")
