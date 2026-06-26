"""Renderização de clipes MP4 para destaques de demo."""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

from highlight_extraction import TICK_RATE, clip_duration_seconds

WORKER_DIR = Path(__file__).resolve().parent
BACKEND_HIGHLIGHTS = WORKER_DIR.parent / "Backend" / "data" / "highlights"

HIGHLIGHT_RENDER_MODE = os.environ.get("HIGHLIGHT_RENDER_MODE", "auto").strip().lower()
HIGHLIGHT_CLIPS_PATH = os.environ.get("HIGHLIGHT_CLIPS_PATH")
FFMPEG_PATH = os.environ.get("FFMPEG_PATH", "ffmpeg")
CS2_EXE_PATH = os.environ.get("CS2_EXE_PATH", "").strip()
STEAM_EXE_PATH = os.environ.get("STEAM_EXE_PATH", "").strip()
CS2_STEAM_APP_ID = os.environ.get("CS2_STEAM_APP_ID", "730").strip() or "730"
BACKEND_INTERNAL_URL = os.environ.get("BACKEND_INTERNAL_URL", "").rstrip("/")
INTERNAL_SERVICE_KEY = os.environ.get("INTERNAL_SERVICE_KEY", "")

# Margem de cada corte em montagens multi-kill (segundos de jogo)
KILL_CUT_PRE_TICKS = 64 * 2
KILL_CUT_POST_TICKS = 64 * 2

HIGHLIGHT_RENDER_QUEUE = "highlight:render:queue"

_CS2_CANDIDATE_PATHS = [
    Path(r"C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe"),
    Path(r"C:\Program Files\Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe"),
    Path.home() / ".steam/steam/steamapps/common/Counter-Strike Global Offensive/game/bin/win64/cs2.exe",
]

_STEAM_CANDIDATE_PATHS = [
    Path(r"C:\Program Files (x86)\Steam\steam.exe"),
    Path(r"C:\Program Files\Steam\steam.exe"),
    Path.home() / ".steam/steam/steam.exe",
]


def get_highlight_clips_dir() -> Path:
    if HIGHLIGHT_CLIPS_PATH:
        storage = Path(HIGHLIGHT_CLIPS_PATH)
        if not storage.is_absolute():
            storage = (WORKER_DIR / storage).resolve()
    else:
        storage = BACKEND_HIGHLIGHTS.resolve()
    storage.mkdir(parents=True, exist_ok=True)
    return storage


def resolve_cs2_exe() -> str | None:
    candidates: list[Path] = []
    if CS2_EXE_PATH:
        candidates.append(Path(CS2_EXE_PATH))
    candidates.extend(_CS2_CANDIDATE_PATHS)
    for candidate in candidates:
        try:
            if candidate.is_file():
                return str(candidate.resolve())
        except OSError:
            continue
    return None


def resolve_steam_exe() -> str | None:
    candidates: list[Path] = []
    if STEAM_EXE_PATH:
        candidates.append(Path(STEAM_EXE_PATH))
    candidates.extend(_STEAM_CANDIDATE_PATHS)
    for candidate in candidates:
        try:
            if candidate.is_file():
                return str(candidate.resolve())
        except OSError:
            continue
    return None


def _is_process_running(image_name: str) -> bool:
    if os.name == "nt":
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {image_name}", "/NH"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return image_name.lower() in (result.stdout or "").lower()

    proc_name = image_name.replace(".exe", "")
    result = subprocess.run(["pgrep", "-x", proc_name], capture_output=True, text=True)
    return result.returncode == 0


def is_steam_client_running() -> bool:
    return _is_process_running("steam.exe") or _is_process_running("steam")


def _wait_for_process(image_name: str, timeout_sec: float) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if _is_process_running(image_name):
            return True
        time.sleep(1)
    return False


def _wait_for_process_exit(image_name: str, timeout_sec: float) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        if not _is_process_running(image_name):
            return True
        time.sleep(2)
    return False


