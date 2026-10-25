"""MuJoCo clip of the Fig. 1 example for the project page: the point-estimate planner's grasp
and the posterior planner's grasp on the same LM-O object, side by side, executed at the
annotated pose with the scene's hidden physics (the outcomes the paper reports).

    MSP_REPO=/nas/Selim/selim_sarowar/msp_framework
    $MSP_REPO/.venv/bin/python tools/export_rollouts.py

Writes static/video/rollout_pair.webm (VP8, looping) and static/video/rollout_pair.jpg (its
last frame, the poster). The simulator state is recorded every STEP physics steps through
LinemodGraspSim.rollout(trace_every=...); the outcome marks are the rollouts' own results.
Encoding needs an ffmpeg with libvpx (FFMPEG, default: the build Playwright ships).
"""

from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path

import numpy as np

PAGE = Path(__file__).resolve().parents[1]
REPO = Path(os.environ.get("MSP_REPO", "/nas/Selim/selim_sarowar/msp_framework"))
for p in (REPO / "scientific_reports_paper/figures", REPO / "scripts/sr", REPO / "src"):
    sys.path.insert(0, str(p))
FFMPEG = os.environ.get("FFMPEG",
                        str(Path.home() / ".cache/ms-playwright/ffmpeg-1011/ffmpeg-linux"))
STEP, FPS, SIZE, HOLD_START, HOLD_END = 8, 30, 480, 20, 45


def _mark(img, ok: bool):  # noqa: ANN001, ANN202
    from matplotlib import font_manager
    from PIL import ImageDraw, ImageFont

    from common import TEAL_DARK, VERM

    font = ImageFont.truetype(font_manager.findfont("DejaVu Sans:bold"), 64)
    ImageDraw.Draw(img).text((SIZE - 78, 18), "✓" if ok else "✗", font=font,
                             fill=TEAL_DARK if ok else VERM)
    return img


def main() -> None:
    from PIL import Image

    from common import ORANGE, TEAL, models_info
    from fig_lmo import rows
    from fig_teaser import choose_instance, instance_sim
    from sim_render import SimRenderer, side_view

    n, _ = choose_instance()
    sim, phys, grasp = instance_sim(n)
    traces, ok = [], []
    for key in ("s_point", "s_post"):
        tr: list[np.ndarray] = []
        ok.append(sim.rollout(grasp[key], phys, trace=tr, trace_every=STEP)[0] > 0.5)
        traces.append(tr)
    length = max(len(t) for t in traces)
    traces = [t + [t[-1]] * (length - len(t)) for t in traces]
    lookat, az = side_view(sim, phys, grasp["s_post"])
    dist = 0.2 + 1.3 * models_info()[str(rows()[n]["obj"])]["diameter"] / 1000.0
    rnd = SimRenderer(sim, SIZE)
    frames = []
    for i in range(length):
        pair = [Image.fromarray(rnd.render(t[i], col, lookat, dist, az, -26.0))
                for t, col in zip(traces, (ORANGE, TEAL), strict=True)]
        if i == length - 1:
            pair = [_mark(p, o) for p, o in zip(pair, ok, strict=True)]
        canvas = Image.new("RGB", (2 * SIZE + 8, SIZE), "white")
        canvas.paste(pair[0], (0, 0))
        canvas.paste(pair[1], (SIZE + 8, 0))
        frames.append(canvas)
    frames = [frames[0]] * HOLD_START + frames + [frames[-1]] * HOLD_END
    out = PAGE / "static/video"
    out.mkdir(parents=True, exist_ok=True)
    frames[-1].save(out / "rollout_pair.jpg", quality=88)
    enc = subprocess.Popen([FFMPEG, "-y", "-loglevel", "error", "-f", "image2pipe", "-c:v",
                            "mjpeg", "-framerate", str(FPS), "-i", "pipe:0", "-c:v", "libvpx",
                            "-b:v", "1800k", "-auto-alt-ref", "0", "-an",
                            str(out / "rollout_pair.webm")], stdin=subprocess.PIPE)
    assert enc.stdin is not None
    for f in frames:
        buf = io.BytesIO()
        f.save(buf, "JPEG", quality=92)
        enc.stdin.write(buf.getvalue())
    enc.stdin.close()
    if enc.wait() != 0:
        raise RuntimeError("ffmpeg failed")
    print("wrote", out / "rollout_pair.webm", len(frames), "frames, outcomes", ok)


if __name__ == "__main__":
    main()
