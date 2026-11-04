/* =====================================================================
 * AMV STUDIO ASSET LIBRARY  -  6 Danh mục / 42 Presets Nâng Cao (v2.1)
 * Đã loại bỏ: Đi vào, Đi ra, Hiệu ứng văn bản, Nền.
 * Đã sửa toàn bộ logic khi áp dụng:
 * - Cố định tuyệt đối trục tâm (W/2, H/2)
 * - Tự động overscan chống hở viền đen khi camera chuyển động
 * - Không bao giờ vẽ placeholder đè lên video thật khi áp dụng
 * - Hỗ trợ cờ __preview và __overlayOnly cho Bố cục & Chuyển tiếp
 * ===================================================================== */
(function (root) {
  'use strict';

  var TAU = Math.PI * 2;
  var clamp = function (x, a, b) { a = a === undefined ? 0 : a; b = b === undefined ? 1 : b; return Math.min(b, Math.max(a, x)); };
  var lerp = function (a, b, k) { return a + (b - a) * k; };
  var seg = function (t, a, b) { return clamp((t - a) / (b - a)); };

  var E = {
    linear: function (t) { return t; },
    inCubic: function (t) { return t * t * t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inOutCubic: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outExpo: function (t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); },
    inExpo: function (t) { return t <= 0 ? 0 : Math.pow(2, 10 * t - 10); },
    inOutExpo: function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    },
    outBack: function (t, s) { s = s === undefined ? 1.70158 : s; var c = s + 1; return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2); },
    outElastic: function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
    },
    spring: function (t, damping, freq) {
      damping = damping || 6; freq = freq || 4;
      return 1 - Math.exp(-damping * t) * Math.cos(freq * Math.PI * t);
    }
  };

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function noise1(x, seed) {
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    var h = function (n) { var s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
    return lerp(h(i), h(i + 1), u) * 2 - 1;
  }

  function rgba(hex, a) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  var _bufs = {};
  function buf(key, w, h) {
    var b = _bufs[key] || (_bufs[key] = document.createElement('canvas'));
    if (b.width !== w || b.height !== h) { b.width = w; b.height = h; }
    return b;
  }

  function placeholder(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#26133a'); g.addColorStop(0.5, '#170e28'); g.addColorStop(1, '#0c0a18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // Glowing subtle neon grid
    ctx.save();
    ctx.strokeStyle = 'rgba(236, 72, 153, 0.22)'; ctx.lineWidth = 1;
    for (var x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (var y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    
    // Anime character circular avatar placeholder
    var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.22;
    var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cg.addColorStop(0, 'rgba(56, 189, 248, 0.45)'); cg.addColorStop(1, 'rgba(236, 72, 153, 0.12)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();

    // Stylized crosshair center
    ctx.strokeStyle = '#ec4899'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
    ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
    ctx.stroke();

    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 12px IBM Plex Sans JP, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('AMV STAGE PREVIEW', cx, cy + r + 22);
    ctx.restore();
  }

  function drawSrc(ctx, src, w, h, isPreview) {
    if (typeof src === 'function') {
      src(ctx, w, h);
    } else if (src && src.width && src.height) {
      ctx.drawImage(src, 0, 0, w, h);
    } else if (isPreview) {
      placeholder(ctx, w, h);
    }
  }

  function snap(key, src, w, h, isPreview) {
    var b = buf(key, w, h), c = b.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.clearRect(0, 0, w, h); drawSrc(c, src, w, h, isPreview);
    return b;
  }

  function tinted(key, src, color, w, h, isPreview) {
    var b = snap(key, src, w, h, isPreview), c = b.getContext('2d');
    c.globalCompositeOperation = 'multiply'; c.fillStyle = color; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'source-over';
    return b;
  }

  // WebGL Runner for Chromatic/Barrel shader
  var _gl = {};
  function glRun(key, frag, src, w, h, u, isPreview) {
    var s = _gl[key];
    if (!s) {
      var cv = document.createElement('canvas');
      var gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: true });
      if (!gl) return null;
      var mk = function (type, code) {
        var sh = gl.createShader(type); gl.shaderSource(sh, code); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
        return sh;
      };
      var vs = mk(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*0.5+0.5;gl_Position=vec4(p,0.,1.);}');
      var fs = mk(gl.FRAGMENT_SHADER, frag);
      if (!vs || !fs) return null;
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      s = _gl[key] = { cv: cv, gl: gl, pr: pr, tex: tex };
    }
    var g = s.gl;
    if (s.cv.width !== w || s.cv.height !== h) { s.cv.width = w; s.cv.height = h; }
    g.viewport(0, 0, w, h); g.useProgram(s.pr);
    var loc = g.getAttribLocation(s.pr, 'p'); g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, true);
    g.bindTexture(g.TEXTURE_2D, s.tex);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, snap('gl_' + key, src, w, h, isPreview));
    g.uniform1i(g.getUniformLocation(s.pr, 'uTex'), 0);
    g.uniform2f(g.getUniformLocation(s.pr, 'uRes'), w, h);
    for (var k in u) g.uniform1f(g.getUniformLocation(s.pr, k), u[k]);
    g.clearColor(0, 0, 0, 0); g.clear(g.COLOR_BUFFER_BIT);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    return s.cv;
  }

  var ASSETS = [];
  var N = function (v, min, max, step) { return { value: v, min: min, max: max, step: step }; };
  var C = function (v) { return { value: v }; };

  function A(id, name, category, params, render, applyCameraTransform) {
    var a = {
      id: id,
      name: name,
      category: category,
      params: params,
      render: render,
      applyCameraTransform: applyCameraTransform || null
    };
    ASSETS.push(a);
    return a;
  }

  function getActiveProjectScheme(plan, t) {
    try {
      plan = plan || (root.S && root.S.plan);
      if (!plan) return null;
      var curT = (t !== undefined) ? t : ((root.S && root.S.exportT !== undefined) ? root.S.exportT : (root.S && root.S.t) || 0);
      var cut = (root.J && root.J.cutAt) ? root.J.cutAt(plan, curT) : (plan.cuts && plan.cuts[0]);
      var st = plan.style;
      if (cut && cut.customScheme) return cut.customScheme;
      if (st && st.schemes && st.schemes.length > 0) {
        var idx = cut ? (cut.scheme % st.schemes.length) : 0;
        return st.schemes[idx] || st.schemes[0];
      }
    } catch (e) {}
    return null;
  }

  function mapParamToSchemeColor(key, sc) {
    if (!sc) return '#06b6d4';
    var lk = String(key || '').toLowerCase();
    if (lk.indexOf('secondary') !== -1 || lk.indexOf('color2') !== -1 || lk.indexOf('barcolor') !== -1 || lk.indexOf('corecolor') !== -1) {
      return sc.accent2 || sc.fg || '#ec4899';
    }
    if (lk.indexOf('cap') !== -1 || lk.indexOf('color3') !== -1 || lk.indexOf('horizon') !== -1 || lk.indexOf('text') !== -1 || lk.indexOf('dot') !== -1) {
      return sc.fg || sc.ghostA || '#ffffff';
    }
    if (lk.indexOf('bg') !== -1 || lk.indexOf('shadow') !== -1 || lk.indexOf('dark') !== -1) {
      return sc.bg || '#0c0a18';
    }
    if (lk.indexOf('sub') !== -1 || lk.indexOf('ring') !== -1 || lk.indexOf('amber') !== -1 || lk.indexOf('flare') !== -1) {
      return sc.ghostA || sc.sub || sc.accent || '#38bdf8';
    }
    return sc.accent || '#06b6d4';
  }

  function resolve(asset, over) {
    var o = {}, k; over = over || {};
    for (k in asset.params) o[k] = over[k] !== undefined ? over[k] : asset.params[k].value;
    for (k in over) if (!(k in o)) o[k] = over[k];

    if (over.__themeSync || over.themeSync) {
      var sc = over.sc || getActiveProjectScheme(over.plan, over.t);
      if (sc) {
        for (var pKey in asset.params) {
          var pVal = asset.params[pKey] && asset.params[pKey].value;
          if ((typeof pVal === 'string' && pVal.charAt(0) === '#') || pKey.toLowerCase().indexOf('color') !== -1) {
            o[pKey] = mapParamToSchemeColor(pKey, sc);
          }
        }
      }
    }
    return o;
  }

  // =====================================================================
  // 1. BỐ CỤC (Layout & Multi-Frame)
  // =====================================================================
  var CAT_LAYOUT = 'Bố cục';

  A('layout_split_diagonal', 'Chia màn hình chéo', CAT_LAYOUT, {
    count: N(3, 2, 6, 1), angle: N(12, 0, 30, 1), gap: N(8, 0, 30, 1),
    border: N(3, 0, 12, 1), color: C('#ffffff')
  }, function (ctx, w, h, t, p) {
    var n = p.count | 0, sk = Math.tan(p.angle * Math.PI / 180) * h / 2, g = p.gap / 2;
    var path = function (i) {
      var x0 = i * w / n, x1 = (i + 1) * w / n;
      ctx.beginPath();
      ctx.moveTo(x0 + sk + g, 0); ctx.lineTo(x1 + sk - g, 0);
      ctx.lineTo(x1 - sk - g, h); ctx.lineTo(x0 - sk + g, h); ctx.closePath();
    };
    for (var i = 0; i < n; i++) {
      ctx.save();
      path(i); ctx.clip();
      ctx.translate(w / 2, h / 2); ctx.scale(1.04, 1.04); ctx.translate(-w / 2, -h / 2);
      drawSrc(ctx, p.source, w, h, p.__preview);
      ctx.restore();
      if (p.border > 0) {
        ctx.save(); path(i);
        ctx.lineWidth = p.border; ctx.strokeStyle = p.color; ctx.stroke(); ctx.restore();
      }
    }
  });

  A('layout_manga_panels', 'Khung truyện tranh Manga', CAT_LAYOUT, {
    rows: N(3, 1, 4, 1), slant: N(0.12, 0, 0.35, 0.01), gap: N(10, 2, 24, 1),
    border: N(4, 0, 12, 1), seed: N(7, 1, 99, 1), color: C('#ffffff')
  }, function (ctx, w, h, t, p) {
    var rnd = rng(p.seed), rows = p.rows | 0, rowH = h / rows, g = p.gap / 2;
    for (var r = 0; r < rows; r++) {
      var cols = 1 + ((rnd() * 2) | 0), ws = [], sum = 0, c;
      for (c = 0; c < cols; c++) { ws[c] = 0.8 + rnd() * 0.4; sum += ws[c]; }
      var slant = p.slant * rowH, xb = 0, y = r * rowH;
      for (c = 0; c < cols; c++) {
        var xr = xb + ws[c] / sum * w, outL = c === 0, outR = c === cols - 1;
        var Lt = xb + (outL ? 0 : slant), Lb = xb - (outL ? 0 : slant);
        var Rt = xr + (outR ? 0 : slant), Rb = xr - (outR ? 0 : slant);
        var path = function () {
          ctx.beginPath();
          ctx.moveTo(Lt + g, y + g); ctx.lineTo(Rt - g, y + g);
          ctx.lineTo(Rb - g, y + rowH - g); ctx.lineTo(Lb + g, y + rowH - g); ctx.closePath();
        };
        ctx.save();
        path(); ctx.clip();
        ctx.translate(w / 2, h / 2); ctx.scale(1.08, 1.08); ctx.translate(-w / 2, -h / 2);
        drawSrc(ctx, p.source, w, h, p.__preview);
        ctx.restore();
        if (p.border > 0) {
          ctx.save(); path(); ctx.lineWidth = p.border; ctx.strokeStyle = p.color; ctx.stroke(); ctx.restore();
        }
        xb = xr;
      }
    }
  });

  A('layout_cinematic_letterbox', 'Khung điện ảnh 2.39:1 Anamorphic', CAT_LAYOUT, {
    matteRatio: N(0.12, 0.04, 0.22, 0.01), glow: N(1, 0, 1, 1), color: C('#ffffff')
  }, function (ctx, w, h, t, p) {
    if (!p.__overlayOnly) {
      drawSrc(ctx, p.source, w, h, p.__preview);
    }
    var barH = h * p.matteRatio;
    ctx.save();
    ctx.fillStyle = '#06050b';
    ctx.fillRect(0, 0, w, barH);
    ctx.fillRect(0, h - barH, w, barH);

    // Fine cinematic rule lines
    if (p.glow > 0) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, barH); ctx.lineTo(w, barH);
      ctx.moveTo(0, h - barH); ctx.lineTo(w, h - barH);
      ctx.stroke();

      // Cinematic corner markers
      var m = 20, len = 14;
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(m, barH + m + len); ctx.lineTo(m, barH + m); ctx.lineTo(m + len, barH + m);
      ctx.moveTo(w - m - len, barH + m); ctx.lineTo(w - m, barH + m); ctx.lineTo(w - m, barH + m + len);
      ctx.moveTo(m, h - barH - m - len); ctx.lineTo(m, h - barH - m); ctx.lineTo(m + len, h - barH - m);
      ctx.moveTo(w - m - len, h - barH - m); ctx.lineTo(w - m, h - barH - m); ctx.lineTo(w - m, h - barH - m - len);
      ctx.stroke();
    }
    ctx.restore();
  });

  A('layout_tri_split', 'Chia 3 dọc phong cách AMV', CAT_LAYOUT, {
    gap: N(10, 0, 30, 1), zoomSide: N(1.2, 1, 1.8, 0.05), border: N(3, 0, 10, 1)
  }, function (ctx, w, h, t, p) {
    var colW = (w - p.gap * 2) / 3;
    for (var i = 0; i < 3; i++) {
      var x = i * (colW + p.gap);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, 0, colW, h); ctx.clip();
      ctx.translate(w / 2, h / 2);
      if (i !== 1) ctx.scale(p.zoomSide, p.zoomSide);
      else ctx.scale(1.05, 1.05);
      ctx.translate(-w / 2, -h / 2);
      drawSrc(ctx, p.source, w, h, p.__preview);
      ctx.restore();
      if (p.border > 0) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = p.border;
        ctx.strokeRect(x, 0, colW, h);
      }
    }
  });

  A('layout_focus_target', 'Khung ngắm tâm điểm HUD', CAT_LAYOUT, {
    scale: N(1.15, 1.0, 1.5, 0.05), color: C('#38bdf8'), reticleSize: N(60, 30, 120, 2)
  }, function (ctx, w, h, t, p) {
    if (!p.__overlayOnly) {
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(p.scale, p.scale); ctx.translate(-w / 2, -h / 2);
      drawSrc(ctx, p.source, w, h, p.__preview);
      ctx.restore();
    }

    var cx = w / 2, cy = h / 2, r = p.reticleSize;
    ctx.save();
    ctx.strokeStyle = p.color; ctx.lineWidth = 2; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    // Circular reticle
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    // 4 Corner HUD brackets
    var m = 40, sz = 24;
    ctx.beginPath();
    ctx.moveTo(m, m + sz); ctx.lineTo(m, m); ctx.lineTo(m + sz, m);
    ctx.moveTo(w - m - sz, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + sz);
    ctx.moveTo(m, h - m - sz); ctx.lineTo(m, h - m); ctx.lineTo(m + sz, h - m);
    ctx.moveTo(w - m - sz, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - sz);
    ctx.stroke();

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - r - 15, cy); ctx.lineTo(cx - r + 5, cy);
    ctx.moveTo(cx + r - 5, cy); ctx.lineTo(cx + r + 15, cy);
    ctx.moveTo(cx, cy - r - 15); ctx.lineTo(cx, cy - r + 5);
    ctx.moveTo(cx, cy + r - 5); ctx.lineTo(cx, cy + r + 15);
    ctx.stroke();
    ctx.restore();
  });

  A('layout_quad_grid', 'Bố cục 4 ô nhịp điệu', CAT_LAYOUT, {
    gap: N(8, 0, 24, 1), border: N(3, 0, 8, 1), color: C('#ffffff')
  }, function (ctx, w, h, t, p) {
    var hw = (w - p.gap) / 2, hh = (h - p.gap) / 2;
    var coords = [
      { x: 0, y: 0 },
      { x: hw + p.gap, y: 0 },
      { x: 0, y: hh + p.gap },
      { x: hw + p.gap, y: hh + p.gap }
    ];
    for (var i = 0; i < 4; i++) {
      var pt = coords[i];
      ctx.save();
      ctx.beginPath(); ctx.rect(pt.x, pt.y, hw, hh); ctx.clip();
      ctx.translate(w / 2, h / 2); ctx.scale(1.08, 1.08); ctx.translate(-w / 2, -h / 2);
      drawSrc(ctx, p.source, w, h, p.__preview);
      ctx.restore();
      if (p.border > 0) {
        ctx.strokeStyle = p.color; ctx.lineWidth = p.border;
        ctx.strokeRect(pt.x, pt.y, hw, hh);
      }
    }
  });

  // =====================================================================
  // 2. ĐỨNG (Idle Motion)
  // =====================================================================
  var CAT_IDLE = 'Đứng';

  A('idle_parallax_float', 'Trôi nổi Parallax đa lớp', CAT_IDLE, {
    intensity: N(1.0, 0.1, 2.5, 0.1), speed: N(1, 0.5, 3, 0.1), tilt: N(0.012, 0, 0.04, 0.002)
  }, function (ctx, w, h, t, p) {
    var ph = t * p.speed * TAU;
    var tx = Math.cos(ph) * w * 0.012 * p.intensity;
    var ty = Math.sin(ph * 0.8) * h * 0.018 * p.intensity;
    var rot = Math.sin(ph) * p.tilt * p.intensity;
    ctx.save();
    ctx.translate(w / 2 + tx, h / 2 + ty);
    ctx.rotate(rot);
    ctx.scale(1.04, 1.04);
    ctx.translate(-w / 2, -h / 2);
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();
  });

  A('idle_breathe', 'Hít thở tự nhiên (Breathe)', CAT_IDLE, {
    intensity: N(1.0, 0.1, 2.5, 0.1), speed: N(1, 0.5, 3, 0.1)
  }, function (ctx, w, h, t, p) {
    var phase = Math.sin(t * p.speed * TAU);
    var sx = 1.0 + 0.012 * p.intensity * phase;
    var sy = 1.0 + 0.024 * p.intensity * phase;
    ctx.save();
    ctx.translate(w / 2, h * 0.65);
    ctx.scale(sx, sy);
    ctx.translate(-w / 2, -h * 0.65);
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();
  });

  A('idle_glow_pulse', 'Nhịp hào quang phát sáng', CAT_IDLE, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1), color: C('#ec4899')
  }, function (ctx, w, h, t, p) {
    var k = 0.5 + 0.5 * Math.sin(t * p.speed * TAU - Math.PI / 2);
    ctx.save();
    ctx.shadowColor = p.color;
    ctx.shadowBlur = (8 + 36 * k) * p.intensity;
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();
  });

  A('idle_levitate_wings', 'Lơ lửng không trọng lực', CAT_IDLE, {
    intensity: N(1.0, 0.1, 2.5, 0.1), speed: N(1, 0.5, 3, 0.1), motes: N(16, 4, 40, 1)
  }, function (ctx, w, h, t, p) {
    var ph = t * p.speed * TAU;
    var ty = Math.sin(ph) * h * 0.02 * p.intensity;
    var rot = Math.cos(ph) * 0.008 * p.intensity;
    ctx.save();
    ctx.translate(w / 2, h / 2 + ty);
    ctx.rotate(rot);
    ctx.scale(1.03, 1.03);
    ctx.translate(-w / 2, -h / 2);
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#38bdf8'; ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 6;
    for (var i = 0; i < p.motes; i++) {
      var seed = (i * 97) % 100;
      var my = (h - ((t * 0.4 + seed / 100) % 1) * h);
      var mx = (seed * 17) % w + Math.sin(ph + i) * 12;
      var sz = 1.5 + (seed % 3);
      ctx.globalAlpha = clamp(Math.sin((my / h) * Math.PI) * 0.65 * p.intensity);
      ctx.beginPath(); ctx.arc(mx, my, sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
  });

  A('idle_heartbeat_pulse', 'Nhịp đập con tim (Beat Punch)', CAT_IDLE, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1)
  }, function (ctx, w, h, t, p) {
    var cycle = (t * p.speed) % 1;
    var p1 = Math.exp(-Math.pow((cycle - 0.12) / 0.06, 2));
    var p2 = Math.exp(-Math.pow((cycle - 0.28) / 0.06, 2)) * 0.7;
    var pulse = (p1 + p2) * 0.038 * p.intensity;
    var s = 1.0 + pulse;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.translate(-w / 2, -h / 2);
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();
  });

  A('idle_shadow_echo', 'Bóng mờ vọng lại (Ghost Echo)', CAT_IDLE, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1)
  }, function (ctx, w, h, t, p) {
    var ph = t * p.speed * TAU;
    var tx = Math.sin(ph) * w * 0.015 * p.intensity;
    var ty = Math.cos(ph) * h * 0.015 * p.intensity;
    ctx.save();
    ctx.globalAlpha = clamp(0.35 * p.intensity);
    ctx.translate(w / 2 - tx * 0.8, h / 2 - ty * 0.8);
    ctx.translate(-w / 2, -h / 2);
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();

    ctx.save();
    ctx.translate(w / 2 + tx, h / 2 + ty);
    ctx.translate(-w / 2, -h / 2);
    drawSrc(ctx, p.source, w, h, p.__preview);
    ctx.restore();
  });

  // =====================================================================
  // 3. TRANG TRÍ (Decorations & Overlays)
  // =====================================================================
  var CAT_DECO = 'Trang trí';

  A('deco_speed_lines', 'Tia tốc độ Anime (Action Focus)', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), count: N(45, 15, 90, 1), color: C('#ffffff'), speed: N(1, 0.5, 4, 0.5)
  }, function (ctx, w, h, t, p) {
    var cx = w / 2, cy = h / 2, R = Math.hypot(w, h) * 0.58;
    var innerR = Math.min(w, h) * 0.28;
    var n = p.count | 0;
    var rnd = rng(Math.floor(t * 18 * p.speed) + 42);
    ctx.save();
    ctx.strokeStyle = p.color;
    for (var i = 0; i < n; i++) {
      var angle = (i / n) * TAU + (rnd() - 0.5) * 0.08;
      var len = innerR + rnd() * (R - innerR) * 0.65;
      var thick = (1 + rnd() * 3) * p.intensity;
      ctx.globalAlpha = clamp((0.25 + rnd() * 0.65) * p.intensity);
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
      ctx.stroke();
    }
    ctx.restore();
  });

  A('deco_edge_aura', 'Hào quang kiếm khí bám viền Nhân vật (Edge Aura)', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1.0, 0.2, 3, 0.1), color: C('#16f4d4'), mode: C('#ec4899')
  }, function (ctx, w, h, t, p) {
    var cx = (typeof p.charX === 'number') ? p.charX : (w * 0.5);
    var cy = (typeof p.charY === 'number') ? p.charY : (h * 0.55);
    var cw = (typeof p.charW === 'number') ? p.charW : (w * 0.3);
    var ch = (typeof p.charH === 'number') ? p.charH : (h * 0.6);
    var ph = t * p.speed * TAU;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var auraGrad = ctx.createRadialGradient(cx, cy, cw * 0.2, cx, cy, Math.max(cw, ch) * 0.7);
    auraGrad.addColorStop(0, rgba(p.color || '#16f4d4', 0.45 * p.intensity));
    auraGrad.addColorStop(0.6, rgba(p.mode || '#ec4899', 0.25 * p.intensity));
    auraGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, cw * (0.65 + 0.05 * Math.sin(ph * 1.5)), ch * (0.55 + 0.04 * Math.cos(ph)), 0, 0, TAU);
    ctx.fill();

    var sparkCount = Math.round(18 * p.intensity);
    var rnd = rng(Math.floor(t * 18) + 97);
    ctx.strokeStyle = p.color || '#16f4d4';
    ctx.lineWidth = 2;
    ctx.shadowColor = p.color || '#16f4d4';
    ctx.shadowBlur = 10;

    for (var s = 0; s < sparkCount; s++) {
      var angle = rnd() * TAU;
      var rx = cx + Math.cos(angle) * (cw * 0.45 + rnd() * 18);
      var ry = cy + Math.sin(angle) * (ch * 0.45 + rnd() * 24);
      var len = (8 + rnd() * 22) * p.intensity;
      var arc = angle + (rnd() - 0.5) * 0.8;
      ctx.globalAlpha = clamp((0.4 + rnd() * 0.6) * p.intensity);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(arc) * len, ry + Math.sin(arc) * len);
      ctx.stroke();
    }
    ctx.restore();
  });

  A('deco_contour_slash', 'Vết chém Katana cắt xuyên thân Nhân vật', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1.0, 0.5, 3, 0.2), color: C('#38bdf8'), angle: N(-30, -75, 75, 5)
  }, function (ctx, w, h, t, p) {
    var cycle = (t * p.speed * 1.8) % 1;
    if (cycle > 0.40) return;
    var pr = cycle / 0.40;

    var cx = (typeof p.charX === 'number') ? p.charX : (w * 0.5);
    var cy = (typeof p.charY === 'number') ? p.charY : (h * 0.55);
    var slashLen = Math.max(w * 0.5, h * 0.65);
    var rad = (p.angle || -30) * Math.PI / 180;
    var cos = Math.cos(rad), sin = Math.sin(rad);

    var startX = cx - cos * slashLen * 0.5;
    var startY = cy - sin * slashLen * 0.5;
    var endX = cx + cos * slashLen * 0.5;
    var endY = cy + sin * slashLen * 0.5;

    var curX = lerp(startX, endX, pr);
    var curY = lerp(startY, endY, pr);
    var alpha = Math.sin(pr * Math.PI) * p.intensity;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.color || '#38bdf8';
    ctx.shadowColor = p.color || '#38bdf8';
    ctx.shadowBlur = 18;
    ctx.lineWidth = (3 + (1 - pr) * 8) * p.intensity;
    ctx.globalAlpha = alpha;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(curX, curY);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (pr > 0.35 && pr < 0.65) {
      var sparkProg = (pr - 0.35) / 0.30;
      var sparkSz = Math.sin(sparkProg * Math.PI) * 45 * p.intensity;
      ctx.fillStyle = '#ffffff';
      ctx.shadowBlur = sparkSz;
      ctx.beginPath();
      ctx.arc(cx, cy, sparkSz * 0.3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  });

  A('deco_slash_marks', 'Vết chém kiếm khí Anime (Katana Slash)', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.5), color: C('#38bdf8')
  }, function (ctx, w, h, t, p) {
    var cycle = (t * p.speed * 2) % 1;
    if (cycle > 0.45) return;
    var pr = cycle / 0.45;
    var x0 = lerp(w * 0.1, w * 0.9, pr);
    var y0 = lerp(h * 0.85, h * 0.15, pr);
    var slashLen = w * 0.45;
    var alpha = (1 - pr) * p.intensity;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 18;
    ctx.lineWidth = (4 + (1 - pr) * 8) * p.intensity;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(x0 - slashLen * 0.5, y0 + slashLen * 0.35);
    ctx.lineTo(x0 + slashLen * 0.5, y0 - slashLen * 0.35);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0 - slashLen * 0.5, y0 + slashLen * 0.35);
    ctx.lineTo(x0 + slashLen * 0.5, y0 - slashLen * 0.35);
    ctx.stroke();
    ctx.restore();
  });

  A('deco_sparkles', 'Tinh thể lấp lánh (Sparkles)', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1), color: C('#fff4bc'), count: N(36, 10, 80, 1)
  }, function (ctx, w, h, t, p) {
    var rnd = rng(17);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.color; ctx.shadowColor = p.color;
    for (var i = 0; i < p.count; i++) {
      var x0 = rnd(), y0 = rnd(), ph = rnd() * TAU, sz = (6 + rnd() * 14) * p.intensity;
      var tw = Math.max(0, Math.sin(t * p.speed * TAU + ph)); tw = tw * tw * tw;
      if (tw < 0.05) continue;
      var x = x0 * w, y = y0 * h, s = sz * tw;
      ctx.globalAlpha = tw; ctx.shadowBlur = s;
      ctx.beginPath();
      ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y);
      ctx.quadraticCurveTo(x, y, x, y + s); ctx.quadraticCurveTo(x, y, x - s, y);
      ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
    }
    ctx.restore();
  });

  A('deco_film_fx', 'Bụi phim + Hạt Grain + Xước cũ', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), grain: N(0.08, 0, 0.25, 0.01), scratches: N(3, 0, 8, 1)
  }, function (ctx, w, h, t, p) {
    var rnd = rng(Math.floor(t * 24) + 1);
    ctx.save();
    var v = ctx.createRadialGradient(w / 2, h / 2, h * 0.38, w / 2, h / 2, Math.hypot(w, h) * 0.55);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,' + clamp(0.55 * p.intensity) + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'; ctx.lineWidth = 1;
    for (var s = 0; s < p.scratches; s++) {
      if (rnd() > 0.6) continue;
      var sx = rnd() * w;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + (rnd() - 0.5) * 8, h); ctx.stroke();
    }
    ctx.restore();
  });

  A('deco_light_leak', 'Rò sáng nghệ thuật (Light Leak)', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1), color: C('#f59e0b')
  }, function (ctx, w, h, t, p) {
    var ph = t * p.speed * TAU;
    var x = (0.2 + Math.sin(ph) * 0.2) * w;
    var y = (0.2 + Math.cos(ph * 0.7) * 0.2) * h;
    var r = Math.min(w, h) * 0.65;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(p.color, 0.5 * p.intensity));
    g.addColorStop(0.5, rgba('#ec4899', 0.25 * p.intensity));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });

  A('deco_floating_petals', 'Cánh hoa Sakura rơi', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), count: N(28, 8, 60, 1), speed: N(1, 0.5, 3, 0.1), color: C('#fbcfe8')
  }, function (ctx, w, h, t, p) {
    var rnd = rng(31);
    ctx.save();
    ctx.fillStyle = p.color; ctx.shadowColor = '#f472b6'; ctx.shadowBlur = 6;
    for (var i = 0; i < p.count; i++) {
      var seed = rnd();
      var py = ((t * 0.35 * p.speed + seed) % 1) * (h + 40) - 20;
      var px = (seed * w * 1.8 + Math.sin(t * 2 + i) * 35) % w;
      var rot = (t * 2 + seed * 10);
      var sz = 6 + seed * 8;
      ctx.globalAlpha = clamp((0.4 + 0.5 * Math.sin(t + seed * 5)) * p.intensity);
      ctx.save();
      ctx.translate(px, py); ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, sz, sz * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  });

  A('deco_fire_embers', 'Tàn lửa bốc lên (Fire Embers)', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), count: N(35, 10, 80, 1), speed: N(1, 0.5, 3, 0.1), color: C('#ff5a1f')
  }, function (ctx, w, h, t, p) {
    var rnd = rng(79);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < p.count; i++) {
      var seed = rnd();
      var ey = (h + 20) - ((t * 0.5 * p.speed + seed) % 1) * (h + 40);
      var ex = (seed * w + Math.sin(t * 3 + seed * 20) * 25) % w;
      var sz = (2 + seed * 5) * p.intensity;
      var alpha = Math.sin((ey / h) * Math.PI) * p.intensity;
      ctx.fillStyle = seed > 0.4 ? p.color : '#ffd166';
      ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = sz * 2;
      ctx.globalAlpha = clamp(alpha);
      ctx.beginPath(); ctx.arc(ex, ey, sz, 0, TAU); ctx.fill();
    }
    ctx.restore();
  });

  A('deco_cyber_hud', 'Giao diện tương lai Cyber HUD', CAT_DECO, {
    intensity: N(1.0, 0.1, 3, 0.1), color: C('#16f4d4')
  }, function (ctx, w, h, t, p) {
    ctx.save();
    ctx.strokeStyle = p.color; ctx.fillStyle = p.color;
    ctx.lineWidth = 1.5; ctx.shadowColor = p.color; ctx.shadowBlur = 6;
    ctx.globalAlpha = clamp(0.75 * p.intensity);

    var m = 28, sz = 32;
    ctx.beginPath();
    ctx.moveTo(m, m + sz); ctx.lineTo(m, m); ctx.lineTo(m + sz, m);
    ctx.moveTo(w - m - sz, m); ctx.lineTo(w - m, m); ctx.lineTo(w - m, m + sz);
    ctx.moveTo(m, h - m - sz); ctx.lineTo(m, h - m); ctx.lineTo(m + sz, h - m);
    ctx.moveTo(w - m - sz, h - m); ctx.lineTo(w - m, h - m); ctx.lineTo(w - m, h - m - sz);
    ctx.stroke();

    var cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.32;
    ctx.beginPath(); ctx.arc(cx, cy, r, t * TAU, t * TAU + Math.PI * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r, t * TAU + Math.PI, t * TAU + Math.PI * 1.7); ctx.stroke();

    ctx.font = 'bold 10px monospace';
    ctx.fillText('REC [4K 60FPS]', m + 40, m + 14);
    ctx.fillText('SYNC: BEAT LOCK', w - m - 120, m + 14);
    ctx.restore();
  });

  // =====================================================================
  // 4. CAMERA (Cố định trục xoay W/2, H/2 - Tự động bù biên Overscan)
  // =====================================================================
  var CAT_CAMERA = 'Camera';

  function getCameraAnchor(w, h, p) {
    var cx = (p && typeof p.targetX === 'number' && !isNaN(p.targetX)) ? p.targetX : (w / 2);
    var cy = (p && typeof p.targetY === 'number' && !isNaN(p.targetY)) ? p.targetY : (h / 2);
    return { cx: cx, cy: cy };
  }

  function applyShake(ctx, w, h, t, p) {
    var freq = (p.frequency || 12) * (p.speed || 1);
    var ph = t * TAU * freq;
    var amp = w * 0.015 * p.intensity;
    var tx = Math.sin(ph * 0.7) * amp;
    var ty = Math.cos(ph * 0.9) * amp * 0.75;
    var rot = Math.sin(ph) * 0.012 * p.intensity;
    var s = 1.08 + 0.03 * p.intensity;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-anc.cx + tx, -anc.cy + ty);
  }
  A('cam_shake', 'Rung chấn Beat Shake', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.2, 3.0, 0.1), frequency: N(12, 4, 24, 1)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyShake(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, applyShake);

  function applyDolly(ctx, w, h, t, p) {
    var phase = 0.5 - 0.5 * Math.cos(t * TAU * p.speed * 0.5);
    var s = 1.04 + 0.14 * p.intensity * phase;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.scale(s, s);
    ctx.translate(-anc.cx, -anc.cy);
  }
  A('cam_dolly_zoom', 'Dolly Zoom Vertigo tuần hoàn', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1), vignette: N(0.4, 0, 1, 0.05)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyDolly(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
    if (p.vignette > 0) {
      var phase = 0.5 - 0.5 * Math.cos(t * TAU * p.speed * 0.5);
      var g = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (p.vignette * phase) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
  }, applyDolly);

  function applyWhipSnap(ctx, w, h, t, p) {
    var period = Math.max(0.6, 2.0 / (p.speed || 1));
    var cycle = (t % period) / period;
    var whip = Math.sin(cycle * TAU) * Math.exp(-cycle * 4.2);
    var tx = whip * w * 0.075 * p.intensity * (p.direction || 1);
    var rot = whip * 0.018 * p.intensity * (p.direction || 1);
    var s = 1.10 + Math.abs(whip) * 0.06 * p.intensity;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-anc.cx + tx, -anc.cy);
  }
  A('cam_whip_snap', 'Lia nhanh Whip Snap có đệm hồi tâm', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1), direction: N(1, -1, 1, 2)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyWhipSnap(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, applyWhipSnap);

  function applyBeatPunch(ctx, w, h, t, p) {
    var beats = p.beats || 2;
    var beatCycle = (t * beats * p.speed) % 1;
    var punch = Math.pow(1 - beatCycle, 3.2) * (p.punch || 0.16) * p.intensity;
    var s = 1.03 + punch;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.scale(s, s);
    ctx.translate(-anc.cx, -anc.cy);
  }
  A('cam_beat_punch', 'Cú đấm nhịp Beat Punch Zoom', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1), beats: N(2, 1, 4, 1), punch: N(0.18, 0.05, 0.4, 0.02)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyBeatPunch(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, applyBeatPunch);

  function apply3DTilt(ctx, w, h, t, p) {
    var ph = t * TAU * p.speed * 0.5;
    var rot = Math.sin(ph) * (p.tiltAngle || 0.03) * p.intensity;
    var tx = Math.cos(ph * 0.8) * w * 0.018 * p.intensity;
    var ty = Math.sin(ph * 1.2) * h * 0.012 * p.intensity;
    var s = 1.08 + 0.02 * p.intensity;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-anc.cx + tx, -anc.cy + ty);
  }
  A('cam_3d_tilt', 'Xoay nghiêng 3D Perspective Tilt', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1), tiltAngle: N(0.035, 0.01, 0.08, 0.005)
  }, function (ctx, w, h, t, p) {
    ctx.save(); apply3DTilt(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, apply3DTilt);

  function applyCrashZoom(ctx, w, h, t, p) {
    var period = Math.max(1.0, 3.0 / (p.speed || 1));
    var cycle = (t % period) / period;
    var zoomPhase = cycle < 0.22 ? E.outExpo(cycle / 0.22) : (cycle < 0.65 ? 1.0 : E.outCubic(1 - (cycle - 0.65) / 0.35));
    var s = 1.04 + ((p.targetScale || 1.45) - 1.04) * zoomPhase * p.intensity;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.scale(s, s);
    ctx.translate(-anc.cx, -anc.cy);
  }
  A('cam_crash_zoom', 'Crash Zoom cận cảnh tâm điểm', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1), targetScale: N(1.45, 1.2, 2.2, 0.1)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyCrashZoom(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, applyCrashZoom);

  function applyOrbit(ctx, w, h, t, p) {
    var ph = t * TAU * p.speed * 0.4;
    var rx = Math.cos(ph) * w * 0.02 * p.intensity;
    var ry = Math.sin(ph) * h * 0.012 * p.intensity;
    var rot = Math.sin(ph) * 0.012 * p.intensity;
    var s = 1.06 + 0.02 * p.intensity;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.rotate(rot);
    ctx.scale(s, s);
    ctx.translate(-anc.cx + rx, -anc.cy + ry);
  }
  A('cam_orbit_pan', 'Lia góc quay quỹ đạo tròn', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyOrbit(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, applyOrbit);

  function applyTargetLock(ctx, w, h, t, p) {
    var tx = Math.sin(t * TAU * 0.6 * p.speed) * w * 0.016 * p.intensity;
    var ty = Math.sin(t * TAU * 1.1 * p.speed) * h * 0.012 * p.intensity;
    var s = 1.05 + 0.02 * p.intensity;
    var anc = getCameraAnchor(w, h, p);
    ctx.translate(anc.cx, anc.cy);
    ctx.scale(s, s);
    ctx.translate(-anc.cx + tx, -anc.cy + ty);
  }
  A('cam_target_lock', 'Bám đuổi chủ thể mềm mại', CAT_CAMERA, {
    intensity: N(1.0, 0.1, 3.0, 0.1), speed: N(1.0, 0.5, 3.0, 0.1)
  }, function (ctx, w, h, t, p) {
    ctx.save(); applyTargetLock(ctx, w, h, t, p); drawSrc(ctx, p.source, w, h, p.__preview); ctx.restore();
  }, applyTargetLock);

  // =====================================================================
  // 5. HIỆU ỨNG MÀN HÌNH (Screen FX)
  // =====================================================================
  var CAT_SCREEN = 'Hiệu ứng màn hình';

  A('fx_rgb_glitch', 'Glitch tách RGB + cắt lát', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.2, 4, 0.1), slices: N(8, 2, 20, 1)
  }, function (ctx, w, h, t, p) {
    var frame = Math.floor(t * 24 * p.speed), rnd = rng(frame * 7919 + 13), burst = rnd() < 0.6 ? 1 : 0.15;
    var R = tinted('glR', p.source, '#ff0000', w, h, p.__preview), Cy = tinted('glC', p.source, '#00ffff', w, h, p.__preview);
    var d = w * 0.008 * p.intensity * burst;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(Cy, -d, 0); ctx.drawImage(R, d, 0);
    for (var i = 0; i < p.slices; i++) {
      var sy = rnd() * h, sh = rnd() * h * 0.08 + 4, dx = (rnd() - 0.5) * w * 0.12 * p.intensity * burst;
      if (burst < 1) continue;
      ctx.drawImage(R, 0, sy, w, sh, dx + d, sy, w, sh); ctx.drawImage(Cy, 0, sy, w, sh, dx - d, sy, w, sh);
    }
    ctx.restore();
  });

  A('fx_crt_scanlines', 'Màn hình CRT: Scanlines + Cong viền', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1), line: N(3, 2, 8, 1)
  }, function (ctx, w, h, t, p) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(0.25 * p.intensity) + ')';
    for (var y = 0; y < h; y += p.line) ctx.fillRect(0, y, w, 1);
    var by = ((t * p.speed) % 1) * (h + h * 0.3) - h * 0.15;
    var bg = ctx.createLinearGradient(0, by - h * 0.12, 0, by + h * 0.12);
    bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.5, 'rgba(255,255,255,' + 0.08 * p.intensity + ')'); bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, by - h * 0.12, w, h * 0.24);

    var v = ctx.createRadialGradient(w / 2, h / 2, h * 0.4, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,' + clamp(0.6 * p.intensity) + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });

  A('fx_bloom', 'Dreamy Bloom phát quang', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), radius: N(1.5, 1, 3, 0.5)
  }, function (ctx, w, h, t, p) {
    var s = Math.max(4, Math.round(8 * p.radius)), sw = Math.max(2, (w / s) | 0), sh = Math.max(2, (h / s) | 0);
    var small = buf('bloomS', sw, sh), sc = small.getContext('2d'), big = snap('bloomB', p.source, w, h, p.__preview);
    sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, sw, sh);
    sc.drawImage(big, 0, 0, sw, sh);
    if ('filter' in sc) { sc.filter = 'blur(2px) brightness(' + (1 + p.intensity * 0.7) + ')'; sc.drawImage(small, 0, 0); sc.filter = 'none'; }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.65 * p.intensity); ctx.drawImage(small, 0, 0, w, h);
    ctx.restore();
  });

  var GLSL_CHROMA =
    'precision mediump float;uniform sampler2D uTex;uniform vec2 uRes;uniform float uT,uI;varying vec2 vUv;\n' +
    'vec2 barrel(vec2 uv,float k){vec2 c=uv-0.5;return 0.5+c*(1.0+k*dot(c,c));}\n' +
    'void main(){\n' +
    '  vec2 uv=barrel(vUv,0.18*uI);\n' +
    '  if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.){gl_FragColor=vec4(0.,0.,0.,1.);return;}\n' +
    '  vec2 off=(uv-0.5)*0.012*uI*(1.0+0.3*sin(uT*40.0));\n' +
    '  vec4 c=texture2D(uTex,uv);\n' +
    '  vec3 col=vec3(texture2D(uTex,uv+off).r,c.g,texture2D(uTex,uv-off).b);\n' +
    '  col*=0.93+0.07*sin(uv.y*uRes.y*3.14159);\n' +
    '  col*=1.0-0.45*dot(uv-0.5,uv-0.5)*2.0*uI;\n' +
    '  gl_FragColor=vec4(col,max(c.a,0.0));\n' +
    '}';
  A('fx_chromatic_glsl', 'Shader Quang sai + Cong viền (WebGL)', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.2, 4, 0.1)
  }, function (ctx, w, h, t, p) {
    var cv = glRun('chroma', GLSL_CHROMA, p.source, w, h, { uT: t * p.speed, uI: p.intensity }, p.__preview);
    if (cv) ctx.drawImage(cv, 0, 0, w, h);
  });

  A('fx_vignette_focus', 'Tối viền điện ảnh (Cinematic Focus)', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), radius: N(0.5, 0.2, 0.8, 0.05)
  }, function (ctx, w, h, t, p) {
    ctx.save();
    var v = ctx.createRadialGradient(w / 2, h / 2, h * p.radius, w / 2, h / 2, Math.hypot(w, h) * 0.58);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,' + clamp(0.75 * p.intensity) + ')');
    ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });

  A('fx_heatwave_warp', 'Sóng nhiệt biến dạng (Heatwave Warp)', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 3, 0.1), slices: N(16, 8, 32, 1)
  }, function (ctx, w, h, t, p) {
    var b = snap('heatB', p.source, w, h, p.__preview);
    var sh = h / p.slices;
    ctx.save();
    for (var i = 0; i < p.slices; i++) {
      var y = i * sh;
      var dx = Math.sin(t * p.speed * TAU + i * 0.6) * w * 0.012 * p.intensity;
      ctx.drawImage(b, 0, y, w, sh, dx, y, w, sh);
    }
    ctx.restore();
  });

  A('fx_strobe_invert', 'Chớp nháy âm bản đảo màu (Beat Strobe)', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), speed: N(1, 0.5, 4, 0.5)
  }, function (ctx, w, h, t, p) {
    var cycle = (t * p.speed * 4) % 1;
    if (cycle < 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(p.intensity) + ')';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  });

  A('fx_radial_blur_zoom', 'Vệt mờ xuyên tâm (Radial Blur Zoom)', CAT_SCREEN, {
    intensity: N(1.0, 0.1, 3, 0.1), samples: N(5, 3, 10, 1)
  }, function (ctx, w, h, t, p) {
    var b = snap('radB', p.source, w, h, p.__preview);
    var n = p.samples | 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 1; i <= n; i++) {
      var s = 1.0 + i * 0.02 * p.intensity;
      ctx.globalAlpha = clamp((0.25 / n) * p.intensity);
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(b, 0, 0, w, h);
      ctx.restore();
    }
    ctx.restore();
  });

  // =====================================================================
  // 6. CHUYỂN TIẾP (Transitions)
  // =====================================================================
  var CAT_TRANS = 'Chuyển tiếp';

  A('tr_wipe_diagonal', 'Quét chéo viền phát sáng', CAT_TRANS, {
    angle: N(18, 0, 40, 1), color: C('#ffffff'), glow: N(16, 0, 40, 1)
  }, function (ctx, w, h, t, p) {
    var pr = clamp(t);
    if (pr <= 0 || pr >= 1) return;
    var e = E.inOutCubic(pr), sk = Math.tan(p.angle * Math.PI / 180) * h / 2, x = lerp(-sk, w + sk, e);
    if (p.next) {
      drawSrc(ctx, p.source, w, h, p.__preview);
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x + sk, 0); ctx.lineTo(x - sk, h); ctx.lineTo(0, h); ctx.closePath(); ctx.clip();
      drawSrc(ctx, p.next, w, h, p.__preview); ctx.restore();
    } else {
      var flare = Math.sin(pr * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      var g = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,' + (0.55 * flare) + ')');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    ctx.save(); ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.shadowColor = p.color; ctx.shadowBlur = p.glow;
    ctx.beginPath(); ctx.moveTo(x + sk, 0); ctx.lineTo(x - sk, h); ctx.stroke(); ctx.restore();
  });

  A('tr_zoom_punch', 'Xuyên zoom + chớp sáng', CAT_TRANS, {
    intensity: N(1.0, 0.1, 3, 0.1), flash: N(0.8, 0, 1, 0.05), samples: N(6, 2, 14, 1)
  }, function (ctx, w, h, t, p) {
    var pr = clamp(t);
    if (pr <= 0 || pr >= 1) return;
    var e = Math.sin(pr * Math.PI);
    var n = p.samples | 0;
    var b = snap('trZoomB', p.source || ctx.canvas, w, h, p.__preview);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var k = 1; k <= n; k++) {
      var s = 1.0 + (k / n) * 0.16 * e * p.intensity;
      ctx.globalAlpha = clamp((0.3 / n) * e * p.intensity);
      ctx.save();
      ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(b, 0, 0, w, h);
      ctx.restore();
    }
    var fl = Math.pow(e, 3.5) * p.flash;
    if (fl > 0.01) {
      ctx.globalAlpha = fl;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  });

  A('tr_blinds', 'Rèm trượt đa nan (Blinds)', CAT_TRANS, {
    count: N(10, 2, 30, 1), stagger: N(0.5, 0, 0.9, 0.05), vertical: N(1, 0, 1, 1)
  }, function (ctx, w, h, t, p) {
    var pr = clamp(t);
    if (pr <= 0 || pr >= 1) return;
    var n = p.count | 0, per = 1 - p.stagger;
    if (p.next) {
      drawSrc(ctx, p.source, w, h, p.__preview);
      ctx.save(); ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var barProg = E.outCubic(seg(pr, (i / n) * p.stagger, (i / n) * p.stagger + per));
        if (p.vertical) { var sw = w / n; ctx.rect(i * sw, 0, sw * barProg + 0.5, h); }
        else { var sh = h / n; ctx.rect(0, i * sh, w, sh * barProg + 0.5); }
      }
      ctx.clip(); drawSrc(ctx, p.next, w, h, p.__preview); ctx.restore();
    } else {
      var wave = Math.sin(pr * Math.PI);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (var i = 0; i < n; i++) {
        var barProg = E.outCubic(seg(pr, (i / n) * p.stagger, (i / n) * p.stagger + per));
        var bladeAlpha = Math.sin(barProg * Math.PI) * 0.45 * wave;
        ctx.fillStyle = 'rgba(255,255,255,' + bladeAlpha + ')';
        if (p.vertical) {
          var sw = w / n;
          ctx.fillRect(i * sw, 0, sw * barProg, h);
        } else {
          var sh = h / n;
          ctx.fillRect(0, i * sh, w, sh * barProg);
        }
      }
      ctx.restore();
    }
  });

  A('tr_glitch_slice', 'Chuyển cảnh vỡ sóng nhiễu Glitch Slice', CAT_TRANS, {
    intensity: N(1.0, 0.1, 3, 0.1), slices: N(12, 4, 30, 1)
  }, function (ctx, w, h, t, p) {
    var progress = clamp(t);
    if (progress <= 0 || progress >= 1) return;
    var burst = Math.sin(progress * Math.PI) * p.intensity;
    if (burst < 0.01) return;
    var rnd = rng(Math.floor(progress * 24) + 7);
    var sh = h / p.slices;
    var snapB = snap('trGlitchB', p.source || ctx.canvas, w, h, p.__preview);
    ctx.save();
    for (var i = 0; i < p.slices; i++) {
      var y = i * sh;
      var dx = (rnd() - 0.5) * w * 0.18 * burst;
      ctx.drawImage(snapB, 0, y, w, sh, dx, y, w, sh);
    }
    if (burst > 0.4) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(56, 189, 248, ' + (burst * 0.25) + ')';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  });

  A('tr_radial_spin', 'Xoay vặn xoáy chuyển cảnh', CAT_TRANS, {
    intensity: N(1.0, 0.1, 3, 0.1), rot: N(1, 0.5, 2, 0.5)
  }, function (ctx, w, h, t, p) {
    var progress = clamp(t);
    if (progress <= 0 || progress >= 1) return;
    if (p.next) {
      var e = E.inOutCubic(progress);
      if (e < 0.5) {
        var s = 1.0 - e * 0.5 * p.intensity;
        ctx.save();
        ctx.translate(w / 2, h / 2); ctx.rotate(e * Math.PI * p.rot); ctx.scale(s, s); ctx.translate(-w / 2, -h / 2);
        drawSrc(ctx, p.source, w, h, p.__preview);
        ctx.restore();
      } else {
        var s2 = 0.5 + (e - 0.5) * p.intensity;
        ctx.save();
        ctx.translate(w / 2, h / 2); ctx.rotate((e - 1.0) * Math.PI * p.rot); ctx.scale(s2, s2); ctx.translate(-w / 2, -h / 2);
        drawSrc(ctx, p.next, w, h, p.__preview);
        ctx.restore();
      }
    } else {
      var wave = Math.sin(progress * Math.PI);
      var rotAngle = Math.sin(progress * Math.PI) * 0.15 * p.rot * p.intensity;
      var s = 1.04 + wave * 0.12 * p.intensity;
      var snapB = snap('trSpinB', p.source || ctx.canvas, w, h, p.__preview);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rotAngle);
      ctx.scale(s, s);
      ctx.translate(-w / 2, -h / 2);
      ctx.drawImage(snapB, 0, 0, w, h);
      ctx.restore();
    }
  });

  A('tr_flash_burn', 'Cháy sáng Film Burn Whiteout', CAT_TRANS, {
    color: C('#fff7ed')
  }, function (ctx, w, h, t, p) {
    var pr = clamp(t);
    if (pr <= 0 || pr >= 1) return;
    var fl = Math.sin(pr * Math.PI);
    var flashAlpha = Math.pow(fl, 2.2);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = p.color; ctx.globalAlpha = flashAlpha * 0.95;
    ctx.fillRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.hypot(w, h) * 0.5);
    g.addColorStop(0, 'rgba(255,200,100,' + (flashAlpha * 0.6) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });

  // =====================================================================
  // 7. PHẢN ỨNG ÂM THANH (Studio-Grade Audio Visualizers 4K)
  // Trap Nation 4K Pro, Monstercat Studio Spectrum, Siri Liquid Silk Waves,
  // Dual Stereo Wings, Stardust Constellation, Cyberpunk LED Matrix, Shockwave Blast
  // =====================================================================
  var CAT_AUDIO = 'Phản ứng âm thanh';

  // Cross-browser capsule round rectangle helper
  function drawRoundRect(ctx, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r || 0, w / 2, h / 2);
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // Enhanced multiband audio metrics extractor with drop detection
  function getAudioMetrics(t, p) {
    p = p || {};
    var en = typeof p.energy === 'number' ? p.energy : null;
    var bp = typeof p.beatPulse === 'number' ? p.beatPulse : null;
    var bass = typeof p.bass === 'number' ? p.bass : null;
    var kick = typeof p.kick === 'number' ? p.kick : null;
    var vocal = typeof p.vocal === 'number' ? p.vocal : null;
    var treble = typeof p.treble === 'number' ? p.treble : null;

    var isLivePlaying = (typeof window !== 'undefined' && window.S && window.S.playing && !window.S.exporting);
    if (isLivePlaying && window.audioDsp && typeof window.audioDsp.update === 'function') {
      window.audioDsp.update();
    }
    var dsp = (isLivePlaying && window.audioDsp && window.audioDsp.smooth) ? window.audioDsp.smooth : null;
    var plan = p.plan || (typeof window !== 'undefined' && window.S && window.S.plan ? window.S.plan : null);

    // Energy calculation
    if (en === null) {
      if (plan && plan.energy && plan.energyRate > 0) {
        var idx = Math.min(plan.energy.length - 1, Math.max(0, Math.floor(t * plan.energyRate)));
        en = plan.energy[idx];
      } else if (dsp) {
        en = ((dsp.kick || 0) + (dsp.bass || 0) + (dsp.vocal || 0)) * 0.45;
      } else {
        var ph = (t * 2.133) % 1;
        en = 0.35 + 0.65 * Math.exp(-ph * 4.2);
      }
    }

    // Beat pulse calculation
    if (bp === null) {
      if (plan && plan.beats && plan.beats.length) {
        var lo = 0, hi = plan.beats.length - 1, prevB = null;
        while (lo <= hi) {
          var mid = (lo + hi) >> 1;
          if (plan.beats[mid] <= t) { prevB = plan.beats[mid]; lo = mid + 1; }
          else hi = mid - 1;
        }
        if (prevB !== null && (t - prevB) < 0.4) {
          bp = Math.exp(-(t - prevB) * 10);
        } else {
          bp = 0;
        }
      } else if (dsp) {
        bp = Math.max(dsp.kick || 0, dsp.bass || 0);
      } else {
        var bPhase = (t * 2.133) % 1;
        bp = Math.exp(-bPhase * 7);
      }
    }

    // Bass frequency calculation
    if (bass === null) {
      if (dsp && typeof dsp.bass === 'number') {
        bass = dsp.bass;
      } else if (plan && plan.spectrum && plan.spectrum.bass) {
        bass = plan.spectrum.bass;
      } else {
        bass = (bp || 0) * 0.85 + (en || 0) * 0.25;
      }
    }

    // Kick punch calculation
    if (kick === null) {
      if (dsp && typeof dsp.kick === 'number') {
        kick = dsp.kick;
      } else {
        kick = Math.pow(bp || 0, 1.8);
      }
    }

    // Vocal & Treble calculation
    if (vocal === null) {
      if (dsp && typeof dsp.vocal === 'number') vocal = dsp.vocal;
      else if (plan && plan.spectrum && plan.spectrum.vocal) vocal = plan.spectrum.vocal;
      else vocal = (en || 0) * 0.75 + Math.abs(Math.sin(t * 7.5)) * 0.25;
    }
    if (treble === null) {
      if (dsp && typeof dsp.treble === 'number') treble = dsp.treble;
      else treble = (en || 0) * 0.5 + Math.abs(Math.cos(t * 11.3)) * 0.35;
    }

    // AI Smart Drop Chorus boost
    var hasSmartSection = (typeof window !== 'undefined' && window.SmartSectionAPI);
    var isDrop = (hasSmartSection && typeof window.SmartSectionAPI.isDrop === 'function') ? window.SmartSectionAPI.isDrop(t) : false;
    var dropBoost = (hasSmartSection && typeof window.SmartSectionAPI.getDropImpactMultiplier === 'function')
      ? window.SmartSectionAPI.getDropImpactMultiplier(t)
      : (isDrop ? 1.32 : 1.0);

    return {
      energy: clamp((en || 0) * dropBoost, 0, 3.5),
      beatPulse: clamp((bp || 0) * dropBoost, 0, 3.5),
      bass: clamp((bass || 0) * dropBoost, 0, 3.5),
      kick: clamp((kick || 0) * dropBoost, 0, 3.5),
      vocal: clamp((vocal || 0) * dropBoost, 0, 3.5),
      treble: clamp((treble || 0) * dropBoost, 0, 3.5),
      dropBoost: dropBoost,
      isDrop: isDrop
    };
  }

  // Peak buffer storage for studio physics
  var mcPeaks = new Float32Array(128);
  var mcVelocities = new Float32Array(128);
  var mcLastT = 0;

  // 1. Trap Nation Pro 4K (Vòng Sóng Lượng Tử - Ultra Batched 60FPS)
  A('audio_trap_nation_pro', 'Trap Nation Pro 4K (Vòng Sóng Lượng Tử)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    radius: N(160, 80, 360, 10),
    bars: N(64, 32, 96, 4),
    primaryColor: C('#06b6d4'),
    secondaryColor: C('#ec4899'),
    coreGlow: N(1.0, 0.2, 2.5, 0.1)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cx = w / 2, cy = h * 0.52;
    var baseR = (p.radius || 160) * (h / 1080);
    var count = p.bars || 64;
    var intMul = p.intensity || 1.0;
    var col1 = p.primaryColor || '#06b6d4';
    var col2 = p.secondaryColor || '#ec4899';

    // Snappy spring kick punch
    var kickPunch = Math.pow(m.kick, 1.25) * 0.18 * intMul;
    var rPulsed = baseR * (1.0 + kickPunch);

    ctx.save();
    ctx.translate(cx, cy);

    // --- 1. Ambient Floating Quantum Embers (Batched in 1 path) ---
    var rnd = rng(42);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rgba(col1, 0.45 + 0.35 * m.energy);
    ctx.beginPath();
    for (var e = 0; e < 24; e++) {
      var speed = 0.2 + rnd() * 0.5;
      var eProg = ((t * speed + rnd()) % 1);
      var eAngle = rnd() * TAU + t * 0.1;
      var eDist = rPulsed * (1.1 + eProg * 1.6);
      var ex = Math.cos(eAngle) * eDist;
      var ey = Math.sin(eAngle) * eDist - (eProg * 65 * (h / 1080));
      var eSz = (1.5 + rnd() * 2.2) * (0.8 + 0.4 * m.beatPulse);
      ctx.moveTo(ex + eSz, ey);
      ctx.arc(ex, ey, eSz, 0, TAU);
    }
    ctx.fill();
    ctx.restore();

    // --- 2. Central Matte Core Disc & Sub-Bass Ripple ---
    var discR = rPulsed * 0.94;
    var discGrad = ctx.createRadialGradient(0, 0, discR * 0.35, 0, 0, discR);
    discGrad.addColorStop(0, 'rgba(8, 6, 16, 0.82)');
    discGrad.addColorStop(0.85, 'rgba(12, 10, 24, 0.92)');
    discGrad.addColorStop(1.0, rgba(col1, 0.5));
    ctx.fillStyle = discGrad;
    ctx.beginPath();
    ctx.arc(0, 0, discR, 0, TAU);
    ctx.fill();

    // Kick shockwave ripple
    if (m.kick > 0.25) {
      var swPhase = (t * 4.5) % 1;
      var swR = rPulsed * (1.0 + swPhase * 0.65);
      var swAlpha = (1.0 - swPhase) * 0.65 * m.kick * intMul;
      ctx.strokeStyle = rgba('#ffffff', swAlpha);
      ctx.lineWidth = 2 * (1.0 - swPhase);
      ctx.beginPath();
      ctx.arc(0, 0, swR, 0, TAU);
      ctx.stroke();
    }

    // --- 3. Dual Counter-Rotating Telemetry Rings ---
    ctx.save();
    ctx.rotate(t * 0.18);
    ctx.strokeStyle = rgba(col1, 0.55);
    ctx.lineWidth = 1.8;
    ctx.setLineDash([8, 14]);
    ctx.beginPath();
    ctx.arc(0, 0, rPulsed, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    for (var k = 0; k < 4; k++) {
      var aK = k * (TAU / 4);
      ctx.moveTo(Math.cos(aK) * (rPulsed - 6), Math.sin(aK) * (rPulsed - 6));
      ctx.lineTo(Math.cos(aK) * (rPulsed + 6), Math.sin(aK) * (rPulsed + 6));
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.rotate(-t * 0.28);
    ctx.strokeStyle = rgba(col2, 0.4);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, rPulsed * 0.96, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // --- 4. High-Precision Radial Tapered Needle Bars (Batched Dual-Pass 60FPS) ---
    var barW = Math.max(2.5, (TAU * rPulsed / count) * 0.65);
    var capPoints = [];

    var freqBins = (typeof window !== 'undefined' && window.audioDsp && typeof window.audioDsp.getFrequencySpectrum === 'function')
      ? window.audioDsp.getFrequencySpectrum(count, t, p.plan)
      : null;

    // Pre-calculate bar vectors (True Frequency Hz Reactivity)
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * TAU + (t * 0.08);
      var symDist = Math.abs(i - count / 2) / (count / 2);
      var binIdx = Math.min(count - 1, Math.floor(symDist * (count - 1)));
      var hzVal = freqBins ? freqBins[binIdx] : (Math.sin(symDist * Math.PI * 0.82 + 0.18) * m.energy);
      var barH = (14 + (hzVal * (m.energy * 105 + m.kick * 75 + 40))) * intMul * (h / 1080);

      var cosA = Math.cos(angle);
      var sinA = Math.sin(angle);
      var rStart = rPulsed + 1;
      var rEnd = rPulsed + barH;

      ctx.moveTo(cosA * rStart, sinA * rStart);
      ctx.lineTo(cosA * rEnd, sinA * rEnd);

      if (barH > 30) {
        var capR = rEnd + 5 + Math.sin(t * 8 + i) * 2;
        capPoints.push({ x: cosA * capR, y: sinA * capR });
      }
    }

    // Pass A: Neon Cyan/Rose Glow Aura (Wide stroke, 0ms shadow blur overhead)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = rgba(col1, 0.38);
    ctx.lineWidth = barW * 1.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Pass B: Crisp Core Neon Line
    ctx.strokeStyle = rgba(col2, 0.92);
    ctx.lineWidth = barW * 0.95;
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = barW * 0.45;
    ctx.stroke();
    ctx.restore();

    // Pass C: Starlight Cap Dots (Batched in 1 path)
    if (capPoints.length > 0) {
      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      var dotR = Math.max(1.5, barW * 0.42);
      for (var cIdx = 0; cIdx < capPoints.length; cIdx++) {
        var cp = capPoints[cIdx];
        ctx.moveTo(cp.x + dotR, cp.y);
        ctx.arc(cp.x, cp.y, dotR, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  });

  // 2. Monstercat Pro Studio Spectrum (Ultra Batched 60FPS)
  A('audio_monstercat_pro', 'Monstercat Pro Studio Spectrum (Cột Sóng Kèm Đỉnh Rơi)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    height: N(220, 80, 480, 10),
    bars: N(54, 24, 84, 2),
    primaryColor: C('#06b6d4'),
    capColor: C('#f43f5e'),
    gap: N(4, 1, 10, 1)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var count = p.bars || 54;
    var maxH = (p.height || 220) * (h / 1080) * (p.intensity || 1.0);
    var gap = p.gap || 4;
    var totalW = w * 0.88;
    var barW = Math.max(3, (totalW / count) - gap);
    var startX = (w - (count * (barW + gap) - gap)) / 2;
    var bottomY = h * 0.94;
    var col1 = p.primaryColor || '#06b6d4';
    var colCap = p.capColor || '#f43f5e';

    var dt = clamp(t - mcLastT, 0.001, 0.05);
    mcLastT = t;
    var gravity = 450 * (h / 1080);

    ctx.save();

    // Baseline studio floor laser strip
    ctx.strokeStyle = rgba(col1, 0.45);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX - 15, bottomY);
    ctx.lineTo(startX + count * (barW + gap) + 15, bottomY);
    ctx.stroke();

    // Shared gradients allocated ONCE per frame
    var barGrad = ctx.createLinearGradient(0, bottomY, 0, bottomY - maxH);
    barGrad.addColorStop(0, rgba(col1, 0.35));
    barGrad.addColorStop(0.55, col1);
    barGrad.addColorStop(0.88, colCap);
    barGrad.addColorStop(1.0, '#ffffff');

    var reflGrad = ctx.createLinearGradient(0, bottomY, 0, bottomY + maxH * 0.38);
    reflGrad.addColorStop(0, rgba(col1, 0.28));
    reflGrad.addColorStop(1.0, 'rgba(0,0,0,0)');

    var barRadius = Math.min(4, barW / 2);

    var freqBins = (typeof window !== 'undefined' && window.audioDsp && typeof window.audioDsp.getFrequencySpectrum === 'function')
      ? window.audioDsp.getFrequencySpectrum(count, t, p.plan)
      : null;

    // Pass 1: Batched Floor Reflections
    ctx.fillStyle = reflGrad;
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var hzVal = freqBins ? freqBins[i] : (Math.pow(1.0 - Math.pow(Math.abs(i - (count - 1) / 2) / (count / 2), 1.3), 0.85) * m.energy);
      var barH = Math.max(8, (hzVal * 0.88 + m.energy * 0.12) * maxH);
      var x = startX + i * (barW + gap);
      var reflH = barH * 0.38;
      if (ctx.roundRect) ctx.roundRect(x, bottomY, barW, reflH, Math.min(3, barW / 2));
      else ctx.rect(x, bottomY, barW, reflH);
    }
    ctx.fill();

    // Pass 2: Batched Main Studio EQ Bars (True Frequency Spectrum 30Hz - 16kHz)
    ctx.fillStyle = barGrad;
    ctx.beginPath();
    for (var j = 0; j < count; j++) {
      var hzVal2 = freqBins ? freqBins[j] : (Math.pow(1.0 - Math.pow(Math.abs(j - (count - 1) / 2) / (count / 2), 1.3), 0.85) * m.energy);
      var bH = Math.max(8, (hzVal2 * 0.88 + m.energy * 0.12) * maxH);
      var bx = startX + j * (barW + gap);
      var by = bottomY - bH;

      // Realistic ballistic gravity physics
      if (bH >= mcPeaks[j]) {
        mcPeaks[j] = bH;
        mcVelocities[j] = 0;
      } else {
        mcVelocities[j] += gravity * dt;
        mcPeaks[j] = Math.max(0, mcPeaks[j] - mcVelocities[j] * dt);
      }

      if (ctx.roundRect) ctx.roundRect(bx, by, barW, bH, barRadius);
      else ctx.rect(bx, by, barW, bH);
    }
    ctx.fill();

    // Pass 3: Batched Floating Gravity Peak Caps
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (var k = 0; k < count; k++) {
      var kx = startX + k * (barW + gap);
      var capY = bottomY - mcPeaks[k] - 4;
      if (ctx.roundRect) ctx.roundRect(kx, capY, barW, 2.5, 1.25);
      else ctx.rect(kx, capY, barW, 2.5);
    }
    ctx.fill();

    ctx.restore();
  });

  // 3. Siri Liquid Silk Wave (Batched 60FPS)
  A('audio_liquid_ribbon_pro', 'Siri Liquid Silk Wave (Dải Sóng Lụa Neon)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    primaryColor: C('#06b6d4'),
    secondaryColor: C('#ec4899'),
    tertiaryColor: C('#f59e0b'),
    glow: N(1.0, 0.2, 2.5, 0.1)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cy = h * 0.72;
    var intMul = p.intensity || 1.0;
    var col1 = p.primaryColor || '#06b6d4';
    var col2 = p.secondaryColor || '#ec4899';
    var col3 = p.tertiaryColor || '#f59e0b';

    var points = 48;
    var step = w / points;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var freqBins = (typeof window !== 'undefined' && window.audioDsp && typeof window.audioDsp.getFrequencySpectrum === 'function')
      ? window.audioDsp.getFrequencySpectrum(points, t, p.plan)
      : null;
    var bEnergy = freqBins ? (freqBins[2] * 1.3) : (m.bass * 0.8 + m.kick * 0.4);
    var vEnergy = freqBins ? (freqBins[Math.floor(points * 0.45)] * 1.2) : (m.vocal * 0.7 + m.energy * 0.5);
    var tEnergy = freqBins ? (freqBins[Math.floor(points * 0.85)] * 1.1) : (m.treble * 0.8 + m.kick * 0.3);

    var waves = [
      { amp: Math.max(12, 65 * bEnergy * intMul * (h / 1080)), freq: 2.2, speed: 3.5, color: col1, lw: 4.5, fillAlpha: 0.14 },
      { amp: Math.max(10, 48 * vEnergy * intMul * (h / 1080)), freq: 3.8, speed: -2.8, color: col2, lw: 3.5, fillAlpha: 0.16 },
      { amp: Math.max(6, 32 * tEnergy * intMul * (h / 1080)), freq: 6.0, speed: 4.8, color: col3, lw: 2.5, fillAlpha: 0.10 }
    ];

    var sparkPoints = [];

    waves.forEach(function (wav) {
      var pts = [];
      for (var i = 0; i <= points; i++) {
        var x = i * step;
        var env = Math.sin((i / points) * Math.PI);
        var y = cy + Math.sin(i * 0.22 * wav.freq + t * wav.speed) * wav.amp * env;
        pts.push({ x: x, y: y });
      }

      ctx.save();
      ctx.strokeStyle = wav.color;
      ctx.lineWidth = wav.lw;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var k = 1; k < pts.length - 2; k++) {
        var xc = (pts[k].x + pts[k + 1].x) / 2;
        var yc = (pts[k].y + pts[k + 1].y) / 2;
        ctx.quadraticCurveTo(pts[k].x, pts[k].y, xc, yc);
      }
      ctx.quadraticCurveTo(pts[pts.length - 2].x, pts[pts.length - 2].y, pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();

      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      var bellyGrad = ctx.createLinearGradient(0, cy - wav.amp, 0, h);
      bellyGrad.addColorStop(0, rgba(wav.color, wav.fillAlpha));
      bellyGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bellyGrad;
      ctx.fill();
      ctx.restore();

      var rndS = rng(Math.floor(t * 10) + wav.freq);
      for (var s = 0; s < 5; s++) {
        var pIdx = Math.floor(rndS() * (pts.length - 4)) + 2;
        var sp = pts[pIdx];
        if (sp) sparkPoints.push({ x: sp.x + (rndS() - 0.5) * 8, y: sp.y + (rndS() - 0.5) * 6 });
      }
    });

    if (sparkPoints.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (var si = 0; si < sparkPoints.length; si++) {
        ctx.moveTo(sparkPoints[si].x + 1.8, sparkPoints[si].y);
        ctx.arc(sparkPoints[si].x, sparkPoints[si].y, 1.8, 0, TAU);
      }
      ctx.fill();
    }

    ctx.restore();
  });

  // 4. Dual Stereo Wings (Ultra Batched 60FPS)
  A('audio_dual_stereo_wings', 'Dual Stereo Wings (Cánh Sóng Đối Xứng Hai Bên)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    bars: N(28, 16, 48, 2),
    primaryColor: C('#06b6d4'),
    accentColor: C('#ec4899')
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var count = p.bars || 28;
    var intMul = p.intensity || 1.0;
    var col1 = p.primaryColor || '#06b6d4';
    var col2 = p.accentColor || '#ec4899';

    var startY = h * 0.22;
    var endY = h * 0.82;
    var stepY = (endY - startY) / count;
    var barH = stepY * 0.58;
    var maxW = w * 0.24 * intMul;

    ctx.save();

    ctx.font = 'bold 9px IBM Plex Sans JP, monospace';
    ctx.fillStyle = rgba(col1, 0.6);
    ctx.fillText('L-CH ◄ 20Hz - 20kHz', 14, startY - 8);
    ctx.fillStyle = rgba(col2, 0.6);
    ctx.textAlign = 'right';
    ctx.fillText('20Hz - 20kHz ► R-CH', w - 14, startY - 8);

    var gradL = ctx.createLinearGradient(0, 0, maxW, 0);
    gradL.addColorStop(0, rgba(col1, 0.3));
    gradL.addColorStop(0.7, col1);
    gradL.addColorStop(1.0, '#ffffff');

    var gradR = ctx.createLinearGradient(w, 0, w - maxW, 0);
    gradR.addColorStop(0, rgba(col2, 0.3));
    gradR.addColorStop(0.7, col2);
    gradR.addColorStop(1.0, '#ffffff');

    var capPointsL = [];
    var capPointsR = [];

    var freqBins = (typeof window !== 'undefined' && window.audioDsp && typeof window.audioDsp.getFrequencySpectrum === 'function')
      ? window.audioDsp.getFrequencySpectrum(count, t, p.plan)
      : null;

    // Left Wing Path (Real Hz: Bottom = Bass, Top = Treble)
    ctx.fillStyle = gradL;
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var yL = startY + (count - 1 - i) * stepY;
      var symDistL = Math.abs(i - count / 2) / (count / 2);
      var fWL = Math.sin(symDistL * Math.PI * 0.85 + 0.15);
      var hzValL = freqBins ? freqBins[i] : (fWL * (m.energy * 0.7 + m.bass * 0.6));
      var lenL = Math.max(12, (14 + hzValL * maxW));
      if (ctx.roundRect) ctx.roundRect(0, yL, lenL, barH, Math.min(3, barH / 2));
      else ctx.rect(0, yL, lenL, barH);
      capPointsL.push({ x: lenL + 3, y: yL });
    }
    ctx.fill();

    // Right Wing Path (Real Hz: Bottom = Bass, Top = Treble)
    ctx.fillStyle = gradR;
    ctx.beginPath();
    for (var j = 0; j < count; j++) {
      var yR = startY + (count - 1 - j) * stepY;
      var symDistR = Math.abs(j - count / 2) / (count / 2);
      var fWR = Math.sin(symDistR * Math.PI * 0.85 + 0.15);
      var hzValR = freqBins ? freqBins[j] : (fWR * (m.energy * 0.7 + m.kick * 0.6));
      var lenR = Math.max(12, (14 + hzValR * maxW));
      if (ctx.roundRect) ctx.roundRect(w - lenR, yR, lenR, barH, Math.min(3, barH / 2));
      else ctx.rect(w - lenR, yR, lenR, barH);
      capPointsR.push({ x: w - lenR - 5.5, y: yR });
    }
    ctx.fill();

    // Batched White Accents
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (var kL = 0; kL < capPointsL.length; kL++) {
      ctx.rect(capPointsL[kL].x, capPointsL[kL].y, 2.5, barH);
    }
    for (var kR = 0; kR < capPointsR.length; kR++) {
      ctx.rect(capPointsR[kR].x, capPointsR[kR].y, 2.5, barH);
    }
    ctx.fill();

    ctx.restore();
  });

  // 4.5 Aurora Spectrum (Vòng Cực Quang FFT Radial - Zero N^2, Batched 60FPS)
  A('audio_aurora_spectrum', 'Aurora Spectrum (Vòng Cực Quang FFT Radial)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    radius: N(200, 100, 420, 10),
    spokes: N(72, 36, 128, 4),
    primaryColor: C('#22d3ee'),
    secondaryColor: C('#a78bfa'),
    tertiaryColor: C('#34d399'),
    coreGlow: N(1.0, 0.2, 2.5, 0.1)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var count = p.spokes || 72;
    var intMul = p.intensity || 1.0;
    var cx = w / 2, cy = h / 2;
    var baseR = Math.min(w, h) * 0.28;
    var maxLen = (p.radius || 200) * (h / 1080) * intMul;
    var col1 = p.primaryColor || '#22d3ee';
    var col2 = p.secondaryColor || '#a78bfa';
    var col3 = p.tertiaryColor || '#34d399';

    var freqBins = (typeof window !== 'undefined' && window.audioDsp && typeof window.audioDsp.getFrequencySpectrum === 'function')
      ? window.audioDsp.getFrequencySpectrum(count, t, p.plan)
      : null;

    // Fallback envelope when no live DSP is available: a slow breathing ring
    // driven by the plan energy so the visualizer is never completely dead.
    var fallback = function (i) {
      var ph = t * 2.1 + (i / count) * TAU * 3;
      return 0.28 + 0.22 * Math.sin(ph) + m.energy * 0.4;
    };

    // Guard the FFT bins: a contaminated plan.energy can push NaN into the
    // spectrum, and a single NaN coordinate poisons the whole canvas path.
    var binAt = function (i) {
      var v = freqBins ? freqBins[i] : fallback(i);
      return (typeof v === 'number' && isFinite(v)) ? v : 0;
    };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Pass 1: radial spokes, one gradient for the whole ring
    var ringGrad = ctx.createRadialGradient(cx, cy, baseR * 0.55, cx, cy, baseR + maxLen);
    ringGrad.addColorStop(0, rgba(col1, 0.55));
    ringGrad.addColorStop(0.45, rgba(col2, 0.75));
    ringGrad.addColorStop(1, rgba(col3, 0.2));

    ctx.strokeStyle = ringGrad;
    ctx.lineWidth = Math.max(1.5, (maxLen / count) * 1.6);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < count; i++) {
      var ang = (i / count) * TAU - Math.PI / 2;
      var hz = binAt(i);
      var len = baseR + Math.max(2, hz * maxLen);
      var px = cx + Math.cos(ang) * len;
      var py = cy + Math.sin(ang) * len;
      ctx.moveTo(cx + Math.cos(ang) * baseR * 0.62, cy + Math.sin(ang) * baseR * 0.62);
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Pass 2: the inner ring (batched arc)
    ctx.strokeStyle = rgba(col1, 0.75);
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.0022);
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.6 + m.kick * 18 * intMul, 0, TAU);
    ctx.stroke();

    // Pass 3: rotating arc markers
    var spin = t * 0.35;
    ctx.strokeStyle = rgba(col3, 0.8);
    ctx.lineWidth = Math.max(2, Math.min(w, h) * 0.004);
    ctx.beginPath();
    for (var k = 0; k < 3; k++) {
      var a0 = spin + (k / 3) * TAU;
      ctx.moveTo(cx + Math.cos(a0) * baseR * 0.86, cy + Math.sin(a0) * baseR * 0.86);
      ctx.arc(cx, cy, baseR * 0.86, a0, a0 + 0.42);
    }
    ctx.stroke();

    // Pass 4: glowing core
    var coreR = baseR * 0.16 * (1 + m.kick * 0.55 * intMul);
    var coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, 'rgba(255,255,255,0.95)');
    coreGrad.addColorStop(0.5, rgba(col2, 0.5));
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, TAU);
    ctx.fill();

    ctx.restore();
  });

  // 5. Stardust Constellation (Ultra Fast Batched 60FPS - Zero N^2 Bottleneck)
  A('audio_stardust_constellation', 'Stardust Constellation (Chòm Sao Năng Lượng)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    count: N(36, 18, 54, 2),
    primaryColor: C('#38bdf8'),
    filamentColor: C('#c084fc')
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var count = p.count || 36;
    var cx = w / 2, cy = h * 0.52;
    var baseR = Math.min(w, h) * 0.32 * (1.0 + 0.12 * m.kick * (p.intensity || 1));
    var col1 = p.primaryColor || '#38bdf8';
    var colFil = p.filamentColor || '#c084fc';
    var rnd = rng(108);

    var nodes = [];
    for (var i = 0; i < count; i++) {
      var speedMult = (0.4 + rnd() * 0.8);
      var angle = (i / count) * TAU + t * 0.25 * speedMult;
      var radOffset = (rnd() - 0.5) * baseR * 0.65;
      var curR = baseR + radOffset + m.beatPulse * 35 * (p.intensity || 1);
      var px = cx + Math.cos(angle) * curR;
      var py = cy + Math.sin(angle) * (curR * 0.75);
      var sz = (2.5 + rnd() * 2.8) * (0.8 + 0.5 * m.energy);
      nodes.push({ x: px, y: py, sz: sz });
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    var maxDist = 90 * (h / 1080) * (0.8 + 0.5 * m.beatPulse);

    // Pass 1: ALL Laser Connection Lines Batched into 1 Single Stroke Call
    ctx.strokeStyle = rgba(colFil, 0.25 + 0.45 * m.energy);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var a = 0; a < nodes.length; a++) {
      for (var b = a + 1; b < nodes.length; b++) {
        var dx = nodes[a].x - nodes[b].x;
        var dy = nodes[a].y - nodes[b].y;
        if (Math.hypot(dx, dy) < maxDist) {
          ctx.moveTo(nodes[a].x, nodes[a].y);
          ctx.lineTo(nodes[b].x, nodes[b].y);
        }
      }
    }
    ctx.stroke();

    // Pass 2: ALL Star Nodes Batched into 1 Single Fill Call
    ctx.fillStyle = col1;
    ctx.beginPath();
    for (var n = 0; n < nodes.length; n++) {
      ctx.moveTo(nodes[n].x + nodes[n].sz, nodes[n].y);
      ctx.arc(nodes[n].x, nodes[n].y, nodes[n].sz, 0, TAU);
    }
    ctx.fill();

    // Pass 3: Beat Sparkle Crosses Batched into 1 Single Stroke Call
    if (m.beatPulse > 0.25) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      for (var sIdx = 0; sIdx < nodes.length; sIdx++) {
        var node = nodes[sIdx];
        if (node.sz > 3.2) {
          var spLen = node.sz * 2.5 * m.beatPulse;
          ctx.moveTo(node.x - spLen, node.y);
          ctx.lineTo(node.x + spLen, node.y);
          ctx.moveTo(node.x, node.y - spLen);
          ctx.lineTo(node.x, node.y + spLen);
        }
      }
      ctx.stroke();
    }

    ctx.restore();
  });

  // 6. Cyberpunk LED Matrix Equalizer (Batched Color Passes 60FPS)
  A('audio_cyber_matrix_pro', 'Cyberpunk LED Matrix Equalizer', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    cols: N(28, 16, 40, 2),
    rows: N(14, 8, 20, 2)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cols = p.cols || 28;
    var rows = p.rows || 14;
    var intMul = p.intensity || 1.0;

    var startX = w * 0.08;
    var startY = h * 0.92;
    var totalW = w * 0.84;
    var cellW = (totalW / cols) * 0.78;
    var gapX = (totalW / cols) * 0.22;
    var cellH = 6 * (h / 1080);
    var gapY = 3 * (h / 1080);

    ctx.save();

    var unlitRects = [];
    var cyanRects = [];
    var amberRects = [];
    var roseRects = [];

    var freqBins = (typeof window !== 'undefined' && window.audioDsp && typeof window.audioDsp.getFrequencySpectrum === 'function')
      ? window.audioDsp.getFrequencySpectrum(cols, t, p.plan)
      : null;

    for (var c = 0; c < cols; c++) {
      var centerDist = Math.abs(c - (cols - 1) / 2) / (cols / 2);
      var freqWeight = 1.0 - centerDist * 0.45;
      var hzVal = freqBins ? freqBins[c] : (freqWeight * (m.energy * 0.7 + m.bass * 0.6));
      var activeRows = Math.min(rows, Math.floor(hzVal * rows * 1.35 * intMul));
      var x = startX + c * (cellW + gapX);

      for (var r = 0; r < rows; r++) {
        var y = startY - r * (cellH + gapY);
        if (r < activeRows) {
          if (r >= rows * 0.82) roseRects.push({ x: x, y: y });
          else if (r >= rows * 0.55) amberRects.push({ x: x, y: y });
          else cyanRects.push({ x: x, y: y });
        } else {
          unlitRects.push({ x: x, y: y });
        }
      }
    }

    // 1. Unlit background grid
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    for (var u = 0; u < unlitRects.length; u++) ctx.rect(unlitRects[u].x, unlitRects[u].y, cellW, cellH);
    ctx.fill();

    // 2. Cyan Layer
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    for (var cyIdx = 0; cyIdx < cyanRects.length; cyIdx++) ctx.rect(cyanRects[cyIdx].x, cyanRects[cyIdx].y, cellW, cellH);
    ctx.fill();

    // 3. Amber Layer
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    for (var amIdx = 0; amIdx < amberRects.length; amIdx++) ctx.rect(amberRects[amIdx].x, amberRects[amIdx].y, cellW, cellH);
    ctx.fill();

    // 4. Rose Peak Layer
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    for (var rsIdx = 0; rsIdx < roseRects.length; rsIdx++) ctx.rect(roseRects[rsIdx].x, roseRects[rsIdx].y, cellW, cellH);
    ctx.fill();

    ctx.restore();
  });

  // 7. Cinematic Bass Shockwave
  A('audio_shockwave_blast_pro', 'Cinematic Bass Shockwave (Vòng Xung Kích)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    color: C('#a855f7'),
    maxRadius: N(480, 200, 900, 20)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cx = w / 2, cy = h * 0.52;
    var maxR = (p.maxRadius || 480) * (h / 1080);
    var col = p.color || '#a855f7';
    var intMul = p.intensity || 1.0;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    var rings = 3;
    for (var r = 0; r < rings; r++) {
      var phase = ((t * 2.2 + r * 0.33) % 1);
      var easeP = E.outCubic(phase);
      var radius = easeP * maxR * (0.85 + 0.35 * m.beatPulse * intMul);
      var alpha = (1.0 - phase) * (0.2 + 0.8 * m.beatPulse) * intMul;

      if (alpha > 0.02) {
        ctx.strokeStyle = rgba(col, alpha);
        ctx.shadowColor = col;
        ctx.shadowBlur = 18 * (1.0 - phase);
        ctx.lineWidth = Math.max(1.5, 6 * (1.0 - phase));
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TAU);
        ctx.stroke();

        ctx.strokeStyle = rgba('#ffffff', alpha * 0.9);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();
  });

  // 8. Beat Aura Glow
  A('audio_aura_pulse', 'Beat Aura Glow (Hào Quang Thấu Kính)', CAT_AUDIO, {
    intensity: N(1.0, 0.1, 3.0, 0.1),
    color: C('#ec4899'),
    radius: N(380, 150, 700, 20)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cx = w / 2, cy = h * 0.52;
    var maxR = (p.radius || 380) * (h / 1080) * (0.85 + 0.35 * m.beatPulse * (p.intensity || 1));
    var alpha = (0.15 + 0.45 * m.energy + 0.4 * m.beatPulse) * (p.intensity || 1);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR);
    g.addColorStop(0, rgba(p.color || '#ec4899', clamp(alpha * 0.8)));
    g.addColorStop(0.5, rgba('#8b5cf6', clamp(alpha * 0.35)));
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });

  // 9. Rung giật theo tần số Bass (Bass-Synced Shake & Glitch)
  A('audio_bass_camera_glitch', 'Rung giật theo tần số Bass', CAT_AUDIO, {
    intensity: N(1.0, 0.1, 3.0, 0.1),
    shakeAmp: N(16, 4, 36, 2),
    rgbSplit: N(8, 2, 24, 1)
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    if (m.beatPulse > 0.08) {
      var amp = (p.shakeAmp || 16) * m.beatPulse * p.intensity * (h / 1080);
      var rnd = rng(Math.floor(t * 30));
      var dx = (rnd() - 0.5) * amp;
      var dy = (rnd() - 0.5) * amp;

      var snapB = snap('bassGlitch', p.source || ctx.canvas, w, h, p.__preview);
      ctx.save();
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(snapB, dx, dy, w, h);

      if (p.rgbSplit > 0 && m.beatPulse > 0.3) {
        var split = p.rgbSplit * m.beatPulse * p.intensity;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = 'rgba(236,72,153,0.3)';
        ctx.drawImage(snapB, dx + split, dy, w, h);
        ctx.fillStyle = 'rgba(56,189,248,0.3)';
        ctx.drawImage(snapB, dx - split, dy, w, h);
      }
      ctx.restore();
    } else {
      drawSrc(ctx, p.source, w, h, p.__preview);
    }
  }, function applyBassCameraTransform(ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    if (m.beatPulse > 0.05) {
      var punch = 1.0 + 0.045 * m.beatPulse * (p.intensity || 1);
      var rnd = rng(Math.floor(t * 30));
      var tx = (rnd() - 0.5) * 12 * m.beatPulse * (p.intensity || 1);
      var ty = (rnd() - 0.5) * 8 * m.beatPulse * (p.intensity || 1);
      ctx.translate(w / 2, h / 2);
      ctx.scale(punch, punch);
      ctx.translate(-w / 2 + tx, -h / 2 + ty);
    }
  });

  // 10. Audio Galaxy & Particle Orbit 3D
  A('audio_galaxy_orbit_3d', 'Audio Galaxy & Particle Orbit 3D (Thiên Hà 3D Nổ Beat)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    primaryColor: C('#06b6d4'),
    secondaryColor: C('#ec4899')
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cx = w / 2, cy = h * 0.52;
    var pal = { primary: p.primaryColor || '#06b6d4', secondary: p.secondaryColor || '#ec4899', cap: '#ffffff' };
    var intMul = p.intensity || 1.0;
    var baseR = Math.min(w, h) * 0.26 * (1.0 + 0.15 * m.kick * intMul);
    var F = h * 0.55;
    var Zcam = 520;
    var kickBurst = Math.pow(m.kick, 1.4) * 130 * intMul * (h / 1080);
    var bassSpread = m.bass * 45 * intMul;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Core
    var coreR = baseR * 0.32 * (1.0 + 0.22 * m.kick);
    var coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.35, pal.primary);
    coreGrad.addColorStop(0.85, pal.secondary);
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, TAU);
    ctx.fill();

    // 3D Rings
    var rings = [
      { r: baseR * 0.82, tilt: 0.55, speed: 0.32, color: pal.primary, lw: 2.2, dash: [] },
      { r: baseR * 1.30, tilt: -0.42, speed: -0.24, color: pal.secondary, lw: 1.8, dash: [6, 10] },
      { r: baseR * 1.75, tilt: 0.68, speed: 0.18, color: pal.cap, lw: 1.2, dash: [4, 8] }
    ];
    rings.forEach(function (ring) {
      ctx.save();
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = ring.lw;
      ctx.setLineDash(ring.dash);
      ctx.beginPath();
      var segs = 48;
      var rotY = t * ring.speed;
      var cosTilt = Math.cos(ring.tilt), sinTilt = Math.sin(ring.tilt);
      var cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      for (var k = 0; k <= segs; k++) {
        var phi = (k / segs) * TAU;
        var lx = ring.r * Math.cos(phi), lz = ring.r * Math.sin(phi);
        var x1 = lx * cosY + lz * sinY, z1 = -lx * sinY + lz * cosY;
        var y2 = -z1 * sinTilt, z2 = z1 * cosTilt;
        var s = F / Math.max(10, z2 + Zcam);
        if (k === 0) ctx.moveTo(cx + x1 * s, cy + y2 * s);
        else ctx.lineTo(cx + x1 * s, cy + y2 * s);
      }
      ctx.stroke();
      ctx.restore();
    });

    // 3D Particles
    var pCount = 120;
    var rotP = t * 0.22;
    var cosP = Math.cos(rotP), sinP = Math.sin(rotP);
    var pts = [];
    for (var i = 0; i < pCount; i++) {
      var pAngle = (i / pCount) * TAU;
      var pElev = Math.sin(i * 3.7 + 1.2) * 0.6;
      var spd = 0.6 + ((i * 17) % 11) * 0.08;
      var ang = pAngle + t * spd * 0.25;
      var baseDist = baseR * (0.4 + ((i * 23) % 100) / 70);
      var r = baseDist + kickBurst * (0.5 + ((i * 7) % 10) * 0.1) + bassSpread;
      var lx = Math.cos(ang) * r, ly = pElev * r * 0.65, lz = Math.sin(ang) * r;
      var x1 = lx * cosP + lz * sinP, z1 = -lx * sinP + lz * cosP;
      var y2 = ly * 0.866 - z1 * 0.5, z2 = ly * 0.5 + z1 * 0.866;
      var s = F / Math.max(10, z2 + Zcam);
      var sz = Math.max(1, (1.8 + (i % 4) * 0.9) * s * (0.8 + 0.5 * m.kick));
      pts.push({ x: cx + x1 * s, y: cy + y2 * s, sz: sz, i: i });
    }

    ctx.fillStyle = pal.primary;
    ctx.beginPath();
    for (var j = 0; j < pts.length; j++) {
      if (pts[j].i % 2 === 0) {
        ctx.moveTo(pts[j].x + pts[j].sz, pts[j].y);
        ctx.arc(pts[j].x, pts[j].y, pts[j].sz, 0, TAU);
      }
    }
    ctx.fill();

    ctx.fillStyle = pal.secondary;
    ctx.beginPath();
    for (var j2 = 0; j2 < pts.length; j2++) {
      if (pts[j2].i % 2 === 1) {
        ctx.moveTo(pts[j2].x + pts[j2].sz, pts[j2].y);
        ctx.arc(pts[j2].x, pts[j2].y, pts[j2].sz, 0, TAU);
      }
    }
    ctx.fill();

    if (m.kick > 0.4) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (var j3 = 0; j3 < pts.length; j3 += 4) {
        ctx.moveTo(pts[j3].x + pts[j3].sz * 0.6, pts[j3].y);
        ctx.arc(pts[j3].x, pts[j3].y, pts[j3].sz * 0.6, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  });

  // 11. Cyber Ribbon / Wave-Surface 3D
  A('audio_cyber_ribbon_3d', 'Cyber Ribbon / Wave-Surface 3D (Dải Lụa Lưới Neon 3D)', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    primaryColor: C('#06b6d4'),
    secondaryColor: C('#ec4899')
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cy = h * 0.72, F = h * 0.52;
    var U = 32, V = 6;
    var Znear = 120, Zfar = 780;
    var pitch = 0.44;
    var cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    var Ycam = -140;
    var pal = { primary: p.primaryColor || '#06b6d4', secondary: p.secondaryColor || '#ec4899' };
    var intMul = p.intensity || 1.0;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    var grid = [];
    for (var v = 0; v < V; v++) {
      var dv = v / (V - 1);
      var zWorld = Znear + dv * (Zfar - Znear);
      var row = [];
      var ampBass = 65 * (m.bass * 0.85 + m.kick * 0.35) * intMul * (h / 1080);
      var ampVocal = 42 * (m.vocal * 0.8 + m.energy * 0.4) * intMul * (h / 1080);
      var ampTreble = 20 * (m.treble || m.energy) * intMul * (h / 1080);

      for (var u = 0; u < U; u++) {
        var unorm = u / (U - 1);
        var env = Math.sin(unorm * Math.PI);
        var w1 = Math.sin(unorm * 2.5 * Math.PI - t * 4.0 + v * 0.6) * ampBass;
        var w2 = Math.sin(unorm * 5.2 * Math.PI + t * 3.2 - v * 0.8) * ampVocal;
        var w3 = Math.sin(unorm * 11.0 * Math.PI - t * 5.5) * ampTreble;
        var yElev = (w1 + w2 + w3) * env * (1.0 - dv * 0.45);
        var xWorld = (unorm - 0.5) * w * 1.15;
        var yBase = yElev + Ycam + (dv - 0.5) * 60;
        var yRot = yBase * cosPitch - zWorld * sinPitch;
        var zRot = yBase * sinPitch + zWorld * cosPitch;
        var s = F / Math.max(10, zRot + 420);
        row.push({ x: w / 2 + xWorld * s, y: cy + yRot * s, s: s, dv: dv });
      }
      grid.push(row);
    }

    for (var v2 = V - 1; v2 >= 0; v2--) {
      var r = grid[v2];
      var dv2 = v2 / (V - 1);
      var alpha = (1.0 - dv2 * 0.6);
      var col = dv2 > 0.5 ? pal.secondary : pal.primary;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(r[0].x, r[0].y);
      for (var k = 1; k < r.length - 2; k++) {
        var xc = (r[k].x + r[k + 1].x) / 2;
        var yc = (r[k].y + r[k + 1].y) / 2;
        ctx.quadraticCurveTo(r[k].x, r[k].y, xc, yc);
      }
      ctx.quadraticCurveTo(r[r.length - 2].x, r[r.length - 2].y, r[r.length - 1].x, r[r.length - 1].y);
      ctx.lineTo(r[r.length - 1].x, h);
      ctx.lineTo(r[0].x, h);
      ctx.closePath();

      var gBelly = ctx.createLinearGradient(0, cy - 80, 0, h);
      gBelly.addColorStop(0, pal.primary);
      gBelly.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gBelly;
      ctx.globalAlpha = 0.12 * alpha;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = 5.0 * r[Math.floor(U / 2)].s;
      ctx.globalAlpha = 0.45 * alpha;
      ctx.beginPath();
      ctx.moveTo(r[0].x, r[0].y);
      for (var k2 = 1; k2 < r.length - 2; k2++) {
        var xc2 = (r[k2].x + r[k2 + 1].x) / 2;
        var yc2 = (r[k2].y + r[k2 + 1].y) / 2;
        ctx.quadraticCurveTo(r[k2].x, r[k2].y, xc2, yc2);
      }
      ctx.quadraticCurveTo(r[r.length - 2].x, r[r.length - 2].y, r[r.length - 1].x, r[r.length - 1].y);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6 * r[Math.floor(U / 2)].s;
      ctx.globalAlpha = 0.85 * alpha;
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = pal.secondary;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    for (var u2 = 2; u2 < U; u2 += 3) {
      for (var v3 = 0; v3 < V - 1; v3++) {
        ctx.moveTo(grid[v3][u2].x, grid[v3][u2].y);
        ctx.lineTo(grid[v3 + 1][u2].x, grid[v3 + 1][u2].y);
      }
    }
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  });

  // 12. Holographic Glass Lissajous Vector Scope 3D
  A('audio_holographic_lissajous_3d', 'Holographic Glass Lissajous Scope 3D', CAT_AUDIO, {
    intensity: N(1.0, 0.2, 3.0, 0.1),
    primaryColor: C('#06b6d4'),
    secondaryColor: C('#ec4899')
  }, function (ctx, w, h, t, p) {
    var m = getAudioMetrics(t, p);
    var cx = w / 2, cy = h * 0.52;
    var pal = { primary: p.primaryColor || '#06b6d4', secondary: p.secondaryColor || '#ec4899' };
    var intMul = p.intensity || 1.0;
    var rad = Math.min(w, h) * 0.35 * (1.0 + 0.1 * m.kick * intMul);
    var F = h * 0.55;
    var Zcam = 540;
    var pitch = 0.52;
    var cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
    var yaw = t * 0.25;
    var cosYaw = Math.cos(yaw), sinYaw = Math.sin(yaw);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    var rings = [0.35, 0.70, 1.0];
    rings.forEach(function (rMul, rIdx) {
      ctx.save();
      ctx.strokeStyle = rIdx === 2 ? pal.primary : pal.secondary;
      ctx.globalAlpha = rIdx === 2 ? 0.85 : 0.35;
      ctx.lineWidth = rIdx === 2 ? 2.5 : 1.0;
      ctx.setLineDash(rIdx === 1 ? [4, 8] : []);
      ctx.beginPath();
      var segs = 48;
      for (var k = 0; k <= segs; k++) {
        var phi = (k / segs) * TAU;
        var lx = rad * rMul * Math.cos(phi), lz = rad * rMul * Math.sin(phi);
        var x1 = lx * cosYaw + lz * sinYaw, z1 = -lx * sinYaw + lz * cosYaw;
        var y2 = -z1 * sinPitch, z2 = z1 * cosPitch;
        var s = F / Math.max(10, z2 + Zcam);
        if (k === 0) ctx.moveTo(cx + x1 * s, cy + y2 * s);
        else ctx.lineTo(cx + x1 * s, cy + y2 * s);
      }
      ctx.stroke();
      ctx.restore();
    });

    var N = 180;
    var ratios = [[1, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 4]];
    var rIdx = Math.floor(t * 0.22) % ratios.length;
    var rx = ratios[rIdx][0], ry = ratios[rIdx][1];

    var curvePts = [];
    for (var i = 0; i < N; i++) {
      var theta = (i / N) * TAU * 2;
      var x0 = Math.sin(theta * rx * 2.2 + t * 1.8) * 0.72 + Math.sin(theta * 7) * 0.08;
      var z0 = Math.cos(theta * ry * 2.2) * 0.72 + Math.sin(theta * 5 + t * 0.9) * 0.08;
      var y0 = -(35 * m.kick + 20 * m.vocal) * Math.sin(theta * 3 + t * 3.2) * intMul;

      var lx = x0 * rad, lz = z0 * rad, ly = y0;
      var x1 = lx * cosYaw + lz * sinYaw, z1 = -lx * sinYaw + lz * cosYaw;
      var y2 = ly * cosPitch - z1 * sinPitch, z2 = ly * sinPitch + z1 * cosPitch;
      var s = F / Math.max(10, z2 + Zcam);
      curvePts.push({ x: cx + x1 * s, y: cy + y2 * s, s: s });
    }

    var channels = [
      { col: 'rgba(255, 55, 115, 0.75)', off: -1.8, lw: 2.8 },
      { col: 'rgba(20, 255, 180, 0.75)', off: 0, lw: 2.2 },
      { col: 'rgba(50, 180, 255, 0.85)', off: 1.8, lw: 2.8 }
    ];

    channels.forEach(function (ch) {
      ctx.save();
      ctx.strokeStyle = ch.col;
      ctx.lineWidth = ch.lw;
      ctx.beginPath();
      for (var i = 0; i < curvePts.length; i++) {
        var pt = curvePts[i];
        if (i === 0) ctx.moveTo(pt.x + ch.off * pt.s, pt.y + ch.off * pt.s * 0.5);
        else ctx.lineTo(pt.x + ch.off * pt.s, pt.y + ch.off * pt.s * 0.5);
      }
      ctx.stroke();
      ctx.restore();
    });

    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    for (var i2 = 0; i2 < curvePts.length; i2++) {
      if (i2 === 0) ctx.moveTo(curvePts[i2].x, curvePts[i2].y);
      else ctx.lineTo(curvePts[i2].x, curvePts[i2].y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  });

  // =====================================================================
  // 8. PMNDRS / POSTPROCESSING MULTI-FILTER PIPELINE & RACK ENGINE
  // Hỗ trợ chọn đồng thời nhiều filter full khung hình & phản ứng nhạc như Vizzy
  // =====================================================================
  var POST_PROCESSING_FILTERS = [
    {
      id: 'post_bloom',
      name: 'Unreal Bloom (Hào quang phát quang)',
      icon: '✨',
      desc: 'Tách ngưỡng sáng và tỏa hào quang phát quang rực rỡ chuẩn Unreal Engine',
      defaultParams: { threshold: 0.55, radius: 1.5, tint: '#ffffff' },
      schema: {
        threshold: { label: 'Ngưỡng sáng', min: 0.1, max: 0.95, step: 0.05, unit: '' },
        radius: { label: 'Bán kính tỏa', min: 0.5, max: 3.5, step: 0.1, unit: 'x' },
        tint: { label: 'Màu hào quang', type: 'color' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.8
    },
    {
      id: 'post_chromatic',
      name: 'Chromatic Aberration (Tách sắc sai RGB)',
      icon: '🌈',
      desc: 'Quang sai thấu kính viền đỏ/cyan + tách màu biên viền giật nảy theo Kick',
      defaultParams: { offset: 8, angle: 0, radial: 0.4 },
      schema: {
        offset: { label: 'Độ lệch màu', min: 1, max: 32, step: 1, unit: 'px' },
        angle: { label: 'Góc nghiêng', min: 0, max: 360, step: 15, unit: '°' },
        radial: { label: 'Tán sắc tỏa tròn', min: 0, max: 1, step: 0.05, unit: '' }
      },
      defaultAudioBand: 'kick',
      defaultAudioReactivity: 1.2
    },
    {
      id: 'post_glitch',
      name: 'Glitch & Digital Slices (Cắt lát kỹ thuật số)',
      icon: '⚡',
      desc: 'Cắt dải phân tầng ngang, giật khung hình và rách màu kỹ thuật số theo Bass',
      defaultParams: { slices: 8, jitter: 18, speed: 1.0 },
      schema: {
        slices: { label: 'Số lát cắt', min: 2, max: 24, step: 1, unit: '' },
        jitter: { label: 'Biên độ giật', min: 4, max: 48, step: 2, unit: 'px' },
        speed: { label: 'Tốc độ sóng', min: 0.5, max: 4.0, step: 0.5, unit: 'x' }
      },
      defaultAudioBand: 'bass',
      defaultAudioReactivity: 1.3
    },
    {
      id: 'post_grain',
      name: 'Film Grain (Hạt phim điện ảnh)',
      icon: '🎞️',
      desc: 'Hạt nhiễu Analog tự nhiên chuyển động từng khung hình tạo chất điện ảnh',
      defaultParams: { size: 1.5, roughness: 0.4, colored: 0 },
      schema: {
        size: { label: 'Kích cỡ hạt', min: 1.0, max: 3.5, step: 0.5, unit: 'px' },
        roughness: { label: 'Độ nhám', min: 0.1, max: 1.0, step: 0.05, unit: '' },
        colored: { label: 'Hạt RGB màu', min: 0, max: 1, step: 1, unit: '' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.3
    },
    {
      id: 'post_crt',
      name: 'CRT Monitor & Scanlines (Màn hình CRT cổ điển)',
      icon: '📺',
      desc: 'Lưới tia quét phosphor, bóng quét chuyển động và cong mép thấu kính retro',
      defaultParams: { lineSpacing: 3, curvature: 0.12, beamSpeed: 1.0 },
      schema: {
        lineSpacing: { label: 'Khoảng cách vạch', min: 2, max: 8, step: 1, unit: 'px' },
        curvature: { label: 'Độ cong màn hình', min: 0, max: 0.25, step: 0.02, unit: '' },
        beamSpeed: { label: 'Tốc độ tia quét', min: 0.2, max: 3.0, step: 0.2, unit: 'x' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.4
    },
    {
      id: 'post_radial_blur',
      name: 'Radial God Rays (Vệt mờ xuyên tâm)',
      icon: '🌌',
      desc: 'Phóng mờ hội tụ xuyên tâm tạo cảm giác lao tới tốc độ cao theo nhịp beat',
      defaultParams: { samples: 6, radius: 0.03, centerX: 0.5, centerY: 0.5 },
      schema: {
        samples: { label: 'Số mẫu làm mịn', min: 3, max: 12, step: 1, unit: '' },
        radius: { label: 'Bán kính phóng', min: 0.01, max: 0.08, step: 0.005, unit: '' },
        centerX: { label: 'Tâm X', min: 0.2, max: 0.8, step: 0.05, unit: '' },
        centerY: { label: 'Tâm Y', min: 0.2, max: 0.8, step: 0.05, unit: '' }
      },
      defaultAudioBand: 'beatPulse',
      defaultAudioReactivity: 1.5
    },
    {
      id: 'post_vignette',
      name: 'Cinematic Vignette (Tối viền góc thấu kính)',
      icon: '🌑',
      desc: 'Giảm độ sáng 4 góc màn hình để tập trung mắt nhìn vào chủ thể trung tâm',
      defaultParams: { radius: 0.55, smoothness: 0.45, color: '#000000' },
      schema: {
        radius: { label: 'Vùng sáng giữa', min: 0.2, max: 0.9, step: 0.05, unit: '' },
        smoothness: { label: 'Độ mượt viền', min: 0.1, max: 0.8, step: 0.05, unit: '' },
        color: { label: 'Màu tối viền', type: 'color' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.4
    },
    {
      id: 'post_color_grade',
      name: 'LUT Color Grade (Bảng màu điện ảnh & Tone)',
      icon: '🎨',
      desc: 'Chỉnh tông màu nghệ thuật: Cyberpunk, Teal & Orange, Anime Pastel, Matrix, Noir',
      defaultParams: { preset: 'cyberpunk', contrast: 1.18, saturation: 1.3, brightness: 1.02 },
      schema: {
        preset: { label: 'Preset màu', options: ['cyberpunk', 'teal_orange', 'anime_warm', 'matrix', 'vintage', 'noir'] },
        contrast: { label: 'Độ tương phản', min: 0.7, max: 1.8, step: 0.05, unit: 'x' },
        saturation: { label: 'Độ bão hòa màu', min: 0.0, max: 2.2, step: 0.1, unit: 'x' },
        brightness: { label: 'Độ sáng tổng thể', min: 0.7, max: 1.4, step: 0.05, unit: 'x' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.5
    },
    {
      id: 'post_heatwave',
      name: 'Heatwave Warp (Sóng nhiệt khúc xạ)',
      icon: '🌊',
      desc: 'Gợn sóng khúc xạ không khí biến dạng uyển chuyển dập dềnh theo tiếng Bass',
      defaultParams: { speed: 1.5, frequency: 20, amplitude: 12 },
      schema: {
        speed: { label: 'Tốc độ sóng', min: 0.5, max: 4.0, step: 0.2, unit: 'x' },
        frequency: { label: 'Mật độ gợn sóng', min: 8, max: 40, step: 2, unit: '' },
        amplitude: { label: 'Biên độ rung', min: 2, max: 32, step: 1, unit: 'px' }
      },
      defaultAudioBand: 'bass',
      defaultAudioReactivity: 1.1
    },
    {
      id: 'post_pixelate',
      name: 'Pixelate Mosaic (Nét điểm ảnh 8-Bit Retro)',
      icon: '👾',
      desc: 'Hạ độ phân giải dạng pixel retro cổ điển, bùng nổ theo nhịp ngắt của nhạc',
      defaultParams: { pixelSize: 8 },
      schema: {
        pixelSize: { label: 'Kích cỡ ô Pixel', min: 2, max: 28, step: 2, unit: 'px' }
      },
      defaultAudioBand: 'kick',
      defaultAudioReactivity: 1.2
    },
    {
      id: 'post_anamorphic_streak',
      name: 'Anamorphic Streaks (Vệt sáng Hollywood 2.39:1)',
      icon: '🌟',
      desc: 'Tia vệt sáng kéo dài ngang chuẩn thấu kính Anamorphic điện ảnh kiểu Sapphire/Hollywood',
      defaultParams: { length: 1.3, threshold: 0.65, streakColor: '#38bdf8', angle: 0 },
      schema: {
        length: { label: 'Độ dài tia vệt', min: 0.3, max: 2.5, step: 0.1, unit: 'x' },
        threshold: { label: 'Ngưỡng bắt sáng', min: 0.2, max: 0.95, step: 0.05, unit: '' },
        streakColor: { label: 'Màu tia sáng', type: 'color' },
        angle: { label: 'Góc nghiêng tia', min: -45, max: 45, step: 5, unit: '°' }
      },
      defaultAudioBand: 'kick',
      defaultAudioReactivity: 1.4
    },
    {
      id: 'post_halation',
      name: 'Film Halation 35mm (Quầng sáng đỏ điện ảnh)',
      icon: '🎞️',
      desc: 'Mô phỏng lớp phim Kodak Vision3: Viền tương phản gắt rực quầng đỏ tán sắc hữu cơ',
      defaultParams: { radius: 6, threshold: 0.6, tint: '#ff2626' },
      schema: {
        radius: { label: 'Bán kính tán sắc', min: 2, max: 18, step: 1, unit: 'px' },
        threshold: { label: 'Ngưỡng tương phản', min: 0.3, max: 0.9, step: 0.05, unit: '' },
        tint: { label: 'Màu Halation', type: 'color' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 1.0
    },
    {
      id: 'post_datamosh',
      name: 'Datamosh & Macroblock Glitch (Lỗi nén P-Frame)',
      icon: '👾',
      desc: 'Tách cụm pixel macroblock và xé vector chuyển động điện tử theo từng cú dập sub-bass',
      defaultParams: { blockSize: 32, displace: 36, blocks: 14 },
      schema: {
        blockSize: { label: 'Cỡ khối nén', min: 16, max: 80, step: 8, unit: 'px' },
        displace: { label: 'Biên độ xé hình', min: 10, max: 80, step: 5, unit: 'px' },
        blocks: { label: 'Mật độ khối vỡ', min: 4, max: 32, step: 2, unit: '' }
      },
      defaultAudioBand: 'bass',
      defaultAudioReactivity: 1.7
    },
    {
      id: 'post_shockwave_lens',
      name: 'Shockwave Blast Lens (Thấu kính sóng nổ)',
      icon: '💥',
      desc: 'Vòng sóng chấn động khúc xạ hình ảnh dội từ tâm chấn bùng nổ theo nhịp kick/snare',
      defaultParams: { wavelength: 0.16, refraction: 22, speed: 1.2, chroma: 0.6 },
      schema: {
        wavelength: { label: 'Bề rộng sóng', min: 0.06, max: 0.35, step: 0.02, unit: '' },
        refraction: { label: 'Lực bẻ khúc xạ', min: 6, max: 48, step: 2, unit: 'px' },
        speed: { label: 'Tốc độ sóng', min: 0.5, max: 3.0, step: 0.2, unit: 'x' },
        chroma: { label: 'Viền sắc sai', min: 0.0, max: 1.0, step: 0.1, unit: '' }
      },
      defaultAudioBand: 'kick',
      defaultAudioReactivity: 1.8
    },
    {
      id: 'post_prismatic_edge',
      name: 'Prismatic Glass Dispersion (Lăng kính đa sắc)',
      icon: '💎',
      desc: 'Khúc xạ mép kính vát kim cương phân tách ánh sáng thành dải quang phổ cầu vồng caustics',
      defaultParams: { depth: 0.15, dispersion: 12, facets: 6 },
      schema: {
        depth: { label: 'Độ dày kính viền', min: 0.05, max: 0.35, step: 0.02, unit: '' },
        dispersion: { label: 'Độ tách quang phổ', min: 3, max: 28, step: 1, unit: 'px' },
        facets: { label: 'Số mặt giác cắt', min: 3, max: 12, step: 1, unit: '' }
      },
      defaultAudioBand: 'beatPulse',
      defaultAudioReactivity: 1.4
    },
    {
      id: 'post_negative_flash',
      name: 'Sakuga Negative Flash (Chớp âm bản AMV Climax)',
      icon: '⚡',
      desc: 'Hiệu ứng cao trào Anime Sakuga: Đảo ngược âm bản dải sáng chớp giật cực hạn theo cao trào',
      defaultParams: { threshold: 0.45, mode: 'solarize', tint: '#16f4d4' },
      schema: {
        threshold: { label: 'Ngưỡng âm bản', min: 0.1, max: 0.85, step: 0.05, unit: '' },
        mode: { label: 'Chế độ chớp', options: ['solarize', 'invert', 'neon_edge', 'high_contrast'] },
        tint: { label: 'Màu chớp neon', type: 'color' }
      },
      defaultAudioBand: 'kick',
      defaultAudioReactivity: 2.0
    },
    {
      id: 'post_motion_smear',
      name: 'Kinetic Motion Smear (Vệt trượt tốc độ quang học)',
      icon: '🚀',
      desc: 'Quét vệt mờ chuyển động định hướng (Optical Flow Smear) tạo động lượng phi mã kiểu AMV Pro',
      defaultParams: { distance: 26, angle: 15, samples: 7 },
      schema: {
        distance: { label: 'Độ dài vệt trượt', min: 6, max: 64, step: 2, unit: 'px' },
        angle: { label: 'Góc trượt vector', min: -180, max: 180, step: 15, unit: '°' },
        samples: { label: 'Độ mượt vệt mờ', min: 4, max: 12, step: 1, unit: '' }
      },
      defaultAudioBand: 'bass',
      defaultAudioReactivity: 1.5
    },
    {
      id: 'post_motion_blur',
      name: 'Optical Shutter Motion Blur (Vệt mờ quang học tốc độ cao)',
      icon: '🚀',
      desc: 'Mô phỏng góc mở màn trập 180° Hollywood: Vệt mờ kéo vệt theo quán tính vận tốc lia/zoom của Camera',
      defaultParams: { shutterAngle: 180, samples: 6, intensity: 1.0 },
      schema: {
        shutterAngle: { label: 'Góc màn trập', min: 45, max: 360, step: 15, unit: '°' },
        samples: { label: 'Số mẫu làm mịn', min: 3, max: 10, step: 1, unit: '' },
        intensity: { label: 'Độ nhạy vận tốc', min: 0.2, max: 3.0, step: 0.1, unit: 'x' }
      },
      defaultAudioBand: 'kick',
      defaultAudioReactivity: 1.2
    },
    {
      id: 'post_dof_bokeh',
      name: 'Cinematic Depth-of-Field & Bokeh (Xóa phông & Chuyển tiêu cự)',
      icon: '📷',
      desc: 'Xóa phông Bokeh điện ảnh f/1.4 và Rack Focus chuyển tiêu cự thông minh giữa Nhân vật và Lyric',
      defaultParams: { mode: 'auto_rack', blurRadius: 6, bokehDiscs: 8, bokehGain: 1.4 },
      schema: {
        mode: { label: 'Tiêu cự Focus', options: ['auto_rack', 'focus_character', 'focus_lyric', 'shallow_dof'] },
        blurRadius: { label: 'Độ sâu xóa phông', min: 2, max: 14, step: 1, unit: 'px' },
        bokehDiscs: { label: 'Hạt Bokeh', min: 0, max: 16, step: 2, unit: '' },
        bokehGain: { label: 'Độ sáng Bokeh', min: 0.5, max: 2.5, step: 0.1, unit: 'x' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.6
    },
    {
      id: 'post_manga_halftone',
      name: 'Manga Screentone (Lưới điểm trame truyện tranh)',
      icon: '📰',
      desc: 'Lưới raster in ấn manga Nhật Bản co giãn kích thước điểm đen/trắng theo sóng âm nhạc',
      defaultParams: { dotSize: 7, angle: 45, invert: 0 },
      schema: {
        dotSize: { label: 'Cỡ điểm hạt Trame', min: 3, max: 18, step: 1, unit: 'px' },
        angle: { label: 'Góc xoay lưới', min: 0, max: 90, step: 5, unit: '°' },
        invert: { label: 'Đảo màu âm bản', min: 0, max: 1, step: 1, unit: '' }
      },
      defaultAudioBand: 'energy',
      defaultAudioReactivity: 0.7
    }
  ];

  // Ping-pong buffers for chaining multiple filters
  var _postBufA = null, _postBufB = null, _noiseBuf = null, _noiseSeed = -1;
  function getPostBuffer(name, w, h) {
    var c = name === 'A' ? _postBufA : _postBufB;
    if (!c) {
      c = document.createElement('canvas');
      if (name === 'A') _postBufA = c; else _postBufB = c;
    }
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    return c;
  }

  // --- 1. Pass: Bloom ---
  function renderPassBloom(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.01) return;

    var s = Math.max(3, Math.round(6 * (p.radius || 1.5)));
    var sw = Math.max(4, (w / s) | 0), sh = Math.max(4, (h / s) | 0);
    var small = buf('pBloomS', sw, sh), sc = small.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, sw, sh);
    sc.drawImage(src, 0, 0, sw, sh);

    var thresh = (p.threshold !== undefined) ? p.threshold : 0.55;
    // Brightness boost above threshold
    if ('filter' in sc) {
      sc.filter = 'brightness(' + (1.2 + effInt * 0.8) + ') blur(3px)';
      sc.drawImage(small, 0, 0);
      sc.filter = 'none';
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(0.55 * effInt);
    ctx.drawImage(small, 0, 0, w, h);

    if (p.tint && p.tint !== '#ffffff') {
      ctx.fillStyle = p.tint;
      ctx.globalAlpha = clamp(0.25 * effInt);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // --- 2. Pass: Chromatic Aberration ---
  function renderPassChromatic(ctx, src, w, h, t, p, effInt, isPreview) {
    if (effInt <= 0.01) { ctx.drawImage(src, 0, 0, w, h); return; }

    var off = (p.offset || 8) * effInt * (w / 1920);
    var ang = ((p.angle || 0) * Math.PI) / 180;
    var dx = Math.cos(ang) * off;
    var dy = Math.sin(ang) * off;

    var cv = glRun('post_chroma', GLSL_CHROMA, src, w, h, { uT: t, uI: effInt * (off / 8) }, isPreview);
    if (cv) {
      ctx.drawImage(cv, 0, 0, w, h);
    } else {
      // 2D Canvas Fallback
      var R = tinted('postChromaR', src, '#ff0044', w, h, isPreview);
      var Cy = tinted('postChromaCy', src, '#00e5ff', w, h, isPreview);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp(0.6 * effInt);
      ctx.drawImage(R, dx, dy, w, h);
      ctx.drawImage(Cy, -dx, -dy, w, h);
      ctx.restore();
    }
  }

  // --- 3. Pass: Glitch ---
  function renderPassGlitch(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var spd = p.speed || 1.0;
    var frame = Math.floor(t * 24 * spd);
    var rnd = rng(frame * 9109 + 23);
    var burst = rnd() < 0.7 ? 1.0 : 0.2;
    var totalSlices = p.slices || 8;
    var jitter = (p.jitter || 18) * effInt * burst * (w / 1920);

    var R = tinted('postGlitchR', src, '#ff0033', w, h, isPreview);
    var Cy = tinted('postGlitchCy', src, '#00ffff', w, h, isPreview);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < totalSlices; i++) {
      var sy = rnd() * h;
      var sh = rnd() * (h / totalSlices) * 1.2 + 4;
      var dx = (rnd() - 0.5) * jitter;
      if (Math.abs(dx) > 2) {
        ctx.drawImage(R, 0, sy, w, sh, dx, sy, w, sh);
        ctx.drawImage(Cy, 0, sy, w, sh, -dx, sy, w, sh);
      }
    }
    ctx.restore();
  }

  // --- 4. Pass: Film Grain ---
  function renderPassFilmGrain(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.02) return;

    if (!_noiseBuf) {
      _noiseBuf = document.createElement('canvas');
      _noiseBuf.width = 256;
      _noiseBuf.height = 256;
    }
    var seed = Math.floor(t * (isPreview ? 12 : 24));
    if (_noiseSeed !== seed) {
      _noiseSeed = seed;
      var nctx = _noiseBuf.getContext('2d');
      var idata = nctx.createImageData(256, 256);
      var buf32 = new Uint32Array(idata.data.buffer);
      var r = rng(seed * 4927 + 7);
      var rough = p.roughness || 0.4;
      var isCol = !!p.colored;

      for (var i = 0; i < 256 * 256; i++) {
        if (isCol) {
          var cr = (r() * 255) | 0, cg = (r() * 255) | 0, cb = (r() * 255) | 0;
          buf32[i] = (120 << 24) | (cb << 16) | (cg << 8) | cr;
        } else {
          var v = (r() * 255) | 0;
          buf32[i] = ((rough * 180) << 24) | (v << 16) | (v << 8) | v;
        }
      }
      nctx.putImageData(idata, 0, 0);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = clamp(0.35 * effInt);
    var ptrn = ctx.createPattern(_noiseBuf, 'repeat');
    ctx.fillStyle = ptrn;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // --- 5. Pass: CRT Scanlines & Screen Curvature ---
  function renderPassCRT(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.02) return;

    var spacing = p.lineSpacing || 3;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,' + clamp(0.24 * effInt) + ')';
    for (var y = 0; y < h; y += spacing) {
      ctx.fillRect(0, y, w, 1);
    }

    // Moving CRT Beam
    var bSpeed = p.beamSpeed || 1.0;
    var by = ((t * bSpeed * 0.4) % 1) * (h + h * 0.3) - h * 0.15;
    var bg = ctx.createLinearGradient(0, by - h * 0.1, 0, by + h * 0.1);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(0.5, 'rgba(255,255,255,' + (0.06 * effInt) + ')');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, by - h * 0.1, w, h * 0.2);

    // Vignette Glass Bulb Curvature
    var crv = p.curvature || 0.12;
    var v = ctx.createRadialGradient(w / 2, h / 2, h * (0.42 - crv * 0.4), w / 2, h / 2, Math.hypot(w, h) * 0.58);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,' + clamp(0.65 * effInt) + ')');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // --- 6. Pass: Radial Blur / God Rays ---
  function renderPassRadialBlur(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var samples = isPreview ? 3 : (p.samples || 6);
    var rad = (p.radius || 0.03) * effInt;
    var cx = (p.centerX !== undefined ? p.centerX : 0.5) * w;
    var cy = (p.centerY !== undefined ? p.centerY : 0.5) * h;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 1; i <= samples; i++) {
      var s = 1.0 + (i / samples) * rad;
      ctx.globalAlpha = clamp((0.28 / samples) * effInt);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  // --- 7. Pass: Cinematic Vignette ---
  function renderPassVignette(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.02) return;

    var rad = p.radius !== undefined ? p.radius : 0.55;
    var smooth = p.smoothness !== undefined ? p.smoothness : 0.45;
    var col = p.color || '#000000';

    ctx.save();
    var rInner = h * rad * (1.0 - smooth * 0.5);
    var rOuter = Math.hypot(w, h) * 0.55;
    var v = ctx.createRadialGradient(w / 2, h / 2, Math.max(0, rInner), w / 2, h / 2, rOuter);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, rgba(col, clamp(0.85 * effInt)));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // --- 8. Pass: Color Grade / LUT ---
  function renderPassColorGrade(ctx, src, w, h, t, p, effInt, isPreview) {
    var preset = p.preset || 'cyberpunk';
    var contrast = p.contrast !== undefined ? p.contrast : 1.18;
    var sat = p.saturation !== undefined ? p.saturation : 1.3;
    var bright = p.brightness !== undefined ? p.brightness : 1.02;

    // Modulate contrast and saturation with effective intensity
    var curContrast = lerp(1.0, contrast, effInt);
    var curSat = lerp(1.0, sat, effInt);
    var curBright = lerp(1.0, bright, effInt);

    ctx.save();
    if ('filter' in ctx) {
      var extra = '';
      if (preset === 'matrix') extra = ' hue-rotate(80deg)';
      else if (preset === 'vintage') extra = ' sepia(0.35)';
      else if (preset === 'noir') extra = ' grayscale(1.0)';
      ctx.filter = 'contrast(' + curContrast + ') saturate(' + curSat + ') brightness(' + curBright + ')' + extra;
    }
    ctx.drawImage(src, 0, 0, w, h);
    ctx.filter = 'none';

    // Split-tone Artistic Color Overlays
    if (preset === 'cyberpunk' && effInt > 0.05) {
      ctx.globalCompositeOperation = 'screen';
      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, rgba('#00e5ff', 0.12 * effInt));
      g.addColorStop(1, rgba('#ff007f', 0.14 * effInt));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (preset === 'teal_orange' && effInt > 0.05) {
      ctx.globalCompositeOperation = 'screen';
      var g2 = ctx.createLinearGradient(0, h, w, 0);
      g2.addColorStop(0, rgba('#005577', 0.15 * effInt));
      g2.addColorStop(1, rgba('#ff7700', 0.12 * effInt));
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
    } else if (preset === 'anime_warm' && effInt > 0.05) {
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba('#fbcfe8', 0.10 * effInt);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // --- 9. Pass: Heatwave Distortion ---
  function renderPassHeatwave(ctx, src, w, h, t, p, effInt, isPreview) {
    if (effInt <= 0.02) { ctx.drawImage(src, 0, 0, w, h); return; }

    var spd = p.speed || 1.5;
    var freq = p.frequency || 20;
    var amp = (p.amplitude || 12) * effInt * (w / 1920);
    var slices = 32;
    var sh = h / slices;

    ctx.save();
    for (var i = 0; i < slices; i++) {
      var y = i * sh;
      var dx = Math.sin(t * spd * TAU + i * (freq / slices) * TAU) * amp;
      ctx.drawImage(src, 0, y, w, sh + 0.5, dx, y, w, sh + 0.5);
    }
    ctx.restore();
  }

  // --- 10. Pass: Pixelate Retro ---
  function renderPassPixelate(ctx, src, w, h, t, p, effInt, isPreview) {
    if (effInt <= 0.05) { ctx.drawImage(src, 0, 0, w, h); return; }

    var sz = Math.max(2, Math.round((p.pixelSize || 8) * effInt));
    var pw = Math.max(2, (w / sz) | 0);
    var ph = Math.max(2, (h / sz) | 0);
    var small = buf('pPixelS', pw, ph), sc = small.getContext('2d');

    sc.imageSmoothingEnabled = false;
    sc.clearRect(0, 0, pw, ph);
    sc.drawImage(src, 0, 0, pw, ph);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, w, h);
    ctx.restore();
  }

  // --- 11. Pass: Anamorphic Streaks ---
  function renderPassAnamorphicStreak(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var streakLen = (p.length !== undefined ? p.length : 1.3) * effInt;
    var col = p.streakColor || '#38bdf8';
    var ang = (p.angle || 0) * Math.PI / 180;

    var sw = Math.max(32, (w / 12) | 0), sh = Math.max(16, (h / 3) | 0);
    var sBuf = buf('pStreakS', sw, sh), sc = sBuf.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, sw, sh);
    sc.drawImage(src, 0, 0, sw, sh);

    if ('filter' in sc) {
      sc.filter = 'brightness(' + (1.3 + effInt * 0.9) + ') contrast(1.4)';
      sc.drawImage(sBuf, 0, 0);
      sc.filter = 'none';
    }

    ctx.save();
    ctx.translate(w / 2, h / 2);
    if (ang !== 0) ctx.rotate(ang);
    ctx.translate(-w / 2, -h / 2);

    ctx.globalCompositeOperation = 'lighter';
    var passes = [1.0, 1.8 * streakLen, 3.2 * streakLen];
    for (var i = 0; i < passes.length; i++) {
      var spread = passes[i];
      ctx.globalAlpha = clamp((0.28 / (i + 1)) * effInt);
      ctx.drawImage(sBuf, 0, 0, sw, sh, -(spread - 1) * w * 0.5, 0, w * spread, h);
    }

    ctx.fillStyle = col;
    ctx.globalAlpha = clamp(0.25 * effInt);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // --- 12. Pass: Film Halation 35mm ---
  function renderPassHalation(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.03) return;

    var rad = Math.max(2, Math.round((p.radius || 6) * effInt * (w / 1920)));
    var tint = p.tint || '#ff2626';

    var sw = Math.max(32, (w / 4) | 0), sh = Math.max(18, (h / 4) | 0);
    var hBuf = buf('pHalationS', sw, sh), hc = hBuf.getContext('2d');
    hc.setTransform(1, 0, 0, 1, 0, 0);
    hc.clearRect(0, 0, sw, sh);
    hc.drawImage(src, 0, 0, sw, sh);

    if ('filter' in hc) {
      hc.filter = 'contrast(2.0) brightness(1.5) blur(' + Math.max(1, rad) + 'px)';
      hc.drawImage(hBuf, 0, 0);
      hc.filter = 'none';
    }

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(0.65 * effInt);

    var tintedBuf = tinted('pHalationTint', hBuf, tint, sw, sh, isPreview);
    ctx.drawImage(tintedBuf, 0, 0, w, h);
    ctx.restore();
  }

  // --- 13. Pass: Datamosh & Macroblock Glitch ---
  function renderPassDatamosh(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.08) return;

    var bSize = Math.max(16, p.blockSize || 32);
    var displace = (p.displace || 36) * effInt * (w / 1920);
    var numBlocks = Math.round((p.blocks || 14) * effInt);
    var frame = Math.floor(t * 18);
    var r = rng(frame * 7727 + 19);

    var R = tinted('pMoshR', src, '#ff1744', w, h, isPreview);
    var B = tinted('pMoshB', src, '#00e5ff', w, h, isPreview);

    ctx.save();
    for (var i = 0; i < numBlocks; i++) {
      var bx = Math.floor(r() * (w - bSize * 2));
      var by = Math.floor(r() * (h - bSize * 2));
      var bw = bSize * (1 + Math.floor(r() * 2));
      var bh = bSize * (1 + Math.floor(r() * 2));
      var dx = (r() - 0.5) * displace * 2;
      var dy = (r() - 0.5) * displace * 0.5;

      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(src, bx, by, bw, bh, bx + dx, by + dy, bw, bh);

      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp(0.5 * effInt);
      ctx.drawImage(R, bx, by, bw, bh, bx + dx + 4, by + dy, bw, bh);
      ctx.drawImage(B, bx, by, bw, bh, bx + dx - 4, by + dy, bw, bh);
    }
    ctx.restore();
  }

  // --- 14. Pass: Shockwave Blast Lens ---
  function renderPassShockwave(ctx, src, w, h, t, p, effInt, isPreview) {
    if (effInt <= 0.05) { ctx.drawImage(src, 0, 0, w, h); return; }

    var spd = p.speed || 1.2;
    var waveW = p.wavelength || 0.16;
    var refr = (p.refraction || 22) * effInt * (w / 1920);
    var chroma = p.chroma !== undefined ? p.chroma : 0.6;
    var cx = w / 2, cy = h / 2;
    var maxR = Math.hypot(w, h) * 0.55;

    var phase = ((t * spd * 1.5) % 1.0);
    var waveCenter = phase * maxR;

    ctx.drawImage(src, 0, 0, w, h);

    var bands = 12;
    ctx.save();
    for (var i = 0; i < bands; i++) {
      var rInner = waveCenter - waveW * maxR * (i / bands);
      if (rInner <= 0 || rInner >= maxR) continue;
      var rOuter = rInner + (waveW * maxR / bands);
      var mag = Math.sin((i / bands) * Math.PI) * refr;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, rOuter, 0, TAU);
      ctx.arc(cx, cy, rInner, 0, TAU, true);
      ctx.clip();

      var scale = 1.0 + (mag / w);
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.restore();
    }

    if (chroma > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = clamp(0.4 * effInt * chroma);
      ctx.beginPath();
      ctx.arc(cx, cy, waveCenter + refr * 0.5, 0, TAU);
      ctx.arc(cx, cy, Math.max(0, waveCenter - refr * 0.5), 0, TAU, true);
      ctx.clip();
      ctx.drawImage(tinted('pShockR', src, '#ff0055', w, h, isPreview), 2, 0, w, h);
      ctx.drawImage(tinted('pShockB', src, '#00ffff', w, h, isPreview), -2, 0, w, h);
      ctx.restore();
    }

    ctx.restore();
  }

  // --- 15. Pass: Prismatic Glass Dispersion ---
  function renderPassPrismaticEdge(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var depth = (p.depth || 0.15) * Math.min(w, h);
    var disp = (p.dispersion || 12) * effInt * (w / 1920);
    var facets = Math.max(3, p.facets || 6);

    ctx.save();
    var R = tinted('pPrismR', src, '#ff1a40', w, h, isPreview);
    var G = tinted('pPrismG', src, '#00ff66', w, h, isPreview);
    var B = tinted('pPrismB', src, '#0077ff', w, h, isPreview);

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = clamp(0.55 * effInt);

    for (var i = 0; i < facets; i++) {
      var angle = (i / facets) * TAU + t * 0.4;
      var dx = Math.cos(angle) * disp;
      var dy = Math.sin(angle) * disp;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.rect(depth, depth, w - depth * 2, h - depth * 2);
      ctx.clip('evenodd');

      ctx.drawImage(R, dx, dy, w, h);
      ctx.drawImage(G, 0, 0, w, h);
      ctx.drawImage(B, -dx, -dy, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  // --- 16. Pass: Sakuga Negative Flash ---
  function renderPassNegativeFlash(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.12) return;

    var mode = p.mode || 'solarize';
    var tint = p.tint || '#16f4d4';

    ctx.save();
    if (mode === 'invert') {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(effInt * 0.9) + ')';
      ctx.fillRect(0, 0, w, h);
    } else if (mode === 'neon_edge') {
      ctx.globalCompositeOperation = 'difference';
      ctx.drawImage(src, 3, 2, w, h);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = rgba(tint, clamp(0.7 * effInt));
      ctx.fillRect(0, 0, w, h);
    } else if (mode === 'high_contrast') {
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(0.6 * effInt) + ')';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.globalCompositeOperation = 'difference';
      ctx.fillStyle = 'rgba(255,255,255,' + clamp(0.85 * effInt) + ')';
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'color-dodge';
      ctx.fillStyle = rgba(tint, clamp(0.4 * effInt));
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }

  // --- 17. Pass: Kinetic Motion Smear ---
  function renderPassMotionSmear(ctx, src, w, h, t, p, effInt, isPreview) {
    if (effInt <= 0.05) { ctx.drawImage(src, 0, 0, w, h); return; }

    var dist = (p.distance || 26) * effInt * (w / 1920);
    var ang = (p.angle || 15) * Math.PI / 180;
    var samples = Math.max(3, p.samples || 7);
    var dx = Math.cos(ang) * dist;
    var dy = Math.sin(ang) * dist;

    ctx.save();
    ctx.drawImage(src, 0, 0, w, h);

    ctx.globalCompositeOperation = 'screen';
    for (var i = 1; i <= samples; i++) {
      var frac = (i / samples);
      ctx.globalAlpha = clamp((0.45 / samples) * effInt * (1.0 - frac * 0.4));
      ctx.drawImage(src, dx * frac, dy * frac, w, h);
      ctx.drawImage(src, -dx * frac * 0.5, -dy * frac * 0.5, w, h);
    }
    ctx.restore();
  }

  // --- 19. Pass: Optical Shutter Motion Blur ---
  function renderPassOpticalMotionBlur(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var camState = window.__AMV_CAMERA_STATE || {};
    var vel = camState.velocity || { vx: 0, vy: 0, vs: 0 };
    var shutter = ((p.shutterAngle || 180) / 360) * (p.intensity || 1.0) * effInt;
    var vx = vel.vx * shutter * 1.5;
    var vy = vel.vy * shutter * 1.5;
    var vs = vel.vs * shutter * 0.8;
    var spd = Math.hypot(vx, vy) + Math.abs(vs) * w * 0.1;

    if (spd < 1.0) {
      if (effInt > 0.4) {
        vx = Math.sin(t * 12) * 8 * effInt;
        vy = Math.cos(t * 9) * 4 * effInt;
        spd = Math.hypot(vx, vy);
      } else {
        return;
      }
    }

    var samples = isPreview ? 3 : Math.max(3, Math.min(8, p.samples || 6));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var i = 1; i <= samples; i++) {
      var frac = (i / samples);
      var alpha = (0.42 / samples) * effInt * (1.0 - frac * 0.35);
      ctx.globalAlpha = alpha;
      var dx = vx * frac, dy = vy * frac;
      var scaleStep = 1 + vs * frac;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(scaleStep, scaleStep);
      ctx.translate(-w / 2 + dx, -h / 2 + dy);
      ctx.drawImage(src, 0, 0, w, h);
      ctx.restore();
    }
    ctx.restore();
  }

  // --- 20. Pass: Cinematic Depth-of-Field & Bokeh ---
  function renderPassDoFBokeh(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var rad = Math.max(2, Math.round((p.blurRadius || 6) * effInt * (w / 1920)));
    var camState = window.__AMV_CAMERA_STATE || {};
    var dofFocus = camState.dofFocus || 'character';

    var bBuf = buf('pDoFBokeh', Math.max(8, (w / 3) | 0), Math.max(8, (h / 3) | 0));
    var bc = bBuf.getContext('2d');
    bc.clearRect(0, 0, bBuf.width, bBuf.height);
    bc.drawImage(src, 0, 0, bBuf.width, bBuf.height);
    if ('filter' in bc) {
      bc.filter = 'blur(' + rad + 'px) brightness(' + (p.bokehGain || 1.3) + ')';
      bc.drawImage(bBuf, 0, 0);
      bc.filter = 'none';
    }

    ctx.save();
    var fX = camState.anchorX || (w * 0.5);
    var fY = camState.anchorY || (h * 0.55);
    var focalRadius = Math.min(w, h) * (dofFocus === 'lyric' ? 0.28 : 0.35);

    var mask = ctx.createRadialGradient(fX, fY, focalRadius * 0.3, fX, fY, focalRadius * 1.6);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    mask.addColorStop(1, 'rgba(0,0,0,1)');

    var maskBuf = buf('pDoFMask', w, h), mc = maskBuf.getContext('2d');
    mc.clearRect(0, 0, w, h);
    mc.drawImage(bBuf, 0, 0, w, h);
    mc.globalCompositeOperation = 'destination-in';
    mc.fillStyle = mask;
    mc.fillRect(0, 0, w, h);

    ctx.globalAlpha = clamp(0.75 * effInt);
    ctx.drawImage(maskBuf, 0, 0, w, h);

    var discs = p.bokehDiscs || 8;
    if (discs > 0 && effInt > 0.3) {
      var rnd = rng(Math.floor(t * 12) + 41);
      ctx.globalCompositeOperation = 'screen';
      for (var d = 0; d < discs; d++) {
        var ang = rnd() * TAU, dist = focalRadius * 0.8 + rnd() * (w * 0.4);
        var bx = fX + Math.cos(ang) * dist, by = fY + Math.sin(ang) * dist;
        var bSize = (rad * 1.8 + rnd() * 12) * effInt;
        var bAlpha = (0.15 + rnd() * 0.25) * effInt;
        ctx.fillStyle = rnd() > 0.5 ? '#fff3d1' : '#a5f3fc';
        ctx.globalAlpha = bAlpha;
        ctx.beginPath();
        ctx.arc(bx, by, bSize, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // --- 18. Pass: Manga Screentone ---
  function renderPassMangaHalftone(ctx, src, w, h, t, p, effInt, isPreview) {
    ctx.drawImage(src, 0, 0, w, h);
    if (effInt <= 0.05) return;

    var dSize = Math.max(3, Math.round((p.dotSize || 7) * (w / 1920)));
    var ang = (p.angle || 45) * Math.PI / 180;
    var inv = !!p.invert;

    var pBuf = buf('pMangaDot', dSize * 2, dSize * 2), pc = pBuf.getContext('2d');
    pc.clearRect(0, 0, dSize * 2, dSize * 2);
    pc.fillStyle = inv ? '#ffffff' : '#000000';
    pc.beginPath();
    pc.arc(dSize, dSize, Math.max(1, dSize * 0.45 * effInt), 0, TAU);
    pc.fill();

    ctx.save();
    ctx.globalCompositeOperation = inv ? 'screen' : 'multiply';
    ctx.globalAlpha = clamp(0.35 * effInt);

    ctx.translate(w / 2, h / 2);
    ctx.rotate(ang);
    ctx.translate(-w / 2, -h / 2);

    var ptrn = ctx.createPattern(pBuf, 'repeat');
    ctx.fillStyle = ptrn;
    ctx.fillRect(-w * 0.5, -h * 0.5, w * 2, h * 2);
    ctx.restore();
  }

  // Master Compositor: Applies active filters sequentially in a high-speed ping-pong chain
  function applyPostProcessingStack(destCtx, srcCanvas, w, h, t, postFilters, plan, isPreview, targetW, targetH) {
    var tw = (typeof targetW === 'number' && targetW > 0) ? targetW : w;
    var th = (typeof targetH === 'number' && targetH > 0) ? targetH : h;
    if (!postFilters || typeof postFilters !== 'object') {
      destCtx.drawImage(srcCanvas, 0, 0, w, h, 0, 0, tw, th);
      return;
    }

    // Check if any filter is actually active
    var activeList = [];
    for (var f = 0; f < POST_PROCESSING_FILTERS.length; f++) {
      var meta = POST_PROCESSING_FILTERS[f];
      var cfg = postFilters[meta.id];
      if (cfg && cfg.enabled) {
        activeList.push({ meta: meta, cfg: cfg });
      }
    }

    if (activeList.length === 0) {
      destCtx.drawImage(srcCanvas, 0, 0, w, h, 0, 0, tw, th);
      return;
    }

    var m = getAudioMetrics(t, { plan: plan });
    var bufA = getPostBuffer('A', w, h);
    var bufB = getPostBuffer('B', w, h);
    var currentSrc = srcCanvas;
    var bufIdx = 0;

    for (var i = 0; i < activeList.length; i++) {
      var item = activeList[i];
      var meta = item.meta;
      var cfg = item.cfg;

      // Extract band value
      var band = cfg.audioBand || meta.defaultAudioBand || 'energy';
      var bandVal = (band === 'bass') ? m.bass : ((band === 'kick') ? m.kick : ((band === 'beatPulse' || band === 'beat') ? m.beatPulse : m.energy));

      var baseInt = (typeof cfg.intensity === 'number') ? cfg.intensity : 1.0;
      var audioReact = (typeof cfg.audioReactivity === 'number') ? cfg.audioReactivity : (meta.defaultAudioReactivity || 0);
      var effInt = clamp(baseInt * (1.0 + audioReact * bandVal * 1.5), 0, 3.5);

      var targetBuf = (bufIdx === 0) ? bufA : bufB;
      var tctx = targetBuf.getContext('2d');
      tctx.setTransform(1, 0, 0, 1, 0, 0);
      tctx.clearRect(0, 0, w, h);

      var p = Object.assign({}, meta.defaultParams, cfg.params || {});

      // Dispatch to specific pass
      switch (meta.id) {
        case 'post_bloom': renderPassBloom(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_chromatic': renderPassChromatic(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_glitch': renderPassGlitch(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_grain': renderPassFilmGrain(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_crt': renderPassCRT(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_radial_blur': renderPassRadialBlur(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_vignette': renderPassVignette(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_color_grade': renderPassColorGrade(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_heatwave': renderPassHeatwave(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_pixelate': renderPassPixelate(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_anamorphic_streak': renderPassAnamorphicStreak(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_halation': renderPassHalation(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_datamosh': renderPassDatamosh(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_shockwave_lens': renderPassShockwave(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_prismatic_edge': renderPassPrismaticEdge(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_negative_flash': renderPassNegativeFlash(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_motion_smear': renderPassMotionSmear(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_manga_halftone': renderPassMangaHalftone(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_motion_blur': renderPassOpticalMotionBlur(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        case 'post_dof_bokeh': renderPassDoFBokeh(tctx, currentSrc, w, h, t, p, effInt, isPreview); break;
        default: tctx.drawImage(currentSrc, 0, 0, w, h); break;
      }

      currentSrc = targetBuf;
      bufIdx = 1 - bufIdx;
    }

    destCtx.drawImage(currentSrc, 0, 0, w, h, 0, 0, tw, th);
  }

  // ------------------------------------------------------------- public API
  var API = {
    ease: E,
    utils: { clamp: clamp, lerp: lerp, seg: seg, rng: rng, noise1: noise1, rgba: rgba },
    categories: [CAT_LAYOUT, CAT_IDLE, CAT_DECO, CAT_CAMERA, CAT_SCREEN, CAT_TRANS, CAT_AUDIO],
    assets: ASSETS,
    postProcessingFilters: POST_PROCESSING_FILTERS,
    applyPostProcessingStack: applyPostProcessingStack,
    getAudioMetrics: getAudioMetrics,
    get: function (id) {
      var ALIASES = {
        'audio_aurora_spectrum': 'audio_aurora_spectrum',
        'aurora_spectrum': 'audio_aurora_spectrum',
        'aurora_ring': 'audio_aurora_spectrum',
        'spectrum_ring': 'audio_aurora_spectrum',

        'audio_neon_circle': 'audio_trap_nation_pro',
        'circle_trap': 'audio_trap_nation_pro',
        'circle': 'audio_trap_nation_pro',
        'trap_nation': 'audio_trap_nation_pro',

        'audio_bass_eq_bars': 'audio_monstercat_pro',
        'bottom_mirror': 'audio_monstercat_pro',
        'monstercat': 'audio_monstercat_pro',
        'eq_bars': 'audio_monstercat_pro',

        'audio_liquid_ribbon': 'audio_liquid_ribbon_pro',
        'ribbon_wave': 'audio_liquid_ribbon_pro',
        'siri_wave': 'audio_liquid_ribbon_pro',
        'liquid_silk': 'audio_liquid_ribbon_pro',

        'side_wings': 'audio_dual_stereo_wings',
        'stereo_wings': 'audio_dual_stereo_wings',

        'audio_particle_bounce': 'audio_stardust_constellation',
        'orbit_particles': 'audio_stardust_constellation',
        'stardust': 'audio_stardust_constellation',
        'constellation': 'audio_stardust_constellation',

        'audio_waveform_3d_grid': 'audio_cyber_matrix_pro',
        'cyber_grid': 'audio_cyber_matrix_pro',
        'led_matrix': 'audio_cyber_matrix_pro',

        'audio_shockwave_blast': 'audio_shockwave_blast_pro',
        'shockwave': 'audio_shockwave_blast_pro',
        'shockwave_blast': 'audio_shockwave_blast_pro',

        // 3D Studio-grade Visualizer Aliases & Full IDs
        'galaxy_orbit': 'audio_galaxy_orbit_3d',
        'audio_galaxy_orbit': 'audio_galaxy_orbit_3d',
        'audio_galaxy_orbit_3d': 'audio_galaxy_orbit_3d',
        'galaxy_particles': 'audio_galaxy_orbit_3d',

        'cyber_ribbon_3d': 'audio_cyber_ribbon_3d',
        'cyber_ribbon': 'audio_cyber_ribbon_3d',
        'audio_cyber_ribbon': 'audio_cyber_ribbon_3d',
        'audio_cyber_ribbon_3d': 'audio_cyber_ribbon_3d',
        'wave_surface_3d': 'audio_cyber_ribbon_3d',

        'holographic_lissajous': 'audio_holographic_lissajous_3d',
        'audio_holographic_lissajous': 'audio_holographic_lissajous_3d',
        'audio_holographic_lissajous_3d': 'audio_holographic_lissajous_3d',
        'glass_lissajous': 'audio_holographic_lissajous_3d',
        'lissajous': 'audio_holographic_lissajous_3d',
        'lissajous_scope': 'audio_holographic_lissajous_3d',
        'holographic_scope': 'audio_holographic_lissajous_3d',
        'vectorscope': 'audio_holographic_lissajous_3d'
      };
      if (id && ALIASES[id]) id = ALIASES[id];
      for (var i = 0; i < ASSETS.length; i++) if (ASSETS[i].id === id) return ASSETS[i];
      return null;
    },
    byCategory: function (c) {
      return ASSETS.filter(function (a) { return a.category === c; });
    },
    resolve: resolve,
    getActiveProjectScheme: getActiveProjectScheme,
    mapParamToSchemeColor: mapParamToSchemeColor,
    render: function (idOrAsset, ctx, w, h, t, overrides) {
      var a = typeof idOrAsset === 'string' ? API.get(idOrAsset) : idOrAsset;
      if (!a) {
        // Safe failover: fall back to audio_trap_nation_pro so render loop never blanks out!
        a = API.get('audio_trap_nation_pro');
        if (!a && ASSETS.length > 0) a = ASSETS[0];
      }
      if (!a) return;
      try {
        ctx.save();
        var renderT = (a.category === 'Chuyển tiếp') ? clamp(t, 0, 1) : t;
        a.render(ctx, w, h, renderT, resolve(a, overrides));
        ctx.restore();
      } catch (renderErr) {
        ctx.restore();
        console.warn('AMV Asset Library render error for asset:', a ? a.id : idOrAsset, renderErr);
        // Emergency fallback if failed asset was not already trap nation
        if (a && a.id !== 'audio_trap_nation_pro') {
          try {
            var fb = API.get('audio_trap_nation_pro');
            if (fb && typeof fb.render === 'function') {
              ctx.save();
              fb.render(ctx, w, h, t, resolve(fb, overrides));
              ctx.restore();
            }
          } catch (_) {}
        }
      }
    }
  };

  root.AMVAssets = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
