// Batch 3 — 36 native CIN MIX techniques across 6 groups (layout, decor, bg, cam, fx, trans).
export const NEW_CODE = `
/* ============================================================
   JIZURA CIN MIX — NATIVE TECHNIQUES BATCH 3 (pack: cin_mix_fx)
   Bố cục / Trang trí / Nền / Camera / Hiệu ứng màn hình / Chuyển tiếp
   ============================================================ */

/* ---------------- LAYOUT (batch 3) ---------------- */

// 7. Kicker Title: tiêu đề lớn + kicker nhỏ phía trên + gạch
J.register('layout', 'cinKickerTitle', {
  name: '📰 Kicker Title (Tiêu Đề Có Kicker)',
  tags: ['editorial', 'graphic', 'emotional'],
  w: 1, fits: n => n >= 1 && n <= 28,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      kickFont: rng.pick(fontsOf(st, ['mono', 'body'])),
      kicker: rng.pick(['FEATURE', 'CHAPTER', 'INTERLUDE', 'EPISODE', 'CINEMIX']),
      rule: rng.chance(0.7),
      left: rng.chance(0.45),
    };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const lines = J.splitLines(raw, W < H ? 9 : 15);
    const o = { track: 0.03, lead: 1.16 };
    const left = !!P.left;
    const maxW = W * (left ? 0.72 : 0.84);
    const size = Math.min(J.fitSize(lines, P.font, maxW, H * 0.36, o), H * 0.19);
    const m = meas(lines, P.font, size, o);
    const cx = left ? W * 0.11 + m.w / 2 : W / 2;
    const cy = left ? H * 0.5 : H * 0.54;
    const e = inK(env), oo = outK(env);
    if (P.kicker && e > 0.01) {
      const ks = Math.max(10, size * 0.19);
      env.draw({
        text: P.kicker, font: P.kickFont, size: ks, x: cx - m.w / 2, y: cy - m.h / 2 - size * 0.72,
        align: 'left', track: 0.3, color: sc.accent, alpha: E.outCubic(clamp((env.lt || 0) / 0.4)) * oo, ghost: false,
      });
      if (P.rule) {
        const y = cy - m.h / 2 - size * 0.42;
        env.line([[cx - m.w / 2, y], [cx - m.w / 2 + m.w * 0.28 * e, y]], sc.accent, Math.max(1.4, size * 0.016), 0.8 * oo, false);
      }
    }
    const bb = J.mainDraw(env, { text: lines, font: P.font, size, x: cx, y: cy, track: 0.03, lead: 1.16, color: sc.fg });
    return bb || bbOf(cx - m.w / 2, cy - m.h / 2, cx + m.w / 2, cy + m.h / 2);
  }
});

// 8. News Ticker: dải chạy chữ ở đáy khung
J.register('layout', 'cinNewsTicker', {
  name: '📰 News Ticker (Dải Chạy Chữ Đáy Khung)',
  tags: ['editorial', 'graphic'],
  w: 1, fits: n => n >= 1 && n <= 90,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['mono', 'body'])), speed: rng.range(0.05, 0.16), size: rng.range(0.022, 0.036) };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const size = Math.min(H * (P.size || 0.03), W * 0.05);
    const y = H * 0.93;
    const o = { track: 0.02, lead: 1.2 };
    const m = meas(raw, P.font, size, o);
    const e = inK(env), oo = outK(env);
    const barH = size * 1.9;
    if (e > 0.01) env.rect(0, y - barH / 2, W, barH, sc.accent, 0.9 * e * oo, false);
    const sp = (P.speed || 0.1) * W;
    const off = ((env.lt || 0) * sp) % Math.max(1, m.w + W * 0.4);
    const rep = Math.max(2, Math.ceil(W / Math.max(1, m.w)) + 2);
    for (let i = 0; i < rep; i++) {
      const x = W + m.w / 2 - off + i * (m.w + W * 0.2);
      if (x < -m.w || x > W + m.w) continue;
      env.draw({ text: raw, font: P.font, size, x, y, track: 0.02, color: sc.bg, alpha: e * oo, ghost: false });
    }
    return bbOf(0, y - barH / 2, W, y + barH / 2);
  }
});

// 9. Poster Big: số lớn bên trái + tiêu đề xếp bên phải
J.register('layout', 'cinPosterBig', {
  name: '🎬 Poster Big (Áp Phích Số Lớn)',
  tags: ['editorial', 'pop', 'graphic'],
  w: 1, fits: n => n >= 1 && n <= 24,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])),
      num: rng.pick(['01', '02', '07', '12', '24', '35']),
      vertical: rng.chance(0.5),
    };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const lines = J.splitLines(raw, W < H ? 7 : 11);
    const numFont = (env.st && env.st.fonts && env.st.fonts.display && env.st.fonts.display[0]) || 'gothic_black';
    const numSize = Math.min(H * 0.42, W * 0.26);
    const o = { track: 0.02, lead: 1.2 };
    const size = Math.min(J.fitSize(lines, P.font, W * 0.52, H * 0.3, o), H * 0.12);
    const m = meas(lines, P.font, size, o);
    const e = inK(env), oo = outK(env);
    const nx = W * 0.16, ny = H * 0.48;
    env.draw({
      text: P.num, font: numFont, size: numSize, x: nx, y: ny,
      color: sc.accent, alpha: e * oo, track: -0.02, rot: -3, ghost: false,
    });
    if (e > 0.01) env.line([[nx - numSize * 0.4, ny + numSize * 0.42], [nx + numSize * 0.4, ny + numSize * 0.42]], sc.accent, Math.max(1.5, size * 0.02), 0.7 * oo, false);
    const bb = J.mainDraw(env, { text: lines, font: P.font, size, x: W * 0.62, y: H * 0.48, track: 0.02, lead: 1.2, color: sc.fg });
    return bb || bbOf(W * 0.4, H * 0.3, W * 0.85, H * 0.65);
  }
});

// 10. Corner Stack: chữ xếp ở bốn góc + gạch nối
J.register('layout', 'cinCornerStack', {
  name: '🔲 Corner Stack (Chữ Bốn Góc)',
  tags: ['graphic', 'editorial'],
  w: 1, fits: n => n >= 1 && n <= 20,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), size: rng.range(0.05, 0.09), rules: rng.chance(0.8) };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const words = raw.split(/[\\s、,，\\/]+/).filter(Boolean);
    const size = Math.min(H * (P.size || 0.07), W * 0.09);
    const e = inK(env), oo = outK(env);
    const pad = W * 0.05;
    const slots = [[pad, pad, 'left', 'top'], [W - pad, pad, 'right', 'top'], [pad, H - pad, 'left', 'bottom'], [W - pad, H - pad, 'right', 'bottom']];
    let bb = null;
    for (let i = 0; i < slots.length; i++) {
      const w = words[i % Math.max(1, words.length)] || raw;
      const [sx, sy, al, vy] = slots[i];
      const y = vy === 'top' ? sy + size * 0.5 : sy - size * 0.5;
      const r = env.draw({ text: w, font: P.font, size, x: sx, y, align: al, track: 0.02, color: i % 2 ? sc.accent : sc.fg, alpha: e * oo, ghost: false });
      if (r) bb = bb ? { x0: Math.min(bb.x0, r.x0), x1: Math.max(bb.x1, r.x1), y0: Math.min(bb.y0, r.y0), y1: Math.max(bb.y1, r.y1), cx: (bb.x0 + bb.x1) / 2, cy: (bb.y0 + bb.y1) / 2, boxes: [] } : r;
      if (P.rules && e > 0.01) {
        const lw = Math.max(1, size * 0.03);
        const L = size * 0.9;
        if (al === 'left') env.line([[sx, y + (vy === 'top' ? size * 0.7 : -size * 0.7)], [sx + L, y + (vy === 'top' ? size * 0.7 : -size * 0.7)]], sc.accent, lw, 0.5 * oo, false);
        else env.line([[sx - L, y + (vy === 'top' ? size * 0.7 : -size * 0.7)], [sx, y + (vy === 'top' ? size * 0.7 : -size * 0.7)]], sc.accent, lw, 0.5 * oo, false);
      }
    }
    return bb || bbOf(pad, pad, W - pad, H - pad);
  }
});

// 11. Dual Column: hai cột chữ chia đôi bởi vạch dọc
J.register('layout', 'cinDualColumn', {
  name: '📑 Dual Column (Hai Cột Chữ)',
  tags: ['editorial', 'graphic', 'calm'],
  w: 1, fits: n => n >= 4 && n <= 60,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['body', 'serif'])), gap: rng.range(0.04, 0.08), rule: rng.chance(0.8) };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const arr = [...raw.replace(/\\s+/g, ' ')].filter(c => c !== ' ');
    const half = Math.ceil(arr.length / 2);
    const a = arr.slice(0, half).join(' '), b = arr.slice(half).join(' ');
    const o = { track: 0.02, lead: 1.34 };
    const colW = W * 0.4;
    const size = Math.min(J.fitSize(a + '\\n' + b, P.font, colW, H * 0.44, o), H * 0.055);
    const m = meas(a, P.font, size, o);
    const e = inK(env), oo = outK(env);
    const lx = W * 0.27, rx = W * 0.73, cy = H * 0.5;
    const bb1 = J.mainDraw(env, { text: a, font: P.font, size, x: lx, y: cy, track: 0.02, lead: 1.34, color: sc.fg, align: 'left' });
    const bb2 = J.mainDraw(env, { text: b, font: P.font, size, x: rx, y: cy, track: 0.02, lead: 1.34, color: sc.sub, align: 'left' });
    if (P.rule && e > 0.01) {
      env.line([[W / 2, H * 0.24], [W / 2, H * 0.76]], sc.accent, Math.max(1.2, size * 0.03), 0.55 * oo, false);
    }
    return bb1 || bb2 || bbOf(lx - m.w / 2, cy - m.h / 2, rx + m.w / 2, cy + m.h / 2);
  }
});

// 12. Marquee Box: hộp chữ nghiêng kiểu biển hiệu
J.register('layout', 'cinMarqueeBox', {
  name: '🪧 Marquee Box (Hộp Chữ Nghiêng)',
  tags: ['pop', 'graphic'],
  w: 1, fits: n => n >= 1 && n <= 18,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'body'])), rot: rng.range(-14, -4), size: rng.range(0.06, 0.1) };
  },
  render(env) {
    const { W, H, sc } = env, P = env.cut.params || {};
    const raw = String(env.cut.text || '');
    const o = { track: 0.04, lead: 1.1 };
    const size = Math.min(H * (P.size || 0.08), W * 0.13);
    const m = meas(raw, P.font, size, o);
    const cx = W / 2, cy = H * 0.48, rot = P.rot || -8;
    const e = inK(env), oo = outK(env);
    if (e > 0.01) {
      const ctx = env.ctx, pad = size * 0.5;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot * DEG);
      ctx.globalAlpha = 0.92 * e * oo;
      ctx.fillStyle = sc.accent;
      ctx.fillRect(-m.w / 2 - pad, -m.h / 2 - pad * 0.55, m.w + pad * 2, m.h + pad * 1.1);
      ctx.restore();
    }
    const bb = J.mainDraw(env, { text: raw, font: P.font, size, x: cx, y: cy, track: 0.04, lead: 1.1, rot, color: sc.bg });
    return bb || bbOf(cx - m.w / 2, cy - m.h / 2, cx + m.w / 2, cy + m.h / 2);
  }
});

/* ---------------- DECOR (batch 3) ---------------- */

// 7. Sprocket Holes: lỗ răng cưa phim hai bên
J.register('decor', 'cinSprocketHoles', {
  name: '🎞️ Sprocket Holes (Lỗ Răng Cưa Phim)',
  tags: ['editorial', 'glitch'],
  w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H } = env, u = Math.min(W, H), oo = outK(env);
    const band = u * 0.032, r = band * 0.3;
    const n = Math.max(6, Math.round(H / (band * 0.85)));
    const step = H / n;
    for (let i = 0; i < n; i++) {
      const y = step * (i + 0.5);
      env.circle(band * 0.5, y, r, '#000000', null, 0, 0.8 * oo, false);
      env.circle(W - band * 0.5, y, r, '#000000', null, 0, 0.8 * oo, false);
    }
    env.rect(0, 0, band, H, '#000000', 0.55 * oo, false);
    env.rect(W - band, 0, band, H, '#000000', 0.55 * oo, false);
  }
});

// 8. Diagonal Rule: dải chéo cắt qua góc
J.register('decor', 'cinDiagonalRule', {
  name: '📐 Diagonal Rule (Dải Chéo Góc Khung)',
  tags: ['graphic', 'editorial'],
  w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H, sc } = env, u = Math.min(W, H), oo = outK(env);
    const bw = u * 0.012, len = Math.hypot(W, H);
    const ang = -Math.PI / 4;
    const cx = Pd && Pd.right ? W * 0.92 : W * 0.08;
    const cy = Pd && Pd.low ? H * 0.92 : H * 0.08;
    env.line([[cx - Math.cos(ang) * len * 0.5, cy - Math.sin(ang) * len * 0.5], [cx + Math.cos(ang) * len * 0.5, cy + Math.sin(ang) * len * 0.5]], sc.accent, bw, 0.7 * oo, false);
  }
});

// 9. Neon Frame: khung neon phát sáng
J.register('decor', 'cinNeonFrame', {
  name: '💡 Neon Frame (Khung Neon Phát Sáng)',
  tags: ['glitch', 'pop'],
  w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H, sc } = env, u = Math.min(W, H), oo = outK(env);
    const m = u * 0.045, ctx = env.ctx;
    const col = sc.accent2;
    ctx.save();
    ctx.globalAlpha = 0.85 * oo;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.4, u * 0.003);
    ctx.shadowColor = col;
    ctx.shadowBlur = u * 0.02;
    ctx.strokeRect(m, m, W - m * 2, H - m * 2);
    ctx.restore();
    const t = u * 0.03;
    for (const [sx, sy] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) {
      env.circle(sx, sy, t * 0.5, col, null, 0, 0.9 * oo, false);
    }
  }
});

// 10. Film Leader: đồng hồ đếm ngược dạo phim
J.register('decor', 'cinFilmLeader', {
  name: '⭕ Film Leader (Đồng Hồ Đếm Ngược)',
  tags: ['editorial', 'graphic'],
  w: 0.8, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H, sc } = env, u = Math.min(W, H), oo = outK(env);
    const cx = W * 0.5, cy = H * 0.5;
    const size = Math.min(H * 0.34, W * 0.2);
    const n = 3 - (Math.floor((env.t || 0) * 2) % 4);
    const val = String(Math.max(1, n));
    const font = (env.st && env.st.fonts && env.st.fonts.display && env.st.fonts.display[0]) || 'gothic_black';
    env.circle(cx, cy, u * 0.26, null, sc.accent, Math.max(1.6, u * 0.004), 0.6 * oo, false);
    env.circle(cx, cy, u * 0.3, null, sc.sub, Math.max(1, u * 0.002), 0.3 * oo, false);
    env.line([[cx - u * 0.3, cy], [cx + u * 0.3, cy]], sc.sub, Math.max(1, u * 0.002), 0.35 * oo, false);
    env.line([[cx, cy - u * 0.3], [cx, cy + u * 0.3]], sc.sub, Math.max(1, u * 0.002), 0.35 * oo, false);
    env.draw({ text: val, font, size, x: cx, y: cy, align: 'center', color: sc.fg, alpha: 0.85 * oo, ghost: false });
  }
});

// 11. Subtitle Bar: nền đen cho phụ đề
J.register('decor', 'cinSubtitleBar', {
  name: '▬ Subtitle Bar (Nền Phụ Đề)',
  tags: ['editorial', 'calm'],
  w: 0.9, layer: 'back',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H } = env, oo = outK(env);
    const bar = H * 0.11;
    env.rect(0, H - bar, W, bar, '#000000', 0.62 * oo, false);
    env.line([[0, H - bar], [W, H - bar]], '#FFFFFF', 1, 0.12 * oo, false);
  }
});

// 12. Dark Frame: viền tối dày + góc mờ dần
J.register('decor', 'cinDarkFrame', {
  name: '🖤 Dark Frame (Viền Tối Dày)',
  tags: ['emotional', 'editorial'],
  w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H } = env, u = Math.min(W, H), oo = outK(env);
    const b = u * 0.07;
    env.rect(0, 0, W, b, '#000000', 0.8 * oo, false);
    env.rect(0, H - b, W, b, '#000000', 0.8 * oo, false);
    env.rect(0, 0, b, H, '#000000', 0.8 * oo, false);
    env.rect(W - b, 0, b, H, '#000000', 0.8 * oo, false);
  }
});

/* ---------------- BG (batch 3) ---------------- */

// 7. Starfield: sao + sao băng
bgReg('cinStarfield', {
  name: '🌠 Starfield (Bầu Trời Sao)',
  tags: ['calm', 'emotional'],
  w: 1,
  plan: rng => ({ n: rng.int(60, 160), seed: rng.int(1, 1e9) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0, s = P.seed || 1;
    const n = P.n || 100, u = Math.min(W, H);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const x = J.r(s, i, 91) * W;
      const y = (J.r(s, i, 92) * H + t * (0.004 + J.r(s, i, 93) * 0.012) * H) % H;
      const r = u * (0.0008 + J.r(s, i, 94) * 0.0026);
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (1 + J.r(s, i, 95) * 3) + i));
      ctx.fillStyle = J.rgba(i % 9 === 0 ? sc.accent : '#FFFFFF', tw * 0.85);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    const sh = Math.floor(t * 0.8) % 5;
    if (sh === 0) {
      const sx = W * ((t * 0.37) % 1.4 - 0.2), sy = H * 0.2;
      const g = ctx.createLinearGradient(sx, sy, sx + W * 0.18, sy + H * 0.08);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, u * 0.0022);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + W * 0.18, sy + H * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }
});

// 8. Ink Wash: vệt mực sumi-e
bgReg('cinInkWash', {
  name: '🖌️ Ink Wash (Vệt Mực Nhật)',
  tags: ['calm', 'emotional', 'editorial'],
  w: 1,
  plan: rng => ({ n: rng.int(3, 7), seed: rng.int(1, 1e9) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0, s = P.seed || 1;
    const n = P.n || 4, u = Math.min(W, H);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const cx = W * (0.15 + J.r(s, i, 96) * 0.7);
      const cy = H * (0.15 + J.r(s, i, 97) * 0.7);
      const rr = u * (0.12 + J.r(s, i, 98) * 0.28);
      const g = ctx.createRadialGradient(cx, cy, rr * 0.1, cx, cy, rr);
      const col = i % 2 ? sc.accent : sc.fg;
      g.addColorStop(0, J.rgba(col, 0.16));
      g.addColorStop(0.6, J.rgba(col, 0.05));
      g.addColorStop(1, J.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      const M = 24;
      for (let j = 0; j <= M; j++) {
        const a = (j / M) * TAU;
        const w = 1 + J.noise1(j * 0.5 + t * 0.2, s + i) * 0.28;
        const x = cx + Math.cos(a) * rr * w, y = cy + Math.sin(a) * rr * w * 0.85;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
});

// 9. Tunnel Lights: vòng đèn lao tới người xem
bgReg('cinTunnelLights', {
  name: '🕳️ Tunnel Lights (Đèn Hành Lang)',
  tags: ['glitch', 'pop', 'graphic'],
  w: 1,
  plan: rng => ({ n: rng.int(5, 9), speed: rng.range(0.25, 0.6) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0;
    const n = P.n || 6, sp = P.speed || 0.4;
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.strokeStyle = J.rgba(sc.accent2, 0.5);
    ctx.lineWidth = Math.max(1.4, Math.min(W, H) * 0.004);
    for (let i = 0; i < n; i++) {
      let u = ((i / n + t * sp) % 1);
      const e = u * u;
      const r = Math.max(W, H) * (0.05 + e * 0.75);
      ctx.globalAlpha = 0.15 + e * 0.6;
      const ry = r * (H / W) * (0.55 + 0.45 * e);
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.ellipse ? ctx.ellipse(cx, cy, r, ry, 0, 0, TAU) : ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = J.rgba(sc.accent, 0.35);
    ctx.lineWidth = Math.max(1, Math.min(W, H) * 0.002);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + t * 0.1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * W * 0.04, cy + Math.sin(a) * H * 0.04);
      ctx.lineTo(cx + Math.cos(a) * W * 0.9, cy + Math.sin(a) * H * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
});

// 10. City Bokeh: đèn thành phố nhòe bokeh
bgReg('cinCityBokeh', {
  name: '🌃 City Bokeh (Đèn Thành Phố Nhòe)',
  tags: ['calm', 'emotional'],
  w: 1,
  plan: rng => ({ n: rng.int(20, 44), seed: rng.int(1, 1e9) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0, s = P.seed || 1;
    const n = P.n || 30, u = Math.min(W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const bx = J.r(s, i, 101) * W;
      const by = H * (0.45 + J.r(s, i, 102) * 0.5);
      const br = u * (0.012 + J.r(s, i, 103) * 0.055);
      const drift = Math.sin(t * (0.2 + J.r(s, i, 104) * 0.4) + i) * u * 0.01;
      const col = [sc.accent, sc.accent2, '#FFD9A0', '#FFFFFF'][i % 4];
      const g = ctx.createRadialGradient(bx + drift, by, br * 0.15, bx + drift, by, br);
      g.addColorStop(0, J.rgba(col, 0.3));
      g.addColorStop(0.7, J.rgba(col, 0.08));
      g.addColorStop(1, J.rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(bx + drift, by, br, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
});

// 11. Laser Grid: lưới laser phối cảnh
bgReg('cinLaserGrid', {
  name: '📡 Laser Grid (Lưới Laser)',
  tags: ['glitch', 'pop'],
  w: 1,
  plan: rng => ({ cols: rng.int(8, 16), scan: rng.range(0.2, 0.5) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0;
    const cols = P.cols || 12, hz = H * 0.55;
    ctx.save();
    ctx.strokeStyle = J.rgba(sc.accent2, 0.42);
    ctx.lineWidth = Math.max(1, H * 0.0016);
    for (let i = -cols; i <= cols; i++) {
      const x0 = W / 2 + i * W * 0.05;
      ctx.beginPath();
      ctx.moveTo(x0, hz);
      ctx.lineTo(W / 2 + i * W * 0.45, H);
      ctx.stroke();
    }
    const rows = 14, sp = P.scan || 0.3;
    for (let i = 0; i < rows; i++) {
      const u = (i + ((t * sp) % 1)) / rows;
      const y = hz + (H - hz) * Math.pow(u, 2.3);
      if (y > H) continue;
      ctx.strokeStyle = J.rgba(sc.accent, 0.35);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    const sy = hz + (H - hz) * Math.pow((t * 0.18) % 1, 2.3);
    ctx.fillStyle = J.rgba(sc.accent, 0.1);
    ctx.fillRect(0, sy - H * 0.012, W, H * 0.024);
    ctx.restore();
  }
});

// 12. Cloudscape: mây mềm nhiều lớp
bgReg('cinCloudscape', {
  name: '☁️ Cloudscape (Mây Mền Nhiều Lớp)',
  tags: ['calm', 'emotional'],
  w: 0.9,
  plan: rng => ({ layers: rng.int(3, 6), seed: rng.int(1, 1e9) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.lt || 0, s = P.seed || 1;
    const layers = P.layers || 4, u = Math.min(W, H);
    ctx.save();
    for (let L = 0; L < layers; L++) {
      const k = (L + 1) / layers;
      const baseY = H * (0.2 + 0.62 * (1 - k) + 0.1 * L);
      const sp = 0.006 + L * 0.006;
      ctx.fillStyle = J.rgba(L % 2 ? sc.fg : sc.sub, 0.05 + 0.05 * (1 - k));
      ctx.beginPath();
      ctx.moveTo(0, H);
      const M = 30;
      for (let i = 0; i <= M; i++) {
        const uu = i / M;
        const x = uu * W;
        const y = baseY + J.noise1(uu * 4 + t * sp * 8, s + L) * H * 0.06 + Math.sin(uu * 6 + t * 0.2 + L) * H * 0.02;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
});

/* ---------------- CAM (batch 3) ---------------- */

// 7. Rolling Shutter: méo rolling shutter
J.register('cam', 'cinRollingShutter', {
  name: '📸 Rolling Shutter (Méo Rolling Shutter)',
  tags: ['glitch', 'graphic'],
  w: 1.1,
  plan: rng => ({ amt: rng.range(1.5, 4), f: rng.range(0.6, 1.4) }),
  get(env, P) {
    const t = env.lt || 0, m = motionOf(env);
    const f = P.f || 1;
    const w = Math.sin(t * f * TAU * 0.4) * 0.6 + J.noise1(t * f * 3.2, 71) * 0.5;
    return {
      s: 1.05,
      x: w * env.W * 0.006 * m,
      skx: w * (P.amt || 2.5) * m,
    };
  }
});

// 8. Vertigo Push: dolly zoom
J.register('cam', 'cinVertigoPush', {
  name: '🌀 Vertigo Push (Dolly Zoom)',
  tags: ['emotional', 'horror', 'editorial'],
  w: 1.3, strong: true,
  plan: rng => ({ zoom: rng.range(1.18, 1.45) }),
  get(env, P) {
    const u = clamp((env.lt || 0) / 2.2);
    const e = E.inOutCubic(u);
    const m = motionOf(env);
    return { s: 1.02 + ((P.zoom || 1.3) - 1.02) * e * m };
  }
});

// 9. Crane Up: camera nâng lên
J.register('cam', 'cinCraneUp', {
  name: '🚜 Crane Up (Camera Nâng Lên)',
  tags: ['emotional', 'editorial', 'calm'],
  w: 1.1,
  plan: rng => ({ rise: rng.range(0.03, 0.075) }),
  get(env, P) {
    const u = clamp((env.lt || 0) / 2.6);
    const e = E.outCubic(u), m = motionOf(env);
    return { s: 1.03 - e * 0.02 * m, y: -e * env.H * (P.rise || 0.05) * m };
  }
});

// 10. Spin Dolly: quay tròn + zoom
J.register('cam', 'cinSpinDolly', {
  name: '🌀 Spin Dolly (Quay Tròn Kèm Zoom)',
  tags: ['pop', 'glitch'],
  w: 1.2, strong: true,
  plan: rng => ({ rev: rng.range(0.4, 1.4), zoom: rng.range(0.1, 0.25) }),
  get(env, P) {
    const t = env.lt || 0, m = motionOf(env);
    const rev = (P.rev || 0.8) * m;
    return {
      s: 1.06 + Math.sin(t * rev) * (P.zoom || 0.16) * m,
      rot: Math.sin(t * rev * 0.7) * 5 * m,
      x: Math.cos(t * rev) * env.W * 0.012 * m,
    };
  }
});

// 11. Impact Shake: rung mạnh theo kick
J.register('cam', 'cinImpactShake', {
  name: '💥 Impact Shake (Rung Mạnh Theo Kick)',
  tags: ['pop', 'glitch'],
  w: 1.4, strong: true,
  plan: rng => ({ amp: rng.range(0.01, 0.026) }),
  get(env, P) {
    const m = motionOf(env);
    const drive = Math.min(1.5, kickOf(env) * 1.4 + bassOf(env) * 0.7);
    const t = env.lt || 0;
    const a = (P.amp || 0.016) * m * (0.25 + drive);
    return {
      s: 1.02 + drive * 0.03 * m,
      x: J.rs(Math.floor(t * 24), 3) * env.W * a,
      y: J.rs(Math.floor(t * 24), 5) * env.H * a,
      rot: J.rs(Math.floor(t * 24), 7) * a * 90,
    };
  }
});

// 12. Lens Breath: tiêu cự phập phồng + nét mờ
J.register('cam', 'cinLensBreath', {
  name: '🔭 Lens Breath (Tiêu Cự Phập Phồng)',
  tags: ['calm', 'emotional'],
  w: 1,
  plan: rng => ({ f: rng.range(0.14, 0.32), blur: rng.range(0.5, 2.2) }),
  get(env, P) {
    const t = env.lt || 0, m = motionOf(env);
    const f = P.f || 0.2;
    const b = (Math.sin(t * f * TAU) * 0.5 + 0.5) * (P.blur || 1.2) * m;
    return { s: 1.04 + Math.sin(t * f * TAU) * 0.012 * m, blur: b };
  }
});

/* ---------------- FX (batch 3) ---------------- */

// 7. VHS Chroma: méo + lệch màu kiểu VHS
J.register('fx', 'cinVHSChroma', {
  name: '📼 VHS Chroma (Méo Lệch Màu VHS)',
  tags: ['glitch', 'pop'],
  w: 1.1, dur: 6, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * Math.sin(Math.PI * clamp(k));
    if (a <= 0.02) return;
    const st = I.step | 0, t = I.t;
    const N = 26;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const y0 = Math.round(ch * i / N), y1 = Math.round(ch * (i + 1) / N);
      const h = y1 - y0;
      if (h <= 0) continue;
      const off = Math.round(Math.sin(i * 0.8 + t * 5) * cw * 0.008 * a);
      ctx.drawImage(S, 0, y0, cw, h, off, y0, cw, h);
    }
    ctx.globalAlpha = 0.3 * a;
    ctx.fillStyle = '#00F0FF';
    ctx.fillRect(0, Math.round(((t * 0.5) % 1) * ch), cw, Math.max(2, ch * 0.006));
    ctx.globalAlpha = 0.22 * a;
    ctx.fillStyle = '#FF3D6E';
    ctx.fillRect(0, Math.round(((t * 0.5 + 0.5) % 1) * ch), cw, Math.max(2, ch * 0.006));
    ctx.restore();
  }
});

// 8. Glitch Blocks: khối ngẫu nhiên bị dịch chuyển
J.register('fx', 'cinGlitchBlocks', {
  name: '🧱 Glitch Blocks (Khối Ngẫu Nhiên Lệch)',
  tags: ['glitch', 'graphic'],
  w: 1, dur: 4, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * (1 - E.inCubic(k));
    if (a <= 0.02) return;
    const st = I.step | 0;
    const n = 6 + (st % 6);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const bw = Math.max(4, Math.round(cw * (0.04 + J.r(st, i, 11) * 0.16)));
      const bh = Math.max(4, Math.round(ch * (0.04 + J.r(st, i, 12) * 0.2)));
      const x = Math.round(J.r(st, i, 13) * (cw - bw));
      const y = Math.round(J.r(st, i, 14) * (ch - bh));
      const dx = Math.round(J.rs(st, i, 15) * cw * 0.05 * a);
      const dy = Math.round(J.rs(st, i, 16) * ch * 0.04 * a);
      ctx.drawImage(S, x, y, bw, bh, x + dx, y + dy, bw, bh);
    }
    ctx.restore();
  }
});

// 9. Chromatic Wave: sóng uốn toàn khung
J.register('fx', 'cinChromaticWave', {
  name: '🌊 Chromatic Wave (Sóng Uốn Màu)',
  tags: ['glitch', 'emotional'],
  w: 1, dur: 6, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * Math.sin(Math.PI * clamp(k));
    if (a <= 0.02) return;
    const N = 30, t = I.t;
    ctx.save();
    for (let i = 0; i < N; i++) {
      const x0 = Math.round(cw * i / N), x1 = Math.round(cw * (i + 1) / N);
      const w = x1 - x0;
      if (w <= 0) continue;
      const off = Math.sin(i * 0.9 + t * 6) * cw * 0.02 * a;
      ctx.drawImage(S, x0, 0, w, ch, x0 + off, 0, w, ch);
    }
    ctx.restore();
  }
});

// 10. Mirror Split: đôi gương giữa khung
J.register('fx', 'cinMirrorSplit', {
  name: '🪞 Mirror Split (Đôi Gương Giữa Khung)',
  tags: ['graphic', 'glitch', 'pop'],
  w: 1, dur: 5, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = (ev.amp || 1) * Math.sin(Math.PI * clamp(k));
    if (a <= 0.02) return;
    const T = I.tmp(cw, ch), tx = T.getContext('2d');
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.globalAlpha = 1;
    tx.globalCompositeOperation = 'source-over';
    tx.clearRect(0, 0, cw, ch);
    tx.drawImage(S, 0, 0);
    tx.save();
    tx.translate(cw, 0);
    tx.scale(-1, 1);
    tx.drawImage(S, 0, 0);
    tx.restore();
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.9 * a);
    ctx.drawImage(T, 0, 0);
    ctx.globalAlpha = 0.5 * a;
    ctx.fillStyle = '#000000';
    ctx.fillRect(cw / 2 - Math.max(1, cw * 0.002), 0, Math.max(2, cw * 0.004), ch);
    ctx.restore();
  }
});

// 11. Flash Frames: chớp trắng theo từng frame
J.register('fx', 'cinFlashFrames', {
  name: '⚡ Flash Frames (Chớp Trắng Từng Frame)',
  tags: ['pop', 'glitch'],
  w: 1, dur: 5, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const st = I.step | 0;
    if (J.r(st, 17) > 0.34) return;
    const a = (ev.amp || 1) * (1 - E.inCubic(k)) * 0.85;
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }
});

// 12. Dip To Black: tối dần rồi sáng lại
J.register('fx', 'cinDipToBlack', {
  name: '🕳️ Dip To Black (Tối Dần Rồi Sáng Lại)',
  tags: ['emotional', 'editorial', 'calm'],
  w: 0.9, dur: 6, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I;
    if (!S) return;
    const a = Math.sin(Math.PI * clamp(k));
    if (a <= 0.02) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();
  }
});

/* ---------------- TRANS (batch 3) ---------------- */

// 7. Ink Spread: vệt mực lan ra che cảnh mới
trReg('cinInkSpread', {
  name: '🖌️ Ink Spread (Vệt Mực Lan Ra)',
  tags: ['editorial', 'emotional'],
  w: 1.1, dur: 0.55,
  plan: rng => ({ n: rng.int(5, 10), seed: rng.int(1, 1e9) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const e = E.outCubic(clamp(p));
    if (e <= 0.001) return;
    const T = I.tmp(cw, ch), tx = T.getContext('2d');
    tx.setTransform(1, 0, 0, 1, 0, 0);
    tx.globalAlpha = 1;
    tx.globalCompositeOperation = 'source-over';
    tx.clearRect(0, 0, cw, ch);
    tx.drawImage(B, 0, 0);
    tx.globalCompositeOperation = 'destination-in';
    tx.fillStyle = '#000000';
    const n = Pt.n || 7, s = Pt.seed || 1;
    for (let i = 0; i < n; i++) {
      const cx = J.r(s, i, 121) * cw, cy = J.r(s, i, 122) * ch;
      const r = Math.max(cw, ch) * (0.1 + J.r(s, i, 123) * 0.2) * e;
      const g = tx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      tx.fillStyle = g;
      tx.beginPath();
      tx.arc(cx, cy, r, 0, Math.PI * 2);
      tx.fill();
    }
    tx.globalCompositeOperation = 'source-over';
    ctx.drawImage(T, 0, 0);
  }
});

// 8. Vertical Slide: cảnh mới trượt lên từ dưới
trReg('cinVerticalSlide', {
  name: '⬆️ Vertical Slide (Trượt Dọc)',
  tags: ['editorial', 'graphic'],
  w: 1, dur: 0.4,
  plan: rng => ({ dir: rng.pick([1, -1]) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const e = E.inOutCubic(clamp(p));
    const dir = Pt.dir || 1;
    const y = dir > 0 ? ch * e : -ch * (1 - e);
    ctx.drawImage(B, 0, y);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, dir > 0 ? y - ch * 0.03 : y + ch, cw, ch * 0.03);
    ctx.restore();
  }
});

// 9. Slice Push: các lát cắt B đẩy vào từ hai bên
trReg('cinSlicePush', {
  name: '🧩 Slice Push (Lát Cắt Đẩy Vào)',
  tags: ['graphic', 'pop'],
  w: 1.1, dur: 0.42,
  plan: rng => ({ n: rng.int(5, 11), dir: rng.pick([1, -1]) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const n = Pt.n || 7, dir = Pt.dir || 1, sw = cw / n;
    for (let i = 0; i < n; i++) {
      const q = clamp(p * 1.25 - i * (0.2 / n));
      const e = E.outCubic(q);
      const x = Math.round(i * sw), w = Math.round(sw);
      // lát trượt từ ngoài (hai bên) vào giữa
      const px = dir > 0 ? x - w * (1 - e) : x + (cw - x - w) * (1 - e);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, 0, w, ch);
      ctx.clip();
      ctx.drawImage(B, px, 0);
      ctx.restore();
    }
  }
});

// 10. Dip To Color: chuyển qua một màu trung gian
trReg('cinDipToColor', {
  name: '🎨 Dip To Color (Chuyển Qua Màu)',
  tags: ['emotional', 'pop', 'editorial'],
  w: 1, dur: 0.45,
  plan: rng => ({ color: rng.pick(['#000000', '#FFFFFF', '#F5A50C', '#FF3D6E']) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const e = clamp(p);
    const col = Pt.color || '#000000';
    if (e < 0.5) {
      ctx.save();
      ctx.globalAlpha = E.inQuad(e * 2);
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    } else {
      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = E.outQuad((e - 0.5) * 2);
      ctx.drawImage(B, 0, 0);
      ctx.restore();
    }
  }
});

// 11. Zoom Blur: A phóng to mờ, B từ nhỏ phóng ra
trReg('cinZoomBlurTrans', {
  name: '🔍 Zoom Blur (Phóng To Mờ)',
  tags: ['glitch', 'pop'],
  w: 1.1, dur: 0.45,
  plan: rng => ({ z: rng.range(1.25, 1.7) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch, allowFilter } = I;
    const e = E.inOutCubic(clamp(p));
    const z = Pz(Pt.z);
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(1 + (z - 1) * e, 1 + (z - 1) * e);
    ctx.translate(-cw / 2, -ch / 2);
    ctx.globalAlpha = 1 - e * 0.55;
    if (allowFilter) ctx.filter = 'blur(' + (e * 10).toFixed(1) + 'px)';
    ctx.drawImage(A, 0, 0);
    ctx.restore();
    const s = 1 + (1 - z) * e;
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(s, s);
    ctx.translate(-cw / 2, -ch / 2);
    ctx.globalAlpha = E.outQuad(e);
    ctx.drawImage(B, 0, 0);
    ctx.restore();
  }
});
const Pz = v => (typeof v === 'number' && v > 1 ? v : 1.4);

// 12. Ribbon Wipe: dải lụa chéo quét qua
trReg('cinRibbonWipe', {
  name: '🎀 Ribbon Wipe (Dải Lụa Chéo)',
  tags: ['emotional', 'editorial'],
  w: 1, dur: 0.45,
  plan: rng => ({ ang: rng.range(-40, -15), wide: rng.range(0.16, 0.3) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I;
    ctx.drawImage(A, 0, 0);
    const e = E.inOutCubic(clamp(p));
    const ang = (Pt.ang || -28) * DEG;
    const wide = cw * (Pt.wide || 0.22);
    const diag = Math.hypot(cw, ch);
    const cx = cw / 2, cy = ch / 2;
    const nx = Math.cos(ang), ny = Math.sin(ang);
    const px = -ny, py = nx;
    const off = (e - 0.5) * diag * 1.25;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx + nx * diag + px * wide / 2 + nx * off, cy + ny * diag + py * wide / 2 + ny * off);
    ctx.lineTo(cx - nx * diag + px * wide / 2 + nx * off, cy - ny * diag + py * wide / 2 + ny * off);
    ctx.lineTo(cx - nx * diag - px * wide / 2 + nx * off, cy - ny * diag - py * wide / 2 + ny * off);
    ctx.lineTo(cx + nx * diag - px * wide / 2 + nx * off, cy + ny * diag - py * wide / 2 + ny * off);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(B, 0, 0);
    ctx.restore();
  }
});
`;

