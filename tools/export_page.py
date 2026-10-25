"""Export everything the project page shows from the code repository and its manuscript build.

    MSP_REPO=/nas/Selim/selim_sarowar/msp_framework
    $MSP_REPO/.venv/bin/python tools/export_page.py

Writes
    static/data/page.json         headline numbers and the main comparison table, parsed from the
                                  manuscript's generated numbers.tex and table_main.tex
    static/data/scenes/<im>.jpg   LM-O test frames for the scene explorer, with
    static/data/scenes/<im>.json  every instance's projected boxes (FoundationPose, 16 posterior
                                  samples, annotation) and both planners' grasps with outcomes
    static/img/                   the paper figures, the method stages cut from Fig. 2 and the
                                  gallery tiles (LM-O frames, point clouds, MuJoCo renders)
Nothing is typed by hand. Explorer frames: the Fig. 1 and Fig. 6 frames plus every tenth LM-O
test frame. Rollout clips come from tools/export_rollouts.py.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import numpy as np

PAGE = Path(__file__).resolve().parents[1]
REPO = Path(os.environ.get("MSP_REPO", "/nas/Selim/selim_sarowar/msp_framework"))
PAPER = REPO / "scientific_reports_paper"
FIGS = PAPER / "figures"
for p in (FIGS, REPO / "scripts/sr", REPO / "src"):
    sys.path.insert(0, str(p))

DATA, IMG = PAGE / "static/data", PAGE / "static/img"
NUMBER = re.compile(r"^\\newcommand\{\\([A-Za-z]+)\}\{(.*)\}$")


# ------------------------------------------------------------------------- numbers and table
def tex_text(s: str) -> str:
    """Plain text of a short LaTeX fragment (numbers, table cells)."""
    s = re.sub(r"\\cite\{[^}]*\}", "", s)
    s = re.sub(r"\\(best|second|rowcolor\{[a-z]+\})\s*", "", s)
    s = re.sub(r"\\textbf\{([^}]*)\}", r"\1", s)
    for a, b in (("{,}", ","), ("$\\pm$", "±"), ("$-$", "−"), ("\\%", "%"), ("--", "–"),
                 ("~", " "), ("$", "")):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def numbers() -> dict[str, str]:
    out = {}
    for line in (PAPER / "numbers.tex").read_text().splitlines():
        m = NUMBER.match(line)
        if m:
            out[m.group(1)] = tex_text(m.group(2))
    return out


def main_table() -> list[dict]:
    """Groups of rows of the paper's Table 1, cell text as printed, best/second marks kept."""
    groups: list[dict] = []
    for line in (PAPER / "table_main.tex").read_text().splitlines():
        line = line.strip()
        head = re.search(r"\\multicolumn\{\d+\}\{l\}\{.*\\textbf\{([^}]*)\}", line)
        if head:
            groups.append({"group": tex_text(head.group(1)), "rows": []})
        elif line.endswith("\\\\") and "&" in line and groups:
            cells = [c.strip() for c in line[:-2].split("&")]
            groups[-1]["rows"].append({
                "cells": [tex_text(c) for c in cells],
                "best": [("\\best" in c) for c in cells],
                "second": [("\\second" in c) for c in cells],
                "ours": "oursrow" in line})
    return groups


# ------------------------------------------------------------------------------ LM-O scenes
def _corners(K: np.ndarray, obj: int, R: np.ndarray, t: np.ndarray) -> list[list[float]]:
    from common import bbox_corners, project

    return np.round(project(K, bbox_corners(obj) @ np.asarray(R, float).T
                            + np.asarray(t, float)), 1).tolist()


def scene_json(im: int) -> dict:
    from common import NAMES, project
    from fig_lmo import Frame, picks, rows

    fr = Frame(im)
    inst = []
    for n in fr.idx:
        r = rows()[n]
        o = int(r["obj"])
        g = {}
        for key, name in (("s_point", "point"), ("s_post", "posterior")):
            j = int(picks()[key][n])
            T = r["T"][j].astype(float)
            p, x = T[:3, 3], T[:3, 0]
            e = np.round(project(fr.K, np.stack([p - 0.03 * x, p + 0.03 * x])), 1).tolist()
            g[name] = {"jaw": e, "lifted": bool(r["succ"][j] > 0.5),
                       "score": round(float(r[key][j]), 3)}
        inst.append({"object": NAMES[o], "visible": round(float(r["visib"]), 2),
                     "estimate": _corners(fr.K, o, r["R_fp"], r["t_fp"]),
                     "annotation": _corners(fr.K, o, r["R"], r["t"]),
                     "samples": [_corners(fr.K, o, R, t) for R, t in zip(r["Rs"], r["ts"],
                                                                          strict=True)],
                     "grasp": g})
    return {"frame": im, "width": int(fr.rgb.shape[1]), "height": int(fr.rgb.shape[0]),
            "instances": inst,
            "lifted": {k: sum(i["grasp"][k]["lifted"] for i in inst)
                       for k in ("point", "posterior")}}


def explorer_frames(teaser: int) -> list[int]:
    """The Fig. 1 frame first, then the Fig. 6 frames and every tenth LM-O test frame."""
    from fig_lmo import choose_frames, rows

    frames = sorted({int(r["im"]) for r in rows()})
    return [teaser, *sorted({*choose_frames(), *frames[::10]} - {teaser})]


