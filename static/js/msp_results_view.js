/* ------------------------------------------------------------------
   E10 learned baselines, the rate-quality frontier, and E12 coverage
   for the executed grasp. Reads window.MSP_RESULTS, which
   tools/export_results.py writes from results/rebuttal/r2, r4, r5, r6.
   Uses svgEl, svgText and makeTooltip from index.js.
   ------------------------------------------------------------------ */
(function () {
  var METRICS = {
    within: { label: 'within-scene AUC', lo: 0.45, hi: 0.90, ticks: [0.5, 0.6, 0.7, 0.8, 0.9] },
    top1: { label: 'top-1 success', lo: 0.60, hi: 0.85, ticks: [0.60, 0.65, 0.70, 0.75, 0.80, 0.85] },
    pooled: { label: 'pooled AUC', lo: 0.60, hi: 0.95, ticks: [0.6, 0.7, 0.8, 0.9] }
  };
  var SERIES = [
    { key: 'msp', name: 'MSP, one payload per scene', color: '#1F5C8B' },
    { key: 'gqcnn', name: 'GQ-CNN architecture, one payload per candidate', color: '#8A6D3B' }
  ];

  function fmt(v, sd) { return sd === undefined ? v.toFixed(3) : v.toFixed(3) + ' <span class="bx-sd">&plusmn; ' + sd.toFixed(3) + '</span>'; }
  function bytes(v) { return v === undefined ? '<span class="ai-na">&ndash;</span>' : v.toLocaleString('en-US'); }

  function setupBaselineTable(R) {
    var body = document.getElementById('bx-table-body');
    if (!body) return;
    body.innerHTML = R.baselines.map(function (b) {
      var tag = b.ours ? ' <span class="ai-ours-tag">Ours</span>' : '';
      var seeds = b.seeds > 1 ? ' <span class="bx-seeds">' + b.seeds + ' seeds</span>' : '';
      return '<tr' + (b.ours ? ' class="ai-ours"' : '') + '><th scope="row">' + b.method + tag + seeds + '</th>' +
        '<td>' + fmt(b.pooled, b.pooled_sd) + '</td><td class="ai-col-avg">' + fmt(b.within, b.within_sd) + '</td>' +
        '<td>' + fmt(b.top1, b.top1_sd) + '</td><td>' + bytes(b.bytes_fp32) + '</td><td>' + bytes(b.bytes_2bit) + '</td></tr>';
    }).join('');
  }

  // First crossing of two piecewise-linear curves in (log10 bits, metric).
  function crossing(a, b) {
    var xs = a.concat(b).map(function (p) { return p.x; }).sort(function (u, v) { return u - v; });
    function at(curve, x) {
      if (x < curve[0].x || x > curve[curve.length - 1].x) return null;
      for (var i = 1; i < curve.length; i++) {
        if (x <= curve[i].x) {
          var t = (x - curve[i - 1].x) / (curve[i].x - curve[i - 1].x);
          return curve[i - 1].y + t * (curve[i].y - curve[i - 1].y);
        }
      }
      return curve[curve.length - 1].y;
    }
    var prev = null;
    for (var x = xs[0]; x <= xs[xs.length - 1]; x += 0.005) {
      var ya = at(a, x), yb = at(b, x);
      if (ya === null || yb === null) { prev = null; continue; }
      var d = ya - yb;
      if (prev !== null && Math.sign(d) !== Math.sign(prev.d) && d !== 0) return { x: x, y: ya };
      prev = { d: d };
    }
    return null;
  }

  function setupFrontierChart(R) {
    var host = document.getElementById('bx-frontier');
    if (!host) return;
    var pills = document.querySelectorAll('#bx-metric .ax-pill');
    var tip = makeTooltip(host);
    var W = 640, H = 370, ML = 62, MR = 24, MT = 22, MB = 70;
    var LO = Math.log10(30), HI = Math.log10(400000);
    function xAt(bits) { return ML + ((Math.log10(bits) - LO) / (HI - LO)) * (W - ML - MR); }

    function draw(metric) {
      var M = METRICS[metric];
      function yAt(v) { return H - MB - ((v - M.lo) / (M.hi - M.lo)) * (H - MT - MB); }
      host.querySelectorAll('svg').forEach(function (s) { s.remove(); });
      var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
      svg.setAttribute('aria-label', 'Rate-quality frontier: ' + M.label + ' against entropy-coded payload bits per scene for MSP and the GQ-CNN architecture');

      M.ticks.forEach(function (v) {
        svg.appendChild(svgEl('line', { x1: ML, x2: W - MR, y1: yAt(v), y2: yAt(v), class: 'ax-svg-grid' }));
        svg.appendChild(svgText(ML - 9, yAt(v) + 3.5, v.toFixed(2), 'ax-svg-tick', { 'text-anchor': 'end' }));
      });
      [100, 1000, 10000, 100000].forEach(function (v) {
        svg.appendChild(svgEl('line', { x1: xAt(v), x2: xAt(v), y1: MT, y2: H - MB, class: 'ax-svg-grid' }));
        svg.appendChild(svgText(xAt(v), H - MB + 17, v.toLocaleString('en-US'), 'ax-svg-tick', { 'text-anchor': 'middle' }));
      });

      var curves = {};
      SERIES.forEach(function (s) {
        var pts = R.frontier.map(function (f) { return { bpd: f.bits_per_dim, bits: f[s.key].bits, v: f[s.key][metric] }; });
        curves[s.key] = pts.map(function (p) { return { x: Math.log10(p.bits), y: p.v }; });
        svg.appendChild(svgEl('polyline', {
          points: pts.map(function (p) { return xAt(p.bits) + ',' + yAt(p.v); }).join(' '),
          fill: 'none', stroke: s.color, 'stroke-width': 2.2, 'stroke-linejoin': 'round'
        }));
        pts.forEach(function (p) {
          var node = svgEl('circle', { cx: xAt(p.bits), cy: yAt(p.v), r: 5.5, fill: s.color });
          node.setAttribute('class', 'ax-point');
          node.addEventListener('mousemove', function (event) {
            tip.show(event, '<b>' + s.name + '</b><br>' + p.bpd + ' bit' + (p.bpd > 1 ? 's' : '') + ' per dimension<br>' +
              Math.round(p.bits).toLocaleString('en-US') + ' bits per scene<br>' + M.label + ' ' + p.v.toFixed(3));
          });
          node.addEventListener('mouseleave', tip.hide);
          svg.appendChild(node);
        });
      });

      var cx = crossing(curves.msp, curves.gqcnn);
      if (cx) {
        var bits = Math.pow(10, cx.x);
        svg.appendChild(svgEl('line', { x1: xAt(bits), x2: xAt(bits), y1: MT, y2: H - MB, stroke: '#5B6470', 'stroke-dasharray': '4 4' }));
        svg.appendChild(svgText(xAt(bits) + 6, MT + 12, 'curves cross near ' + (Math.round(bits / 10) * 10).toLocaleString('en-US') + ' bits',
          'ax-svg-tick', { fill: '#37404D' }));
      }

      var ly = H - 22;
      SERIES.forEach(function (s, i) {
        var lx = ML + i * 270;
        svg.appendChild(svgEl('line', { x1: lx, x2: lx + 18, y1: ly, y2: ly, stroke: s.color, 'stroke-width': 2.4 }));
        svg.appendChild(svgText(lx + 24, ly + 3.5, s.name, 'ax-svg-tick', { fill: '#37404D' }));
      });
      svg.appendChild(svgText(ML + (W - ML - MR) / 2, H - MB + 36, 'entropy-coded payload, bits per scene (log scale)', 'ax-svg-label', { 'text-anchor': 'middle' }));
      svg.appendChild(svgText(0, 0, M.label, 'ax-svg-label', {
        transform: 'translate(15,' + (MT + (H - MT - MB) / 2) + ') rotate(-90)', 'text-anchor': 'middle'
      }));
      host.appendChild(svg);
    }

    pills.forEach(function (p) {
      p.addEventListener('click', function () {
        pills.forEach(function (o) { o.classList.toggle('is-active', o === p); });
        draw(p.dataset.metric);
      });
    });
    draw('within');
  }

  function setupExecutedTable(R) {
    var body = document.getElementById('bx-exec-body');
    if (!body) return;
    function cell(d) { return '<td>' + d.coverage.toFixed(3) + '</td><td class="bx-dim">' + d.certified.toFixed(3) + '</td>'; }
    body.innerHTML = R.executed.map(function (e) {
      return '<tr><th scope="row">' + e.target.toFixed(2) + '</th>' + cell(e.pairwise) + cell(e.executed) + cell(e.selective) + '</tr>';
    }).join('');
  }

  document.addEventListener('DOMContentLoaded', function () {
    var R = window.MSP_RESULTS;
    if (!R) return;
    setupBaselineTable(R);
    setupFrontierChart(R);
    setupExecutedTable(R);
  });
})();
