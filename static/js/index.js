/* ------------------------------------------------------------------
   MSP project page.

   Every number below is read from the run artefacts in the code
   repository (results/libero/*.json and results/libero/l1_scores.pt),
   with the same estimators the paper build uses, and matches
   paper/tables/*.tex and the panels from scripts/paper/make_figures.py.

   Nothing here is transcribed from prose. Where the README and the
   generated tables disagree, the tables win: they are regenerated from
   the results on every build.
   ------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   Copy BibTeX to clipboard
   ------------------------------------------------------------------ */
function copyBibTeX() {
  var bibtexElement = document.getElementById('bibtex-code');
  var button = document.querySelector('.copy-bibtex-btn');
  if (!bibtexElement || !button) return;

  var copyText = button.querySelector('.copy-text');

  function markCopied() {
    button.classList.add('copied');
    if (copyText) copyText.textContent = 'Copied!';
    setTimeout(function () {
      button.classList.remove('copied');
      if (copyText) copyText.textContent = 'Copy';
    }, 2000);
  }

  function fallbackCopy() {
    var textArea = document.createElement('textarea');
    textArea.value = bibtexElement.textContent;
    document.body.appendChild(textArea);
    textArea.select();
    try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
    document.body.removeChild(textArea);
    markCopied();
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(bibtexElement.textContent).then(markCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function onFirstView(element, callback, threshold) {
  if (!('IntersectionObserver' in window)) { callback(); return; }
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      callback();
      observer.unobserve(entry.target);
    });
  }, { threshold: threshold || 0.25 });
  observer.observe(element);
}

/* ------------------------------------------------------------------
   Tiny SVG helpers. Charts are hand-built so the page ships no plotting
   library and every drawn value is traceable to a data block above.
   ------------------------------------------------------------------ */
var SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  var node = document.createElementNS(SVGNS, name);
  Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
  return node;
}

function svgText(x, y, text, cls, extra) {
  var node = svgEl('text', Object.assign({ x: x, y: y, class: cls || 'ax-svg-tick' }, extra || {}));
  node.textContent = text;
  return node;
}

function makeTooltip(host) {
  var tip = document.createElement('div');
  tip.className = 'ax-tip';
  host.appendChild(tip);

  return {
    show: function (event, html) {
      tip.innerHTML = html;
      tip.classList.add('is-on');
      var box = host.getBoundingClientRect();
      var x = event.clientX - box.left;
      var y = event.clientY - box.top;
      tip.style.left = Math.min(Math.max(x + 14, 4), Math.max(box.width - tip.offsetWidth - 4, 4)) + 'px';
      tip.style.top = Math.max(y - tip.offsetHeight - 12, 4) + 'px';
    },
    hide: function () { tip.classList.remove('is-on'); }
  };
}

/* ------------------------------------------------------------------
   Sticky nav: scroll spy, reading progress, mobile toggle
   ------------------------------------------------------------------ */
function setupNav() {
  var nav = document.getElementById('ai-nav');
  var progress = document.getElementById('ai-progress');
  var toggle = document.getElementById('ai-nav-toggle');
  var links = document.getElementById('ai-nav-links');
  if (!nav) return;

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var open = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    links.addEventListener('click', function (event) {
      if (event.target.tagName === 'A') {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  var anchors = links ? Array.prototype.slice.call(links.querySelectorAll('a')) : [];
  var sections = anchors
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function onScroll() {
    if (progress) {
      var height = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (height > 0 ? (window.pageYOffset / height) * 100 : 0) + '%';
    }

    var scrollButton = document.querySelector('.scroll-to-top');
    if (scrollButton) scrollButton.classList.toggle('visible', window.pageYOffset > 300);

    var current = -1;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= nav.offsetHeight + 20) current = i;
    }
    anchors.forEach(function (a, i) { a.classList.toggle('is-active', i === current); });
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () { onScroll(); ticking = false; });
  }, { passive: true });

  onScroll();
}

/* ------------------------------------------------------------------
   Animated stat counters
   ------------------------------------------------------------------ */
