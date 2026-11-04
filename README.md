# JIZURA — cinnamley123g mix bản jizuraa

**AMV Studio · Kinetic Lyric Video Creator · 3D Audio Visualizer**

Trình tạo video lời bài hát chuyển động với Layout nhân vật đa vị trí, 3 lớp Layer phía sau kiểu Lyric,
và bộ visualizer 3D phản ứng âm thanh. Bản mix bởi cinnamley123g.

## Chạy ứng dụng

Ứng dụng chạy **hoàn toàn client-side**, không cần server, bundler hay bước build nào.

```
mở index.html bằng trình duyệt
```

Hoặc phục vụ tĩnh (tuỳ chọn, cho PWA/service worker):

```bash
npx serve .
```

## Yêu cầu

- Trình duyệt hiện đại (Chrome / Edge / Firefox / Safari)
- Node.js ≥ 20 — **chỉ dùng để chạy test**, không cần cho app

## Chạy test

```bash
npm test
```

Lệnh này chạy `node --test --test-concurrency=1 tests/*.test.js` — 25 suite, 454 test.

> ⚠️ **Bắt buộc `--test-concurrency=1`.** Các suite benchmark assert thời gian render `< 16.6 ms` (60 FPS).
> Khi chạy song song, máy bị nghẽn và benchmark **fail giả**. Engine thực chỉ mất ~1.0–1.7 ms/frame.

## Cấu trúc thư mục

| Đường dẫn | Vai trò |
|---|---|
| `index.html` | Bản chính — app + toàn bộ engine (đúng **12** thẻ `<script>`) |
| `amv_asset_library.js` / `amv_asset_manager.js` | Hệ thống AMV add-on (preset, post-filter, beat detector) |
| `src/amv_asset_manager.js` | Mirror byte-for-byte của `amv_asset_manager.js` (bắt buộc SHA256 parity) |
| `src/timeline/`, `src/pipeline/` | Beat detector & WebCodecs exporter |
| `tests/` | 25 suite, 454 test |
| `tools/` | Script sync mirror, đóng gói zip, build Cloudflare, perf probe |
| `docs/TECHNIQUE_API.md` | **Nguồn sự thật** về technique registry (`J.register`) |

## Đồng bộ & đóng gói

```bash
node tools/sync_all_mirrors.mjs    # đồng bộ public/, cloudflare_dist/, JIZURA CIN MIX/
node tools/build_cloudflare.mjs    # build cloudflare_dist + cloudflare_dist.zip
node tools/build_pages.mjs         # build dist/ cho GitHub Pages (giữ invariant 12 script)
node tools/pack_zip.mjs            # build JIZURA-CIN-MIX.zip
```

> ⚠️ **Sửa file gốc ở root rồi phải chạy `sync_all_mirrors.mjs`.** `src/`, `public/`, `cloudflare_dist/`
> và `JIZURA CIN MIX/` chỉ là mirror — sửa trực tiếp vào chúng sẽ bị ghi đè, và SHA256 parity sẽ fail.

## Triển khai

| Nơi | Cách |
|---|---|
| **GitHub Pages** | Push lên `main` → workflow `pages.yml` tự build & deploy |
| **Cloudflare Pages** | `node tools/build_cloudflare.mjs` rồi upload `cloudflare_dist/` |
| **Offline / PWA** | `sw.js` cache app shell; **network-first** cho HTML + bundle JS nên fix mới luôn tới client |

Live demo: <https://sansma123g123456.github.io/Jizuraa-cinnamley123g-mix/>

## Bất biến bắt buộc

1. `index.html` giữ **đúng 12** thẻ `<script>`.
2. `J.CORE_ORDER` (5 nhóm core) **đóng băng** — không được sửa.
3. SHA256 parity giữa `amv_asset_manager.js` và mọi mirror.
4. Mọi kỹ thuật mới phải có ở **cả** `index.html` và `JIZURA CIN MIX/index.html`.

Chi tiết: [`docs/TECHNIQUE_API.md`](docs/TECHNIQUE_API.md)

## Giấy phép

MIT — dựa trên JIZURA engine (© 2026 hakoniwa) và mp4-muxer (MIT).
Phông chữ: Google Fonts (SIL Open Font License 1.1).
