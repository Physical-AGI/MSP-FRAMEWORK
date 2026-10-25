// Project page behaviour: section entrances, the LM-O scene explorer, the method accordion.
// Every scene drawn here comes from static/data/scenes/<frame>.json, written by
// tools/export_page.py from the paper's LM-O results.

// Reveal once when an element enters the viewport; never leaves content hidden.
(() => {
  const targets = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) { targets.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
  targets.forEach((el) => io.observe(el));
  window.addEventListener('load', () => setTimeout(() => {
    targets.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight && r.bottom > 0) el.classList.add('is-in');
    });
  }, 2500));
})();

// The rollout clip respects reduced motion: it stays on its poster frame.
(() => {
  const v = document.querySelector('.clip video');
  if (v && matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); }
})();

// Method accordion: one stage open at a time.
(() => {
  const stages = [...document.querySelectorAll('.stage')];
  for (const s of stages) {
    s.querySelector('.stage-tab').addEventListener('click', () => {
      for (const t of stages) {
        const open = t === s;
        t.dataset.open = String(open);
        t.querySelector('.stage-tab').setAttribute('aria-expanded', String(open));
      }
    });
  }
})();

// LM-O scene explorer.
(() => {
  const svg = document.getElementById('scene');
  if (!svg) return;
  const NS = 'http://www.w3.org/2000/svg';
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const image = document.getElementById('scene-image');
  const boxes = document.getElementById('scene-boxes');
  const grasps = document.getElementById('scene-grasps');
  const count = document.getElementById('scene-count');
  const tabs = [...document.querySelectorAll('.tabs [data-mode]')];
  let scenes = [], index = 0, mode = 'point', scene = null;
  const cache = new Map();

  const pad = (n) => String(n).padStart(6, '0');
  const path = (c) => EDGES.map(([a, b]) => `M${c[a][0]},${c[a][1]}L${c[b][0]},${c[b][1]}`).join('');
  const el = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  function draw() {
    if (!scene) return;
    boxes.replaceChildren();
    grasps.replaceChildren();
    for (const inst of scene.instances) {
      if (mode === 'posterior') {
        boxes.append(el('path', { d: inst.samples.map(path).join(''), class: 'sample' }));
      } else {
        if (mode === 'annotation') boxes.append(el('path', { d: path(inst.annotation), class: 'gt' }));
        boxes.append(el('path', { d: path(inst.estimate), class: 'est' }));
      }
      if (mode === 'annotation') continue;
      const g = inst.grasp[mode];
      const [[x1, y1], [x2, y2]] = g.jaw;
      grasps.append(el('line', { x1, y1, x2, y2, class: 'halo' }));
      grasps.append(el('line', { x1, y1, x2, y2, class: `jaw-${mode}` }));
      // outcome mark beside the jaw: a tick when the rollout lifts the object, a cross when it drops it
      const mx = Math.max(x1, x2) + 8, my = Math.min(y1, y2) - 10;
      const d = g.lifted ? `M${mx - 7},${my} l5,6 l10,-12` : `M${mx - 6},${my - 6} l12,12 M${mx + 6},${my - 6} l-12,12`;
      grasps.append(el('path', { d, class: 'mark-halo' }));
      grasps.append(el('path', { d, class: g.lifted ? 'ok' : 'no' }));
    }
    const n = scene.instances.length;
    const who = { point: 'point-estimate', posterior: 'posterior', annotation: null }[mode];
    count.textContent = who
      ? `Scene ${index + 1} of ${scenes.length}, frame ${scene.frame}: the ${who} grasp lifts ${scene.lifted[mode]} of ${n} objects (point estimate ${scene.lifted.point}, posterior ${scene.lifted.posterior}).`
      : `Scene ${index + 1} of ${scenes.length}, frame ${scene.frame}: annotated poses dashed, estimates in orange.`;
  }

  async function load(i) {
    index = (i + scenes.length) % scenes.length;
    const f = scenes[index].frame;
    if (!cache.has(f)) cache.set(f, fetch(`static/data/scenes/${pad(f)}.json`).then((r) => r.json()));
    const s = await cache.get(f);
    image.setAttribute('href', `static/data/scenes/${pad(f)}.jpg`);
    scene = s;
    draw();
    const next = scenes[(index + 1) % scenes.length].frame;  // warm the next scene
    if (!cache.has(next)) cache.set(next, fetch(`static/data/scenes/${pad(next)}.json`).then((r) => r.json()));
  }

  for (const t of tabs) {
    t.addEventListener('click', () => {
      mode = t.dataset.mode;
      for (const u of tabs) u.setAttribute('aria-selected', String(u === t));
      draw();
    });
  }
  document.querySelectorAll('.cells [data-step]').forEach((b) =>
    b.addEventListener('click', () => load(index + Number(b.dataset.step))));

  fetch('static/data/page.json').then((r) => r.json()).then((page) => {
    scenes = page.scenes;
    load(0);
  }).catch(() => { count.textContent = 'The scene data could not be loaded.'; });
})();