function setupCounters() {
  var counters = document.querySelectorAll('[data-count-to]');
  if (!counters.length) return;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function render(el, value) {
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    el.textContent = (el.dataset.prefix || '') + value.toFixed(decimals) + (el.dataset.suffix || '');
  }

  counters.forEach(function (el) {
    var target = parseFloat(el.dataset.countTo);
    if (reduce) { render(el, target); return; }

    onFirstView(el, function () {
      var duration = 1100;
      var start = null;
      function step(timestamp) {
        if (start === null) start = timestamp;
        var progress = Math.min((timestamp - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3);
        render(el, target * eased);
        if (progress < 1) window.requestAnimationFrame(step);
      }
      window.requestAnimationFrame(step);
    }, 0.4);
  });
}

/* ------------------------------------------------------------------
   Generic tab groups
   ------------------------------------------------------------------ */
function setupTabs() {
  var tabs = document.querySelectorAll('.ai-tab[data-tab]');
  if (!tabs.length) return;

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.dataset.tab;
      tabs.forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('is-active', active);
        t.setAttribute('aria-selected', String(active));
      });
      document.querySelectorAll('.ai-tab-panel').forEach(function (panel) {
        panel.classList.toggle('is-active', panel.dataset.panel === name);
      });
    });
  });
}

/* ------------------------------------------------------------------
   Figure lightbox
   ------------------------------------------------------------------ */
function setupLightbox() {
  var lightbox = document.getElementById('ai-lightbox');
  var image = document.getElementById('ai-lightbox-img');
  var caption = document.getElementById('ai-lightbox-caption');
  var closeBtn = document.getElementById('ai-lightbox-close');
  if (!lightbox || !image) return;

  function open(source) {
    image.src = source.src;
    image.alt = source.alt;
    var figcaption = source.closest('figure') ? source.closest('figure').querySelector('figcaption') : null;
    if (caption) caption.textContent = figcaption ? figcaption.textContent.trim() : source.alt;
    lightbox.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
    image.src = '';
  }

  document.querySelectorAll('.ai-zoomable').forEach(function (img) {
    img.addEventListener('click', function () { open(img); });
  });

  if (closeBtn) closeBtn.addEventListener('click', close);
  lightbox.addEventListener('click', function (event) {
    if (event.target === lightbox) close();
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && lightbox.classList.contains('is-open')) close();
  });
}

/* ------------------------------------------------------------------
   Pipeline walkthrough: observe, encode, score, certify
   ------------------------------------------------------------------ */
var STAGES = {
  observe: {
    eyebrow: 'Stage 1 of 4',
    title: 'Observe',
    lead: 'V networked RGB-D views of a scene whose true state is never available at deployment.',
    body: 'The world state x = (S, T, phi) collects shape, pose and physics, and only the first two ' +
      'are visible in an image at all. Friction, mass and the centre of mass are not photographable, ' +
      'which is why a system that reports an accurate pose has still not reported the thing that ' +
      'decides whether a grasp holds. The physics oracle that supplies outcome labels is used in ' +
      'training only and is absent at test time.',
    spec: [
      ['State dimension', '14'],
      ['Views at inference', 'V, permutation-invariant'],
      ['Reconstruction loss', 'none'],
      ['Pose loss', 'none']
    ]
  },
  encode: {
    eyebrow: 'Stage 2 of 4',
    title: 'Encode a belief, not a pose',
    lead: 'A per-view backbone pools into a posterior q(z | o) over a 64-dimensional code.',
    body: 'The code is trained by a variational information bottleneck: minimise the rate R, the ' +
      'KL from the posterior to the prior, while paying a weighted distortion on the outcomes that ' +
      'actually matter. As the sufficiency budget grows the optimum recovers the minimal sufficient ' +
      'statistic, so what survives compression is all and only the information that changes what ' +
      'happens. Two states are equivalent when every admissible action produces the same outcome ' +
      'distribution, and geometry is recoverable only up to that equivalence.',
    spec: [
      ['Latent dimension', '64'],
      ['Rate at the deployed point', '0.534 nats'],
      ['Objective', 'variational IB'],
      ['Pooling', 'permutation-invariant']
    ]
  },
  score: {
    eyebrow: 'Stage 3 of 4',
    title: 'Score outcomes, not geometry',
    lead: 'One head maps (code, action) to a distribution over what the grasp will do.',
    body: 'Three outcome channels are modelled: success as a Bernoulli, margin as a Gaussian and ' +
      'slip as a zero-inflated log-normal. The budget puts almost all its weight on success, the one ' +
      'channel the decision rule reads. Placing an equal multiplier on channels whose log-likelihoods ' +
      'live on incommensurate scales starves it, and the model stops ranking grasps at all: that is ' +
      'the uniform-budget ablation, and it is the sharpest result in the table.',
    spec: [
      ['Outcome channels', '3'],
      ['Marginalised over', 'K posterior samples'],
      ['Score', 's(o,a) = E[sigma]'],
      ['Uncertainty', 'v(o,a) = Var[sigma]']
    ]
  },
  certify: {
    eyebrow: 'Stage 4 of 4',
    title: 'Certify, then act or abstain',
    lead: 'Split conformal prediction turns the score into a distribution-free coverage guarantee.',
    body: 'Actions whose prediction set is the singleton {1} form the certified set; the system takes ' +
      'the risk-averse argmax inside it, and abstains when the set is empty. Coverage is marginal and ' +
      'holds by construction, empirically 0.897 against a 0.90 target over 16,000 test points. ' +
      'Certified precision is a different estimand and is reported separately, which matters because ' +
      'conflating the two is the standard way to overclaim a conformal result.',
    spec: [
      ['Target coverage', '0.90'],
      ['Empirical coverage', '0.897'],
      ['Certified precision', '0.744'],
      ['Test points', '16,000']
    ]
  }
};

