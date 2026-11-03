// Batch 2 — 30 native CIN MIX techniques (3 per group), injected into the cin_mix_fx IIFE.
export const NEW_CODE = `
/* ============================================================
   JIZURA CIN MIX — NATIVE TECHNIQUES BATCH 2 (pack: cin_mix_fx)
   Bổ sung 30 kỹ thuật native: 3 cho mỗi nhóm trong 10 nhóm.
   ============================================================ */

/* ---------------- LAYOUT (batch 2) ---------------- */

// 4. Neon Sign: bảng neon viền sáng + chữ phát quang
J.register('layout', 'cinNeonSign', {
  name: '🪧 Neon Sign (Bảng Neon Sáng)',
  tags: ['pop', 'glitch', 'graphic'],
  w: 1, fits: n => n >= 1 && n <= 20,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])),
      track: rng.range(0.05, 0.14),
      sign: rng.chance(0.65),
      size: rng.range(0.08, 0.13),
    };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const lines = J.splitLines(raw, W < H ? 8 : 13);
    const o = { track: P.track, lead: 1.12 };
    const size = Math.min(J.fitSize(lines, P.font, W * 0.66, H * 0.26, o), H * (P.size || 0.12));
    const m = meas(lines, P.font, size, o);
    const cx = W / 2, cy = H * 0.46;
    const e = inK(env), oo = outK(env);
    const col = sc.accent;
    if (P.sign && e > 0.01) {
      const pad = size * 0.45, pw = m.w + pad * 2, ph = m.h + pad * 1.4;
      const ctx = env.ctx;
      ctx.save();
      ctx.globalAlpha = 0.92 * e * oo;
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, size * 0.022);
      ctx.shadowColor = col;
      ctx.shadowBlur = size * 0.3 * e;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - pw / 2, cy - ph / 2, pw, ph, size * 0.14);
      else ctx.rect(cx - pw / 2, cy - ph / 2, pw, ph);
      ctx.stroke();
      ctx.restore();
    }
    const bb = J.mainDraw(env, { text: lines, font: P.font, size, x: cx, y: cy, track: P.track, lead: 1.12, color: sc.fg,
      shadow: { dx: 0, dy: 0, blur: size * 0.2, color: col } });
    return bb || bbOf(cx - m.w / 2, cy - m.h / 2, cx + m.w / 2, cy + m.h / 2);
  }
});

// 5. Subtitle Safe: phụ đề an toàn ở đáy khung
J.register('layout', 'cinSubtitleSafe', {
  name: '💬 Subtitle Safe (Phụ Đề An Toàn)',
  tags: ['editorial', 'calm', 'emotional'],
  w: 1, fits: n => n >= 1 && n <= 60,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['body', 'display'])), track: rng.range(0.01, 0.05), plate: rng.chance(0.55) };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const lines = J.splitLines(raw, W < H ? 22 : 42);
    const o = { track: P.track, lead: 1.3 };
    const size = Math.min(J.fitSize(lines, P.font, W * 0.78, H * 0.17, o), H * 0.062);
    const m = meas(lines, P.font, size, o);
    const cx = W / 2, cy = H * 0.875;
    const e = inK(env), oo = outK(env);
    if (P.plate && e > 0.01) {
      env.rect(cx - m.w / 2 - size * 0.45, cy - m.h / 2 - size * 0.22, m.w + size * 0.9, m.h + size * 0.44, sc.bg, 0.55 * e * oo, false);
    }
    const bb = J.mainDraw(env, { text: lines, font: P.font, size, x: cx, y: cy, track: P.track, lead: 1.3, color: sc.fg });
    return bb || bbOf(cx - m.w / 2, cy - m.h / 2, cx + m.w / 2, cy + m.h / 2);
  }
});

// 6. Kanji Stack: chữ lớn dọc kiểu Nhật + gạch accent
J.register('layout', 'cinStackKanji', {
  name: '🈶 Kanji Stack (Chữ Lớn Kiểu Nhật)',
  tags: ['editorial', 'emotional', 'graphic'],
  w: 1, fits: n => n >= 1 && n <= 12,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), vertical: rng.chance(0.7), size: rng.range(0.13, 0.19) };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const text = String(env.cut.text || '');
    const vert = !!P.vertical;
    let lines = text, size;
    if (vert) {
      size = Math.min(H * (P.size || 0.18), W * 0.26, (H * 0.8) / Math.max(1, J.glyphCount(text)));
    } else {
      lines = J.splitLines(text, W < H ? 8 : 14);
      size = Math.min(J.fitSize(lines, P.font, W * 0.78, H * 0.3, { track: 0.04, lead: 1.22 }), H * 0.16);
    }
    const cx = W * 0.5, cy = H * 0.47;
    const e = inK(env), oo = outK(env);
    const bb = J.mainDraw(env, { text: lines, font: P.font, size, x: cx, y: cy, vertical: vert, track: 0.04, lead: 1.22, color: sc.fg });
    if (e > 0.01) {
      const lw = Math.max(1.4, size * 0.018);
      if (vert) env.line([[cx + size * 0.95, H * 0.12], [cx + size * 0.95, H * 0.88]], sc.accent, lw, 0.55 * oo, false);
      else env.line([[W * 0.12, cy + size * 0.78], [W * 0.88, cy + size * 0.78]], sc.accent, lw, 0.55 * oo, false);
    }
    return bb;
  }
});

/* ---------------- ENTER (batch 2) ---------------- */

// 4. Whip In: quất ngang vào khung
J.register('enter', 'cinWhipIn', {
  name: '💨 Whip In (Vào Bằng Quất Ngang)',
  tags: ['pop', 'graphic'],
  inDur: (dur, n) => Math.min(0.5, 0.14 + n * 0.01),
  apply(env, it, p) {
    const k = 1 - E.outExpo(p);
    const dir = (it.seed % 2 === 0) ? 1 : -1;
    it.x += dir * env.W * 0.55 * k;
    it.skew = (it.skew || 0) + dir * 32 * k;
    it.size *= 1 + k * 0.22;
    it.alpha = (it.alpha ?? 1) * Math.min(1, p * 5);
    glyphs(it, (i) => ({ dx: dir * k * env.W * 0.1 * (1 + (i % 3) * 0.12) }));
  }
});

// 5. Type On: máy đánh chữ từng ký tự
J.register('enter', 'cinTypeOn', {
  name: '⌨️ Type On (Máy Đánh Chữ)',
  tags: ['editorial', 'graphic', 'calm'],
  inDur: (dur, n) => Math.min(1.4, 0.35 + n * 0.05),
  apply(env, it, p) {
    const total = Math.max(1, [...String(it.text || '')].length);
    const shown = Math.ceil(p * total);
    it.alpha = (it.alpha ?? 1) * Math.min(1, p * 6);
    glyphs(it, (i) => (i < shown ? null : { hide: true }));
  }
});

// 6. Beat Zoom: phóng to đập theo nhịp
J.register('enter', 'cinBeatZoom', {
  name: '💓 Beat Zoom (Phóng To Đập Nhịp)',
  tags: ['pop', 'emotional'],
  inDur: (dur, n) => Math.min(0.7, 0.2 + n * 0.012),
  apply(env, it, p) {
    const e = E.outBack(p, 2.1);
    it.size *= 0.62 + e * 0.38;
    it.alpha = (it.alpha ?? 1) * Math.min(1, p * 4);
    const drive = Math.min(1.2, bassOf(env) + kickOf(env) * 0.8);
    if (drive > 0.01) glyphs(it, (i) => ({ s: 1 + drive * 0.06 * Math.sin(i * 0.6) }));
  }
});

/* ---------------- HOLD (batch 2) ---------------- */

// 4. Beat Pulse: phồng nhẹ theo nhịp
J.register('hold', 'cinBeatPulse', {
  name: '💗 Beat Pulse (Phồng Theo Nhịp)',
  tags: ['pop', 'emotional'],
  apply(env, it, amt) {
    const drive = Math.min(1.2, beatK(env) + kickOf(env) * 0.5);
    if (drive <= 0.01) return;
    glyphs(it, (i) => ({ s: 1 + drive * 0.045 * amt }));
  }
});

// 5. Wave Shift: sóng chạy ngang qua ký tự
J.register('hold', 'cinWaveShift', {
  name: '🌊 Wave Shift (Sóng Chạy Qua Ký Tự)',
  tags: ['calm', 'emotional'],
  apply(env, it, amt) {
    const t = env.lt || 0, ph = t * 3.2;
    glyphs(it, (i) => ({
      dy: Math.sin(ph + i * 0.5) * it.size * 0.09 * amt,
      rot: Math.sin(ph * 0.8 + i * 0.4) * 4 * amt,
    }));
  }
});

// 6. Glitch Pulse: giật lệch kênh theo nhịp
J.register('hold', 'cinGlitchPulse', {
  name: '🧿 Glitch Pulse (Giật Lệch Kênh Theo Nhịp)',
  tags: ['glitch', 'pop'],
  apply(env, it, amt) {
    const st = env.step | 0, seed = (env.cut && env.cut.seed) || 1;
    const drive = Math.min(1, beatK(env) + kickOf(env) * 0.6);
    if (J.r(seed, st, 41) > 0.18 * (0.3 + drive) * amt) return;
    const off = (J.r(seed, st, 42) - 0.5) * it.size * 0.3;
    const du = (J.r(seed, st, 43) - 0.5) * it.size * 0.12;
    glyphs(it, (i) => ({ dx: off * (i % 2 ? 1 : -1), dy: du }));
  }
});

/* ---------------- EXIT (batch 2) ---------------- */

// 4. Scatter Out: tung văng tứ phía
J.register('exit', 'cinScatterOut', {
  name: '💥 Scatter Out (Tung Văng Tứ Phía)',
  tags: ['pop', 'glitch'],
  outDur: (dur, n) => Math.min(0.7, 0.25 + n * 0.012),
  apply(env, it, p) {
    const e = E.inCubic(p), seed = it.seed | 0;
    it.alpha = (it.alpha ?? 1) * (1 - e * 0.35);
    glyphs(it, (i) => {
      const a = J.r(seed, i, 51) * TAU;
      const d = e * env.W * (0.12 + J.r(seed, i, 52) * 0.3);
      return {
        dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.6,
        rot: J.rs(seed, i, 53) * 120 * e,
        s: Math.max(0.12, 1 - e * 0.55),
        a: 1 - e,
      };
    });
  }
});

// 5. Reverse Exit: thoát ngược — chữ bay ngược lại
J.register('exit', 'cinReverseExit', {
  name: '⏪ Reverse Exit (Thoát Ngược Chiều)',
  tags: ['editorial', 'calm'],
  outDur: (dur, n) => Math.min(0.8, 0.3 + n * 0.014),
  apply(env, it, p) {
    const e = E.inOutCubic(p), dir = (it.seed % 2 === 0) ? 1 : -1;
    it.x += dir * env.W * 0.38 * e;
    it.size *= 1 + e * 0.45;
    it.alpha = (it.alpha ?? 1) * (1 - e);
    it.blur = (it.blur || 0) + e * it.size * 0.06;
    glyphs(it, (i) => ({ dx: dir * e * env.W * 0.035 * i, a: 1 - e * 0.5 }));
  }
});

// 6. Vertical Blur: mờ dần rồi tan
J.register('exit', 'cinVerticalBlur', {
  name: '🌫️ Vertical Blur (Mờ Dần Rồi Tan)',
  tags: ['emotional', 'calm'],
  outDur: (dur, n) => Math.min(0.9, 0.35 + n * 0.015),
  apply(env, it, p) {
    const e = E.inQuad(p);
    it.blur = (it.blur || 0) + e * it.size * 0.14;
    it.alpha = (it.alpha ?? 1) * (1 - e);
    it.size *= 1 + e * 0.18;
    glyphs(it, (i) => ({ dy: e * it.size * 0.12 * (i % 2 ? 1 : -1) }));
  }
});

/* ---------------- TREAT (batch 2) ---------------- */

// 4. Gradient Sweep: dải sáng chạy qua chữ
J.register('treat', 'cinGradientSweep', {
  name: '🌈 Gradient Sweep (Dải Sáng Chạy Qua)',
  tags: ['pop', 'graphic'],
  w: 0.9,
  plan: rng => ({ c0: rng.pick(['#FFFFFF', '#F5EEEA']), c1: rng.pick(['#F5A50C', '#FF3D6E', '#16F4D4']), speed: rng.range(0.5, 1.3) }),
  apply(env, it, P) {
    const a = (P && P.c0) || '#FFFFFF', b = (P && P.c1) || '#F5A50C';
    const t = env.lt || 0, sp = (P && P.speed) || 1;
    const f = ((t * sp) % 1);
    const p = 0.08 + f * 0.84;
    it.gradient = [[0, a], [p, b], [1, a]];
    it.shadow = { dx: 0, dy: 0, blur: it.size * 0.12, color: b };
  }
});

// 5. Retro Print: in lệch màu kiểu retro
J.register('treat', 'cinRetroPrint', {
  name: '🖨️ Retro Print (In Lệch Màu Retro)',
  tags: ['editorial', 'graphic', 'pop'],
  w: 0.9,
  plan: rng => ({ c1: rng.pick(['#FF3D6E', '#00F0FF', '#F5A50C']), c2: rng.pick(['#00F0FF', '#FFE600', '#FF0055']) }),
  apply(env, it, P) {
    const c1 = (P && P.c1) || '#FF3D6E', c2 = (P && P.c2) || '#00F0FF';
    it.extrude = { n: 5, dx: it.size * 0.03, dy: it.size * 0.03, color: c1, fade: true, a: 0.9 };
    it.stroke = Math.max(1, it.size * 0.013);
    it.strokeColor = c2;
  }
});

// 6. Stencil Break: chữ stencil bị cắt khúc
J.register('treat', 'cinStencilBreak', {
  name: '🔪 Stencil Break (Chữ Stencil Bị Cắt)',
  tags: ['glitch', 'graphic'],
  w: 0.9,
  apply(env, it) {
    const st = env.step | 0, seed = (env.cut && env.cut.seed) || 1;
    it.fill = false;
    it.stroke = Math.max(1.4, it.size * 0.024);
    it.strokeColor = accentOf(env);
    if (J.r(seed, st, 71) > 0.7) glyphs(it, () => ({ clipY: [-0.7, -0.22] }));
  }
});

/* ---------------- DECOR (batch 2) ---------------- */

// 4. Letterbox Bars: thanh đen cinema 2.39:1
J.register('decor', 'cinLetterboxBars', {
  name: '🎞️ Letterbox Bars (Thanh Đen Cinema)',
  tags: ['editorial', 'emotional'],
  w: 1, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H } = env, oo = outK(env);
    const bar = Math.min(H * 0.11, W * 0.055);
    env.rect(0, 0, W, bar, '#000000', 0.95 * oo, false);
    env.rect(0, H - bar, W, bar, '#000000', 0.95 * oo, false);
  }
});

// 5. Film Dust: bụi và vết xước phim nhựa
J.register('decor', 'cinFilmDust', {
  name: '🎞️ Film Dust (Bụi Và Vết Xước Phim)',
  tags: ['editorial', 'emotional', 'glitch'],
  w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H } = env, u = Math.min(W, H);
    const st = env.step | 0, seed = (Pd && Pd.seed) || 1, oo = outK(env);
    for (let i = 0; i < 26; i++) {
      if (J.r(seed, st, i, 61) > 0.28) continue;
      const x = J.r(seed, i, 62) * W, y = J.r(seed, i, 63) * H;
      const s = u * (0.001 + J.r(seed, i, 64) * 0.004);
      env.circle(x, y, s, '#FFFFFF', null, 0, 0.22 * oo, false);
      env.circle(x, y + s * 2.4, s * 0.6, '#000000', null, 0, 0.18 * oo, false);
    }
    const sc = 1 + (st % 3);
    for (let i = 0; i < sc; i++) {
      const x = J.r(seed, st, i, 65) * W;
      env.line([[x, 0], [x + J.rs(seed, i, 66) * u * 0.012, H]], '#FFFFFF', 1, 0.07 * oo, false);
    }
  }
});

// 6. Lens Flare: quầng sáng ống kính
J.register('decor', 'cinLensFlare', {
  name: '🔮 Lens Flare (Quầng Sáng Ống Kính)',
  tags: ['emotional', 'pop'],
  w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H, sc } = env, u = Math.min(W, H), t = env.lt || 0, oo = outK(env);
    const sx = W * (0.5 + 0.26 * Math.sin(t * 0.33));
    const sy = H * (0.4 + 0.1 * Math.cos(t * 0.27));
    const dx = W * 0.5 - sx, dy = H * 0.5 - sy;
    const col = sc.accent2;
    for (let i = 1; i <= 4; i++) {
      const k = i / 4;
      const x = sx + dx * k * 1.6, y = sy + dy * k * 1.6;
      const r = u * (0.01 + 0.02 * (1 - k));
      env.circle(x, y, r, col, null, 0, 0.15 * oo, false);
    }
    env.circle(sx, sy, u * 0.018, '#FFFFFF', null, 0, 0.3 * oo, false);
    env.circle(sx, sy, u * 0.05, col, null, 0, 0.09 * oo, false);
  }
});

/* ---------------- BG (batch 2) ---------------- */

// 4. Aurora Rift: rèm cực quang
bgReg('cinAuroraRift', {
  name: '🌌 Aurora Rift (Rèm Cực Quang)',
  tags: ['emotional', 'calm'],
  w: 1,
  plan: rng => ({ n: rng.int(2, 4), seed: rng.int(1, 1e9), hue: rng.pick(['accent', 'accent2']) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0, s = P.seed || 1;
    const n = P.n || 3, col = P.hue === 'accent2' ? sc.accent2 : sc.accent;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const baseY = H * (0.26 + 0.13 * k);
      const g = ctx.createLinearGradient(0, baseY - H * 0.22, 0, baseY + H * 0.3);
      g.addColorStop(0, J.rgba(col, 0));
      g.addColorStop(0.5, J.rgba(col, 0.15));
      g.addColorStop(1, J.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      const N = 28;
      for (let i = 0; i <= N; i++) {
        const u = i / N, x = u * W;
        const y = baseY + Math.sin(u * 4 + t * 0.7 + k * 1.7) * H * 0.05 + J.noise1(u * 6 + t * 0.4, s + k) * H * 0.04;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      for (let i = N; i >= 0; i--) {
        const u = i / N, x = u * W;
        const y = baseY + H * 0.22 + Math.sin(u * 3.2 - t * 0.5 + k) * H * 0.04;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
});

// 5. Halftone Sun: mặt trời halftone retro
bgReg('cinHalftoneSun', {
  name: '🌅 Halftone Sun (Mặt Trời Halftone Retro)',
  tags: ['editorial', 'pop', 'graphic'],
  w: 1,
  plan: rng => ({ rows: rng.int(8, 14), seed: rng.int(1, 1e9), warm: rng.chance(0.6) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, s = P.seed || 1;
    const rows = P.rows || 10, cols = Math.max(6, Math.round(rows * (W / H)));
    const top = H * 0.16, bot = H * 0.86;
    const cA = P.warm ? '#FFB347' : (sc.accent || '#F5A50C');
    const cB = P.warm ? '#FF5E62' : (sc.accent2 || '#FF3D6E');
    ctx.save();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u = (c + 0.5) / cols, v = (r + 0.5) / rows;
        const d = Math.hypot((u - 0.5) * (W / H), v - 0.5) / 0.5;
        if (d > 1) continue;
        const rr = (1 - d) * H * 0.09 * (0.7 + 0.3 * J.noise1(r * 3 + c, s));
        if (rr <= 0.4) continue;
        ctx.fillStyle = v < 0.5 ? cA : cB;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(u * W, top + v * (bot - top), rr, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
});

// 6. Dust Motes: hạt bụi lơ lửng trong không khí
bgReg('cinDustMotes', {
  name: '✨ Dust Motes (Hạt Bụi Lơ Lửng)',
  tags: ['emotional', 'calm'],
  w: 0.9,
  plan: rng => ({ n: rng.int(18, 40), seed: rng.int(1, 1e9) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0, s = P.seed || 1;
    const n = P.n || 26, u = Math.min(W, H);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x0 = J.r(s, i, 81) * W, y0 = J.r(s, i, 82) * H;
      const sp = 0.02 + J.r(s, i, 83) * 0.06;
      const x = ((x0 + Math.sin(t * (0.2 + J.r(s, i, 84)) + i) * W * 0.02) % W + W) % W;
      const y = ((y0 - t * sp * H) % (H * 1.2) + H * 1.2) % (H * 1.2) - H * 0.1;
      const r = u * (0.0015 + J.r(s, i, 85) * 0.005);
      ctx.fillStyle = J.rgba(i % 4 === 0 ? sc.accent : sc.fg, 0.1 + J.r(s, i, 86) * 0.28);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
});

/* ---------------- CAM (batch 2) ---------------- */

// 4. Handheld Shake: lắc máy cầm tay
J.register('cam', 'cinHandheldShake', {
  name: '🤲 Handheld Shake (Lắc Máy Cầm Tay)',
  tags: ['emotional', 'editorial', 'calm'],
  w: 1.2,
  plan: rng => ({ amp: rng.range(0.004, 0.011), f: rng.range(0.7, 1.5) }),
  get(env, P) {
    const t = env.lt || 0, m = motionOf(env);
    const a = (P.amp || 0.007) * m, f = P.f || 1;
    return {
      s: 1.03,
      x: (J.noise1(t * f * 2.4, 11) + J.noise1(t * f * 5.1, 23) * 0.4) * env.W * a,
      y: (J.noise1(t * f * 2.1, 31) + J.noise1(t * f * 4.3, 41) * 0.4) * env.H * a,
      rot: J.noise1(t * f * 1.7, 53) * (P.amp || 0.007) * 220 * m,
    };
  }
});

// 5. Dutch Angle: góc nghiêng đặc trưng
J.register('cam', 'cinDutchAngle', {
  name: '📐 Dutch Angle (Góc Nghiêng Đặc Trưng)',
  tags: ['editorial', 'emotional'],
  w: 1.1,
  plan: rng => ({ ang: rng.range(-9, 9), drift: rng.range(-2, 2) }),
  get(env, P) {
    const t = env.lt || 0, m = motionOf(env);
    const a = (P.ang || 0) + Math.sin(t * 0.35) * (P.drift || 0);
    return { s: 1.04, rot: a * m };
  }
});

// 6. Zoom Breath: zoom phập phồng theo nhịp thở
J.register('cam', 'cinZoomBreath', {
  name: '🫁 Zoom Breath (Zoom Phập Phồng)',
  tags: ['calm', 'emotional', 'editorial'],
  w: 1.1,
  plan: rng => ({ amt: rng.range(0.02, 0.05), f: rng.range(0.12, 0.3) }),
  get(env, P) {
    const t = env.lt || 0, m = motionOf(env);
    const a = (P.amt || 0.03) * m, f = P.f || 0.2;
    return {
      s: 1.03 + Math.sin(t * f * TAU) * a,
      y: Math.sin(t * f * TAU + 1.2) * env.H * 0.004 * m,
    };
  }
});

/* ---------------- FX (batch 2) ---------------- */

// 4. Scanline Roll: vạch số quét cuộn màn hình
J.register('fx', 'cinScanlineRoll', {
  name: '📺 Scanline Roll (Vạch Số Quét Cuộn)',
  tags: ['glitch', 'graphic'],
  w: 1, dur: 5, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * Math.sin(Math.PI * clamp(k));
    if (a <= 0.02) return;
    const bh = Math.max(4, Math.round(ch * 0.16));
    const y = Math.max(0, Math.min(ch - bh, Math.round(((I.t * 0.6) % 1.4 - 0.2) * ch)));
    ctx.save();
    ctx.globalAlpha = 0.5 * a;
    ctx.drawImage(S, 0, y, cw, bh, 0, y - bh, cw, bh);
    ctx.globalAlpha = 0.3 * a;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, y, cw, bh);
    ctx.restore();
  }
});

// 5. RGB Stutter: nhấp nháy kênh màu RGB
J.register('fx', 'cinRGBStutter', {
  name: '🔁 RGB Stutter (Nhấp Nháy Kênh Màu)',
  tags: ['glitch', 'pop'],
  w: 1, dur: 5, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * (1 - E.inCubic(k));
    if (a <= 0.02) return;
    const st = I.step | 0;
    const T = I.tmp(cw, ch), tx = T.getContext('2d');
    const chan = (mult, dx) => {
      tx.setTransform(1, 0, 0, 1, 0, 0);
      tx.globalCompositeOperation = 'source-over';
      tx.globalAlpha = 1;
      tx.clearRect(0, 0, cw, ch);
      tx.drawImage(S, 0, 0);
      tx.globalCompositeOperation = 'multiply';
      tx.fillStyle = mult;
      tx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, 0.75 * a);
      ctx.drawImage(T, dx, 0);
      ctx.restore();
    };
    const o = Math.max(2, Math.round(cw * 0.006 * (0.4 + J.r(st, 3) * 1.6) * a));
    chan('#ff0000', -o);
    chan('#00ffff', o);
  }
});

// 6. Echo Trail: vệt sóng mờ dần
J.register('fx', 'cinEchoTrail', {
  name: '👻 Echo Trail (Vệt Sóng Mờ Dần)',
  tags: ['emotional', 'pop'],
  w: 0.9, dur: 6, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * (1 - E.inCubic(k));
    if (a <= 0.02) return;
    const dx = Math.round(cw * 0.012 * a);
    ctx.save();
    ctx.globalAlpha = 0.28 * a;
    ctx.drawImage(S, -dx, 0);
    ctx.globalAlpha = 0.16 * a;
    ctx.drawImage(S, dx * 2, 0);
    ctx.restore();
  }
});

/* ---------------- TRANS (batch 2) ---------------- */

// 4. Film Burn: vệt cháy phim nuốt cảnh mới
trReg('cinFilmBurn', {
  name: '🔥 Film Burn (Vệt Cháy Phim)',
  tags: ['glitch', 'emotional'],
  w: 1.2, dur: 0.5,
  plan: rng => ({ dir: rng.pick([1, -1]), warm: rng.chance(0.6) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const e = E.inOutCubic(clamp(p));
    const dir = Pt.dir || 1;
    const cx = dir > 0 ? e * cw * 1.15 : cw - e * cw * 1.15;
    const R = Math.max(cw, ch) * 0.16;
    const T = I.tmp(cw, ch), tx = T.getContext('2d');
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.globalAlpha = 1;
    tx.globalCompositeOperation = 'source-over';
    tx.clearRect(0, 0, cw, ch);
    tx.drawImage(B, 0, 0);
    tx.globalCompositeOperation = 'destination-in';
    const g = tx.createRadialGradient(cx, ch * 0.5, R * 0.2, cx, ch * 0.5, R * 2.2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    tx.fillStyle = g;
    tx.fillRect(0, 0, cw, ch);
    tx.globalCompositeOperation = 'source-over';
    ctx.drawImage(T, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const eg = ctx.createRadialGradient(cx, ch * 0.5, R * 0.6, cx, ch * 0.5, R * 2.4);
    eg.addColorStop(0, Pt.warm ? 'rgba(255,220,150,0.7)' : 'rgba(255,255,255,0.55)');
    eg.addColorStop(0.4, Pt.warm ? 'rgba(255,120,40,0.35)' : 'rgba(180,220,255,0.28)');
    eg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = eg;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }
});

// 5. Iris Circle: iris tròn mở từ tâm
trReg('cinIrisCircle', {
  name: '⭕ Iris Circle (Iris Tròn Mở)',
  tags: ['editorial', 'pop'],
  w: 1, dur: 0.45,
  plan: rng => ({ cx: rng.range(0.35, 0.65), cy: rng.range(0.35, 0.65) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const e = E.inOutCubic(clamp(p));
    const cx = cw * (Pt.cx || 0.5), cy = ch * (Pt.cy || 0.5);
    const R = Math.max(0.01, Math.hypot(cw, ch) * 0.62 * e);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.clip('evenodd');
    ctx.drawImage(B, 0, 0);
    ctx.restore();
  }
});

// 6. Shutter Bars: rèm shutter mở dần
trReg('cinShutterBars', {
  name: '🎚️ Shutter Bars (Rèm Shutter)',
  tags: ['editorial', 'graphic'],
  w: 1, dur: 0.4,
  plan: rng => ({ n: rng.int(6, 12), dir: rng.pick([1, -1]) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const n = Pt.n || 8, dir = Pt.dir || 1, bh = ch / n;
    for (let i = 0; i < n; i++) {
      const off = dir > 0 ? i : n - 1 - i;
      const q = clamp((p - off * (0.35 / n)) / (1 - 0.35));
      const e = E.inOutCubic(q);
      const y = i * bh, h = bh * (1 - e);
      if (h <= 0.5) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y, cw, h);
      ctx.clip();
      ctx.drawImage(B, 0, 0);
      ctx.restore();
    }
  }
});
`;

