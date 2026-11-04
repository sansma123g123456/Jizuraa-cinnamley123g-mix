# JIZURA CIN MIX — Technique API Reference

> **Mục đích:** Tài liệu này là nguồn sự thật duy nhất về API kỹ thuật (technique) của JIZURA.
> Mọi model/người làm việc với repo nên **đọc file này trước**, thay vì đọc lại `index.html` (~56k dòng).
>
> **Cập nhật:** 2026-10-29 · dựa trên `index.html` dòng ~1–55884.

---

## 0. TL;DR — 5 điều cần biết trước khi code

1. Toàn bộ kỹ thuật nằm trong **một global `J`** (`window.J`), đăng ký qua `J.register(group, key, def, pack)`.
2. **10 nhóm**: `layout, enter, hold, exit, decor, treat, bg, cam, fx, trans`.
3. Mỗi nhóm có **signature riêng** (xem §4). Không phải nhóm nào giống nhau.
4. `index.html` phải có **đúng 12 thẻ `<script>`** (bất biến kiểm thử).
5. `index.html` và `JIZURA CIN MIX/index.html` phải **giữ nguyên parity tính năng** (không bắt buộc giống byte-for-byte, nhưng mọi kỹ thuật phải có ở cả hai).

---

## 1. Cấu trúc repo & bất biến

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | **Bản chính** (app + toàn bộ engine, 12 `<script>` inline). 55 884 dòng. |
| `JIZURA CIN MIX/index.html` | Bản mirror đóng gói (zip phát hành). Phải có cùng feature set. |
| `public/index.html` | Bản mirror của `index.html` (đồng bộ bằng `tools/sync_all_mirrors.mjs`). |
| `amv_asset_library.js` / `amv_asset_manager.js` | Hệ thống add-on AMV (asset manager) — **KHÁC** với technique registry. |
| `src/amv_asset_manager.js` | Mirror byte-for-byte của `amv_asset_manager.js` (bắt buộc SHA256 parity). |
| `tests/*.test.js` | 25 suite, **449 test**, chạy bằng `node --test --test-concurrency=1 tests/*.test.js`. || `JIZURA-CIN-MIX.zip` | Gói phát hành, phải rebuild sau khi sửa `JIZURA CIN MIX/`. |

### Bất biến bắt buộc (test sẽ fail nếu vi phạm)

| Bất biến | Kiểm tra ở |
|---|---|
| `index.html` có **đúng 12** thẻ `<script>` | `tests/e2e_v2_suite.test.js` (Invariant 0.1) |
| Trong đó có **đúng 3** script `src=` ngoài (external local) | `tests/e2e_v2_suite.test.js` |
| `amv_asset_manager.js` == `src/amv_asset_manager.js` (SHA256) | `tests/visualizer_off_regression.test.js`, `e2e_v2_suite` |
| `amv_asset_manager.js` == `JIZURA CIN MIX/amv_asset_manager.js` (SHA256) | `tests/visualizer_off_regression.test.js` |
| `J.CORE_ORDER` (5 nhóm core) **đóng băng** tại dòng ~8202 | không được sửa |

> ⚠️ `J.CORE_ORDER` được chụp **trước** khi các pack biểu thức đăng ký. Nếu bạn thêm kỹ thuật mới, thứ tự trong `J.order(group)` sẽ đổi nhưng `J.CORE_ORDER` **không** được đổi.

### Lệnh thường dùng

```bash
node --test --test-concurrency=1 tests/*.test.js   # chạy toàn bộ test (tuần tự để benchmark ổn định)
node -c sw.js                        # syntax check service worker
```

> ⚠️ **Bắt buộc `--test-concurrency=1`.** Các suite benchmark (`challenger_m1_benchmarks.test.js`,
> `challenger_m3_kinetic.test.js`) assert thời gian render `< 16.6 ms` (60 FPS). Khi `node --test` chạy
> 22 file song song, máy bị nghẽn cổng, tail latency (p99) nhảy lên 200–500 ms và benchmark **fail giả**.
> Engine thực chỉ mất **~1.0–1.7 ms/frame** ở 1080p (đo bằng `tools/perf_probe.mjs`).

Rebuild zip (PowerShell):

```powershell
Remove-Item JIZURA-CIN-MIX.zip -ErrorAction SilentlyContinue
node tools/pack_zip.mjs              # POSIX paths, giữ nguyên cấu trúc mirror
```