function setupStages() {
  var buttons = document.querySelectorAll('.ai-stage');
  var detail = document.getElementById('ai-loop-detail');
  if (!buttons.length || !detail) return;

  var el = {
    eyebrow: detail.querySelector('.ai-loop-eyebrow'),
    title: detail.querySelector('h3'),
    lead: detail.querySelector('.ai-loop-lead'),
    body: detail.querySelector('.ai-loop-body'),
    spec: detail.querySelector('.ai-loop-spec')
  };

  function show(key, button) {
    var stage = STAGES[key];
    if (!stage) return;

    buttons.forEach(function (b) {
      var active = b === button;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });

    detail.style.setProperty('--stage-c', 'var(--stage-' + key + ')');
    el.eyebrow.textContent = stage.eyebrow;
    el.title.textContent = stage.title;
    el.lead.textContent = stage.lead;
    el.body.textContent = stage.body;
    el.spec.innerHTML = stage.spec.map(function (pair) {
      return '<div><span class="ai-spec-label">' + pair[0] +
        '</span><span class="ai-spec-val">' + pair[1] + '</span></div>';
    }).join('');
  }

  buttons.forEach(function (button) {
    button.addEventListener('click', function () { show(button.dataset.stage, button); });
  });

  show('observe', buttons[0]);
}

/* ------------------------------------------------------------------
   Risk-coverage: the deployment curve.
   Recomputed from results/libero/l1_scores.pt through
   msp.diagnostics.selective.compare_selective, seed 0.
   Each pair is [act rate, fraction of executed grasps that lifted].
   ------------------------------------------------------------------ */
var RISK = {
  nScenes: 1997, random: 0.6229,
  msp: [[0.0005, 1.0], [0.0205, 1.0], [0.0411, 1.0], [0.0616, 1.0], [0.1022, 0.9853], [0.1227, 0.9878], [0.1432, 0.9825], [0.1632, 0.9847], [0.2043, 0.9828], [0.2248, 0.9822], [0.2449, 0.9836], [0.2654, 0.9811], [0.3065, 0.9788], [0.3265, 0.9801], [0.347, 0.9784], [0.3676, 0.9782], [0.4081, 0.9718], [0.4286, 0.9708], [0.4492, 0.9632], [0.4692, 0.952], [0.5103, 0.9313], [0.5308, 0.9198], [0.5508, 0.9082], [0.5714, 0.8948], [0.6124, 0.8823], [0.6324, 0.8733], [0.653, 0.862], [0.6735, 0.8513], [0.7141, 0.831], [0.7346, 0.8228], [0.7551, 0.8143], [0.7752, 0.8049], [0.8162, 0.7896], [0.8368, 0.7816], [0.8568, 0.7744], [0.8773, 0.7677], [0.9184, 0.7497], [0.9384, 0.7348], [0.9589, 0.7191], [1.0, 0.6915]],
  analytic: [[0.0005, 1.0], [0.0205, 0.4878], [0.0411, 0.4146], [0.0616, 0.439], [0.1022, 0.4559], [0.1227, 0.449], [0.1432, 0.4545], [0.1632, 0.454], [0.2043, 0.4779], [0.2248, 0.4833], [0.2449, 0.5031], [0.2654, 0.5113], [0.3065, 0.531], [0.3265, 0.5276], [0.347, 0.5325], [0.3676, 0.5327], [0.4081, 0.5509], [0.4286, 0.5549], [0.4492, 0.5619], [0.4692, 0.5731], [0.5103, 0.5888], [0.5308, 0.5925], [0.5508, 0.5982], [0.5714, 0.6004], [0.6124, 0.61], [0.6324, 0.6136], [0.653, 0.6181], [0.6735, 0.6216], [0.7141, 0.6318], [0.7346, 0.636], [0.7551, 0.6426], [0.7752, 0.6473], [0.8162, 0.6577], [0.8368, 0.6607], [0.8568, 0.6634], [0.8773, 0.6655], [0.9184, 0.6652], [0.9384, 0.6644], [0.9589, 0.6663], [1.0, 0.6655]]
};

