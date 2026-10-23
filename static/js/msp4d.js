/* ------------------------------------------------------------------
   4D grasp viewer. Data: static/data/msp4d, written by
   tools/export_msp4d.py from the held-out L1 test corpus.

   Each scene is the fused eight-view RGB-D cloud of one settled object.
   Each candidate grasp carries its recorded rollout: object pose and
   gripper geom poses every 20 ms. The object is rigid, so its points
   are moved by the recorded pose; the trail draws earlier poses
   coloured by time, which is the (X, Y, Z, t) cloud.
   ------------------------------------------------------------------ */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

var ROOT = 'static/data/msp4d/';
var FRAME_STRIDE = 28;          // object pos+quat, then palm, left finger, right finger
var TRAIL_COPIES = 9;
var VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
var SCORE_LO = new THREE.Color('#D3E0EA');
var SCORE_HI = new THREE.Color('#1F5C8B');
var PHASE_LABEL = { place: 'Jaws placed', hold: 'Hold', close: 'Closing jaws', settle: 'Contacts settle', lift: 'Lift' };

var host = document.getElementById('m4d');
if (host) boot(host);

function boot(root) {
  var el = {
    objects: root.querySelector('#m4d-objects'),
    stage: root.querySelector('.m4d-stage'),
    canvas: root.querySelector('#m4d-canvas'),
    loading: root.querySelector('.m4d-loading'),
    phase: root.querySelector('#m4d-phase'),
    time: root.querySelector('#m4d-time'),
    lift: root.querySelector('#m4d-lift'),
    liftFill: root.querySelector('#m4d-lift-fill'),
    liftMark: root.querySelector('#m4d-lift-mark'),
    cands: root.querySelector('#m4d-cands'),
    input: root.querySelector('#m4d-input'),
    play: root.querySelector('#m4d-play'),
    scrub: root.querySelector('#m4d-scrub'),
    trail: root.querySelector('#m4d-trail'),
    axes: root.querySelector('#m4d-axes'),
    reset: root.querySelector('#m4d-reset'),
    speeds: root.querySelectorAll('.m4d-speed'),
    summary: document.getElementById('m4d-summary'),
    note: document.getElementById('m4d-note')
  };

  var started = false;
  var io = new IntersectionObserver(function (entries) {
    if (!started && entries.some(function (e) { return e.isIntersecting; })) {
      started = true;
      io.disconnect();
      start(el).catch(function (err) {
        el.loading.textContent = 'The 4D viewer could not load (' + err.message + ').';
        el.loading.classList.add('is-error');
      });
    }
  }, { rootMargin: '200px' });
  io.observe(root);
}