def ensure_steam_client_ready(timeout_sec: int = 120) -> None:
    """Garante Steam em execução — o CS2 não inicia sem o cliente Steam."""
    if is_steam_client_running():
        time.sleep(3)
        return

    steam_exe = resolve_steam_exe()
    if not steam_exe:
        raise RuntimeError(
            "Steam não encontrado. Instale o Steam ou defina STEAM_EXE_PATH no worker."
        )

    print("[highlights] Steam não detectado — iniciando cliente...")
    subprocess.Popen(
        [steam_exe, "-silent"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    if not _wait_for_process("steam.exe", timeout_sec) and not _wait_for_process("steam", timeout_sec):
        raise RuntimeError(
            "Não foi possível iniciar o Steam. Abra o Steam manualmente, faça login e tente de novo."
        )

    time.sleep(8)


def _cs2_game_args(demo_path: str, cfg_name: str) -> list[str]:
    return [
        "-insecure",
        "-novid",
        "-windowed",
        "-w",
        "1280",
        "-h",
        "720",
        "-console",
        "+playdemo",
        _demo_path_for_cs2(demo_path),
        "+exec",
        cfg_name,
    ]


def _launch_cs2_and_wait(cs2_exe: str, demo_path: str, cfg_name: str, timeout_sec: int) -> None:
    ensure_steam_client_ready()

    steam_exe = resolve_steam_exe()
    game_args = _cs2_game_args(demo_path, cfg_name)

    if steam_exe:
        print("[highlights] Iniciando CS2 via Steam (-applaunch)...")
        subprocess.Popen(
            [steam_exe, "-applaunch", CS2_STEAM_APP_ID, *game_args],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not _wait_for_process("cs2.exe", 180):
            raise RuntimeError(
                "CS2 não iniciou via Steam. Abra o Steam, faça login e confirme que o CS2 está instalado."
            )
        if not _wait_for_process_exit("cs2.exe", timeout_sec):
            raise RuntimeError("CS2 não finalizou a renderização dentro do tempo limite.")
        return

    print("[highlights] Iniciando CS2 diretamente (Steam já em execução)...")
    result = subprocess.run(
        [cs2_exe, *game_args],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout_sec,
    )
    if result.returncode != 0:
        tail = (result.stderr or "")[-800:]
        if "Steam Client" in tail or "Steam is probably not running" in tail:
            raise RuntimeError(
                "CS2 não conectou ao Steam. Abra o Steam, faça login e deixe rodando em segundo plano."
            )
        raise RuntimeError(tail or "CS2 não concluiu a renderização")


def resolve_render_mode() -> str:
    mode = HIGHLIGHT_RENDER_MODE or "auto"
    if mode == "auto":
        return "cs2" if resolve_cs2_exe() else "card"
    return mode


def _ffmpeg_available() -> bool:
    return shutil.which(FFMPEG_PATH) is not None


def _sanitize_drawtext(value: str) -> str:
    cleaned = value.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
    cleaned = re.sub(r"[\r\n]+", " ", cleaned)
    return cleaned[:120]


def _sanitize_spec_name(value: str) -> str:
    cleaned = re.sub(r'["\\]', "", value)
    return cleaned[:64] or "Player"


def _type_label(highlight_type: str) -> str:
    labels = {
        "MULTI_KILL": "Multi-kill",
        "ACE": "ACE",
        "CLUTCH": "Clutch",
        "OPENING_KILL": "Opening kill",
    }
    return labels.get(highlight_type.upper(), highlight_type)


def _parse_kill_ticks(job: dict) -> list[int]:
    raw = job.get("killTicks")
    if not isinstance(raw, list):
        return []
    ticks = sorted(int(t) for t in raw if int(t) > 0)
    return ticks


def _tick_offset_seconds(tick: int, clip_start_tick: int) -> float:
    return max(0.0, (int(tick) - int(clip_start_tick)) / TICK_RATE)


def _ffmpeg_trim_segment(source: Path, start_sec: float, end_sec: float, output: Path) -> None:
    duration = max(0.25, end_sec - start_sec)
    cmd = [
        FFMPEG_PATH,
        "-y",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        str(source),
        "-t",
        f"{duration:.3f}",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
        str(output),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:] or "FFmpeg falhou ao recortar segmento")


def _ffmpeg_concat_segments(segments: list[Path], output: Path) -> None:
    if not segments:
        raise RuntimeError("Nenhum segmento para concatenar")
    if len(segments) == 1:
        shutil.copy2(segments[0], output)
        return

    list_file = output.parent / f"concat-{output.stem}.txt"
    list_file.write_text(
        "\n".join(f"file '{segment.resolve().as_posix()}'" for segment in segments),
        encoding="utf-8",
    )
    cmd = [
        FFMPEG_PATH,
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        str(list_file),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-500:] or "FFmpeg falhou ao concatenar segmentos")
    try:
        list_file.unlink()
    except OSError:
        pass


def build_kill_montage(
    source_video: Path,
    *,
    clip_start_tick: int,
    kill_ticks: list[int],
    output_path: Path,
) -> None:
    """Recorta um trecho por abate e concatena (cortes da jogada)."""
    if len(kill_ticks) < 2:
        shutil.copy2(source_video, output_path)
        return

    work_dir = output_path.parent / f".montage-{output_path.stem}"
    work_dir.mkdir(parents=True, exist_ok=True)
    segments: list[Path] = []

    try:
        for index, kill_tick in enumerate(sorted(kill_ticks)):
            start = _tick_offset_seconds(kill_tick - KILL_CUT_PRE_TICKS, clip_start_tick)
            end = _tick_offset_seconds(kill_tick + KILL_CUT_POST_TICKS, clip_start_tick)
            if end <= start:
                end = start + 1.0
            segment_path = work_dir / f"kill_{index:02d}.mp4"
            _ffmpeg_trim_segment(source_video, start, end, segment_path)
            segments.append(segment_path)

        _ffmpeg_concat_segments(segments, output_path)
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


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


def resolve_cs2_csgo_dir(cs2_exe: str) -> Path:
    """Diretório game/csgo onde o CS2 grava frames do startmovie."""
    exe = Path(cs2_exe).resolve()
    return exe.parents[2] / "csgo"


def _sanitize_movie_basename(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "", value)
    return (cleaned[:48] or "csleaguehl")


def _cleanup_cs2_movie_files(csgo_dir: Path, basename: str) -> None:
    for pattern in (f"{basename}*.tga", f"{basename}*.wav"):
        for path in csgo_dir.glob(pattern):
            try:
                path.unlink()
            except OSError:
                pass


def _collect_cs2_movie_frames(csgo_dir: Path, basename: str) -> list[Path]:
    frames = sorted(csgo_dir.glob(f"{basename}*.tga"))
    return [frame for frame in frames if frame.is_file()]


def _demo_path_for_cs2(demo_path: str) -> str:
    return str(Path(demo_path).resolve()).replace("\\", "/")


def _build_cs2_record_cfg(
    cfg_path: Path,
    *,
    clip_start_tick: int,
    clip_end_tick: int,
    frame_basename: str,
    steam_id: str | None,
    player_name: str | None,
) -> None:
    lines = [
        "volume 0",
        "snd_mute_losefocus 1",
        "cl_draw_only_deathnotices 0",
        "demo_pauseafterinit 1",
        f"demo_gototick {clip_start_tick}",
    ]

    if steam_id and steam_id.isdigit():
        lines.append(f"spec_lock_to_accountid {steam_id}")
    elif player_name:
        lines.append(f'spec_player "{_sanitize_spec_name(player_name)}"')

    lines.extend(
        [
            "spec_mode 4",
            "demo_resume",
            "host_timescale 1",
            "host_framerate 30",
            f"startmovie {frame_basename} tga framerate 30",
            f"demo_gototick {clip_end_tick}",
            "endmovie",
            "quit",
        ]
    )
    cfg_path.write_text("\n".join(lines), encoding="utf-8")


def _frames_to_mp4(frames: list[Path], output_path: Path) -> None:
    if not frames:
        raise RuntimeError("Nenhum frame TGA para converter")

    staging_dir = output_path.parent / f".frames-{output_path.stem}"
    staging_dir.mkdir(parents=True, exist_ok=True)
    try:
        for index, frame in enumerate(frames):
            shutil.copy2(frame, staging_dir / f"frame{index:04d}.tga")

        cmd = [
            FFMPEG_PATH,
            "-y",
            "-framerate",
            "30",
            "-i",
            str(staging_dir / "frame%04d.tga"),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(result.stderr[-500:] or "FFmpeg falhou ao converter frames")
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def render_cs2_clip(
    output_path: Path,
    *,
    highlight_id: str,
    demo_path: str,
    clip_start_tick: int,
    clip_end_tick: int,
    steam_id: str | None = None,
    player_name: str | None = None,
    kill_ticks: list[int] | None = None,
) -> None:
    cs2_exe = resolve_cs2_exe()
    if not cs2_exe:
        raise RuntimeError("CS2 não encontrado — configure CS2_EXE_PATH no worker")
    if not _ffmpeg_available():
        raise RuntimeError("FFmpeg necessário para converter frames do CS2")
    if not Path(demo_path).is_file():
        raise RuntimeError(f"Demo não encontrada para renderização: {demo_path}")

    csgo_dir = resolve_cs2_csgo_dir(cs2_exe)
    cfg_dir = csgo_dir / "cfg"
    cfg_dir.mkdir(parents=True, exist_ok=True)

    frame_basename = _sanitize_movie_basename(f"csleague_{highlight_id}")
    cfg_name = _sanitize_movie_basename(f"csleague_{highlight_id}")
    cfg_path = cfg_dir / f"{cfg_name}.cfg"

    duration = clip_duration_seconds(clip_start_tick, clip_end_tick)
    temp_dir = output_path.parent / f".render-{output_path.stem}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    raw_video = temp_dir / "raw.mp4"

    _cleanup_cs2_movie_files(csgo_dir, frame_basename)

    try:
        _build_cs2_record_cfg(
            cfg_path,
            clip_start_tick=clip_start_tick,
            clip_end_tick=clip_end_tick,
            frame_basename=frame_basename,
            steam_id=steam_id,
            player_name=player_name,
        )

        timeout = max(300, int(duration * 8) + 120)
        print(
            f"[highlights] CS2 render {highlight_id}: ticks {clip_start_tick}-{clip_end_tick}, "
            f"basename={frame_basename}, steam={steam_id or player_name}"
        )
        _launch_cs2_and_wait(cs2_exe, demo_path, cfg_name, timeout)

        frames = _collect_cs2_movie_frames(csgo_dir, frame_basename)
        if not frames:
            raise RuntimeError(
                f"CS2 não gerou frames em {csgo_dir} (basename {frame_basename}). "
                "Verifique se o Steam/CS2 está instalado e se a demo abre no jogo."
            )
        _frames_to_mp4(frames, raw_video)

        ticks = kill_ticks or []
        if len(ticks) >= 2:
            build_kill_montage(
                raw_video,
                clip_start_tick=clip_start_tick,
                kill_ticks=ticks,
                output_path=output_path,
            )
        else:
            shutil.copy2(raw_video, output_path)
    finally:
        _cleanup_cs2_movie_files(csgo_dir, frame_basename)
        try:
            cfg_path.unlink()
        except OSError:
            pass
        shutil.rmtree(temp_dir, ignore_errors=True)


def render_highlight_clip(job: dict) -> Path:
    highlight_id = str(job["highlightId"])
    output_path = get_highlight_clips_dir() / f"{highlight_id}.mp4"
    clip_start = int(job["clipStartTick"])
    clip_end = int(job["clipEndTick"])
    kill_ticks = _parse_kill_ticks(job)
    steam_id = str(job.get("steamId") or "").strip() or None
    player_name = str(job.get("playerName") or "Jogador")

    mode = resolve_render_mode()
    if mode == "cs2":
        render_cs2_clip(
            output_path,
            highlight_id=highlight_id,
            demo_path=str(job["demoPath"]),
            clip_start_tick=clip_start,
            clip_end_tick=clip_end,
            steam_id=steam_id,
            player_name=player_name,
            kill_ticks=kill_ticks,
        )
    else:
        render_card_clip(
            output_path,
            player_name=player_name,
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
        print(f"[highlights] clipe renderizado ({resolve_render_mode()}): {output_path}")
    except Exception as err:
        message = str(err)[:500]
        post_render_result(
            scope=scope,
            highlight_id=highlight_id,
            status="FAILED",
            error_message=message,
        )
        print(f"[highlights] render falhou ({highlight_id}): {message}")