function setupRiskCoverage() {
  var host = document.getElementById('ax-risk');
  if (!host) return;

  var W = 660, H = 340, ML = 62, MR = 24, MT = 24, MB = 60;
  var Y0 = 0.35, Y1 = 1.02;
  var state = { act: 0.25 };

  var slider = document.getElementById('ax-act');
  var out = {
    label: document.getElementById('ax-act-val'),
    msp: document.getElementById('ax-duel-msp'),
    proxy: document.getElementById('ax-duel-proxy'),
    verdict: document.getElementById('ax-risk-verdict')
  };

  function xAt(v) { return ML + v * (W - ML - MR); }
  function yAt(v) { return H - MB - ((v - Y0) / (Y1 - Y0)) * (H - MT - MB); }

  function at(series, act) {
    var best = series[0], bestD = Infinity;
    series.forEach(function (p) {
      var d = Math.abs(p[0] - act);
      if (d < bestD) { bestD = d; best = p; }
    });
    return best;
  }

  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
  svg.setAttribute('aria-label',
    'Risk-coverage curves: MSP precision falls from 1.00 to 0.69 as the act rate rises, ' +
    'while the analytic proxy rises from 0.41 to 0.67 and reaches the random-grasp baseline only near the end');

  [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].forEach(function (v) {
    svg.appendChild(svgEl('line', { x1: ML, x2: W - MR, y1: yAt(v), y2: yAt(v), class: 'ax-svg-grid' }));
    svg.appendChild(svgText(ML - 9, yAt(v) + 3.5, v.toFixed(1), 'ax-svg-tick', { 'text-anchor': 'end' }));
  });
  [0, 0.2, 0.4, 0.6, 0.8, 1.0].forEach(function (v) {
    svg.appendChild(svgText(xAt(v), H - MB + 17, v.toFixed(1), 'ax-svg-tick', { 'text-anchor': 'middle' }));
  });

  svg.appendChild(svgEl('line', {
    x1: ML, x2: W - MR, y1: yAt(RISK.random), y2: yAt(RISK.random),
    stroke: '#5B6470', 'stroke-width': 1.2, 'stroke-dasharray': '3 3'
  }));
  svg.appendChild(svgText(W - MR - 4, yAt(RISK.random) - 6,
    'random grasp (' + RISK.random.toFixed(2) + ')', 'ax-svg-tick', { 'text-anchor': 'end' }));

  [['analytic', '#9B2226'], ['msp', '#1F5C8B']].forEach(function (spec) {
    svg.appendChild(svgEl('polyline', {
      points: RISK[spec[0]].map(function (p) { return xAt(p[0]) + ',' + yAt(p[1]); }).join(' '),
      fill: 'none', stroke: spec[1], 'stroke-width': 2.3, 'stroke-linejoin': 'round'
    }));
  });

  svg.appendChild(svgText(ML + (W - ML - MR) / 2, H - MB + 38,
    'act rate   fraction of scenes the system commits to', 'ax-svg-label', { 'text-anchor': 'middle' }));
  svg.appendChild(svgText(0, 0, 'grasps that lifted the object', 'ax-svg-label', {
    transform: 'translate(16,' + (MT + (H - MT - MB) / 2) + ') rotate(-90)', 'text-anchor': 'middle'
  }));

  [['MSP', '#1F5C8B', 0], ['Ferrari-Canny', '#9B2226', 1]].forEach(function (spec) {
    var y = MT + 6 + spec[2] * 17;
    var x = W - MR - 132;
    svg.appendChild(svgEl('line', { x1: x, x2: x + 18, y1: y - 4, y2: y - 4, stroke: spec[1], 'stroke-width': 2.3 }));
    svg.appendChild(svgText(x + 24, y, spec[0], 'ax-svg-tick'));
  });

  var rule = svgEl('line', { y1: MT, y2: H - MB, stroke: '#1F5C8B', 'stroke-width': 1.4, opacity: 0.45 });
  svg.appendChild(rule);
  var dotProxy = svgEl('circle', { r: 6, fill: '#9B2226', stroke: '#fff', 'stroke-width': 2 });
  var dotMsp = svgEl('circle', { r: 6, fill: '#1F5C8B', stroke: '#fff', 'stroke-width': 2 });
  svg.appendChild(dotProxy);
  svg.appendChild(dotMsp);
  host.appendChild(svg);

  function render() {
    var m = at(RISK.msp, state.act);
    var a = at(RISK.analytic, state.act);
    var x = xAt(m[0]);

    rule.setAttribute('x1', x); rule.setAttribute('x2', x);
    dotMsp.setAttribute('cx', x); dotMsp.setAttribute('cy', yAt(m[1]));
    dotProxy.setAttribute('cx', xAt(a[0])); dotProxy.setAttribute('cy', yAt(a[1]));

    out.label.textContent = m[0].toFixed(2);
    out.msp.textContent = m[1].toFixed(3);
    out.proxy.textContent = a[1].toFixed(3);

    out.verdict.innerHTML = a[1] > RISK.random
      ? 'At this act rate the analytic proxy finally edges past picking a grasp at random. It only ' +
        'gets there by committing to nearly everything, which is the opposite of being selective.'
      : 'At this act rate the analytic proxy is <b>worse than picking a grasp at random</b> (' +
        RISK.random.toFixed(3) + '). The grasps it is surest about are the ones that fail.';
  }

  if (slider) {
    slider.addEventListener('input', function () {
      state.act = parseInt(slider.value, 10) / 100;
      render();
    });
  }

  render();
}