def export_scenes(frames: list[int]) -> list[dict]:
    from PIL import Image

    out = DATA / "scenes"
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for im in frames:
        s = scene_json(im)
        (out / f"{im:06d}.json").write_text(json.dumps(s, separators=(",", ":")))
        Image.open(REPO / f"data/lmo/test/000002/rgb/{im:06d}.png").convert("RGB").save(
            out / f"{im:06d}.jpg", quality=84, optimize=True)
        index.append({"frame": im, "objects": len(s["instances"]), **s["lifted"]})
        print("scene", im, s["lifted"], len(s["instances"]))
    return index


# --------------------------------------------------------------------------------- pictures
def export_figures() -> None:
    from PIL import Image

    IMG.mkdir(parents=True, exist_ok=True)
    for name, photo in (("fig1_teaser", True), ("fig2_method", True), ("fig3_pose_gap", False),
                        ("fig4_results", False), ("fig5_analysis", False),
                        ("fig6_qualitative", True)):
        im = Image.open(FIGS / f"{name}.png").convert("RGB")
        if photo:
            im.save(IMG / f"{name}.jpg", quality=90, optimize=True)
        else:
            im.save(IMG / f"{name}.png", optimize=True)


# Fig. 2 stage crops in figure fractions (x0, x1, y0, y1), from fig_method.py's panel layout.
STAGES = {"estimate": (0.005, 0.248, 0.43, 0.795), "bank": (0.005, 0.655, 0.815, 0.993),
          "retrieve": (0.256, 0.659, 0.43, 0.795), "posterior": (0.667, 0.995, 0.43, 0.795),
          "rollout": (0.005, 0.553, 0.012, 0.417), "decide": (0.561, 0.995, 0.012, 0.417)}


def export_stages() -> None:
    from PIL import Image

    fig = Image.open(FIGS / "fig2_method.png").convert("RGB")
    W, H = fig.size
    pad = 3  # savefig pad_inches=0.01 at 300 dpi
    w, h = W - 2 * pad, H - 2 * pad
    for name, (x0, x1, y0, y1) in STAGES.items():
        box = (round(pad + x0 * w), round(pad + (1 - y1) * h), round(pad + x1 * w),
               round(pad + (1 - y0) * h))
        fig.crop(box).save(IMG / f"stage_{name}.jpg", quality=90, optimize=True)


def export_gallery(frames: list[int]) -> list[dict]:
    """LM-O frames with every box, their point clouds, and the MuJoCo renders of the figures."""
    import matplotlib.pyplot as plt
    from fig_lmo import Frame
    from PIL import Image

    out = IMG / "gallery"
    out.mkdir(parents=True, exist_ok=True)
    tiles = []
    for im in frames:
        fr = Frame(im)
        for kind in ("boxes", "cloud"):
            fig = plt.figure(figsize=(6.4, 4.8), dpi=150)
            ax = fig.add_axes([0, 0, 1, 1])
            if kind == "boxes":
                fr.show(ax)
                fr.boxes(ax)
            else:
                fr.cloud(ax)
            path = out / f"lmo_{im:06d}_{kind}.jpg"
            fig.savefig(path.with_suffix(".png"), dpi=150, facecolor="white")
            plt.close(fig)
            Image.open(path.with_suffix(".png")).convert("RGB").save(path, quality=86)
            path.with_suffix(".png").unlink()
            tiles.append({"src": f"static/img/gallery/{path.name}",
                          "caption": f"LM-O frame {im}, {'boxes' if kind == 'boxes' else 'depth'}"})
    m = np.load(REPO / "results/sr/viz/method_rollouts_1165.npz")
    for a, who in enumerate(("point estimate", "posterior")):
        for k, col in enumerate(m["cols"]):
            name = f"lamp_{who.split()[0]}_{k}.jpg"
            Image.fromarray(m["img"][a, k]).save(out / name, quality=88)
            pose = "the estimate" if int(col) == 0 else f"pose sample {int(col)}"
            ok = "lifted" if m["y"][a, int(col), 0] > 0.5 else "dropped"
            who_ = "point-estimate" if who == "point estimate" else who
            tiles.append({"src": f"static/img/gallery/{name}",
                          "caption": f"Lamp, {who_} grasp at {pose}: {ok}"})
    return tiles


def main() -> None:
    from fig_lmo import choose_frames, rows
    from fig_teaser import choose_instance, story
    from PIL import Image

    DATA.mkdir(parents=True, exist_ok=True)
    export_figures()
    export_stages()
    teaser = int(rows()[choose_instance()[0]]["im"])
    story(str(IMG / "teaser_story.png"))
    Image.open(IMG / "teaser_story.png").convert("RGB").save(IMG / "teaser_story.jpg",
                                                              quality=90)
    (IMG / "teaser_story.png").unlink()
    frames = explorer_frames(teaser)
    scenes = export_scenes(frames)
    fig6 = choose_frames()
    rest = [f for f in frames if f != teaser and f not in fig6]
    gallery = export_gallery([teaser, *fig6, *rest[::6]])
    page = {"numbers": numbers(), "table": main_table(), "scenes": scenes, "gallery": gallery,
            "teaser_frame": teaser}
    (DATA / "page.json").write_text(json.dumps(page, indent=1, ensure_ascii=False))
    print("wrote", DATA / "page.json", len(scenes), "scenes", len(gallery), "gallery tiles")


if __name__ == "__main__":
    main()
