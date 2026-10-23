"""Export the data behind the page's 4D grasp viewer.

Every scene comes from the held-out L1 test corpus (seed 4, 2,000 scenes). Scores are the exact
per-candidate values behind the paper's L1 numbers, read from results/libero/l1_scores.pt; nothing
is retrained or rescored here. What this script adds is geometry over time:

  * points:  the eight ring cameras of the simulator, rendered at higher resolution than the
             96 x 96 the encoder sees, back-projected and fused into one cloud, labelled table or
             object by the MuJoCo segmentation buffer;
  * frames:  every candidate grasp re-simulated with the unmodified rollout in
             msp.oracle.libero_sim, recording the object and gripper poses at each step. The object
             is rigid, so moving its fused points by the recorded pose gives the (X, Y, Z, t) cloud.

Scene selection is a fixed rule, not a choice: for each object, the first test scene (corpus
order) that the within-scene AUC can score, i.e. at least three executable candidates with both a
lift and a failure among them. Objects with no such scene are skipped.

Run from the page repo root with any Python that has torch, mujoco, numpy and Pillow:

    MUJOCO_GL=egl python -I tools/export_msp4d.py --repo ../msp_framework --out static/data/msp4d
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np

TEST_CORPUS = "results/libero/corpus/libero_197aaee1a663467e.pt"
L1_SCORES = "results/libero/l1_scores.pt"
RENDER_HW = 200  # per view; the encoder itself sees 96 x 96
VOXEL = 0.0025  # m, fused-cloud downsampling
CROP_R = 0.16  # m, table disc kept around the object
SNAP_EVERY = 10  # record every 10th physics step (dt = 2 ms, so 20 ms per frame)
POS_SCALE = 1e4  # int16 positions in units of 0.1 mm, relative to the scene centre


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--repo", type=Path, required=True, help="msp_framework checkout")
    ap.add_argument("--out", type=Path, required=True)
    return ap.parse_args()


def select_scenes(succ, executable, object_index, n_objects: int) -> list[int]:
    """First within-scene-rankable test scene per object, in corpus order."""
    picked = []
    for oi in range(n_objects):
        for i in np.flatnonzero(object_index == oi):
            ex = executable[i]
            y = succ[i][ex]
            if ex.sum() >= 3 and 0 < y.sum() < len(y):
                picked.append(int(i))
                break
    return picked


def settle_for_render(sim, oi: int, x: np.ndarray, mujoco, helpers):
    """The exact scene `LiberoGraspOracle.render` photographs: state placed, 60 settle steps."""
    axis_angle_to_matrix, matrix_to_quat, torch = helpers
    m = sim._model(oi)  # noqa: SLF001
    d = mujoco.MjData(m)
    oa = m.jnt_qposadr[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, "obj")]
    ha = m.jnt_qposadr[mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, "hand_free")]
    r_obj = axis_angle_to_matrix(torch.tensor(x[3:6], dtype=torch.float32).view(1, 3))
    d.qpos[oa : oa + 3] = x[0:3]
    d.qpos[oa + 3 : oa + 7] = matrix_to_quat(r_obj).numpy()[0]
    d.qpos[ha : ha + 3] = [0.0, 0.0, 1.5]
    mujoco.mj_forward(m, d)
    for _ in range(60):
        mujoco.mj_step(m, d)
    return m, d


def fuse_views(sim, m, d, mujoco) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(N, 3) world points, (N, 3) uint8 colours, (N,) label: 0 table, 1 object."""
    h = w = RENDER_HW
    r = mujoco.Renderer(m, height=h, width=w)
    obj_body = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "object")
    floor = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_GEOM, "floor")
    pts, cols, labs = [], [], []
    for v in range(sim.N_VIEWS):
        cam = f"view{v}"
        r.update_scene(d, camera=cam)
        rgb = r.render().copy()
        r.enable_depth_rendering()
        r.update_scene(d, camera=cam)
        dep = r.render().copy()
        r.disable_depth_rendering()
        r.enable_segmentation_rendering()
        r.update_scene(d, camera=cam)
        seg = r.render().copy()
        r.disable_segmentation_rendering()

        cid = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_CAMERA, cam)
        f = 0.5 * h / np.tan(np.deg2rad(m.cam_fovy[cid]) / 2)
        u, vv = np.meshgrid(np.arange(w) + 0.5, np.arange(h) + 0.5)
        z = dep
        p_cam = np.stack([(u - w / 2) * z / f, -(vv - h / 2) * z / f, -z], axis=-1)
        p = d.cam_xpos[cid] + p_cam.reshape(-1, 3) @ d.cam_xmat[cid].reshape(3, 3).T

        gid, gtype = seg[..., 0].ravel(), seg[..., 1].ravel()
        is_geom = (gtype == int(mujoco.mjtObj.mjOBJ_GEOM)) & (gid >= 0)
        lab = np.full(gid.shape, -1, dtype=np.int8)
        lab[is_geom & (gid == floor)] = 0
        body = np.where(is_geom, m.geom_bodyid[np.clip(gid, 0, m.ngeom - 1)], -1)
        lab[is_geom & (body == obj_body)] = 1
        keep = lab >= 0
        pts.append(p[keep])
        cols.append(rgb.reshape(-1, 3)[keep])
        labs.append(lab[keep])
    r.close()
    return np.concatenate(pts), np.concatenate(cols), np.concatenate(labs)