/* ------------------------------------------------------------------
   Certificate operating points (results/libero/l2_coverage.json).
   Split conformal at three values of alpha, 16,000 test points each.
   ------------------------------------------------------------------ */
var CERT = {
  '0.05': { target: 0.95, coverage: 0.9463, precision: 0.7916, abstention: 0.8225, certified: 0.1688 },
  '0.1':  { target: 0.90, coverage: 0.8973, precision: 0.7435, abstention: 0.7430, certified: 0.2347 },
  '0.2':  { target: 0.80, coverage: 0.8000, precision: 0.6734, abstention: 0.5980, certified: 0.4020 }
};

function setupCertificate() {
  var pills = document.querySelectorAll('.ax-pill[data-alpha]');
  if (!pills.length) return;

  var fields = ['target', 'coverage', 'precision', 'abstention', 'certified'];

  function show(alpha) {
    var row = CERT[alpha];
    if (!row) return;
    fields.forEach(function (key) {
      var val = document.getElementById('ax-cert-' + key);
      var bar = document.getElementById('ax-certbar-' + key);
      if (val) val.textContent = row[key].toFixed(key === 'target' ? 2 : 4);
      if (bar) bar.style.width = (row[key] * 100).toFixed(1) + '%';
    });
    var gap = document.getElementById('ax-cert-gap');
    if (gap) {
      var d = row.coverage - row.target;
      gap.innerHTML = 'Empirical coverage sits <b>' + (d >= 0 ? '+' : '') + d.toFixed(4) +
        '</b> from its target. Coverage is the marginal quantity the theorem guarantees; certified ' +
        'precision is a different estimand and is reported beside it rather than in place of it.';
    }
  }

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      pills.forEach(function (p) { p.classList.toggle('is-active', p === pill); });
      show(pill.dataset.alpha);
    });
  });

  show('0.1');
}

/* ------------------------------------------------------------------
   Rate-distortion frontier (results/libero/l5_frontier.json).
   beta multiplies the relevance term, so larger beta buys sufficiency
   at the price of rate. D_succ is the outcome the budget purchases.
   ------------------------------------------------------------------ */
var FRONTIER = [
  { beta: 1,   rate: 0.0039, dSucc: 0.6560, dTotal: 0.7252, coverage: 0.8958, abstention: 0.643 },
  { beta: 3,   rate: 0.0881, dSucc: 0.6220, dTotal: 0.7671, coverage: 0.8924, abstention: 0.674 },
  { beta: 10,  rate: 0.2795, dSucc: 0.5979, dTotal: 0.8704, coverage: 0.9044, abstention: 0.736 },
  { beta: 30,  rate: 0.5340, dSucc: 0.5822, dTotal: 0.9926, coverage: 0.8973, abstention: 0.743 },
  { beta: 100, rate: 3.2864, dSucc: 0.4117, dTotal: 0.9560, coverage: 0.9053, abstention: 0.367 }
];

