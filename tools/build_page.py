"""Fill tools/index.template.html with static/data/page.json and write index.html.

    $MSP_REPO/.venv/bin/python tools/build_page.py      (after tools/export_page.py)

Every number on the page is a {{Name}} placeholder resolved from the manuscript's numbers.tex
(via page.json); the table is the manuscript's Table 1, row for row. A placeholder without a
value stops the build.
"""

from __future__ import annotations

import html
import json
import random
import re
from pathlib import Path

from PIL import Image

PAGE = Path(__file__).resolve().parents[1]

# (name, one line, image stem, alt text) for the method strip, cut from Fig. 2 of the paper.
STAGES = (
    ("Estimate", "FoundationPose returns one pose and no uncertainty.", "estimate",
     "The RGB-D input with the visible mask, and the FoundationPose estimate as an orange box."),
    ("Residual bank", "Its errors on annotated training frames, kept with fit features.", "bank",
     "Training frames with the estimate and the annotation, and the bank of their errors."),
    ("Retrieve", "Training frames whose fit looks alike lend their errors.", "retrieve",
     "Depth points coloured by their distance to the posed model, and the bank sorted by "
     "feature distance with the drawn rows marked."),
    ("Sample", "Sixteen poses the object could be in.", "posterior",
     "Sixteen posterior samples as teal boxes on the image and on the depth point cloud."),
    ("Roll out", "Every grasp at every pose, under four physics draws.", "rollout",
     "Sixteen candidate grasps and MuJoCo rollouts of two of them at several pose samples."),
    ("Decide", "Act on the best grasp, certify it, or look again.", "decide",
     "Simulated success under every sample, the posterior mean per grasp, and the certificate "
     "and execution checks of the chosen grasp."),
)


LABELS = ("Method", "n", "Top-1", "AUC", "Sel@25%", "Cert.")


def size(src: str) -> tuple[int, int]:
    with Image.open(PAGE / src) as im:
        return im.size


def stages() -> str:
    out = []
    for k, (name, line, stem, alt) in enumerate(STAGES):
        src = f"static/img/stage_{stem}.jpg"
        w, h = size(src)
        opened = "true" if k == 0 else "false"
        out.append(
            f'    <div class="stage" style="--k:{k}" data-open="{opened}">\n'
            f'      <button class="stage-tab" aria-expanded="{opened}" aria-controls="stage-{k}">'
            f"{html.escape(name)}</button>\n"
            f'      <div class="stage-body" id="stage-{k}">\n'
            f'        <div class="stage-text"><h3>{html.escape(name)}</h3>'
            f"<p>{html.escape(line)}</p></div>\n"
            f'        <img src="{src}" width="{w}" height="{h}" loading="lazy" '
            f'alt="{html.escape(alt)}">\n'
            f"      </div>\n    </div>")
    return "\n".join(out)


def table(groups: list[dict]) -> str:
    out = []
    for g in groups:
        out.append(f'    <tbody><tr class="group"><th colspan="6" scope="rowgroup">'
                   f"{html.escape(g['group'])}</th></tr>")
        for r in g["rows"]:
            cells = []
            for i, c in enumerate(r["cells"]):
                text = html.escape(c)
                if r["best"][i]:
                    text = f'<strong title="best">{text}</strong>'
                elif r["second"][i]:
                    text = f'<span class="second" title="second best">{text}</span>'
                cells.append(f'<th scope="row">{text}</th>' if i == 0
                             else f'<td data-label="{LABELS[i]}">{text}</td>')
            cls = ' class="ours"' if r["ours"] else ""
            out.append(f"      <tr{cls}>{''.join(cells)}</tr>")
        out.append("    </tbody>")
    return "\n".join(out)


def gallery(tiles: list[dict]) -> str:
    out = []
    for t in tiles:
        w, h = size(t["src"])
        cap = html.escape(t["caption"])
        out.append(f'    <figure><img src="{t["src"]}" width="{w}" height="{h}" loading="lazy" '
                   f'alt="{cap}"><figcaption>{cap}</figcaption></figure>')
    return "\n".join(out)


def blocks(cols: int = 24, rows: int = 3, seed: int = 2) -> str:
    """The footer band: a strip of the LINEMOD marker board, drawn as flat squares. Every
    other cell is a marker (an ink square with a 3x3 grid of paper bits), the rest is board."""
    rng = random.Random(seed)
    cell, gap = 36, 4
    parts = []
    for r in range(rows):
        for c in range(cols):
            if (r + c) % 2:
                continue
            x, y = c * (cell + gap), r * (cell + gap)
            parts.append(f'<rect x="{x}" y="{y}" width="{cell}" height="{cell}"/>')
            for b in range(9):
                if rng.random() < 0.45:
                    bx, by = x + 6 + (b % 3) * 8, y + 6 + (b // 3) * 8
                    parts.append(f'<rect class="bit" x="{bx}" y="{by}" width="8" height="8"/>')
    w, h = cols * (cell + gap) - gap, rows * (cell + gap) - gap
    return (f'    <svg viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice" '
            f'role="presentation">{"".join(parts)}</svg>')


def main() -> None:
    page = json.loads((PAGE / "static/data/page.json").read_text())
    values = {k: html.escape(v) for k, v in page["numbers"].items()}
    values["TeaserFrame"] = f"{page['teaser_frame']:06d}"
    values["FirstScene"] = f"{page['scenes'][0]['frame']:06d}"
    blocks_ = {"STAGES": stages(), "TABLE": table(page["table"]),
               "GALLERY": gallery(page["gallery"]), "BLOCKS": blocks()}
    out = (PAGE / "tools/index.template.html").read_text()
    for k, v in blocks_.items():
        out = out.replace("{{" + k + "}}", v)
    missing = sorted({m for m in re.findall(r"\{\{(\w+)\}\}", out) if m not in values})
    if missing:
        raise SystemExit(f"no value for {missing}")
    out = re.sub(r"\{\{(\w+)\}\}", lambda m: values[m.group(1)], out)
    (PAGE / "index.html").write_text(out)
    print("wrote", PAGE / "index.html")


if __name__ == "__main__":
    main()