> ⚠️ **Dùng `node tools/pack_zip.mjs`**, không dùng `Compress-Archive`: hàm pack_zip giữ đường dẫn POSIX
> (`src/amv_asset_manager.js`) và nén deflate, còn `Compress-Archive` sinh separator `\` và nén lớn hơn.

### Deploy: cache-buster + service worker

Khi sửa `amv_asset_library.js` / `amv_asset_manager.js`, **phải bump query version** trong `index.html`:

```html
<script src="amv_asset_library.js?v=3.4"></script>
<script src="src/amv_asset_manager.js?v=3.4" ...></script>
```

Nếu không bump, service worker có thể vẫn serve file cũ. `sw.js` hiện dùng **network-first** cho app shell
(HTML + 2 bundle AMV) nên cache cũ sẽ tự bị thay thế khi có mạng — nhưng query version vẫn là lớp phòng
thủ thứ hai và giúp trình duyệt không tải lại file đã đổi.

Khi đổi `sw.js`, nhớ bump `CACHE_NAME` (`jizura-cache-v4.2`) — đó là cách SW cũ bị gỡ khỏi máy client.

---

## 2. Global namespace `J` — helper cốt lõi

Tất cả nằm ở `window.J`. Script engine chạy ở khoảng dòng 5195–8200.

### 2.1 Số học / easing

```js
J.clamp(x, a = 0, b = 1)      // giới hạn
J.lerp(a, b, t)
J.inv(a, b, x)                 // nghịch đảo lerp
J.smooth(a, b, x)              // smoothstep
J.TAU                          // 2π
J.DEG                          // π/180
```

`J.E` — bộ easing (tất cả tự clamp 0..1):

| Hàm | Công thức |
|---|---|
| `lin` | x |
| `inQuad` / `outQuad` | x² / 1-(1-x)² |
| `inCubic` / `outCubic` | x³ / 1-(1-x)³ |
| `inOutCubic` | piecewise cubic |
| `outExpo` | 1 - 2^(-10x) |
| `inExpo` | 2^(10x-10) |
| `inOutExpo` | piecewise exp |
| `outBack(x, s = 1.9)` | back overshoot |
| `outElastic` | elastic |
| `inOutSine` | -(cos πx - 1)/2 |

### 2.2 Ngẫu nhiên tất định (deterministic)

```js
J.h(a, b, c, d, e)   // hash uint32 từ tối đa 5 số nguyên
J.r(a, b, c, d, e)   // 0..1
J.rs(a, b, c, d, e)  // -1..1
J.rr(lo, hi, a, b, c, d, e)  // random trong [lo, hi]
J.pick(arr, a, b, c, d)
J.rng(seed)          // mulberry32: f(), f.range(lo,hi), f.int(lo,hi), f.pick(arr), f.chance(p), f.wpick([{w,v}])
J.sid(str)           // string -> uint32 (cached)
J.noise1(x, seed)    // value noise 1D mượt, trả về -1..1
```

### 2.3 Màu

```js
J.hex('#fff')        // -> [r,g,b]
J.rgba(hex, a)       // -> 'rgba(r,g,b,a)'
J.mix(h1, h2, t)     // trộn 2 hex
J.lum(hex)           // luminance 0..1
J.toHex(r,g,b)
J.hsl(h, s, l)       // -> hex
J.toHsl(hex)
J.contrast(a, b)     // WCAG ratio
J.fitContrast(hex, bg, min = 3)
```

### 2.4 Đo chữ

```js
J.layoutText(it)  // -> { W, H, N, lay: [{ch, i, x, y, w, h, adv, fs, r90?, vx?, vy?}] }
J.measure(it)     // -> { w, h, lay }
J.fitSize(text, font, maxW, maxH, opt)  // -> size
J.glyphCount(text)
J.splitLines(text, perLine)
J.chunkText(text)
```

### 2.5 Khác

```js
J.PT(dx, dy, rot, s, st, sdir, a)   // "piece transform" mặc định
J.combineChar(fns)   // gộp nhiều charFn
J.combinePiece(fns)  // gộp nhiều pieceFn
J.fontsOf(st, roles)  // -> [fontKey]
J.unionBB(a, b)
J.centerBB(env, bb)
J.defaultProject()
J.resolveStyle(project)  // -> style object
J.designSize(aspect)     // '16:9' -> [1920,1080]; '9:16' -> [1080,1920]
J.previewPlan(project, group, key)  // -> plan giả lập cho thumbnail
J.MOODS                 // { glitch, calm, pop, graphic, editorial, emotional, chaos, horror }
J.SETS                  // { horror:{on:false}, typo:{on:true}, kinetic:{on:true}, shotcraft:{on:true} }
```

---

## 3. Registry API

```js
J.register(group, key, def, pack)
```

- `group` ∈ `J.GROUP_KEYS` = `['layout','enter','hold','exit','decor','treat','bg','cam','fx','trans']`
- `key` — chữ thường/camelCase, **duy nhất toàn hệ thống**
- `def` — object định nghĩa (xem §4)
- `pack` — tên pack, dùng để gắn `set` / `extra`

Hành vi:

| Việc | Kết quả |
|---|---|
| `def.name` thiếu | `throw new Error(...)` |
| `key` đã tồn tại với `pack` khác | `console.warn` (vẫn ghi đè) |
| `def.special` truthy | **không** thêm vào `J.order(group)` (ẩn khỏi UI) |
| pack không nằm trong `J.BASE_PACKS` | đánh dấu `def.extra = true` → random picker bỏ qua trừ khi `project.extra === true` |
| `def.set` = tên trong `J.SETS` | bật/tắt theo switch của set |

Helper: `J.registerAll(group, defs, pack)`.

Truy vấn:

```js
J.registry(group)   // -> J.LAYOUTS | J.ENTER | J.HOLD | ...
J.order(group)      // -> mảng key theo thứ tự UI
J.taggedWith(group, mood)
J.randomOk(project, group, key)  // được random chọn không
J.setOn(project, set)
J.isExtra(group, key) / J.isWa(group, key) / J.setOf(group, key)
```

### 3.1 Metadata fields dùng chung

| Field | Ý nghĩa |
|---|---|
| `name` | **bắt buộc**. Tên hiển thị (UI có thể override qua dictionary `titles` / `P`). |
| `tags` | `['glitch','calm','pop','graphic','editorial','emotional','horror']` — dùng cho mood picker & lọc. |
| `w` | trọng số khi random (mặc định 1). |
| `ae` | tên preset After Effects tương ứng (metadata). |
| `set` | tên bộ trong `J.SETS`. |
| `extra` | pack mới → không random nếu `project.extra !== true`. |
| `wa` | motif Nhật → không random nếu `project.wa === false`. |
| `busy` | layout "bận" → decor layer `back` bị loại trừ khi `subtle`. |
| `special` | ẩn khỏi danh sách UI. |
| `strong` | pack `shotcraft` — ưu tiên mạnh. |

### 3.2 Đăng ký nhanh theo nhóm

```js
const PK = 'myPack';
const reg = (g, k, d) => J.register(g, k, d, PK);
```

---

## 4. Signature của 10 nhóm

> **Quy tắc chung:** mọi hàm `apply`/`draw`/`render`/`get` **phải bọc try/catch ở nơi gọi** (engine đã bọc sẵn cho `layout.render`, `decor.draw`; nhưng `enter/hold/exit/treat` gọi trực tiếp → nên tự guard).

### 4.1 `layout` — Bố cục

```js
J.register('layout', 'myKey', {
  name: '…', tags: [...], w: 1,
  fits: (n) => boolean,          // n = số ký tự (không tính space) — dùng cho preview fallback
  plan: (rng, cut, st) => params,// rng: mulberry32, cut: {text, n, W, H, dur}, st: style
  render: (env) => bbox,         // vẽ; trả bbox của text chính
});
```

- `plan` trả về object params, được lưu vào `cut.params` và xuất ra AE.
- `render(env)` **phải** gọi `J.mainDraw(env, item)` để chạy pipeline enter/hold/exit/treat.
- Trả về `bb` (bbox) dùng cho decor `front` và `lowerThird`.
- Có thể vẽ thêm bằng `env.draw({...})`.

**Ví dụ tham chiếu — `center`:**

```js
center: {
  name: '中央', fits: n => true,
  plan: (rng, cut, st) => ({
    font: rng.pick(fontsOf(st, rng.chance(0.7) ? ['display'] : ['serif'])),
    sx: rng.pick([1, 1, 1, 1.25, 1.45, 0.78]),
    track: rng.range(0.02, 0.14),
    sub: rng.chance(0.45), under: rng.chance(0.3), accent: rng.chance(0.18),
    ox: rng.range(-0.05, 0.05), oy: rng.range(-0.06, 0.06),
  }),
  render(env) {
    const { W, H, sc } = env, P = env.cut.params, text = J.splitLines(env.cut.text, W < H ? 5 : 11);
    const size = Math.min(J.fitSize(text, P.font, W * 0.84, H * 0.5, { sx: P.sx, track: P.track, lead: 1.2 }), H * 0.33);
    const bb = J.mainDraw(env, {
      text, font: P.font, size, x: W / 2 + P.ox * W, y: H / 2 + P.oy * H,
      sx: P.sx, track: P.track, lead: 1.2, color: P.accent ? sc.accent : sc.fg,
    });
    return bb;
  },
},
```

### 4.2 `enter` — Đi vào

```js
J.register('enter', 'myKey', {
  name: '…', tags: [...],
  inDur?: (dur, n) => number,      // tuỳ chọn: độ dài animation
  pieces?: true,                    // nếu true, engine gọi apply cả khi p<1
  apply: (env, it, p, ctx) => void, // p: 0 → 1
});
```

Trong `apply` bạn được sửa trực tiếp `it`:

| Field | Ý nghĩa |
|---|---|
| `it.x`, `it.y` | vị trí (px thiết kế) |
| `it.size` | cỡ chữ |
| `it.rot` | xoay (độ) |
| `it.skx` | shear ngang (độ) |
| `it.alpha` | độ mờ (0..1) |
| `it.track` | giãn cách chữ |
| `it.charFns` | mảng hàm per-glyph (xem §6) |
| `it.pieceFns` | mảng hàm per-piece |
| `it.shadow`, `it.stroke`, `it.strokeColor`, `it.gradient`, `it.pattern` | xử lý chữ |

`ctx = { dur, inDur, outDur }`.

**Ví dụ:**

```js
J.register('enter', 'speedSlash', {
  name: '⚡ Speed Slash (Chém Xé Gió)',
  tags: ['pop', 'graphic', 'kinetic'],
  apply(env, it, p) {
    const e = E.outExpo(p), k = 1 - e;
    const dir = (it.seed % 2 === 0 ? 1 : -1);
    it.x += dir * env.W * 0.35 * k;
    it.y -= dir * env.H * 0.18 * k;
    it.skx = (it.skx || 0) + dir * 28 * k;
    it.size *= 1 + k * 0.9;
    it.alpha = (it.alpha ?? 1) * Math.min(1, p * 2.5);
  }
});
```

### 4.3 `hold` — Đứng

```js
J.register('hold', 'myKey', {
  name: '…', tags: [...],
  apply: (env, it, amt, ctx) => void,  // amt: 0 → 1 (cường độ giữ)
});
```

`amt` = `clamp((lt - inDur*0.85) / 0.25) * (1 - pOut)` → tăng dần sau khi vào xong, giảm khi thoát.

Thường dùng để push vào `it.charFns` (rung, sóng) hoặc chỉnh `it.size`, `it.skx`.

**Ví dụ:**

```js
J.register('hold', 'liquidLofi', {
  name: '🌊 Liquid Lofi (Sóng Nước Bồng Bềnh)',
  tags: ['calm', 'emotional'],
  apply(env, it, amt) {
    it.charFns.push((i) => {
      const ph = env.lt * 3.2 + i * 0.45;
      return {
        dy: Math.sin(ph) * it.size * 0.08 * amt,
        dx: Math.cos(ph * 0.7) * it.size * 0.02 * amt,
        rot: Math.sin(ph * 0.8) * 3.5 * amt,
      };
    });
  }
});
```

### 4.4 `exit` — Đi ra

```js
J.register('exit', 'myKey', {
  name: '…', tags: [...],
  outDur?: (dur, n) => number,
  apply: (env, it, p, ctx) => void,  // p: 0 → 1 (tiến độ thoát)
});
```

Giống `enter` nhưng `p` tăng từ 0 (bắt đầu thoát) → 1 (biến mất hẳn).

### 4.5 `decor` — Trang trí

```js
J.register('decor', 'myKey', {
  name: '…', tags: [...], w: 1,
  layer: 'front' | 'back',           // BẮT BUỘC
  draw: (env, bb0, Pd) => void,      // bb0 = bbox text (null nếu layout không trả)
});
```

- `layer: 'back'` → vẽ **trước** text, nhận `bb0 = null`.
- `layer: 'front'` → vẽ **sau** text, nhận `bb0` = bbox của text chính.
- `Pd` = params do `decorParams(rng, key)` sinh ra:

```js
{ id, seed, n, right, low, accent, corner, big, mode, from, to, v, r }
```

**Ví dụ:**

```js
reg('decor', 'hrScratches', {
  name: '引っ掻き傷', tags: ['horror','glitch'], w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H, sc } = env, s = Pd.seed | 0;
    // dùng env.line / env.circle / env.rect / env.poly / env.blob
  }
});
```

### 4.6 `treat` — Hiệu ứng văn bản

```js
J.register('treat', 'myKey', {
  name: '…', tags: [...], w: 1,
  plan?: (rng, st) => params,         // tuỳ chọn → cut.treatP
  apply: (env, it, P) => void,         // P = cut.treatP (object)
});
```

Được gọi **trước** enter/hold/exit trong `J.mainDraw` (nếu `cut.treat` trùng key và `!it.plain`).

Sửa được: `it.shadow`, `it.stroke`, `it.strokeColor`, `it.gradient`, `it.pattern`, `it.charFns`, `it.fill`, `it.fillAlpha`, `it.blur`, `it.blend`, `it.extrude`, `it.dash`.

**Ví dụ:**

```js
J.register('treat', 'rgbSplit', {
  name: '🔴🔵 RGB Split (Lệch Sắc 3D Neon)',
  tags: ['glitch', 'pop'],
  apply(env, it) {
    const kick = (window.StemVisualizerAPI && window.StemVisualizerAPI.getKickShake()) || 0;
    const off = Math.max(2, it.size * (0.035 + kick * 0.05));
    it.shadow = { x: off, y: 0, blur: 0, color: 'rgba(255, 0, 85, 0.85)' };
    it.stroke = Math.max(1, it.size * 0.015);
    it.strokeColor = 'rgba(0, 240, 255, 0.75)';
  }
});
```

### 4.7 `bg` — Nền

```js
J.register('bg', 'myKey', {
  name: '…', tags: [...], w: 1,
  plan: (rng, st) => params,
  draw: (env, P, ctx) => void,        // ctx = env.ctx (CanvasRenderingContext2D)
});
```

- `plan` → `cut.bgP`.
- `draw` vẽ trực tiếp lên `ctx` (canvas chính), **không** dùng `env.rect` (env.rect chỉ dùng cho decor/layer).
- Vẽ xuống `sc.bg` thường, không cần clear.

**Ví dụ (`bgReg` helper tự bọc save/restore):**

```js
const bgReg = (k, d) => reg('bg', k, Object.assign({}, d, {
  draw(env, P) { const ctx = env.ctx; ctx.save(); try { d.draw(env, P || {}, ctx); } finally { ctx.restore(); } }
}));