function setupFrontier() {
  var host = document.getElementById('ax-frontier');
  if (!host) return;

  var W = 620, H = 360, ML = 66, MR = 26, MT = 26, MB = 62;
  var tip = makeTooltip(host);

  var LO = Math.log10(0.003), HI = Math.log10(4.0);
  function xAt(r) { return ML + ((Math.log10(Math.max(r, 0.003)) - LO) / (HI - LO)) * (W - ML - MR); }
  function yAt(d) { return H - MB - ((d - 0.38) / (0.70 - 0.38)) * (H - MT - MB); }

  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
  svg.setAttribute('aria-label',
    'Rate against success distortion over the sufficiency budget: distortion falls monotonically as the rate rises');

  [0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70].forEach(function (v) {
    svg.appendChild(svgEl('line', { x1: ML, x2: W - MR, y1: yAt(v), y2: yAt(v), class: 'ax-svg-grid' }));
    svg.appendChild(svgText(ML - 9, yAt(v) + 3.5, v.toFixed(2), 'ax-svg-tick', { 'text-anchor': 'end' }));
  });
  [0.003, 0.01, 0.1, 1, 4].forEach(function (v) {
    svg.appendChild(svgEl('line', { x1: xAt(v), x2: xAt(v), y1: MT, y2: H - MB, class: 'ax-svg-grid' }));
    svg.appendChild(svgText(xAt(v), H - MB + 17, String(v), 'ax-svg-tick', { 'text-anchor': 'middle' }));
  });

  svg.appendChild(svgEl('polyline', {
    points: FRONTIER.map(function (p) { return xAt(p.rate) + ',' + yAt(p.dSucc); }).join(' '),
    fill: 'none', stroke: '#1F5C8B', 'stroke-width': 2.3, 'stroke-linejoin': 'round'
  }));

  FRONTIER.forEach(function (p) {
    var node = svgEl('circle', { cx: xAt(p.rate), cy: yAt(p.dSucc), r: 6, fill: '#1F5C8B' });
    node.setAttribute('class', 'ax-point');
    node.addEventListener('mousemove', function (event) {
      tip.show(event, '<b>&beta; = ' + p.beta + '</b><br>rate ' + p.rate.toFixed(4) + ' nats<br>' +
        'D<sub>succ</sub> ' + p.dSucc.toFixed(4) + '<br>coverage ' + p.coverage.toFixed(4) +
        '<br>abstention ' + p.abstention.toFixed(3));
    });
    node.addEventListener('mouseleave', tip.hide);
    svg.appendChild(node);
    svg.appendChild(svgText(xAt(p.rate), yAt(p.dSucc) - 13, 'β = ' + p.beta, 'ax-svg-tick',
      { 'text-anchor': 'middle', fill: '#1F5C8B' }));
  });

  svg.appendChild(svgText(ML + (W - ML - MR) / 2, H - MB + 38,
    'rate R   nats per scene, log scale', 'ax-svg-label', { 'text-anchor': 'middle' }));
  svg.appendChild(svgText(0, 0, 'success distortion  D_succ', 'ax-svg-label', {
    transform: 'translate(16,' + (MT + (H - MT - MB) / 2) + ') rotate(-90)', 'text-anchor': 'middle'
  }));

  host.appendChild(svg);
}

/* ------------------------------------------------------------------
   Per-object table (recomputed from l1_scores.pt, joined to
   l3_identifiability.json). wa and wm are within-scene AUCs averaged
   over the scenes where the ranking question is well posed: a scene
   needs at least three executable grasps and both a success and a
   failure. Objects with fewer than 15 such scenes get null rather than
   a noisy number.
   ------------------------------------------------------------------ */