async function start(el) {
  var meta = await fetchJSON(ROOT + 'index.json');
  var view = makeView(el.canvas, el.stage);
  var cache = {};
  var state = { k: null, scene: null, j: null, frame: 0, playing: false, speed: 0.5, trail: true, axes: true };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Phase boundaries in frames: frame 0 is the placement, then each phase's steps / stride.
  var phases = [{ name: 'place', from: 0, to: 1 }];
  var cursor = 1;
  meta.phases.forEach(function (p) { phases.push({ name: p.name, from: cursor, to: cursor + p.frames }); cursor += p.frames; });

  writeSummary(el.summary, meta);
  el.liftMark.style.left = (100 * meta.success_height_m / meta.lift_height_m).toFixed(2) + '%';
  el.note.textContent = 'Re-simulated outcomes agree with the corpus labels for ' +
    meta.resim_outcomes_matching_corpus[0] + ' of ' + meta.resim_outcomes_matching_corpus[1] +
    ' candidates (corpus MuJoCo ' + meta.corpus_mujoco + ', re-simulation ' + meta.resim_mujoco + ').';

  meta.scenes.forEach(function (s) {
    var b = document.createElement('button');
    b.className = 'm4d-chip';
    b.type = 'button';
    b.dataset.k = s.k;
    b.innerHTML = '<span>' + s.object.replace(/_/g, ' ') + '</span><i class="m4d-geo is-' + s.geometry + '">' + s.geometry + '</i>';
    b.addEventListener('click', function () { selectScene(s.k, true); });
    el.objects.appendChild(b);
  });

  el.play.addEventListener('click', function () {
    if (!state.scene) return;
    if (state.frame >= nFrames() - 1) state.frame = 0;
    setPlaying(!state.playing);
  });
  el.scrub.addEventListener('input', function () {
    setPlaying(false);
    state.frame = Number(el.scrub.value);
    drawFrame();
  });
  el.trail.addEventListener('click', function () {
    state.trail = !state.trail;
    el.trail.setAttribute('aria-pressed', String(state.trail));
    drawFrame();
  });
  el.axes.addEventListener('click', function () {
    state.axes = !state.axes;
    el.axes.setAttribute('aria-pressed', String(state.axes));
    drawFrame();
  });
  el.reset.addEventListener('click', function () { view.resetCamera(); });
  el.speeds.forEach(function (b) {
    b.addEventListener('click', function () {
      state.speed = Number(b.dataset.speed);
      el.speeds.forEach(function (o) { o.classList.toggle('is-active', o === b); });
    });
  });

  var last = null;
  view.onTick(function (now) {
    if (!state.playing) { last = null; return false; }
    if (last !== null) {
      state.frame += ((now - last) / meta.dt_ms) * state.speed;
      if (state.frame >= nFrames() - 1) { state.frame = nFrames() - 1; setPlaying(false); }
    }
    last = now;
    el.scrub.value = String(Math.round(state.frame));
    drawFrame();
    return true;
  });

  await selectScene(0, !reduceMotion);

  function nFrames() {
    var c = state.scene.candidates[state.j];
    return c.frames.length / FRAME_STRIDE;
  }

  function setPlaying(on) {
    state.playing = on;
    el.play.classList.toggle('is-playing', on);
    el.play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    if (on) view.wake();
  }

  async function selectScene(k, autoplay) {
    setPlaying(false);
    el.objects.querySelectorAll('.m4d-chip').forEach(function (c) { c.classList.toggle('is-active', Number(c.dataset.k) === k); });
    el.loading.classList.add('is-on');
    if (!cache[k]) {
      var pair = await Promise.all([fetchJSON(ROOT + 'scene_' + k + '.json'), fetchBin(ROOT + 'scene_' + k + '.bin')]);
      cache[k] = { json: pair[0], bin: pair[1] };
    }
    var data = cache[k];
    state.k = k;
    state.scene = data.json;
    el.input.src = ROOT + 'scene_' + k + '_input.png';
    el.input.alt = 'The 96 by 96 RGB view the encoder receives for this ' + data.json.object.replace(/_/g, ' ') + ' scene';
    view.setScene(data.json, data.bin, meta);
    el.loading.classList.remove('is-on');
    renderCandidates();
    selectCandidate(data.json.msp_pick, autoplay);
  }

  function renderCandidates() {
    var s = state.scene;
    var order = s.candidates.slice().sort(function (a, b) {
      if (a.executable !== b.executable) return a.executable ? -1 : 1;
      return b.msp - a.msp;
    });
    el.cands.innerHTML = '';
    order.forEach(function (c, rank) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'm4d-cand' + (c.executable ? '' : ' is-unreachable');
      b.dataset.j = c.j;
      var out = !c.executable ? '<span class="m4d-out is-na">Unreachable</span>' :
        (c.succ ? '<span class="m4d-out is-lift">Lifted</span>' : '<span class="m4d-out is-drop">Failed</span>');
      var tags = '';
      if (c.j === s.msp_pick) tags += '<span class="m4d-tag is-msp">MSP pick</span>';
      if (c.j === s.fc_pick) tags += '<span class="m4d-tag is-fc">Ferrari-Canny pick</span>';
      if (c.executable && c.succ !== c.succ_resim) tags += '<span class="m4d-tag is-warn">re-sim differs</span>';
      b.innerHTML =
        '<span class="m4d-cand-rank">' + (c.executable ? rank + 1 : '&ndash;') + '</span>' +
        '<span class="m4d-cand-body">' +
          '<span class="m4d-cand-top"><span class="m4d-bar"><i style="width:' + (c.msp * 100).toFixed(1) + '%"></i></span>' +
          '<b>' + c.msp.toFixed(2) + '</b>' + out + '</span>' +
          '<span class="m4d-cand-sub">Ferrari-Canny &epsilon; ' + c.fc.toFixed(4) + tags + '</span>' +
        '</span>';
      b.addEventListener('click', function () { selectCandidate(c.j, true); });
      el.cands.appendChild(b);
    });
  }

  function selectCandidate(j, autoplay) {
    state.j = j;
    state.frame = 0;
    el.cands.querySelectorAll('.m4d-cand').forEach(function (b) { b.classList.toggle('is-active', Number(b.dataset.j) === j); });
    el.scrub.max = String(nFrames() - 1);
    el.scrub.value = '0';
    view.setCandidate(j);
    drawFrame();
    if (autoplay && nFrames() > 1) setPlaying(true);
  }

  function drawFrame() {
    var c = state.scene.candidates[state.j];
    var f = Math.min(state.frame, nFrames() - 1);
    var dz = view.drawFrame(c, f, state.trail, state.axes);
    var fi = Math.floor(f);
    var ph = phases.find(function (p) { return fi >= p.from && fi < p.to; }) || phases[phases.length - 1];
    el.phase.textContent = c.jaw_collision ? 'Open jaws intersect the scene: not executed' : PHASE_LABEL[ph.name];
    el.time.textContent = 't = ' + Math.round(f * meta.dt_ms) + ' ms';
    var mm = Math.max(0, dz * 1000);
    el.lift.textContent = 'object raised ' + mm.toFixed(0) + ' mm';
    var frac = Math.min(1, mm / (meta.lift_height_m * 1000));
    el.liftFill.style.width = (frac * 100).toFixed(1) + '%';
    el.liftFill.classList.toggle('is-past', dz > meta.success_height_m);
  }
}