def crop_and_voxelise(p, c, lab, centre):
    near = np.linalg.norm(p[:, :2] - centre[:2], axis=1) < CROP_R
    near &= p[:, 2] > -0.005
    p, c, lab = p[near], c[near], lab[near]
    key = np.floor(p / VOXEL).astype(np.int64)
    # Object points win a voxel over table points, so the object surface is never thinned away.
    order = np.lexsort((-lab, key[:, 2], key[:, 1], key[:, 0]))
    key, p, c, lab = key[order], p[order], c[order], lab[order]
    first = np.ones(len(key), dtype=bool)
    first[1:] = np.any(key[1:] != key[:-1], axis=1)
    return p[first], c[first], lab[first]


class StepRecorder:
    """Stands in for the `mujoco` module inside libero_sim and records poses at each step.

    The rollout code is not copied or edited: it runs as written, and this proxy only observes
    the MjData it advances.
    """

    def __init__(self, real, geom_names: tuple[str, ...]):
        self._real = real
        self._geom_names = geom_names
        self.reset()

    def reset(self) -> None:
        self.steps: list[np.ndarray] = []
        self.forwards: list[np.ndarray] = []
        self._ids = None

    def __getattr__(self, name):
        return getattr(self._real, name)

    def _snap(self, m, d) -> np.ndarray:
        mj = self._real
        if self._ids is None:
            self._ids = [mj.mj_name2id(m, mj.mjtObj.mjOBJ_GEOM, g) for g in self._geom_names]
            self._obj = mj.mj_name2id(m, mj.mjtObj.mjOBJ_BODY, "object")
        rows = [np.r_[d.xpos[self._obj], d.xquat[self._obj]]]
        for gid in self._ids:
            q = np.zeros(4)
            mj.mju_mat2Quat(q, d.geom_xmat[gid])
            rows.append(np.r_[d.geom_xpos[gid], q])
        return np.concatenate(rows)

    def mj_step(self, m, d) -> None:
        self._real.mj_step(m, d)
        self.steps.append(self._snap(m, d))

    def mj_forward(self, m, d) -> None:
        self._real.mj_forward(m, d)
        self.forwards.append(self._snap(m, d))