var OBJECTS = [
  { name: "macaroni and cheese", box: true, base: 0.0434, scenes: 44, grasps: 1082, wa: 0.4248, wm: 0.5648, rank: 13, nullDim: 1, angle: 0.044 },
  { name: "cookies", box: true, base: 0.353, scenes: 159, grasps: 1320, wa: 0.4007, wm: 0.7552, rank: 14, nullDim: 0, angle: null },
  { name: "cream cheese", box: true, base: 0.4135, scenes: 155, grasps: 1248, wa: 0.608, wm: 0.7535, rank: 14, nullDim: 0, angle: null },
  { name: "butter", box: true, base: 0.4794, scenes: 152, grasps: 1216, wa: 0.5941, wm: 0.6133, rank: 14, nullDim: 0, angle: null },
  { name: "tomato sauce", box: false, base: 0.5086, scenes: 112, grasps: 580, wa: 0.522, wm: 0.4673, rank: 12, nullDim: 2, angle: 0.056 },
  { name: "alphabet soup", box: false, base: 0.5234, scenes: 102, grasps: 598, wa: 0.5141, wm: 0.4545, rank: 12, nullDim: 2, angle: 0.048 },
  { name: "chocolate pudding", box: true, base: 0.5842, scenes: 151, grasps: 1224, wa: 0.7483, wm: 0.8062, rank: 14, nullDim: 0, angle: null },
  { name: "popcorn", box: true, base: 0.6159, scenes: 133, grasps: 1104, wa: 0.4965, wm: 0.5414, rank: 14, nullDim: 0, angle: null },
  { name: "salad dressing", box: false, base: 0.9577, scenes: 24, grasps: 638, wa: 0.5674, wm: 0.6569, rank: 12, nullDim: 2, angle: 0.059 },
  { name: "ketchup", box: false, base: 0.9657, scenes: 22, grasps: 671, wa: 0.4182, wm: 0.5053, rank: 13, nullDim: 1, angle: 0.052 },
  { name: "milk", box: false, base: 0.9767, scenes: 10, grasps: 515, wa: null, wm: null, rank: 11, nullDim: 3, angle: 0.214 },
  { name: "orange juice", box: false, base: 0.9786, scenes: 12, grasps: 607, wa: null, wm: null, rank: 12, nullDim: 2, angle: 0.55 },
  { name: "bbq sauce", box: false, base: 0.9991, scenes: 1, grasps: 1176, wa: null, wm: null, rank: 14, nullDim: 0, angle: null }
];

function setupObjects() {
  var tbody = document.querySelector('#ax-obj-table tbody');
  if (!tbody) return;

  var state = { geom: 'all', sort: 'base', asc: true };

  var out = {
    n: document.getElementById('ax-obj-n'),
    wa: document.getElementById('ax-obj-wa'),
    wm: document.getElementById('ax-obj-wm'),
    note: document.getElementById('ax-obj-note')
  };

  function keep(o) {
    if (state.geom === 'box') return o.box;
    if (state.geom === 'curved') return !o.box;
    return true;
  }

  function cell(v) {
    if (v === null) return '<td class="ai-na">not rankable</td>';
    var cls = v < 0.5 ? 'ax-below' : 'ax-above';
    return '<td><span class="' + cls + '">' + v.toFixed(3) + '</span></td>';
  }

  function render() {
    var rows = OBJECTS.filter(keep).slice();
    rows.sort(function (a, b) {
      var va = a[state.sort], vb = b[state.sort];
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === 'string') return state.asc ? va.localeCompare(vb) : vb.localeCompare(va);
      return state.asc ? va - vb : vb - va;
    });

    tbody.innerHTML = rows.map(function (o) {
      return '<tr>' +
        '<th scope="row">' + o.name +
          '<span class="ax-geom ' + (o.box ? 'is-box">box' : 'is-curved">curved') + '</span></th>' +
        '<td>' + o.base.toFixed(3) + '</td>' +
        cell(o.wa) + cell(o.wm) +
        '<td>' + o.rank + '</td>' +
        '<td>' + o.nullDim + '</td>' +
        '<td>' + (o.angle === null ? '<span class="ai-na">&ndash;</span>' : o.angle.toFixed(2)) + '</td>' +
      '</tr>';
    }).join('');

    // Averages over the objects the ranking question can actually be asked of.
    var rankable = rows.filter(function (o) { return o.wm !== null; });
    var mean = function (key) {
      return rankable.reduce(function (a, o) { return a + o[key]; }, 0) / Math.max(rankable.length, 1);
    };
    out.n.textContent = rows.length;
    out.wa.textContent = rankable.length ? mean('wa').toFixed(3) : '–';
    out.wm.textContent = rankable.length ? mean('wm').toFixed(3) : '–';
    out.note.textContent = rankable.length === rows.length
      ? 'All ' + rows.length + ' objects have enough rankable scenes to be scored.'
      : (rows.length - rankable.length) + ' of ' + rows.length + ' objects are grasped so reliably ' +
        'that almost no scene contains both a success and a failure, so the within-scene question ' +
        'cannot be asked of them at all.';
  }

  document.querySelectorAll('.ax-pill[data-geom]').forEach(function (pill) {
    pill.addEventListener('click', function () {
      state.geom = pill.dataset.geom;
      document.querySelectorAll('.ax-pill[data-geom]').forEach(function (p) {
        p.classList.toggle('is-active', p === pill);
      });
      render();
    });
  });

  document.querySelectorAll('#ax-obj-table th.ai-sortable').forEach(function (header) {
    header.addEventListener('click', function () {
      var key = header.dataset.sort;
      if (state.sort === key) {
        state.asc = !state.asc;
      } else {
        state.sort = key;
        state.asc = key === 'name';
      }
      document.querySelectorAll('#ax-obj-table th.ai-sortable').forEach(function (h) {
        var on = h === header;
        h.classList.toggle('is-sorted', on);
        var icon = h.querySelector('i');
        if (icon) icon.className = !on ? 'fas fa-sort' : (state.asc ? 'fas fa-sort-up' : 'fas fa-sort-down');
      });
      render();
    });
  });

  render();
}

