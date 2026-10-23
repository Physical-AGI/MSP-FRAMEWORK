# MSP

Project page for **Learning Manipulation-Sufficient Representations via Outcome Bottlenecks**.

Perception for manipulation, formulated as estimating a calibrated belief over the **minimal
statistic that preserves all and only the information that changes action outcomes**, rather than an
accurate pose. Two world states are equivalent when every admissible action produces the same
outcome distribution; geometry is recoverable only up to that equivalence, and accuracy beyond the
sufficiency resolution is both unrecoverable and unnecessary. Grasp selection, distribution-free
abstention, active perception and test-time adaptation all fall out of two learned modules as
inference procedures. No reconstruction, no dynamics rollout, no RL.

Live at <https://physical-agi.github.io/MSP-FRAMEWORK/>.
Code at <https://github.com/s-elim/msp-framework>.

## What is interactive

| Component | What it does |
|---|---|
| Pipeline walkthrough | Observe, encode a belief, score outcomes, certify and act |
| **Act-rate slider** | Drag the fraction of scenes the system commits to and watch both scorers move. Below an act rate of about 0.70 the analytic proxy is worse than picking a grasp at random |
| Certificate panel | Switch α between 0.05, 0.10 and 0.20 and watch coverage, certified precision, abstention and the certified action fraction move together |
| Rate-distortion frontier | The β sweep on a log rate axis; hover a point for its coverage and abstention |
| Object table | 13 objects, filterable by geometry and sortable by any column, with the identifiability diagnostic joined in |
| Ablation bars | Within-scene AUC with the action response beside it, so the uniform-budget collapse is visible |
| **4D grasp viewer** | One held-out test scene per object as a fused eight-view point cloud; pick any candidate grasp and replay its MuJoCo rollout, with a time-coloured trail of the object's earlier poses (X, Y, Z, t) |
| Baseline table and rate-quality frontier | MSP against the retrained GQ-CNN architecture, the no-bottleneck network, Ferrari-Canny and random; switch the frontier between within-scene AUC, top-1 success and pooled AUC |
| Executed-grasp coverage | Coverage and certified fraction for the pairwise filter, the same filter on the executed grasp, and the filter recalibrated on the selected action |

## Local preview

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Where the numbers come from

Every number is read from the run artefacts in the code repository, with the same estimators the
paper build uses. Nothing is transcribed from prose: where the code repository's README and its
generated tables disagree, the tables win, because they are regenerated from the results on every
build.

| Page section | Source |
|---|---|
| Framework figure | `paper/figures/fig_framework.pdf` |
| Proxy vs MSP table | `results/libero/l1_proxy_vs_msp.json`, `paper/tables/tab_proxy_vs_msp.tex` |
| Geometry split | `tab_geometry_split.tex`, `fig_geometry_split.png` |
| Act-rate slider | `results/libero/l1_scores.pt` through `msp.diagnostics.selective.compare_selective`, seed 0 |
| Certificate panel | `results/libero/l2_coverage.json`, all three α |
| Rate-distortion frontier | `results/libero/l5_frontier.json` |
| Object table | `l1_scores.pt` (within-scene AUC per object) joined to `l3_identifiability.json` |
| Ablation bars | `results/libero/l6_ablations.json`, `tab_libero_ablations.tex` |
| Active perception | `results/libero/l4_active.json` |
| 4D grasp viewer | `results/libero/corpus/libero_197aaee1a663467e.pt` (test split, seed 4) and `l1_scores.pt`, re-simulated by `tools/export_msp4d.py` into `static/data/msp4d/` |
| Baselines, frontier, executed-grasp coverage | `results/rebuttal/r2.json`, `r4.json`, `r5.json`, `r6.json`, through `tools/export_results.py` into `static/js/generated/msp_results.js` |

Two aggregations appear on the page and they are not the same number. The corpus-level within-scene
AUCs (0.548 and 0.639) average over scenes; the object table's readout averages over objects. Both
are labelled where they appear.

## Regenerating the data files

Both scripts take the code repository as `--repo`. The 4D export needs torch, mujoco, numpy and Pillow,
and a headless GL backend (`MUJOCO_GL=egl` on a GPU node, `osmesa` elsewhere). It re-simulates every
candidate with the unmodified rollout in `msp.oracle.libero_sim` and reports how many outcomes match
the stored corpus labels (103 of 104 with MuJoCo 3.14.0 against the corpus's 3.10.0); the page prints
that count under the viewer.

```bash
python3 tools/export_results.py --repo ../msp_framework
MUJOCO_GL=egl python -I tools/export_msp4d.py --repo ../msp_framework --out static/data/msp4d
```

The viewer uses three.js r160, vendored under `static/js/vendor/three-0.160.0/` with its MIT licence.

## Structure

```
index.html              # the whole page
static/css/index.css    # theme + interactive component styles
static/js/index.js      # nav, stages, act-rate slider, SVG charts, object table, lightbox
static/images/          # figures copied from the paper
```

Charts are hand-built SVG, so the page ships no plotting library and every drawn value is traceable
to a data block at the top of `static/js/index.js`.

## Keeping it in sync

After a new run, regenerate the tables and figures in the code repository
(`scripts/paper/make_tables.py`, `make_figures.py`), then update `RISK`, `CERT`, `FRONTIER`,
`OBJECTS` and `ABLATIONS` in `static/js/index.js` and the static tables in `index.html` to match.

Page template adapted from [Nerfies](https://nerfies.github.io), licensed
[CC BY-SA 4.0](http://creativecommons.org/licenses/by-sa/4.0/).