export const TITLES = {
  layout: {
    anchor: "      cinStackKanji: 'Stacked Kanji Column',\n",
    add: "      cinKickerTitle: 'Kicker Headline',\n      cinNewsTicker: 'News Ticker',\n      cinPosterBig: 'Big Number Poster',\n      cinCornerStack: 'Corner Stack',\n      cinDualColumn: 'Dual Column',\n      cinMarqueeBox: 'Marquee Box',\n",
  },
  decor: {
    anchor: "      cinLensFlare: 'Lens Flare Ghosts',\n",
    add: "      cinSprocketHoles: 'Film Sprocket Holes',\n      cinDiagonalRule: 'Diagonal Corner Rule',\n      cinNeonFrame: 'Neon Frame',\n      cinFilmLeader: 'Film Leader Countdown',\n      cinSubtitleBar: 'Subtitle Plate Bar',\n      cinDarkFrame: 'Thick Dark Frame',\n",
  },
  bg: {
    anchor: "      cinDustMotes: 'Floating Dust Motes',\n",
    add: "      cinStarfield: 'Starfield',\n      cinInkWash: 'Ink Wash',\n      cinTunnelLights: 'Tunnel Lights',\n      cinCityBokeh: 'City Bokeh Lights',\n      cinLaserGrid: 'Laser Grid',\n      cinCloudscape: 'Cloudscape',\n",
  },
  cam: {
    anchor: "      cinZoomBreath: 'Breathing Zoom',\n",
    add: "      cinRollingShutter: 'Rolling Shutter',\n      cinVertigoPush: 'Vertigo Dolly Zoom',\n      cinCraneUp: 'Crane Up',\n      cinSpinDolly: 'Spin Dolly',\n      cinImpactShake: 'Impact Shake',\n      cinLensBreath: 'Breathing Lens',\n",
  },
  fx: {
    anchor: "      cinEchoTrail: 'Echo Trail',\n",
    add: "      cinVHSChroma: 'VHS Chroma Warp',\n      cinGlitchBlocks: 'Glitch Blocks',\n      cinChromaticWave: 'Chromatic Wave',\n      cinMirrorSplit: 'Mirror Split',\n      cinFlashFrames: 'Flash Frames',\n      cinDipToBlack: 'Dip To Black',\n",
  },
  trans: {
    anchor: "      cinShutterBars: 'Shutter Bars',\n",
    add: "      cinInkSpread: 'Ink Spread',\n      cinVerticalSlide: 'Vertical Slide',\n      cinSlicePush: 'Slice Push',\n      cinDipToColor: 'Dip To Color',\n      cinZoomBlurTrans: 'Zoom Blur Cut',\n      cinRibbonWipe: 'Ribbon Wipe',\n",
  },
};

export const MARKER = 'JIZURA — which entries random picks may use';