/* ------------------------------------------------------------------
   Ablations, scored on the within-scene axis (l6_ablations.json).
   A pooled AUC cannot referee these: on this corpus a model that has
   learned nothing but object identity still scores about 0.72.
   ------------------------------------------------------------------ */
var ABLATIONS = [
  { name: 'full', within: 0.6395, pooled: 0.8752, response: 0.2208, rate: 5.668, full: true },
  { name: 'latent dim 16', within: 0.6340, pooled: 0.8727, response: 0.2193, rate: 4.888 },
  { name: 'K = 1 posterior sample', within: 0.6020, pooled: 0.8442, response: 0.1745, rate: 6.883 },
  { name: 'latent dim 32', within: 0.5872, pooled: 0.8458, response: 0.1850, rate: 5.121 },
  { name: 'uniform budget', within: 0.5110, pooled: 0.7104, response: 0.0022, rate: 8.737, dead: true },
  { name: 'no perception (z ablated)', within: 0.5057, pooled: 0.6154, response: 0.0307, rate: 0.0, dead: true }
];

function setupAblations() {
  var host = document.getElementById('ax-ablations');
  if (!host) return;

  var LO = 0.48, HI = 0.66;
  function pct(v) { return Math.max(0, Math.min(1, (v - LO) / (HI - LO))) * 100; }

  host.innerHTML = ABLATIONS.map(function (a) {
    var cls = 'ax-abl-row' + (a.full ? ' is-full' : '') + (a.dead ? ' is-dead' : '');
    return '<div class="' + cls + '">' +
      '<span class="ax-abl-name">' + a.name + '</span>' +
      '<span class="ax-abl-track">' +
        '<span class="ax-abl-chance" style="left:' + pct(0.5).toFixed(1) + '%"></span>' +
        '<span class="ax-abl-fill" data-w="' + pct(a.within).toFixed(1) + '"></span>' +
      '</span>' +
      '<span class="ax-abl-val">' + a.within.toFixed(3) + '</span>' +
      '<span class="ax-abl-resp">response ' +
        (a.response < 0.01 ? '<b>' + a.response.toFixed(3) + '</b>' : a.response.toFixed(3)) +
      '</span>' +
    '</div>';
  }).join('');

  onFirstView(host, function () {
    host.querySelectorAll('.ax-abl-fill').forEach(function (fill, i) {
      setTimeout(function () { fill.style.width = fill.dataset.w + '%'; }, i * 80);
    });
  });
}

/* ------------------------------------------------------------------
   Grow-on-scroll bars
   ------------------------------------------------------------------ */
function setupGrowables() {
  document.querySelectorAll('.ai-ladder').forEach(function (ladder) {
    onFirstView(ladder, function () {
      ladder.querySelectorAll('.ai-rung').forEach(function (rung, i) {
        setTimeout(function () { rung.classList.add('is-grown'); }, i * 70);
      });
    });
  });

  document.querySelectorAll('.ai-chart').forEach(function (chart) {
    onFirstView(chart, function () {
      chart.querySelectorAll('.ai-col').forEach(function (col) { col.classList.add('is-grown'); });
    });
  });
}

/* ------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', function () {
  setupNav();
  setupCounters();
  setupTabs();
  setupLightbox();
  setupStages();
  setupRiskCoverage();
  setupCertificate();
  setupFrontier();
  setupObjects();
  setupAblations();
  setupGrowables();
});