bgReg('auroraRibbons', {
  name: 'オーロラ', tags: ['emotional','calm'], w: 0.9,
  plan: rng => ({ seed: bs(rng), n: rng.int(2,3), y: rng.range(0.36,0.48), k: rng.range(0.2,0.28) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, s = P.seed || 1, t = env.t;
    // ctx.fillStyle = ...; ctx.fillRect(...)
  }
});
```

### 4.8 `cam` — Camera

```js
J.register('cam', 'myKey', {
  name: '…', tags: [...], w: 1, strong: true,
  plan: (rng, st) => params,
  get: (env, P) => ({ s, x, y, rot, skx, blur }),
});
```

| Field | Ý nghĩa |
|---|---|
| `s` | scale (1 = không zoom) |
| `x`, `y` | pan (px thiết kế) |
| `rot` | xoay (độ) |
| `skx` | shear ngang (độ) |
| `blur` | blur máy quay |

**Ví dụ (`crashZoom`):**

```js
J.register('cam', 'crashZoom', {
  name: '⚡ Crash Zoom (Giật cận điện ảnh)',
  tags: ['glitch','pop','graphic','editorial'], w: 1.6, strong: true,
  plan: rng => ({ dir: rng.pick([1,-1]), zoom: rng.range(1.36,1.55) }),
  get: (env, P) => {
    const u = clamp(env.lt / Math.max(0.25, env.cut.dur));
    const bounce = Math.exp(-u * 6.8) * Math.cos(u * Math.PI * 3.5);
    return {
      s: 1.02 + ((P.zoom || 1.42) - 1.02) * bounce,
      x: (P.dir || 1) * bounce * env.W * 0.016,
      rot: (P.dir || 1) * bounce * 1.8,
    };
  }
});
```

### 4.9 `fx` — Hiệu ứng màn hình

```js
J.register('fx', 'myKey', {
  name: '…', tags: [...], w: 1,
  dur: number,        // thời lượng (frame, 24fps base) — dùng cho preview
  amp: number,        // cường độ (default 1.15)
  scratch: true,      // cần copy frame vào I.S trước khi vẽ
  mid: true,          // hiệu ứng giữa khung hình (không phải mép)
  edge: false,        // để false để loại khỏi nhóm "edge"
  glitchy: true,      // bị giảm tần suất khi mood glitch thấp
  draw: (ctx, ev, k, I) => void,   // k = tiến độ 0→1
});
```

`I` (info):

| Field | Ý nghĩa |
|---|---|
| `I.cw`, `I.ch` | kích thước canvas (px thiết bị) |
| `I.S` | canvas scratch (bản copy frame trước hiệu ứng) — chỉ có nếu `scratch: true` |
| `I.sc` | scheme màu hiện tại |
| `I.st` | style |
| `I.step` | frame index 24fps |
| `I.t` | thời gian (s) |
| `I.scale` | hệ số scale thiết kế → thiết bị |
| `I.tmp(w,h)`, `I.tmp2(w,h)` | canvas tạm |
| `I.transparent` | đang render ở chế độ nền trong suốt |

`ev` = `{ t, type, amp, dur }`.

**Ví dụ:**

```js
fx('radialChroma', {
  name: '放射色収差', tags: ['glitch','emotional','pop'], w: 0.9, dur: 4, amp: 1, mid: true, scratch: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const d = (0.03 + 0.016 * J.r(ev.amp|0, 1)) * (0.4 + 0.6 * E.outQuad(k));
    // ctx.drawImage(S, ...) hoặc vẽ filter lên ctx
  }
});
```

### 4.10 `trans` — Chuyển tiếp

```js
J.register('trans', 'myKey', {
  name: '…', tags: [...], w: 1,
  dur: 0.35,                             // giây (bị clamp 0.12..0.6)
  plan: (rng, st) => params,
  draw: (ctx, A, B, p, I, P) => void,    // A = frame cũ, B = frame mới, p = 0→1
});
```

`I` (transition info): `{ cw, ch, sc, scPrev, st, P, step, t, scale, allowFilter, seed, tmp(w,h) }`.

- `A` và `B` là canvas đã render đầy đủ.
- Bắt buộc: vẽ `A` làm nền trước, rồi cắt/ghép `B` lên.
- `P` = `cut.transP` (params từ `plan`).

**Ví dụ (`tyRuleWipe`):**

```js
trReg('tyRuleWipe', {
  name: '罫線ワイプ', tags: ['editorial','graphic','calm'], w: 0.9, dur: 0.45,
  plan: rng => ({ n: rng.int(7,12), rtl: rng.chance(0.25) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I, n = Pt.n || 9, bh = ch / n;
    ctx.drawImage(A, 0, 0);
    for (let i = 0; i < n; i++) {
      const q = E.inOutCubic(clamp((p - i * (0.5/n)) / (1 - (n-1) * (0.5/n))));
      const y0 = Math.round(i * bh), y1 = Math.round((i+1) * bh), x = cw * q;
      if (q > 0) part(ctx, B, 0, y0, x, y1 - y0);   // part() = cắt 1 vùng từ canvas
    }
  }
});
```

---

## 5. Object `env` (môi trường render)

```js
{
  ctx,                 // CanvasRenderingContext2D (thiết bị px)
  W, H,                // kích thước thiết kế của vùng vẽ
  sc,                  // scheme màu hiện tại
  st,                  // style object (fonts, schemes, bias...)
  fx,                  // project.fx (motion, glitch, chroma, decor, density...)
  plan,                // toàn bộ plan
  cut,                 // cut hiện tại
  // --- thời gian ---
  t,                   // thời gian tuyệt đối (s)
  lt, ltb,             // thời gian kể từ đầu cut (s) — ltb = lt + lag
  pIn, pOut,           // tiến độ vào / ra (0..1)
  step,                // frame index ở 24fps
  // --- pass / layer ---
  pass,                // 'main' | 'A' | 'B' (ghost pass)
  passColor,           // màu ghost khi pass != 'main'
  layer,               // 'back' | 'front'
  zone,                // {x,y,w,h} nếu centerFree
  // --- khác ---
  scale,               // px thiết bị / px thiết kế
  allowFilter,         // có cho dùng ctx.filter không
  energy,              // mức năng lượng âm thanh 0..1 (từ plan.energy) hoặc null
  beat,                // { index, since, len } — HOẶC null nếu không có beat
  fps, passColor,
}
```

> ⚠️ `env.beat` **chỉ có 3 field**: `{ index, since, len }` — **không có** `strength` hay `dt`.
> `beat.since` = giây kể từ beat vừa rồi; `beat.len` = độ dài nhịp (tối thiểu 0.2s).

### 5.1 Primitives vẽ (dùng cho decor & layout)

| Hàm | Chữ ký |
|---|---|
| `env.rect(x, y, w, h, color, alpha = 1, ghost = true)` | fillRect |
| `env.line(pts, color, lw = 1, alpha = 1, ghost = true)` | `pts = [[x,y], ...]` |
| `env.polyPartial(pts, e, color, lw, alpha, ghost)` | vẽ 1 phần đường (e = 0..1) |
| `env.circle(cx, cy, r, fill, stroke, lw = 1, alpha = 1, ghost = true)` | |
| `env.arc(cx, cy, r, a0, a1, color, lw, alpha, ghost)` | góc **độ** |
| `env.rrect(x, y, w, h, r, fill, alpha, ghost, stroke, lw)` | bo góc |
| `env.poly(pts, color, alpha, ghost)` | fill đa giác |
| `env.blob(pts, color, alpha, ghost)` | fill đa giác bo tròn (quadratic) |
| `env.draw(item)` | vẽ 1 text item (tương đương `J.drawItem`) |

Tham số `ghost`: `true` = dùng màu ghost khi ở pass không phải 'main'; `false` = luôn dùng màu thật.

### 5.2 Object `it` (text item)

```js
{
  text, font, size,
  x, y,               // vị trí
  sx, sy,             // scale ngang/dọc
  rot, skew,          // độ
  track, lead,        // giãn cách, leading
  align, vertical,    // 'left'|'center'|'right'
  color, alpha,       // màu, độ mờ
  fill, fillAlpha,    // bật/tắt fill
  stroke, strokeColor,// viền
  shadow,             // { x|dx, y|dy, blur, color }
  extrude,            // { n, dx, dy, color }
  gradient,           // [c0,c1] hoặc [[offset,color],...]
  pattern, patternColor, patternBg,
  blur, blend, dash,
  mi,                 // motion index (index trong cut)
  seed,               // seed ngẫu nhiên của item
  delay,              // độ trễ stagger
  charFn, pieceFn,    // hàm per-glyph / per-piece đã gộp
  charFns, pieceFns,  // mảng hàm gốc
  pre, post,          // hook (env, it, bb) => void
  streak, echo,       // vệt / bóng lặp
  bands, vbands,      // cắt dải
  clip, clipY, clipFn,
  cursorAt, wipeBar,
  plain,              // layout tự vẽ plate → bỏ qua treat
  noHold, noWeight,
}
```

---

## 6. Hợp đồng `charFn` / `pieceFn`

### 6.1 `charFn(i, g, n) -> object | null`

| Field | Ý nghĩa |
|---|---|
| `dx`, `dy` | dịch chuyển (px thiết kế) |
| `rot` | xoay (độ) |
| `s` | scale đồng nhất |
| `sx`, `sy` | scale riêng |
| `a` | alpha nhân thêm (0..1) |
| `hide` | `true` → ẩn glyph |
| `ch` | thay ký tự |
| `color` | đổi màu glyph |
| `skew`, `blur`, `clipX`, `clipY`, `outline` | mở rộng (một số pack dùng) |

> **Lưu ý:** `J.combineChar` chỉ merge `dx/dy/rot/s/a/sx/sy/ch/color` (+`skew/blur` ở bản mở rộng). `hide` trả về ngay lập tức (không merge).

### 6.2 `pieceFn(ci, pj, pc, ox, oy, g) -> J.PT(...) | null | J.PID`

Trả về `J.PT(dx, dy, rot, s, st, sdir, a)`. `J.PID` = "không đổi".

---

## 7. Audio-reactive API (Stem Separation)

Các helper đọc trực tiếp từ global, **luôn guard** vì có thể không tồn tại:

```js
const kick  = (window.StemVisualizerAPI?.getKickShake?.(env.t, env.plan)) || 0;  // 0..~1.5
const bass  = (window.StemVisualizerAPI?.getBassBloom?.(env.t, env.plan)) || 0;  // 0..~1.5
const piano = (window.StemVisualizerAPI?.getPianoRipple?.()) || 0;
const drop  = (window.SmartSectionAPI?.getDropImpactMultiplier?.(env.t)) || 1;      // 1..~2
```

> ⚠️ `getHiHatSparkle` **KHÔNG tồn tại** trong `StemVisualizerAPI` (đã kiểm tra) — code gọi nó sẽ luôn nhận `0` vì dùng `&&` guard thiếu method.
> Method có thật của `StemVisualizerAPI`: `getKickShake`, `getBassBloom`, `getPianoRipple`, `getDspMetrics`, `getSmoothLevels`, `drawSparkleParticles`, `updateStemLevels`, `isLive`.
> `SmartSectionAPI.getDropImpactMultiplier(t)` **có** thật.

Ngoài ra `env.beat` cung cấp: `{ index, since, len, strength, dt }` — dùng cho nhịp đồng hồ mà không cần audio.

---

## 8. Preview / thumbnail

`J.previewPlan(project, group, key)` dựng plan giả lập để render thumbnail:

- `layout`: text thử 3 cấp độ (`Giai điệu` / `Ánh ban mai` / `Kỷ niệm ngày xưa vang vọng`) — chọn cấp đầu mà `fits(n)` chấp nhận.
- `enter`: quay vòng `inDur`.
- `exit`: quay vòng `outDur`.
- `trans`: 2 cut (`TRƯỚC` / `SAU`).
- `fx`: 1 event tại `t = 0.04`, `dur = (D.dur || 6) / 24`.
- Các nhóm khác: cut 2.4s, layout `center`, enter `pop`, hold `breathe`.

**Yêu cầu để thumbnail hiển thị đúng:**
1. `def.name` phải có.
2. `layout` phải có `fits` (nếu `fits` trả false cho mọi text → preview fallback sang text dài hơn; nếu vẫn false, thumbnail vẫn render, không lỗi).
3. `plan` phải **không throw** khi `cut = { text, n, W, H, dur }` và `st = J.resolveStyle(project)`.
4. `render/draw/apply/get` phải **không throw** với `env` preview.

UI render: `renderTech()` ở ~45050; canvas 160px (ngang) / 110px cao (dọc); preview loop ~14 fps, chỉ vẽ card đang scroll vào viewport (`IntersectionObserver`).

---

## 9. Randomizer / bộ / motif Nhật

```js
J.BASE_PACKS = ['core', undefined, 'layoutsA', 'layoutsB', 'enter', 'exitHold', 'decor', 'looks', 'shotcraft'];
J.BASE_STYLES = [...];
J.EXTRA_FONTS = ['reggae','rampart','potta','kiwi','klee','shippori'];
J.WA = { layout: [...], enter: [...], exit: [...], decor: [...], bg: [...], treat: [...], style: [...] };
J.SETS = { horror:{on:false}, typo:{on:true}, kinetic:{on:true}, shotcraft:{on:true} };
```

Quy tắc random (`J.randomOk`):

| Điều kiện | Kết quả |
|---|---|
| `def.extra` (pack mới) và `project.extra !== true` | ❌ không random |
| `def.wa` và `project.wa === false` | ❌ không random |
| `def.set` và set đang tắt | ❌ không random |

> **Hệ quả thực tế:** pack mới (`cin_mix_fx`) sẽ bị loại khỏi random picker nếu không thêm vào `J.BASE_PACKS` **hoặc** người dùng bật `project.extra`.
> Nếu muốn pack mới xuất hiện trong "Okamakase"/random → **thêm tên pack vào `J.BASE_PACKS`** (ở ~dòng 42316).

---

## 10. Đa ngôn ngữ (tên hiển thị)

Có **3 lớp** đặt tên, áp dụng theo thứ tự (sau cùng thắng):

1. **`def.name`** — mặc định trong mã (tiếng Nhật/Anh).
2. **`titles` dictionary** (script ~42358) — tên tiếng Anh, override sau khi tất cả pack đăng ký:
   ```js
   const titles = { layout: { vcols: 'Vertical text', ... }, enter: {...}, ... };
   // auto-fallback: 'myKey' -> 'My Key' (camelCase -> Title Case, RGB/CRT/VHS/QR/TV/LED/HUD/JP giữ nguyên)
   ```
3. **`P` dictionary** (script ~42590) — ghi đè tên cho các pack `horror` / `typo` / `kinetic`.
4. **Dictionary tiếng Việt** (script ~42595) — chỉ override **style** và **mood**, không override tên kỹ thuật.

> **Kết luận thực tế:** tên kỹ thuật hiển thị là **tiếng Anh** (từ `titles` hoặc auto-label). Nếu muốn hiện tiếng Việt phải thêm vào `titles` (không có cơ chế VI riêng cho technique).
> → **Khuyến nghị:** đặt `def.name` là **tiếng Việt** (có emoji) để khớp phong cách hiện tại của pack `cin_mix_fx` (`'⚡ Speed Slash (Chém Xé Gió)'`), và thêm key vào `titles` nếu muốn bản Anh.

---

## 11. Thêm kỹ thuật mới — checklist

1. Chọn `group` và `key` **chưa tồn tại** (`J.order(group)`).
2. Đặt trong block pack, ví dụ `cin_mix_fx` (hiện ở ~dòng **42004–42295** trong `index.html`).
3. `def.name` bắt buộc. `tags` nên dùng mood hợp lệ (`glitch|calm|pop|graphic|editorial|emotional|horror`).
4. `def.plan` (nếu có) **không throw** với `rng` của preview plan.
5. `def.render/draw/apply/get` **không throw** khi `env` là preview env.
6. Không sửa `J.CORE_ORDER`.
7. Nếu muốn random picker dùng được → thêm pack vào `J.BASE_PACKS` hoặc đặt `def.set` cho 1 set đang bật.
8. Thêm tên vào `titles` (tiếng Anh) nếu muốn.
9. **Áp dụng đồng thời cho `index.html` và `JIZURA CIN MIX/index.html`.**
10. Chạy `node --test tests/*.test.js` → phải **379 pass / 0 fail**.
11. Rebuild `JIZURA-CIN-MIX.zip`.

---

## 12. Gotchas thường gặp

| Vấn đề | Nguyên nhân | Cách sửa |
|---|---|---|
| Thumbnail trống / nền đen | `render`/`draw` throw | Bọc try/catch, kiểm tra `env.cut` tồn tại |
| Kỹ thuật không xuất hiện trong UI | `def.special` truthy | Bỏ `special` |
| Được hiện nhưng bị gạch ngang trong UI | `extra` = true | Thêm pack vào `J.BASE_PACKS` |
| Tên hiển thị tiếng Anh dù đặt tiếng Việt | dictionary `titles` override | Thêm key vào `titles` hoặc đổi tên key khác |
| `hold` không chạy | `it.noHold` = true (layout tự vẽ plate) | Kiểm tra `plateHold(env)` trong pack |
| `treat` không chạy | `it.plain` = true | Đặt `plain` false (mặc định) |
| Không thấy `charFns` | `J.mainDraw` reset `it.charFns = []` mỗi frame | Push vào `it.charFns` **trong** `apply`, không giữ tham chiếu ngoài |
| `getHiHatSparkle` luôn 0 | chưa implement | Dùng `env.beat` hoặc `getBassBloom` / `getPianoRipple` |
| `env.beat.strength` là `undefined` | beat chỉ có `{index, since, len}` | Tính `strength = 1 - since/len` nếu cần |
| `drawFx` không vẽ | thiếu `it.text` hoặc `it.size <= 0.5` | Kiểm tra item |
| Số script ≠ 12 | thêm `<script>` mới | Gộp code vào script hiện có |
| Test fail SHA256 | sửa `amv_asset_manager.js` mà không copy sang `src/` + `JIZURA CIN MIX/` | Copy cả 3 bản |

---

## 13. Bản đồ nhanh các dòng quan trọng (`index.html`)

| Dòng | Nội dung |
|---|---|
| ~5195–5300 | Helper `J` (clamp/lerp/E/rng/màu) |
| ~5875–6221 | `layoutText`, `measure`, `fitSize`, `drawItem` |
| ~6235–6285 | Style schemes (màu) |
| ~6474 | `J.resolveStyle` |
| ~7062–7102 | `combineChar` / `combinePiece` |
| ~7130–7178 | **Registry**: `GROUPS`, `J.register`, `J.order` |
| ~7190–7220 | `J.mainDraw` (pipeline enter→treat→hold→exit) |
| ~7223–7276 | `J.drawFx` (streak/echo/bands/clip) |
| ~7331–8200 | `J.LAYOUTS` mặc định + styles |
| ~8202 | `J.CORE_ORDER` (**đóng băng**) |
| ~8645–8890 | Planner (tạo cuts) |
| ~9308–9392 | `J.previewPlan` |
| ~9434–9450 | `J.MOODS` |
| ~9964–10029 | `makeEnv` + primitives |
| ~10085–10160 | Renderer `post()` — gọi FX |
| ~11232–11390 | Pack `bgcamB` (bg + cam) |
| ~22052–22100 | Pack FX + helper `fx()` |
| ~23575–24140 | Pack `horror` |
| ~25620–26360 | Pack `kinetic` |
| ~40960–41200 | Pack `shotcraft` (cam/trans) |
| **~42004–42295** | **Pack `cin_mix_fx`** ← chỗ thêm kỹ thuật mới |
| ~42316–42352 | `BASE_PACKS`, `WA`, `SETS`, `randomOk` |
| ~42354–42588 | Dictionary `titles` (EN) |
| ~42590–42600 | Dictionary `P` (pack) + dictionary VI (style/mood) |
| ~44957–45108 | UI tab "Kỹ thuật" (`renderTech`) |
| ~51121–51230 | `StemVisualizerAPI` |
| ~54359+ | `AudioVisualizerAPI` |
| ~55515+ | `SmartSectionAPI` |

---

## 15. Pack `cin_mix_fx` — 96 kỹ thuật native (3 đợt, 2026-10-29)

Đã đăng ký **96 technique native** trong block `cin_mix_fx`.
Nguồn: `index.html` + `JIZURA CIN MIX/index.html` (đồng bộ byte-for-byte ở block `cin_mix_fx`),
pack đã có trong `J.BASE_PACKS` → **được random picker chọn** (không cần bật `project.extra`).

| Nhóm | Số | Keys |
|---|---|---|
| `layout` | 12 | `cinTitleCard`, `cinSplitFrame`, `cinVerticalDrift`, `cinNeonSign`, `cinSubtitleSafe`, `cinStackKanji`, `cinKickerTitle`, `cinNewsTicker`, `cinPosterBig`, `cinCornerStack`, `cinDualColumn`, `cinMarqueeBox` |
| `enter` | 6 | `cinSlamIn`, `cinCascadeIn`, `cinIrisFocus`, `cinWhipIn`, `cinTypeOn`, `cinBeatZoom` |
| `hold` | 6 | `cinFlickerHold`, `cinGlowBreathe`, `cinSplitFlicker`, `cinBeatPulse`, `cinWaveShift`, `cinGlitchPulse` |
| `exit` | 6 | `cinBurnOut`, `cinSplitExit`, `cinPixelDissolve`, `cinScatterOut`, `cinReverseExit`, `cinVerticalBlur` |
| `decor` | 12 | `cinFilmGate`, `cinAnamorphicFlare`, `cinTimecode`, `cinLetterboxBars`, `cinFilmDust`, `cinLensFlare`, `cinSprocketHoles`, `cinDiagonalRule`, `cinNeonFrame`, `cinFilmLeader`, `cinSubtitleBar`, `cinDarkFrame` |
| `treat` | 6 | `cinChromeText`, `cinHologram`, `cinOutlineNeon`, `cinGradientSweep`, `cinRetroPrint`, `cinStencilBreak` |
| `bg` | 12 | `cinStageSpotlight`, `cinNeonGrid`, `cinRainBokeh`, `cinAuroraRift`, `cinHalftoneSun`, `cinDustMotes`, `cinStarfield`, `cinInkWash`, `cinTunnelLights`, `cinCityBokeh`, `cinLaserGrid`, `cinCloudscape` |
| `cam` | 12 | `cinKickPunch`, `cinSlowOrbit`, `cinSnapIn`, `cinHandheldShake`, `cinDutchAngle`, `cinZoomBreath`, `cinRollingShutter`, `cinVertigoPush`, `cinCraneUp`, `cinSpinDolly`, `cinImpactShake`, `cinLensBreath` |
| `fx` | 12 | `cinPrismShift`, `cinBarGlitch`, `cinVignettePulse`, `cinScanlineRoll`, `cinRGBStutter`, `cinEchoTrail`, `cinVHSChroma`, `cinGlitchBlocks`, `cinChromaticWave`, `cinMirrorSplit`, `cinFlashFrames`, `cinDipToBlack` |
| `trans` | 12 | `cinFlashCut`, `cinWhipWipe`, `cinLightLeak`, `cinFilmBurn`, `cinIrisCircle`, `cinShutterBars`, `cinInkSpread`, `cinVerticalSlide`, `cinSlicePush`, `cinDipToColor`, `cinZoomBlurTrans`, `cinRibbonWipe` |

**Đợt 1** (30): 3/nhóm — nền tảng (xem lịch sử git).
**Đợt 2** (30): 3/nhóm — đợt mở rộng toàn bộ 10 nhóm.
**Đợt 3** (36): 6/nhóm — tập trung 6 nhóm `layout` / `decor` / `bg` / `cam` / `fx` / `trans`.

Tên hiển thị: tiếng Việt trong `def.name`, tiếng Anh trong dictionary `titles` (đã thêm cho cả 96 key).

Test: `tests/cin_mix_native_techniques.test.js` (3 test) — kiểm tra đăng ký đủ 10 nhóm,
preview plan render không throw, và sống sót qua renderer post pipeline.

> Script patch dùng để áp các đợt:
> - Đợt 2: `tools/apply_cin_batch2.mjs` + `tools/cin_batch2_code.mjs`
> - Đợt 3: `tools/apply_cin_batch3.mjs` + `tools/cin_batch3_code.mjs`
> (mã kỹ thuật nằm trong file `*_code.mjs` — sửa ở đó rồi chạy lại patch script).

---

## 15b. Ghi chú kỹ thuật

### Đợt 2
- `cinTypeOn` dùng `{ hide: true }` trong `charFns` — `J.combineChar` trả `hide` ngay lập tức, engine bỏ qua glyph.
- `cinStencilBreak` dùng `it.fill = false` + `clipY` theo ký tự (engine hỗ trợ `c.clipY` trong `drawItem`).
- `cinFilmBurn` (trans) dùng `I.tmp(cw, ch)` + `destination-in` gradient để cắt hình B theo vệt cháy.
- `cinIrisCircle` dùng `ctx.clip('evenodd')` để lấy hình B trong hình tròn.
- `cinSubtitleSafe` đặt chữ ở `y = H * 0.875` — vùng an toàn phụ đề.

### Đợt 3
- `bg` và `trans` phải đăng ký qua wrapper `bgReg(...)` / `trReg(...)` của pack `cin_mix_fx`
  (wrapper tự bọc `ctx.save()/restore()` và lấy params từ `I.P` cho trans).
- `ctx.ellipse` **không có** trong mock context của test → dùng fallback `ctx.arc`.
  (Đã sửa `cinTunnelLights`.)
- `cinNewsTicker` không dùng `J.mainDraw` (chữ chạy ngang) → vẽ bằng `env.draw` + `env.rect` làm nền.
- `cinCornerStack` tự ghép bbox từ kết quả `env.draw` vì không có `J.mainDraw`.
- `cinZoomBlurTrans` dùng `ctx.filter = 'blur(...)'` — chỉ khi `I.allowFilter` true (guard trong code).
- `cinVertigoPush` chỉ dùng `s` (scale) để giả lập dolly zoom — không đổi tiêu cự thật.

---

## 16. Phân biệt: Technique registry vs AMV add-on
| | Technique registry (`J.register`) | AMV add-on |
|---|---|---|
| Nơi | `index.html` (script engine) | `amv_asset_library.js`, `amv_asset_manager.js` |
| Đăng ký | `J.register(group, key, def, pack)` | `AMVAssetLibrary` / `AMVAssetManager` |
| Hiển thị | Tab 10 nhóm trong UI editor | Add-on / asset manager riêng |
| Vai trò | Kỹ thuật dựng video **native** | Quản lý asset (asset trải phí, người dùng import) |

> Yêu cầu của người dùng: **không** thêm feature vào hệ thống AMV add-on; thêm vào **technique registry native** (10 nhóm).