function writeSummary(node, meta) {
  var n = meta.scenes.length;
  var msp = meta.scenes.filter(function (s) { return s.msp_pick_lifts; }).length;
  var fc = meta.scenes.filter(function (s) { return s.fc_pick_lifts; }).length;
  node.innerHTML = 'In these <b>' + n + '</b> scenes MSP&rsquo;s top-scored grasp lifts the object in <b>' + msp +
    '</b>; the Ferrari-Canny pick lifts it in <b>' + fc + '</b>.';
}

/* ---------------- three.js view ---------------- */
function makeView(canvas, stage) {
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(new THREE.Color('#F4F6F8'));

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(38, 1, 0.005, 5);
  camera.up.set(0, 0, 1);
  var controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.minDistance = 0.12;
  controls.maxDistance = 1.2;

  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  var sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(0.4, -0.3, 0.8);
  scene.add(sun);

  var dot = makeDotTexture();
  var world = new THREE.Group();
  scene.add(world);

  var table = null, objectGroup = null, objectGeom = null, trail = [], gripper = [], axes = [], ring = null;
  var current = null, restZ = 0, centre = [0, 0, 0];
  var tickFn = null, raf = null, needsRender = true;

  controls.addEventListener('change', function () { needsRender = true; wake(); });

  var resize = function () {
    var w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    needsRender = true;
    wake();
  };
  new ResizeObserver(resize).observe(stage);

  function resetCamera() {
    camera.position.set(0.36, -0.40, 0.30);
    controls.target.set(0, 0, 0.075);
    controls.update();
    needsRender = true;
    wake();
  }
  resetCamera();

  function loop(now) {
    raf = null;
    var moving = tickFn ? tickFn(now) : false;
    var damping = controls.update();
    if (needsRender || moving || damping) {
      renderer.render(scene, camera);
      needsRender = false;
    }
    if (moving || damping) wake();
  }
  function wake() { if (raf === null) raf = requestAnimationFrame(loop); }

  function clear() {
    [table, objectGroup, ring].concat(trail, gripper, axes).forEach(function (o) {
      if (!o) return;
      world.remove(o);
      o.traverse(function (n) {
        if (n.geometry && n.geometry !== objectGeom) n.geometry.dispose();
        if (n.material) n.material.dispose();
      });
    });
    if (objectGeom) objectGeom.dispose();
    trail = []; gripper = []; axes = [];
  }

  function setScene(json, bin, meta) {
    clear();
    centre = json.centre;
    restZ = json.rest_pos[2];
    var n = json.n_points;
    var pos = new Int16Array(bin, 0, 3 * n);
    var col = new Uint8Array(bin, 6 * n, 3 * n);
    var lab = new Uint8Array(bin, 9 * n, n);
    var nObj = json.n_object_points, nTab = n - nObj;
    var tp = new Float32Array(3 * nTab), tc = new Float32Array(3 * nTab);
    var op = new Float32Array(3 * nObj), oc = new Float32Array(3 * nObj);
    var a = 0, b = 0, s = 1 / meta.pos_scale;
    for (var i = 0; i < n; i++) {
      var dst = lab[i] === 1 ? op : tp, dc = lab[i] === 1 ? oc : tc, o = lab[i] === 1 ? b++ : a++;
      for (var d = 0; d < 3; d++) {
        dst[3 * o + d] = pos[3 * i + d] * s;
        dc[3 * o + d] = srgbToLinear(col[3 * i + d] / 255);
      }
    }
    table = new THREE.Points(geom(tp, tc), pointMaterial(0.0026, true, 1));
    world.add(table);

    objectGeom = geom(op, oc);
    objectGroup = new THREE.Group();
    objectGroup.add(new THREE.Points(objectGeom, pointMaterial(0.0028, true, 1)));
    world.add(objectGroup);
    for (var k = 0; k < TRAIL_COPIES; k++) {
      var m = pointMaterial(0.0024, false, 0.5);
      m.color = rampColor(VIRIDIS, k / (TRAIL_COPIES - 1));
      var ghost = new THREE.Points(objectGeom, m);
      ghost.matrixAutoUpdate = true;
      trail.push(ghost);
      world.add(ghost);
    }

    meta.gripper.forEach(function (g, gi) {
      var mat = new THREE.MeshStandardMaterial({
        color: gi === 0 ? 0x2B3442 : 0x55606F, roughness: 0.6, metalness: 0.1,
        transparent: gi === 0, opacity: gi === 0 ? 0.55 : 1
      });
      var box = new THREE.Mesh(new THREE.BoxGeometry(2 * g.half[0], 2 * g.half[1], 2 * g.half[2]), mat);
      gripper.push(box);
      world.add(box);
    });

    // One jaw axis per candidate, drawn at its placement pose and shaded by MSP's score.
    json.candidates.forEach(function (c) {
      var f = c.frames;
      var l = new THREE.Vector3(f[14] - centre[0], f[15] - centre[1], f[16]);
      var r = new THREE.Vector3(f[21] - centre[0], f[22] - centre[1], f[23]);
      var mid = l.clone().add(r).multiplyScalar(0.5);
      var len = l.distanceTo(r);
      var cyl = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0012, 0.0012, len, 8),
        new THREE.MeshBasicMaterial({ color: SCORE_LO.clone().lerp(SCORE_HI, c.msp), transparent: true, opacity: c.executable ? 0.9 : 0.25 })
      );
      cyl.position.copy(mid);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), r.clone().sub(l).normalize());
      cyl.userData.j = c.j;
      axes.push(cyl);
      world.add(cyl);
    });

    var pts = [];
    for (var q = 0; q <= 64; q++) {
      var th = (q / 64) * Math.PI * 2;
      pts.push(new THREE.Vector3(0.075 * Math.cos(th), 0.075 * Math.sin(th), restZ + meta.success_height_m));
    }
    ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: 0x2F7A4F, dashSize: 0.008, gapSize: 0.006 }));
    ring.computeLineDistances();
    ring.position.set(json.rest_pos[0] - centre[0], json.rest_pos[1] - centre[1], 0);
    world.add(ring);

    needsRender = true;
    wake();
  }

  function setCandidate(j) {
    current = j;
    axes.forEach(function (a) {
      var on = a.userData.j === j;
      a.scale.set(on ? 2.4 : 1, 1, on ? 2.4 : 1);
      a.renderOrder = on ? 2 : 1;
    });
  }

  function poseAt(frames, f, block, outPos, outQuat) {
    var n = frames.length / FRAME_STRIDE;
    var i0 = Math.min(Math.floor(f), n - 1), i1 = Math.min(i0 + 1, n - 1), t = f - i0;
    var o0 = i0 * FRAME_STRIDE + block * 7, o1 = i1 * FRAME_STRIDE + block * 7;
    outPos.set(
      lerp(frames[o0], frames[o1], t) - centre[0],
      lerp(frames[o0 + 1], frames[o1 + 1], t) - centre[1],
      lerp(frames[o0 + 2], frames[o1 + 2], t)
    );
    var qa = new THREE.Quaternion(frames[o0 + 4], frames[o0 + 5], frames[o0 + 6], frames[o0 + 3]);
    var qb = new THREE.Quaternion(frames[o1 + 4], frames[o1 + 5], frames[o1 + 6], frames[o1 + 3]);
    outQuat.copy(qa).slerp(qb, t);
  }

  var tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();

  function drawFrame(c, f, showTrail, showAxes) {
    poseAt(c.frames, f, 0, tmpP, tmpQ);
    objectGroup.position.copy(tmpP);
    objectGroup.quaternion.copy(tmpQ);
    var dz = tmpP.z - restZ;
    gripper.forEach(function (g, gi) {
      poseAt(c.frames, f, gi + 1, g.position, g.quaternion);
    });
    trail.forEach(function (g, k) {
      var fk = (k / (TRAIL_COPIES - 1)) * f;
      g.visible = showTrail && f > 1;
      poseAt(c.frames, fk, 0, g.position, g.quaternion);
    });
    axes.forEach(function (a) { a.visible = showAxes || a.userData.j === current; });
    needsRender = true;
    wake();
    return dz;
  }

  return {
    setScene: setScene,
    setCandidate: setCandidate,
    drawFrame: drawFrame,
    resetCamera: resetCamera,
    onTick: function (fn) { tickFn = fn; },
    wake: wake
  };

  function geom(p, c) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  }

  function pointMaterial(size, vertexColors, opacity) {
    return new THREE.PointsMaterial({
      size: size, sizeAttenuation: true, vertexColors: vertexColors, map: dot, alphaTest: 0.5 * opacity,
      transparent: opacity < 1, opacity: opacity, depthWrite: opacity >= 1
    });
  }
}

function makeDotTexture() {
  var c = document.createElement('canvas');
  c.width = c.height = 64;
  var g = c.getContext('2d');
  g.beginPath();
  g.arc(32, 32, 30, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  var t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rampColor(stops, t) {
  var x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  var i = Math.min(Math.floor(x), stops.length - 2);
  return new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i + 1]), x - i);
}

function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function lerp(a, b, t) { return a + (b - a) * t; }

async function fetchJSON(url) {
  var r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

async function fetchBin(url) {
  var r = await fetch(url);
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.arrayBuffer();
}