def main() -> None:
    args = parse_args()
    repo = args.repo.resolve()
    sys.path.insert(0, str(repo / "src"))

    import mujoco
    import torch
    from PIL import Image

    from msp.data.libero import LiberoCorpusSpec
    from msp.oracle import libero_sim
    from msp.oracle.analytic import _axis_angle_to_matrix
    from msp.oracle.libero_assets import LiberoObjectLibrary
    from msp.oracle.mujoco_sim import _matrix_to_quat

    spec = LiberoCorpusSpec(n_scenes=2000, n_actions=8, image_size=96, n_views=8, seed=4)
    expected = Path(TEST_CORPUS).stem.split("_", 1)[1]
    if spec.key() != expected:
        raise SystemExit(f"physics fingerprint changed: key {spec.key()} != corpus {expected}")

    corpus = torch.load(repo / TEST_CORPUS, mmap=True, weights_only=False)
    scores = torch.load(repo / L1_SCORES, weights_only=False)
    succ = scores["succ"].numpy().astype(int)
    ex = scores["executable"].numpy().astype(bool)
    oi_all = scores["object_index"].numpy()
    if not np.array_equal(corpus["succ"].squeeze(-1).numpy().astype(int), succ):
        raise SystemExit("l1_scores.pt is not aligned with the test corpus")
    names = scores["object_names"]
    boxlike = scores["boxlike"].numpy().astype(bool)

    lib = LiberoObjectLibrary(repo / "assets/libero")
    sim = libero_sim.LiberoGraspOracle(library=lib)
    if sim.object_names() != names:
        raise SystemExit("object order differs from the scored corpus")
    cfg = sim.cfg
    rec = StepRecorder(mujoco, libero_sim._GRIPPER_GEOMS)  # noqa: SLF001

    m0 = sim._model(0)  # noqa: SLF001
    gripper = []
    for g in libero_sim._GRIPPER_GEOMS:  # noqa: SLF001
        gid = mujoco.mj_name2id(m0, mujoco.mjtObj.mjOBJ_GEOM, g)
        gripper.append({"name": g, "half": [round(float(s), 4) for s in m0.geom_size[gid]]})

    t_place = 60  # re-settle steps before the hand is placed
    phases = [
        ("hold", 40), ("close", cfg.close_steps), ("settle", cfg.settle_steps), ("lift", cfg.lift_steps)
    ]
    args.out.mkdir(parents=True, exist_ok=True)
    picked = select_scenes(succ, ex, oi_all, len(names))
    index, n_match, n_total = [], 0, 0

    for k, i in enumerate(picked):
        oi = int(oi_all[i])
        x = corpus["state"][i].numpy().astype(float)
        acts = corpus["actions"][i].numpy().astype(float)
        m, d = settle_for_render(sim, oi, x, mujoco, (_axis_angle_to_matrix, _matrix_to_quat, torch))
        p, c, lab = fuse_views(sim, m, d, mujoco)
        obj_body = mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_BODY, "object")
        rest_pos = d.xpos[obj_body].copy()
        rest_rot = d.xmat[obj_body].reshape(3, 3).copy()
        centre = np.array([rest_pos[0], rest_pos[1], 0.0])
        p, c, lab = crop_and_voxelise(p, c, lab, centre)
        # Object points in the object's rest frame, so the viewer can move them by each frame's pose.
        local = p.copy()
        local[lab == 1] = (p[lab == 1] - rest_pos) @ rest_rot
        rel = np.where(lab[:, None] == 1, local, p - centre)
        q = np.round(rel * POS_SCALE).astype(np.int16)
        blob = q.tobytes() + c.astype(np.uint8).tobytes() + lab.astype(np.uint8).tobytes()
        (args.out / f"scene_{k}.bin").write_bytes(blob)

        view0 = corpus["observation"][i, 0, :3].permute(1, 2, 0).numpy()
        Image.fromarray((view0 * 255).clip(0, 255).astype(np.uint8)).save(args.out / f"scene_{k}_input.png")

        libero_sim.mujoco = rec
        cands = []
        try:
            for j in range(acts.shape[0]):
                rec.reset()
                s_sim, slip = sim._rollout(oi, x, acts[j])  # noqa: SLF001
                after = rec.steps[t_place:]
                frames = [rec.forwards[-1]] + after[SNAP_EVERY - 1 :: SNAP_EVERY] if after else [rec.forwards[-1]]
                n_total += 1
                n_match += int(round(s_sim) == succ[i, j])
                cands.append({
                    "j": j,
                    "executable": bool(ex[i, j]),
                    "jaw_collision": not after,
                    "msp": round(float(scores["s_msp"][i, j]), 4),
                    "fc": round(float(scores["margin"][i, j]), 5),
                    "succ": int(succ[i, j]),
                    "succ_resim": int(round(s_sim)),
                    "slip_m": round(float(slip), 4),
                    "frames": np.round(np.stack(frames), 4).ravel().tolist(),
                })
        finally:
            libero_sim.mujoco = mujoco

        exec_idx = [cd["j"] for cd in cands if cd["executable"]]
        msp_pick = max(exec_idx, key=lambda j: cands[j]["msp"])
        fc_pick = max(exec_idx, key=lambda j: cands[j]["fc"])
        scene = {
            "object": names[oi],
            "geometry": "box" if boxlike[oi] else "curved",
            "test_index": i,
            "centre": np.round(centre, 5).tolist(),
            "rest_pos": np.round(rest_pos, 5).tolist(),
            "n_points": int(len(p)),
            "n_object_points": int((lab == 1).sum()),
            "msp_pick": msp_pick,
            "fc_pick": fc_pick,
            "candidates": cands,
        }
        (args.out / f"scene_{k}.json").write_text(json.dumps(scene, separators=(",", ":")))
        index.append({"k": k, "object": names[oi], "geometry": scene["geometry"], "test_index": i,
                      "msp_pick_lifts": bool(succ[i, msp_pick]), "fc_pick_lifts": bool(succ[i, fc_pick])})
        print(f"scene {k}: {names[oi]:<20} test#{i:<5} pts {len(p):>6} "
              f"msp pick {msp_pick} ({succ[i, msp_pick]}) fc pick {fc_pick} ({succ[i, fc_pick]})", flush=True)

    meta = {
        "selection": "first within-scene-rankable test scene per object, corpus order "
                     "(>= 3 executable candidates with both a lift and a failure)",
        "corpus": TEST_CORPUS,
        "scores": L1_SCORES,
        "corpus_mujoco": corpus["provenance"]["mujoco_version"],
        "resim_mujoco": mujoco.__version__,
        "resim_outcomes_matching_corpus": [n_match, n_total],
        "render_hw": RENDER_HW,
        "voxel_m": VOXEL,
        "pos_scale": POS_SCALE,
        "dt_ms": round(cfg.timestep * SNAP_EVERY * 1000, 3),
        "phases": [{"name": n, "steps": s, "frames": s // SNAP_EVERY} for n, s in phases],
        "frame_layout": "object pos[3] quat[4] (wxyz), then per gripper geom pos[3] quat[4]",
        "gripper": gripper,
        "lift_height_m": cfg.lift_height,
        "success_height_m": cfg.success_height,
        "scenes": index,
    }
    (args.out / "index.json").write_text(json.dumps(meta, indent=1))
    print(f"re-simulated outcomes matching the corpus labels: {n_match}/{n_total}")


if __name__ == "__main__":
    main()
