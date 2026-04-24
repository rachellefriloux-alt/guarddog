"""
streamer.py

Helper to start an ffmpeg HLS pipeline from raw frames.
This example shows how to spawn ffmpeg and feed raw frames via stdin.
In production you may prefer to write frames to a named pipe or use a media server.
"""

import os
import shlex
import subprocess
from pathlib import Path

BASE = Path(__file__).parent
HLS_ROOT = BASE / "hls"
HLS_ROOT.mkdir(exist_ok=True)


def ffmpeg_cmd(width=960, height=540, fps=15, out_dir=None):
    out_dir = out_dir or str(HLS_ROOT / "cam")
    os.makedirs(out_dir, exist_ok=True)
    cmd = (
        "ffmpeg -f rawvideo -pix_fmt bgr24 -s {w}x{h} -r {fps} -i - "
        "-c:v libx264 -preset veryfast -tune zerolatency -f hls "
        "-hls_time 2 -hls_list_size 3 -hls_flags delete_segments {out}/index.m3u8"
    ).format(w=width, h=height, fps=fps, out=out_dir)
    return cmd


def start_ffmpeg_process(width=960, height=540, fps=15, out_dir=None):
    cmd = ffmpeg_cmd(width, height, fps, out_dir)
    return subprocess.Popen(shlex.split(cmd), stdin=subprocess.PIPE)
