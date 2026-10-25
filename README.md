# Grasp planning on a pose posterior

Project page for **Planning on a residual-based pose posterior closes the grasp-success gap
between estimated and annotated object poses** (Md Selim Sarowar and Sungho Kim, Advanced Visual
Intelligence Lab, Yeungnam University). Manuscript in preparation; code released with the paper.

Live at <https://physical-agi.github.io/MSP-FRAMEWORK/>.

## What is on the page

| Section | Content |
|---|---|
| First screen | An LM-O test frame with every FoundationPose estimate and the posterior samples; a MuJoCo clip of the same driller, where the grasp planned on the point estimate drops it and the grasp planned on the posterior lifts it |
| Results | The teaser's object close up, success on the 5-10% error bin and certified precision |
| Scenes | **Scene explorer**: real LM-O test frames, each object with its FoundationPose box, the 16 posterior samples or the annotation, and both planners' grasps with their simulated outcomes |
| Method | Six stages of Fig. 2, one line each |
| Table | The paper's Table 1 and Figs. 3-5 |
| Gallery | LM-O frames with all boxes, their depth point clouds, MuJoCo renders |

## Where everything comes from

Nothing on the page is typed by hand. The code repository is `msp_framework` (`MSP_REPO`).

| Output | Tool | Source |
|---|---|---|
| `static/data/page.json` numbers | `tools/export_page.py` | `scientific_reports_paper/numbers.tex` (written by `make_tables.py` from the results files) |
| Table | `tools/export_page.py` | `scientific_reports_paper/table_main.tex` |
| `static/data/scenes/` | `tools/export_page.py` | `results/sr/lmo/lmo_eval.pt`; frames: the Fig. 1 and Fig. 6 frames and every tenth LM-O test frame |
| `static/img/` | `tools/export_page.py` | the paper figures, Fig. 2 cut into its stages, gallery tiles drawn with the figure code |
| `static/video/rollout_pair.*` | `tools/export_rollouts.py` | the Fig. 1 instance re-simulated in MuJoCo at the annotated pose with its hidden physics; the outcomes are checked against the stored ones |
| `index.html` | `tools/build_page.py` | `tools/index.template.html` filled from `page.json` |

```bash
export MSP_REPO=/nas/Selim/selim_sarowar/msp_framework
$MSP_REPO/.venv/bin/python tools/export_page.py
$MSP_REPO/.venv/bin/python tools/export_rollouts.py
$MSP_REPO/.venv/bin/python tools/build_page.py
python3 -m http.server 8000   # then open http://localhost:8000
```