export const TITLES = {
  layout: {
    anchor: "      cinVerticalDrift: 'Vertical Drift Column',\n",
    add: "      cinNeonSign: 'Neon Sign Board',\n      cinSubtitleSafe: 'Subtitle Safe',\n      cinStackKanji: 'Stacked Kanji Column',\n",
  },
  enter: {
    anchor: "      cinIrisFocus: 'Iris Focus In',\n",
    add: "      cinWhipIn: 'Whip In',\n      cinTypeOn: 'Typewriter On',\n      cinBeatZoom: 'Beat Zoom In',\n",
  },
  hold: {
    anchor: "      cinSplitFlicker: 'Split Channel Flicker',\n",
    add: "      cinBeatPulse: 'Beat Pulse',\n      cinWaveShift: 'Wave Shift',\n      cinGlitchPulse: 'Glitch Pulse',\n",
  },
  exit: {
    anchor: "      cinPixelDissolve: 'Pixel Dissolve',\n",
    add: "      cinScatterOut: 'Scatter Out',\n      cinReverseExit: 'Reverse Exit',\n      cinVerticalBlur: 'Vertical Blur Out',\n",
  },
  decor: {
    anchor: "      cinTimecode: 'Timecode Overlay',\n",
    add: "      cinLetterboxBars: 'Letterbox Bars',\n      cinFilmDust: 'Film Dust and Scratches',\n      cinLensFlare: 'Lens Flare Ghosts',\n",
  },
  treat: {
    anchor: "      cinOutlineNeon: 'Neon Outline',\n",
    add: "      cinGradientSweep: 'Gradient Sweep',\n      cinRetroPrint: 'Retro Offset Print',\n      cinStencilBreak: 'Stencil Break',\n",
  },
  bg: {
    anchor: "      cinRainBokeh: 'Rain and Bokeh',\n",
    add: "      cinAuroraRift: 'Aurora Rift',\n      cinHalftoneSun: 'Halftone Sun',\n      cinDustMotes: 'Floating Dust Motes',\n",
  },
  cam: {
    anchor: "      cinSnapIn: 'Snap In',\n",
    add: "      cinHandheldShake: 'Handheld Shake',\n      cinDutchAngle: 'Dutch Angle',\n      cinZoomBreath: 'Breathing Zoom',\n",
  },
  fx: {
    anchor: "      cinVignettePulse: 'Vignette Pulse',\n",
    add: "      cinScanlineRoll: 'Rolling Scanline',\n      cinRGBStutter: 'RGB Stutter',\n      cinEchoTrail: 'Echo Trail',\n",
  },
  trans: {
    anchor: "      cinLightLeak: 'Light Leak',\n",
    add: "      cinFilmBurn: 'Film Burn',\n      cinIrisCircle: 'Circular Iris',\n      cinShutterBars: 'Shutter Bars',\n",
  },
};

export const MARKER = 'JIZURA — which entries random picks may use';
