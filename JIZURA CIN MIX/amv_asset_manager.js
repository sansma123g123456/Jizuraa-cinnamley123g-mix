/* =====================================================================
 * JIZURA AMV ASSET MANAGER & UI INTEGRATION ENGINE (v2.2)
 * Tích hợp toàn diện 6 Danh mục / 42 Presets chuẩn AMV Anime
 * Đã sửa toàn bộ logic áp dụng:
 * 1. Khởi tạo mặc định: TẤT CẢ TẮT (null) - Không tự động rung hay chớp.
 * 2. Offscreen Scene Capture: Camera biến đổi TOÀN BỘ khung hình video/lyric/character
 *    thành 1 khối thống nhất, cố định tâm W/2, H/2, tự động bù biên 1.05x, không lệch trôi.
 * 3. Bố cục (Layout): Renders các ô cắt chéo/manga/4-ô trực tiếp từ video gốc,
 *    không chồng hình hay tạo bóng kép.
 * 4. Chuyển tiếp (Transition): Tự động lấy khung video hiện tại, không vẽ placeholder.
 * 5. Nhân vật Đứng (Idle): Khóa vị trí theo tọa độ gốc của nhân vật (charX, charY),
 *    không nhảy vọt vị trí.
 * 6. UI: Giữ nguyên Preview Canvas khi nhấn "Áp Dụng", không đứt kết nối vòng lặp.
 * ===================================================================== */
(function() {
  'use strict';

  // 8 Danh mục AMV chuẩn mực (có thêm Bộ lọc hậu kỳ đa lớp pmndrs/postprocessing)
  const CATEGORY_META = [
    { id: 'Bộ lọc hậu kỳ', count: '20 Filters', icon: '🎛️', desc: 'pmndrs/postprocessing Rack: 20 bộ lọc cao cấp chuẩn AMV Master (Optical Shutter Motion Blur, Cinematic DoF Bokeh, Anamorphic Streaks, Halation 35mm, Datamosh, Shockwave Lens,...)' },
    { id: 'Camera', count: '8 Presets', icon: '🎥', desc: 'Ống kính AMV: Rung chấn Beat Shake, Dolly Zoom Vertigo, Whip Snap hồi tâm, Beat Punch Zoom, 3D Tilt, Crash Zoom, Orbit Pan, Target Lock' },
    { id: 'Bố cục', count: '6 Presets', icon: '📐', desc: 'Chia màn hình, khung Manga Shonen, Khung điện ảnh 2.39:1, Khung ngắm HUD, 4 ô nhịp' },
    { id: 'Đứng', count: '6 Presets', icon: '🧍', desc: 'Chuyển động lặp (Loop): Trôi nổi Parallax, Hít thở tự nhiên, Lơ lửng không trọng lực, Nhịp tim' },
    { id: 'Trang trí', count: '10 Presets', icon: '✨', desc: 'Lớp phủ mỹ thuật: Hào quang bám viền Nhân vật (Edge Aura), Katana Slash xuyên thân, Tia tốc độ Anime, Tinh thể, Bụi phim, Rò sáng, Cánh hoa, Tàn lửa, Cyber HUD' },
    { id: 'Hiệu ứng màn hình', count: '8 Presets', icon: '📺', desc: 'Hậu kỳ đơn lẻ: RGB Glitch cắt lát, CRT Scanlines, Dreamy Bloom, WebGL Chromatic, Tối viền điện ảnh, Sóng nhiệt, Chớp âm bản, Vệt mờ xuyên tâm' },
    { id: 'Chuyển tiếp', count: '6 Presets', icon: '🔄', desc: 'Chuyển cảnh: Quét chéo viền sáng, Xuyên zoom chớp sáng, Rèm trượt, Vỡ sóng nhiễu Glitch Slice, Xoay vặn xoáy, Cháy sáng Film Burn' },
    { id: 'Phản ứng âm thanh', count: '9 Presets Studio', icon: '📊', desc: 'Sóng Nhạc Audio Visualizer Studio 4K: Trap Nation Pro, Monstercat Studio Spectrum, Siri Liquid Silk Wave, Dual Stereo Wings, Chòm sao Laser Stardust, Cyberpunk LED Matrix, Shockwave Blast' }
  ];

  // Global State for AMV Assets (TẤT CẢ MẶC ĐỊNH LÀ NULL - KHÔNG TỰ KÍCH HOẠT)
  const state = {
    isOpen: false,
    isDocked: false,
    selectedCategory: 'Bộ lọc hậu kỳ',
    activeAssets: {
      'Camera': null,
      'Bố cục': null,
      'Đứng': null,
      'Trang trí': null,
      'Hiệu ứng màn hình': null,
      'Chuyển tiếp': null,
      'Phản ứng âm thanh': null
    },
    // When the user explicitly turns the audio visualizer OFF, the AMV audio layer must be
    // skipped entirely. We cannot rely on a null asset id: the render pipeline used to fall
    // back to 'audio_trap_nation_pro' whenever the id was missing, so the visualizer kept
    // drawing on the canvas even after it had been switched off.
    audioVisualizerOff: false,
    postFilters: {}, // filterId -> { enabled: boolean, intensity: number, audioReactivity: number, audioBand: string, params: {} }
    cameraConfig: {
      target: 'all', // 'all' (Toàn cảnh) | 'lyric_priority' | 'char_only' | 'lyric_only'
      anchor: 'auto', // 'auto' | 'character' | 'lyric' | 'center'
      lyricInfluence: 100, // 0 - 150%
      parallax3D: true, // 3-Plane Parallax Depth
      beatImpact: true, // Beat Impact Squash & Glitch
      sandwichDepth: true // 2.5D Sandwich Depth & Rim Light
    },
    customParams: {}, // assetId -> { paramName: value }
    lockedCategories: {
      'Bộ lọc hậu kỳ': false,
      'Camera': false,
      'Bố cục': false,
      'Đứng': false,
      'Trang trí': false,
      'Hiệu ứng màn hình': false,
      'Chuyển tiếp': false,
      'Phản ứng âm thanh': false
    },
    previewRunning: true
  };

  // Helper khởi tạo mặc định cho 10 bộ lọc pmndrs/postprocessing
  function ensurePostFiltersInit() {
    const lib = window.AMVAssets;
    const list = (lib && lib.postProcessingFilters) || [];
    list.forEach(f => {
      if (!state.postFilters[f.id]) {
        state.postFilters[f.id] = {
          enabled: false,
          intensity: 1.0,
          audioReactivity: typeof f.defaultAudioReactivity === 'number' ? f.defaultAudioReactivity : 0.8,
          audioBand: f.defaultAudioBand || 'energy',
          params: Object.assign({}, f.defaultParams)
        };
      }
    });
  }

  // Khôi phục trạng thái activeAssets, customParams và postFilters từ localStorage
  try {
    const saved = localStorage.getItem('jizura_amv_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.activeAssets) Object.assign(state.activeAssets, parsed.activeAssets);
      if (typeof parsed.audioVisualizerOff === 'boolean') state.audioVisualizerOff = parsed.audioVisualizerOff;
      if (parsed.customParams) Object.assign(state.customParams, parsed.customParams);
      if (parsed.postFilters) Object.assign(state.postFilters, parsed.postFilters);
      if (parsed.cameraConfig) Object.assign(state.cameraConfig, parsed.cameraConfig);
    }
    const savedPost = localStorage.getItem('jizura_amv_post_filters');
    if (savedPost) {
      Object.assign(state.postFilters, JSON.parse(savedPost));
    }
  } catch (e) {}

  ensurePostFiltersInit();

  function persistState() {
    try {
      localStorage.setItem('jizura_amv_state', JSON.stringify({
        activeAssets: state.activeAssets,
        audioVisualizerOff: state.audioVisualizerOff,
        customParams: state.customParams,
        postFilters: state.postFilters,
        cameraConfig: state.cameraConfig
      }));
      localStorage.setItem('jizura_amv_post_filters', JSON.stringify(state.postFilters));
    } catch (e) {}
    if (window.S && window.S.project) {
      window.S.project.amv = {
        activeAssets: Object.assign({}, state.activeAssets),
        audioVisualizerOff: state.audioVisualizerOff,
        customParams: JSON.parse(JSON.stringify(state.customParams)),
        postFilters: JSON.parse(JSON.stringify(state.postFilters)),
        cameraConfig: Object.assign({}, state.cameraConfig)
      };
    }
  }

  window.ActiveAMVState = state;
  window.__getAMVState = () => ({
    activeAssets: Object.assign({}, state.activeAssets),
    audioVisualizerOff: state.audioVisualizerOff,
    customParams: JSON.parse(JSON.stringify(state.customParams)),
    postFilters: JSON.parse(JSON.stringify(state.postFilters)),
    cameraConfig: Object.assign({}, state.cameraConfig)
  });
  window.__applyAMVState = (cfg) => {
    if (!cfg) return;
    if (cfg.activeAssets) {
      for (const k of Object.keys(state.activeAssets)) {
        state.activeAssets[k] = cfg.activeAssets[k] || null;
      }
    }
    if (typeof cfg.audioVisualizerOff === 'boolean') state.audioVisualizerOff = cfg.audioVisualizerOff;
    if (cfg.customParams) Object.assign(state.customParams, cfg.customParams);
    if (cfg.postFilters) Object.assign(state.postFilters, cfg.postFilters);
    if (cfg.cameraConfig) Object.assign(state.cameraConfig, cfg.cameraConfig);
    ensurePostFiltersInit();
    persistState();
    try { renderCategoriesList(); } catch (e) {}
    try { updateActivePresetCards(state.selectedCategory); } catch (e) {}
    try { triggerMainRedraw(); } catch (e) {}
  };

  // Active preview canvas loop
  const previewCanvasMap = new Map(); // assetId -> { canvas, ctx, asset, w, h }

  function getLibrary() {
    return window.AMVAssets || null;
  }

  function resolveActiveAudioVisualizerId() {
    // The user turned the audio visualizer OFF -> no preset may be resolved.
    if (state.audioVisualizerOff) return null;
    let actId = (state.activeAssets && state.activeAssets['Phản ứng âm thanh']) ? state.activeAssets['Phản ứng âm thanh'] : null;
    if (!actId && window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.isEnabled === 'function' && window.AudioVisualizerAPI.isEnabled()) {
      actId = (typeof window.AudioVisualizerAPI.getStyle === 'function') ? window.AudioVisualizerAPI.getStyle() : 'circle_trap';
    }
    if (actId) {
      const lib = getLibrary();
      if (lib && typeof lib.get === 'function') {
        const found = lib.get(actId);
        if (found && found.id) return found.id;
        // Robust fallback: if actId not found in library, fall back to audio_trap_nation_pro
        const fallback = lib.get('audio_trap_nation_pro');
        if (fallback && fallback.id) return fallback.id;
      }
      return actId;
    }
    return null;
  }

  // ---------------------------------------------------------------- UI Styles
  let modalEl = null;
  let tabPaneEl = null;

  function ensureStyles() {
    if (document.getElementById('amv-asset-styles')) return;
    const style = document.createElement('style');
    style.id = 'amv-asset-styles';
    style.textContent = `
      .amv-modal-overlay {
        position: fixed;
        inset: 0;
        z-index: 99995;
        background: rgba(8, 7, 14, 0.78);
        backdrop-filter: blur(10px);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .amv-modal-overlay.open {
        opacity: 1;
        pointer-events: auto;
      }
      .amv-modal-window {
        width: 860px;
        max-width: calc(100vw - 24px);
        height: 660px;
        max-height: calc(100vh - 32px);
        background: #110f1c;
        border: 1px solid #2e284a;
        border-radius: 12px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.15), 0 0 30px rgba(22, 244, 212, 0.12);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .amv-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 18px;
        background: rgba(20, 17, 34, 0.95);
        border-bottom: 1px solid #282242;
        gap: 12px;
        flex-shrink: 0;
      }
      .amv-modal-title {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .amv-modal-title h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 800;
        color: #f3effa;
        display: flex;
        align-items: center;
        gap: 8px;
        letter-spacing: 0.02em;
      }
      .amv-modal-subtitle {
        font-size: 11px;
        color: #a59abb;
        font-family: var(--ui, sans-serif);
      }
      .amv-modal-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .amv-btn-icon {
        background: #1c182e;
        border: 1px solid #2e284a;
        color: #f3effa;
        border-radius: 6px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.15s ease;
      }
      .amv-btn-icon:hover {
        background: #282242;
        border-color: #3d3560;
        color: #fff;
      }
      .amv-modal-body {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
      .amv-category-sidebar {
        width: 230px;
        background: #0d0b16;
        border-right: 1px solid #282242;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        padding: 8px 6px;
        gap: 3px;
        flex-shrink: 0;
      }
      @media (max-width: 768px) {
        .amv-modal-overlay {
          padding: 0 !important;
        }
        .amv-modal-window {
          width: 100vw !important;
          max-width: 100vw !important;
          height: 100vh !important;
          height: 100dvh !important;
          max-height: 100vh !important;
          max-height: 100dvh !important;
          border-radius: 0 !important;
          border: none !important;
        }
        .amv-modal-header {
          padding: 10px 14px !important;
          flex-wrap: wrap !important;
        }
        .amv-modal-body {
          flex-direction: column !important;
        }
        .amv-category-sidebar {
          width: 100% !important;
          max-height: 48px !important;
          flex-direction: row !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          border-right: none !important;
          border-bottom: 1px solid #282242 !important;
          padding: 6px 8px !important;
          gap: 6px !important;
          white-space: nowrap !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
        }
        .amv-category-sidebar::-webkit-scrollbar { display: none !important; }
        .amv-category-item, .amv-cat-btn {
          padding: 6px 12px !important;
          flex-shrink: 0 !important;
          border-radius: 20px !important;
          font-size: 11px !important;
        }
        .amv-rack-grid {
          grid-template-columns: 1fr !important;
        }
        .amv-rack-presets-row {
          overflow-x: auto !important;
          flex-wrap: nowrap !important;
          -webkit-overflow-scrolling: touch !important;
          scrollbar-width: none !important;
          padding-bottom: 4px !important;
        }
        .amv-rack-presets-row::-webkit-scrollbar { display: none !important; }
        .amv-rack-preset-btn {
          flex-shrink: 0 !important;
          font-size: 10.5px !important;
        }
      }
      .amv-category-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-radius: 6px;
        color: #a59abb;
        font-size: 12px;
        cursor: pointer;
        user-select: none;
        transition: all 0.12s ease;
        border: 1px solid transparent;
      }
      .amv-category-item:hover {
        background: rgba(46, 40, 74, 0.4);
        color: #f3effa;
      }
      .amv-category-item.active {
        background: #1c182e;
        border-color: #3d3560;
        color: #16f4d4;
        font-weight: 700;
        box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      }
      .amv-cat-left {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .amv-cat-chevron {
        font-size: 9px;
        opacity: 0.6;
        transition: transform 0.15s ease;
      }
      .amv-category-item.active .amv-cat-chevron {
        transform: rotate(90deg);
        color: #16f4d4;
      }
      .amv-cat-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .amv-cat-count {
        font-family: var(--mono, monospace);
        font-size: 10px;
        color: #6c6382;
      }
      .amv-category-item.active .amv-cat-count {
        color: #a59abb;
      }
      .amv-cat-lock {
        background: transparent;
        border: none;
        cursor: pointer;
        font-size: 10px;
        padding: 2px 4px;
        border-radius: 3px;
        color: #6c6382;
        transition: color 0.15s ease;
      }
      .amv-cat-lock:hover {
        color: #f5a50c;
      }
      .amv-cat-lock[aria-pressed="true"] {
        color: #f5a50c;
      }
      .amv-presets-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: #110f1c;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .amv-category-header-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #18142a;
        border-radius: 8px;
        border: 1px solid #282242;
      }
      .amv-presets-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
        gap: 14px;
      }
      .amv-preset-card {
        background: #161226;
        border: 1px solid #282242;
        border-radius: 8px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        transition: all 0.18s ease;
        position: relative;
      }
      .amv-preset-card:hover {
        border-color: #3d3560;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        transform: translateY(-1px);
      }
      .amv-preset-card.is-active {
        border-color: #16f4d4;
        box-shadow: 0 0 14px rgba(22, 244, 212, 0.22);
      }
      .amv-preset-canvas-wrap {
        width: 100%;
        height: 140px;
        background: #090810;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .amv-preset-canvas-wrap canvas {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
      }
      .amv-active-pill {
        position: absolute;
        top: 8px;
        right: 8px;
        background: #16f4d4;
        color: #0c0b16;
        font-size: 9.5px;
        font-weight: 800;
        letter-spacing: 0.05em;
        padding: 2px 7px;
        border-radius: 4px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      }
      .amv-preset-info {
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .amv-preset-name {
        font-size: 12.5px;
        font-weight: 700;
        color: #f3effa;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .amv-preset-id {
        font-family: var(--mono, monospace);
        font-size: 10px;
        color: #6c6382;
      }
      .amv-preset-actions {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
      }
      .amv-btn-apply {
        flex: 1;
        background: #241f3b;
        color: #f3effa;
        border: 1px solid #383058;
        border-radius: 5px;
        font-size: 11px;
        font-weight: 700;
        padding: 6px 10px;
        cursor: pointer;
        transition: all 0.15s ease;
        text-align: center;
      }
      .amv-btn-apply:hover {
        background: #312a52;
        border-color: #4a3e74;
        color: #fff;
      }
      .amv-btn-apply.active-state {
        background: #16f4d4;
        border-color: #16f4d4;
        color: #0d0b16;
      }
      .amv-btn-tune {
        background: #1c182e;
        border: 1px solid #2e284a;
        color: #a59abb;
        border-radius: 5px;
        padding: 6px 9px;
        cursor: pointer;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.15s ease;
      }
      .amv-btn-tune:hover {
        background: #282242;
        color: #fff;
      }
      .amv-params-panel {
        background: #100d1e;
        border-top: 1px solid #241f3b;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        font-size: 11px;
      }
      .amv-param-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .amv-param-label {
        color: #9d96b3;
        font-size: 10.5px;
      }
      .amv-param-row input[type="range"] {
        flex: 1;
        height: 4px;
        accent-color: #16f4d4;
        cursor: pointer;
      }
      .amv-param-row input[type="color"] {
        width: 24px;
        height: 22px;
        padding: 0;
        border: 1px solid #332b50;
        border-radius: 3px;
        cursor: pointer;
        background: transparent;
      }
      .amv-param-val {
        font-family: var(--mono, monospace);
        font-size: 10px;
        color: #16f4d4;
        min-width: 28px;
        text-align: right;
      }
      .amv-btn-row-theme {
        background: rgba(22, 244, 212, 0.12);
        border: 1px solid rgba(22, 244, 212, 0.35);
        color: #16f4d4;
        font-size: 9.5px;
        font-weight: 700;
        border-radius: 4px;
        padding: 2px 6px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 3px;
        transition: all 0.15s ease;
        white-space: nowrap;
      }
      .amv-btn-row-theme:hover {
        background: rgba(22, 244, 212, 0.28);
        border-color: #16f4d4;
        transform: translateY(-1px);
      }
      .amv-param-theme-banner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        margin-bottom: 8px;
        padding: 5px 8px;
        background: rgba(22, 244, 212, 0.08);
        border: 1px solid rgba(22, 244, 212, 0.22);
        border-radius: 6px;
      }
      .amv-btn-theme-apply {
        background: linear-gradient(135deg, rgba(22, 244, 212, 0.2), rgba(6, 182, 212, 0.3));
        border: 1px solid #16f4d4;
        color: #16f4d4;
        font-size: 10px;
        font-weight: 700;
        border-radius: 4px;
        padding: 3px 8px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .amv-btn-theme-apply:hover {
        background: #16f4d4;
        color: #0c0a18;
      }
      .amv-btn-theme-toggle {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #94a3b8;
        font-size: 10px;
        font-weight: 600;
        border-radius: 4px;
        padding: 3px 7px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .amv-btn-theme-toggle.active {
        background: rgba(192, 132, 252, 0.2);
        border-color: #c084fc;
        color: #c084fc;
        font-weight: 700;
      }
      /* Multi-Filter Post-Processing Rack Styles (Vizzy.io Inspired) */
      .amv-rack-container {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
      }
      .amv-rack-header-toolbar {
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: #171329;
        border: 1px solid #2e284a;
        border-radius: 8px;
        padding: 12px 14px;
      }
      .amv-rack-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }
      .amv-rack-presets-row {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        padding-top: 8px;
        border-top: 1px dashed #2e284a;
      }
      .amv-rack-preset-btn {
        background: #201b38;
        border: 1px solid #383058;
        color: #f3effa;
        font-size: 10.5px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .amv-rack-preset-btn:hover {
        background: #2d264e;
        border-color: #16f4d4;
        color: #16f4d4;
      }
      .amv-rack-card {
        background: #151126;
        border: 1px solid #282244;
        border-radius: 10px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        position: relative;
      }
      .amv-rack-card:hover {
        border-color: #3f3666;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      }
      .amv-rack-card.is-active {
        border-color: #16f4d4;
        background: #17132c;
        box-shadow: 0 0 16px rgba(22, 244, 212, 0.18);
      }
      .amv-rack-card-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .amv-rack-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #221c3b;
        border: 1px solid #383058;
        color: #9d96b3;
        font-size: 11px;
        font-weight: 700;
        padding: 5px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .amv-rack-toggle-btn.active {
        background: #16f4d4;
        color: #0c0b16;
        border-color: #16f4d4;
        box-shadow: 0 0 10px rgba(22, 244, 212, 0.35);
      }
      .amv-rack-led {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #5d5675;
        transition: all 0.15s ease;
      }
      .amv-rack-toggle-btn.active .amv-rack-led {
        background: #0c0b16;
        box-shadow: 0 0 4px #0c0b16;
      }
      .amv-rack-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .amv-rack-title {
        font-size: 13.5px;
        font-weight: 700;
        color: #f3effa;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .amv-rack-desc {
        font-size: 11px;
        color: #9d96b3;
      }
      .amv-rack-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px 16px;
        background: #100d1e;
        border: 1px solid #231c3b;
        border-radius: 8px;
        padding: 12px 14px;
      }
      @media (max-width: 680px) {
        .amv-rack-grid { grid-template-columns: 1fr; }
      }
      .amv-rack-slider-block {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .amv-rack-slider-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 11px;
      }
      .amv-rack-slider-label {
        color: #a59abb;
        font-weight: 600;
      }
      .amv-rack-slider-val {
        font-family: var(--mono, monospace);
        font-size: 11px;
        font-weight: 700;
        color: #16f4d4;
      }
      .amv-band-group {
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 3px;
      }
      .amv-band-btn {
        flex: 1;
        background: #1c1733;
        border: 1px solid #2e284a;
        color: #9d96b3;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 6px;
        border-radius: 4px;
        cursor: pointer;
        text-align: center;
        transition: all 0.12s ease;
      }
      .amv-band-btn:hover {
        color: #f3effa;
        border-color: #3d3560;
      }
      .amv-band-btn.active {
        background: rgba(22, 244, 212, 0.18);
        border-color: #16f4d4;
        color: #16f4d4;
        font-weight: 700;
      }
      .amv-rack-params-accordion {
        border-top: 1px solid #231c3b;
        padding-top: 10px;
        margin-top: 4px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .amv-rack-param-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .amv-rack-param-label {
        font-size: 10.5px;
        color: #9d96b3;
      }
      .amv-rack-param-row input[type="range"] {
        flex: 1;
        height: 4px;
        accent-color: #16f4d4;
        cursor: pointer;
      }
      .amv-rack-param-row select {
        background: #1c182e;
        border: 1px solid #2e284a;
        color: #16f4d4;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .tabpane .amv-rack-grid {
        grid-template-columns: 1fr !important;
      }
      .tabpane .amv-band-group {
        flex-wrap: wrap !important;
      }
      .tabpane .amv-band-btn {
        flex: 1 1 45% !important;
        font-size: 9.5px !important;
        padding: 4px 4px !important;
      }
      .tabpane .amv-rack-header-toolbar {
        padding: 10px 12px;
      }
      .tabpane .amv-rack-card {
        padding: 12px;
      }
    `;
    (document.head || document.documentElement || document.body).appendChild(style);
  }

  // ---------------------------------------------------------------- DOM Creation
  function buildModal() {
    if (modalEl) return;
    ensureStyles();

    modalEl = document.createElement('div');
    modalEl.className = 'amv-modal-overlay';
    modalEl.id = 'amvAssetModal';

    modalEl.innerHTML = `
      <div class="amv-modal-window" role="dialog" aria-modal="true" aria-label="Thư viện Asset Chuyển động AMV">
        <div class="amv-modal-header">
          <div class="amv-modal-title">
            <h3><span>🪄</span> Thư Viện Asset Chuyển Động AMV (6 Danh Mục / 42 Presets)</h3>
            <span class="amv-modal-subtitle">Trục tâm cố định (W/2, H/2), chống lệch vị trí, chống vỡ tỷ lệ zoom, lặp tuần hoàn mượt mà.</span>
          </div>
          <div class="amv-modal-actions">
            <div id="amvActiveThemeSwatch" class="amv-theme-swatch-badge" title="Chủ đề đồng bộ hoạt động" style="width:18px;height:18px;border-radius:50%;margin-right:6px;border:1.5px solid rgba(255,255,255,0.4);background:linear-gradient(135deg, #ff66aa, #66ffff);box-shadow:0 0 8px rgba(255,102,170,0.4);cursor:default;"></div>
            <button id="amvBtnSyncThemeOnce" type="button" class="amv-btn-icon" title="Đồng bộ 1 lần màu Theme vào tất cả hiệu ứng AMV (Khóa màu tĩnh, không giật theo cảnh)" style="width:auto;padding:0 10px;font-size:11px;gap:4px;color:#16f4d4;border-color:rgba(22,244,212,0.4);">
              <span>⚡</span> Đồng Bộ 1 Click
            </button>
            <button id="amvBtnRandomize" type="button" class="amv-btn-icon" title="Ngẫu nhiên chọn preset cho các danh mục chưa khóa" style="width:auto;padding:0 10px;font-size:11px;gap:4px;">
              <span>🎲</span> Ngẫu Nhiên
            </button>
            <button id="amvBtnClearAll" type="button" class="amv-btn-icon" title="Tắt tất cả hiệu ứng AMV đang áp dụng" style="width:auto;padding:0 10px;font-size:11px;gap:4px;">
              <span>✕</span> Tắt Tất Cả
            </button>
            <button id="amvBtnClose" type="button" class="amv-btn-icon" title="Đóng bảng (Esc)" style="width:32px;">
              ✕
            </button>
          </div>
        </div>
        <div class="amv-modal-body">
          <div class="amv-category-sidebar" id="amvCategoryList">
            <!-- 6 Categories -->
          </div>
          <div class="amv-presets-container" id="amvPresetsView">
            <!-- Active Presets Grid -->
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    modalEl.querySelector('#amvBtnClose').addEventListener('click', closeModal);
    modalEl.querySelector('#amvBtnClearAll').addEventListener('click', clearAllActiveAssets);
    modalEl.querySelector('#amvBtnRandomize').addEventListener('click', randomizeActiveAssets);
    const btnSyncOnce = modalEl.querySelector('#amvBtnSyncThemeOnce');
    if (btnSyncOnce) btnSyncOnce.addEventListener('click', syncAllActiveAssetsToTheme);
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.isOpen) {
        closeModal();
      }
    });

    renderCategoriesList();
    renderPresetsForCategory(state.selectedCategory);
  }

  function renderCategoriesList() {
    const list = modalEl ? modalEl.querySelector('#amvCategoryList') : null;
    if (!list) return;

    list.innerHTML = '';
    CATEGORY_META.forEach(cat => {
      const isSelected = state.selectedCategory === cat.id;
      const isLocked = state.lockedCategories[cat.id] || false;
      const activeId = (cat.id === 'Phản ứng âm thanh') ? resolveActiveAudioVisualizerId() : state.activeAssets[cat.id];
      const activePostCount = (cat.id === 'Bộ lọc hậu kỳ')
        ? Object.values(state.postFilters).filter(f => f && f.enabled).length
        : 0;

      const item = document.createElement('div');
      item.className = `amv-category-item ${isSelected ? 'active' : ''}`;
      item.dataset.cat = cat.id;

      item.innerHTML = `
        <div class="amv-cat-left">
          <span class="amv-cat-chevron">▸</span>
          <span>${cat.id}</span>
          ${cat.id === 'Bộ lọc hậu kỳ' && activePostCount > 0
            ? `<span style="font-size:9.5px;font-weight:800;background:#16f4d4;color:#0d0b16;padding:1px 6px;border-radius:10px;margin-left:2px;">${activePostCount} Bật</span>`
            : (activeId ? `<span style="width:6px;height:6px;border-radius:50%;background:#16f4d4;display:inline-block;" title="Đang có hiệu ứng kích hoạt"></span>` : '')}
        </div>
        <div class="amv-cat-right">
          <span class="amv-cat-count">${cat.count}</span>
          <button type="button" class="amv-cat-lock" aria-pressed="${isLocked ? 'true' : 'false'}" title="${isLocked ? 'Đã khóa khỏi Randomizer' : 'Nhấp để khóa khỏi Randomizer'}">
            🔒
          </button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.amv-cat-lock')) {
          e.stopPropagation();
          state.lockedCategories[cat.id] = !state.lockedCategories[cat.id];
          renderCategoriesList();
          return;
        }
        state.selectedCategory = cat.id;
        renderCategoriesList();
        renderPresetsForCategory(cat.id);
      });

      list.appendChild(item);
    });
  }

  // ------------------------------------------------------------- Vizzy-Style Multi-Filter Rack UI
  function renderPostProcessingRack(container) {
    const lib = getLibrary();
    if (!lib) {
      container.innerHTML = `<div style="padding:16px;color:#a59abb;font-size:12px;">Đang tải 18 bộ lọc AMV...</div>`;
      setTimeout(() => { if (container) renderPostProcessingRack(container); }, 80);
      return;
    }

    ensurePostFiltersInit();
    const filters = lib.postProcessingFilters || [];
    const activeCount = Object.values(state.postFilters).filter(f => f && f.enabled).length;

    let html = `
      <div class="amv-rack-container">
        <div class="amv-rack-header-toolbar">
          <div class="amv-rack-title-row">
            <div>
              <strong style="color:#f3effa;font-size:14px;display:flex;align-items:center;gap:6px;">
                <span>🎛️</span> Bộ Lọc Hậu Kỳ Đa Lớp (pmndrs/postprocessing Rack)
              </strong>
              <div style="font-size:11px;color:#9d96b3;margin-top:2px;">
                Kích hoạt nhiều filter cùng lúc full khung hình. Tùy chỉnh cường độ và phản ứng động theo nhạc (Bass, Kick, Energy, Beat) như Vizzy.
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span id="amvRackActiveBadge" style="font-family:var(--mono);font-size:11px;color:#16f4d4;background:rgba(22,244,212,0.12);padding:4px 9px;border-radius:5px;border:1px solid rgba(22,244,212,0.3);font-weight:700;">
                ⚡ ${activeCount} / ${filters.length} Filter Đang Bật
              </span>
              <button type="button" id="amvRackDisableAll" class="amv-rack-preset-btn" style="border-color:#ff5a6a;color:#ff5a6a;">
                ✕ Tắt Hết
              </button>
            </div>
          </div>
          <div class="amv-rack-presets-row">
            <span style="font-size:10.5px;color:#9d96b3;font-weight:600;">Bộ phối nhanh (Quick Stacks):</span>
            <button type="button" class="amv-rack-preset-btn" data-preset="sakuga" style="border-color:#16f4d4;color:#16f4d4;font-weight:700;">⚡ Sakuga Climax</button>
            <button type="button" class="amv-rack-preset-btn" data-preset="master35mm" style="border-color:#f59e0b;color:#fbbf24;font-weight:700;">🎞️ 35mm Master Film</button>
            <button type="button" class="amv-rack-preset-btn" data-preset="anime">🌸 Anime Warm Glow</button>
            <button type="button" class="amv-rack-preset-btn" data-preset="cyber">🏙️ Cyberpunk Drop</button>
            <button type="button" class="amv-rack-preset-btn" data-preset="lofi">📼 Lo-Fi CRT Tape</button>
            <button type="button" class="amv-rack-preset-btn" data-preset="bass">💥 Bass Drop Impact</button>
          </div>
        </div>

        <div class="amv-rack-list" id="amvRackList" style="display:flex;flex-direction:column;gap:12px;"></div>
      </div>
    `;

    container.innerHTML = html;

    function syncSiblingRack() {
      const modalView = modalEl ? modalEl.querySelector('#amvPresetsView') : null;
      const sideContainer = document.getElementById('sideTabRackContainer');
      const other = (container === sideContainer) ? modalView : sideContainer;
      if (other && (other === sideContainer || (state.isOpen && state.selectedCategory === 'Bộ lọc hậu kỳ'))) {
        renderPostProcessingRack(other);
      }
      renderCategoriesList();
    }

    // Attach Quick Stacks listeners
    container.querySelectorAll('.amv-rack-preset-btn[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        applyQuickStackPreset(btn.dataset.preset);
        renderPostProcessingRack(container);
        syncSiblingRack();
        triggerMainRedraw();
      });
    });

    container.querySelector('#amvRackDisableAll').addEventListener('click', () => {
      filters.forEach(f => {
        if (state.postFilters[f.id]) state.postFilters[f.id].enabled = false;
      });
      persistState();
      renderPostProcessingRack(container);
      syncSiblingRack();
      triggerMainRedraw();
    });

    const rackList = container.querySelector('#amvRackList');

    filters.forEach(f => {
      const cfg = state.postFilters[f.id] || {
        enabled: false,
        intensity: 1.0,
        audioReactivity: typeof f.defaultAudioReactivity === 'number' ? f.defaultAudioReactivity : 0.8,
        audioBand: f.defaultAudioBand || 'energy',
        params: Object.assign({}, f.defaultParams)
      };

      const card = document.createElement('div');
      card.className = `amv-rack-card ${cfg.enabled ? 'is-active' : ''}`;
      card.id = `rack_card_${f.id}`;

      let paramsRowsHtml = '';
      for (const [key, field] of Object.entries(f.schema || {})) {
        const curVal = (cfg.params && cfg.params[key] !== undefined) ? cfg.params[key] : f.defaultParams[key];
        if (field.options) {
          paramsRowsHtml += `
            <div class="amv-rack-param-row">
              <span class="amv-rack-param-label">${field.label}:</span>
              <select data-param="${key}">
                ${field.options.map(opt => `<option value="${opt}" ${opt === curVal ? 'selected' : ''}>${opt.toUpperCase()}</option>`).join('')}
              </select>
            </div>
          `;
        } else if (field.type === 'color') {
          paramsRowsHtml += `
            <div class="amv-rack-param-row">
              <span class="amv-rack-param-label">${field.label}:</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <input type="color" data-param="${key}" value="${curVal || '#ffffff'}" style="width:26px;height:24px;border:1px solid #332b50;border-radius:3px;cursor:pointer;background:transparent;padding:0;">
                <button type="button" class="amv-btn-row-theme amv-rack-btn-theme" data-filter="${f.id}" data-param="${key}" title="Áp dụng màu từ Chủ Đề dự án">🎨 Chủ đề</button>
              </div>
            </div>
          `;
        } else {
          const step = field.step || 0.1;
          const displayVal = (typeof curVal === 'number') ? curVal.toFixed(step < 0.1 ? 2 : 1) : curVal;
          paramsRowsHtml += `
            <div class="amv-rack-param-row">
              <span class="amv-rack-param-label">${field.label}:</span>
              <input type="range" data-param="${key}" min="${field.min}" max="${field.max}" step="${step}" value="${curVal}">
              <span class="amv-param-val" id="val_${f.id}_${key}">${displayVal}${field.unit || ''}</span>
            </div>
          `;
        }
      }

      card.innerHTML = `
        <div class="amv-rack-card-top">
          <div style="display:flex;align-items:center;gap:10px;">
            <button type="button" class="amv-rack-toggle-btn ${cfg.enabled ? 'active' : ''}" id="toggle_${f.id}">
              <span class="amv-rack-led"></span>
              <span class="amv-rack-toggle-text">${cfg.enabled ? '✓ ĐANG BẬT' : '○ TẮT'}</span>
            </button>
            <div class="amv-rack-info">
              <div class="amv-rack-title">
                <span>${f.icon}</span>
                <span>${f.name}</span>
              </div>
              <div class="amv-rack-desc">${f.desc}</div>
            </div>
          </div>
          <button type="button" class="amv-rack-preset-btn btn-reset-filter" title="Khôi phục thông số mặc định của filter này">
            ↺ Đặt lại
          </button>
        </div>

        <div class="amv-rack-grid">
          <!-- Slider 1: Cường độ cơ bản -->
          <div class="amv-rack-slider-block">
            <div class="amv-rack-slider-header">
              <span class="amv-rack-slider-label">🎚️ Cường độ cơ bản (Intensity):</span>
              <span class="amv-rack-slider-val" id="lbl_int_${f.id}">${Math.round((cfg.intensity ?? 1.0) * 100)}%</span>
            </div>
            <input type="range" class="slider-intensity" min="0" max="1.5" step="0.05" value="${cfg.intensity ?? 1.0}">
          </div>

          <!-- Slider 2: Phản ứng theo nhạc -->
          <div class="amv-rack-slider-block">
            <div class="amv-rack-slider-header">
              <span class="amv-rack-slider-label">⚡ Phản ứng theo nhạc (Audio Reactivity):</span>
              <span class="amv-rack-slider-val" id="lbl_react_${f.id}">${Math.round((cfg.audioReactivity ?? 0.8) * 100)}%</span>
            </div>
            <input type="range" class="slider-reactivity" min="0" max="2.0" step="0.1" value="${cfg.audioReactivity ?? 0.8}">
          </div>

          <!-- Selector 3: Dải âm kích hoạt -->
          <div class="amv-rack-slider-block" style="grid-column: 1 / -1;">
            <div class="amv-rack-slider-header">
              <span class="amv-rack-slider-label">🎵 Dải âm kích hoạt (Audio Band):</span>
              <span style="font-size:10px;color:#9d96b3;">Chọn dải âm thanh điều khiển filter</span>
            </div>
            <div class="amv-band-group">
              <button type="button" class="amv-band-btn ${cfg.audioBand === 'energy' ? 'active' : ''}" data-band="energy">⚡ Toàn Dải (Energy)</button>
              <button type="button" class="amv-band-btn ${cfg.audioBand === 'bass' ? 'active' : ''}" data-band="bass">🥁 Bass Trầm</button>
              <button type="button" class="amv-band-btn ${cfg.audioBand === 'kick' ? 'active' : ''}" data-band="kick">💥 Nhịp Kick</button>
              <button type="button" class="amv-band-btn ${(cfg.audioBand === 'beatPulse' || cfg.audioBand === 'beat') ? 'active' : ''}" data-band="beatPulse">🎵 Xung Beat</button>
            </div>
          </div>
        </div>

        <!-- Section 4: Tùy biến thông số chuyên sâu -->
        <div class="amv-rack-params-accordion">
          <div style="font-size:10px;font-weight:700;color:#6c6382;text-transform:uppercase;letter-spacing:0.04em;">⚙️ Thông số chuyên sâu:</div>
          ${paramsRowsHtml}
        </div>
      `;

      // Event listener: Toggle
      const toggleBtn = card.querySelector(`#toggle_${f.id}`);
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cfg.enabled = !cfg.enabled;
        card.classList.toggle('is-active', cfg.enabled);
        toggleBtn.classList.toggle('active', cfg.enabled);
        toggleBtn.querySelector('.amv-rack-toggle-text').textContent = cfg.enabled ? '✓ ĐANG BẬT' : '○ TẮT';
        persistState();
        renderCategoriesList();
        updateRackActiveCount();
        syncSiblingRack();
        triggerMainRedraw();
      });

      // Event listener: Intensity slider
      const intSlider = card.querySelector('.slider-intensity');
      const intVal = card.querySelector(`#lbl_int_${f.id}`);
      intSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        cfg.intensity = v;
        intVal.textContent = Math.round(v * 100) + '%';
        persistState();
        triggerMainRedraw();
      });

      // Event listener: Reactivity slider
      const reactSlider = card.querySelector('.slider-reactivity');
      const reactVal = card.querySelector(`#lbl_react_${f.id}`);
      reactSlider.addEventListener('input', (e) => {
        const v = parseFloat(e.target.value);
        cfg.audioReactivity = v;
        reactVal.textContent = Math.round(v * 100) + '%';
        persistState();
        triggerMainRedraw();
      });

      // Event listener: Audio Band buttons
      card.querySelectorAll('.amv-band-btn').forEach(bBtn => {
        bBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          card.querySelectorAll('.amv-band-btn').forEach(b => b.classList.remove('active'));
          bBtn.classList.add('active');
          cfg.audioBand = bBtn.dataset.band;
          persistState();
          triggerMainRedraw();
        });
      });

      // Event listener: Custom Parameters
      card.querySelectorAll('[data-param]').forEach(input => {
        const paramKey = input.dataset.param;
        const schemaField = f.schema && f.schema[paramKey];
        input.addEventListener('input', (e) => {
          let val = e.target.value;
          if (input.type === 'range') {
            val = parseFloat(val);
            const valSpan = card.querySelector(`#val_${f.id}_${paramKey}`);
            if (valSpan) valSpan.textContent = val.toFixed((schemaField && schemaField.step < 0.1) ? 2 : 1) + ((schemaField && schemaField.unit) || '');
          }
          if (!cfg.params) cfg.params = {};
          cfg.params[paramKey] = val;
          persistState();
          triggerMainRedraw();
        });
      });

      // Event listener: Rack Color Theme Button
      card.querySelectorAll('.amv-rack-btn-theme').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const pKey = btn.dataset.param;
          const sc = getCurrentProjectScheme();
          const targetColor = mapParamToSchemeColor(pKey, sc);
          const colorInput = card.querySelector(`input[type="color"][data-param="${pKey}"]`);
          if (colorInput) colorInput.value = targetColor;
          if (!cfg.params) cfg.params = {};
          cfg.params[pKey] = targetColor;
          persistState();
          triggerMainRedraw();
          if (window.toast) window.toast(`🎨 Đã gán màu filter "${pKey}" = ${targetColor} từ chủ đề (${sc.name || 'Dự án'})`);
        });
      });

      // Event listener: Reset
      const resetBtn = card.querySelector('.btn-reset-filter');
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cfg.intensity = 1.0;
        cfg.audioReactivity = typeof f.defaultAudioReactivity === 'number' ? f.defaultAudioReactivity : 0.8;
        cfg.audioBand = f.defaultAudioBand || 'energy';
        cfg.params = Object.assign({}, f.defaultParams);
        persistState();
        renderPostProcessingRack(container);
        syncSiblingRack();
        triggerMainRedraw();
      });

      rackList.appendChild(card);
    });

    function updateRackActiveCount() {
      const b = container.querySelector('#amvRackActiveBadge');
      if (b) {
        const cnt = Object.values(state.postFilters).filter(f => f && f.enabled).length;
        b.textContent = `⚡ ${cnt} / ${filters.length} Filter Đang Bật`;
      }
    }
  }

  function applyQuickStackPreset(presetName) {
    ensurePostFiltersInit();
    for (const k in state.postFilters) {
      if (state.postFilters[k]) state.postFilters[k].enabled = false;
    }

    if (presetName === 'anime') {
      if (state.postFilters['post_bloom']) {
        state.postFilters['post_bloom'].enabled = true;
        state.postFilters['post_bloom'].intensity = 0.95;
        state.postFilters['post_bloom'].audioReactivity = 0.7;
        state.postFilters['post_bloom'].audioBand = 'energy';
        state.postFilters['post_bloom'].params = { threshold: 0.5, radius: 1.8, tint: '#fff0f5' };
      }
      if (state.postFilters['post_vignette']) {
        state.postFilters['post_vignette'].enabled = true;
        state.postFilters['post_vignette'].intensity = 0.55;
        state.postFilters['post_vignette'].audioReactivity = 0.35;
        state.postFilters['post_vignette'].audioBand = 'energy';
        state.postFilters['post_vignette'].params = { radius: 0.6, smoothness: 0.5, color: '#1a0520' };
      }
      if (state.postFilters['post_color_grade']) {
        state.postFilters['post_color_grade'].enabled = true;
        state.postFilters['post_color_grade'].intensity = 0.9;
        state.postFilters['post_color_grade'].audioReactivity = 0.45;
        state.postFilters['post_color_grade'].audioBand = 'energy';
        state.postFilters['post_color_grade'].params = { preset: 'anime_warm', contrast: 1.12, saturation: 1.25, brightness: 1.05 };
      }
    } else if (presetName === 'cyber') {
      if (state.postFilters['post_bloom']) {
        state.postFilters['post_bloom'].enabled = true;
        state.postFilters['post_bloom'].intensity = 1.1;
        state.postFilters['post_bloom'].audioReactivity = 1.0;
        state.postFilters['post_bloom'].audioBand = 'kick';
        state.postFilters['post_bloom'].params = { threshold: 0.45, radius: 2.0, tint: '#ff00aa' };
      }
      if (state.postFilters['post_chromatic']) {
        state.postFilters['post_chromatic'].enabled = true;
        state.postFilters['post_chromatic'].intensity = 1.0;
        state.postFilters['post_chromatic'].audioReactivity = 1.4;
        state.postFilters['post_chromatic'].audioBand = 'kick';
        state.postFilters['post_chromatic'].params = { offset: 12, angle: 15, radial: 0.5 };
      }
      if (state.postFilters['post_glitch']) {
        state.postFilters['post_glitch'].enabled = true;
        state.postFilters['post_glitch'].intensity = 0.85;
        state.postFilters['post_glitch'].audioReactivity = 1.4;
        state.postFilters['post_glitch'].audioBand = 'bass';
        state.postFilters['post_glitch'].params = { slices: 10, jitter: 20, speed: 1.5 };
      }
      if (state.postFilters['post_color_grade']) {
        state.postFilters['post_color_grade'].enabled = true;
        state.postFilters['post_color_grade'].intensity = 0.95;
        state.postFilters['post_color_grade'].audioReactivity = 0.5;
        state.postFilters['post_color_grade'].audioBand = 'energy';
        state.postFilters['post_color_grade'].params = { preset: 'cyberpunk', contrast: 1.25, saturation: 1.45, brightness: 1.0 };
      }
    } else if (presetName === 'lofi') {
      if (state.postFilters['post_crt']) {
        state.postFilters['post_crt'].enabled = true;
        state.postFilters['post_crt'].intensity = 0.65;
        state.postFilters['post_crt'].audioReactivity = 0.4;
        state.postFilters['post_crt'].audioBand = 'energy';
        state.postFilters['post_crt'].params = { lineSpacing: 3, curvature: 0.15, beamSpeed: 1.0 };
      }
      if (state.postFilters['post_grain']) {
        state.postFilters['post_grain'].enabled = true;
        state.postFilters['post_grain'].intensity = 0.45;
        state.postFilters['post_grain'].audioReactivity = 0.3;
        state.postFilters['post_grain'].audioBand = 'energy';
        state.postFilters['post_grain'].params = { size: 1.8, roughness: 0.45, colored: 0 };
      }
      if (state.postFilters['post_vignette']) {
        state.postFilters['post_vignette'].enabled = true;
        state.postFilters['post_vignette'].intensity = 0.7;
        state.postFilters['post_vignette'].audioReactivity = 0.3;
        state.postFilters['post_vignette'].audioBand = 'energy';
        state.postFilters['post_vignette'].params = { radius: 0.5, smoothness: 0.4, color: '#000000' };
      }
      if (state.postFilters['post_heatwave']) {
        state.postFilters['post_heatwave'].enabled = true;
        state.postFilters['post_heatwave'].intensity = 0.4;
        state.postFilters['post_heatwave'].audioReactivity = 0.6;
        state.postFilters['post_heatwave'].audioBand = 'bass';
        state.postFilters['post_heatwave'].params = { speed: 1.0, frequency: 16, amplitude: 6 };
      }
    } else if (presetName === 'bass') {
      if (state.postFilters['post_chromatic']) {
        state.postFilters['post_chromatic'].enabled = true;
        state.postFilters['post_chromatic'].intensity = 1.2;
        state.postFilters['post_chromatic'].audioReactivity = 1.8;
        state.postFilters['post_chromatic'].audioBand = 'kick';
        state.postFilters['post_chromatic'].params = { offset: 16, angle: 0, radial: 0.6 };
      }
      if (state.postFilters['post_glitch']) {
        state.postFilters['post_glitch'].enabled = true;
        state.postFilters['post_glitch'].intensity = 1.0;
        state.postFilters['post_glitch'].audioReactivity = 1.6;
        state.postFilters['post_glitch'].audioBand = 'bass';
        state.postFilters['post_glitch'].params = { slices: 12, jitter: 28, speed: 2.0 };
      }
      if (state.postFilters['post_radial_blur']) {
        state.postFilters['post_radial_blur'].enabled = true;
        state.postFilters['post_radial_blur'].intensity = 1.1;
        state.postFilters['post_radial_blur'].audioReactivity = 1.8;
        state.postFilters['post_radial_blur'].audioBand = 'beatPulse';
        state.postFilters['post_radial_blur'].params = { samples: 8, radius: 0.045, centerX: 0.5, centerY: 0.5 };
      }
      if (state.postFilters['post_bloom']) {
        state.postFilters['post_bloom'].enabled = true;
        state.postFilters['post_bloom'].intensity = 1.0;
        state.postFilters['post_bloom'].audioReactivity = 1.2;
        state.postFilters['post_bloom'].audioBand = 'kick';
        state.postFilters['post_bloom'].params = { threshold: 0.4, radius: 2.2, tint: '#ffffff' };
      }
    } else if (presetName === 'sakuga') {
      if (state.postFilters['post_negative_flash']) {
        state.postFilters['post_negative_flash'].enabled = true;
        state.postFilters['post_negative_flash'].intensity = 1.0;
        state.postFilters['post_negative_flash'].audioReactivity = 2.0;
        state.postFilters['post_negative_flash'].audioBand = 'kick';
        state.postFilters['post_negative_flash'].params = { threshold: 0.45, mode: 'solarize', tint: '#16f4d4' };
      }
      if (state.postFilters['post_shockwave_lens']) {
        state.postFilters['post_shockwave_lens'].enabled = true;
        state.postFilters['post_shockwave_lens'].intensity = 1.1;
        state.postFilters['post_shockwave_lens'].audioReactivity = 1.8;
        state.postFilters['post_shockwave_lens'].audioBand = 'kick';
        state.postFilters['post_shockwave_lens'].params = { wavelength: 0.18, refraction: 26, speed: 1.4, chroma: 0.8 };
      }
      if (state.postFilters['post_anamorphic_streak']) {
        state.postFilters['post_anamorphic_streak'].enabled = true;
        state.postFilters['post_anamorphic_streak'].intensity = 1.15;
        state.postFilters['post_anamorphic_streak'].audioReactivity = 1.5;
        state.postFilters['post_anamorphic_streak'].audioBand = 'kick';
        state.postFilters['post_anamorphic_streak'].params = { length: 1.5, threshold: 0.58, streakColor: '#38bdf8', angle: 0 };
      }
      if (state.postFilters['post_chromatic']) {
        state.postFilters['post_chromatic'].enabled = true;
        state.postFilters['post_chromatic'].intensity = 1.0;
        state.postFilters['post_chromatic'].audioReactivity = 1.5;
        state.postFilters['post_chromatic'].audioBand = 'kick';
        state.postFilters['post_chromatic'].params = { offset: 14, angle: 15, radial: 0.6 };
      }
      if (state.postFilters['post_motion_smear']) {
        state.postFilters['post_motion_smear'].enabled = true;
        state.postFilters['post_motion_smear'].intensity = 0.75;
        state.postFilters['post_motion_smear'].audioReactivity = 1.4;
        state.postFilters['post_motion_smear'].audioBand = 'bass';
        state.postFilters['post_motion_smear'].params = { distance: 30, angle: 0, samples: 8 };
      }
    } else if (presetName === 'master35mm') {
      if (state.postFilters['post_halation']) {
        state.postFilters['post_halation'].enabled = true;
        state.postFilters['post_halation'].intensity = 1.0;
        state.postFilters['post_halation'].audioReactivity = 1.0;
        state.postFilters['post_halation'].audioBand = 'energy';
        state.postFilters['post_halation'].params = { radius: 8, threshold: 0.55, tint: '#ff2222' };
      }
      if (state.postFilters['post_anamorphic_streak']) {
        state.postFilters['post_anamorphic_streak'].enabled = true;
        state.postFilters['post_anamorphic_streak'].intensity = 0.9;
        state.postFilters['post_anamorphic_streak'].audioReactivity = 1.1;
        state.postFilters['post_anamorphic_streak'].audioBand = 'kick';
        state.postFilters['post_anamorphic_streak'].params = { length: 1.2, threshold: 0.68, streakColor: '#60a5fa', angle: 0 };
      }
      if (state.postFilters['post_grain']) {
        state.postFilters['post_grain'].enabled = true;
        state.postFilters['post_grain'].intensity = 0.55;
        state.postFilters['post_grain'].audioReactivity = 0.35;
        state.postFilters['post_grain'].audioBand = 'energy';
        state.postFilters['post_grain'].params = { size: 1.6, roughness: 0.45, colored: 1 };
      }
      if (state.postFilters['post_vignette']) {
        state.postFilters['post_vignette'].enabled = true;
        state.postFilters['post_vignette'].intensity = 0.65;
        state.postFilters['post_vignette'].audioReactivity = 0.35;
        state.postFilters['post_vignette'].audioBand = 'energy';
        state.postFilters['post_vignette'].params = { radius: 0.58, smoothness: 0.45, color: '#000000' };
      }
      if (state.postFilters['post_color_grade']) {
        state.postFilters['post_color_grade'].enabled = true;
        state.postFilters['post_color_grade'].intensity = 0.9;
        state.postFilters['post_color_grade'].audioReactivity = 0.4;
        state.postFilters['post_color_grade'].audioBand = 'energy';
        state.postFilters['post_color_grade'].params = { preset: 'teal_orange', contrast: 1.15, saturation: 1.25, brightness: 1.0 };
      }
    }

    persistState();
  }

  function renderPresetsForCategory(catId) {
    const container = modalEl ? modalEl.querySelector('#amvPresetsView') : null;
    if (!container) return;

    const lib = getLibrary();
    if (!lib) {
      container.innerHTML = `<div style="padding:20px;color:#ff5a6a;">Thư viện AMVAssets chưa sẵn sàng. Vui lòng thử lại.</div>`;
      return;
    }

    if (catId === 'Bộ lọc hậu kỳ') {
      renderPostProcessingRack(container);
      return;
    }

    const catMeta = CATEGORY_META.find(c => c.id === catId) || { id: catId, desc: '' };
    const presets = lib.byCategory(catId) || [];
    previewCanvasMap.clear(); // Free previous category canvas handles

    let html = `
      <div class="amv-category-header-banner">
        <div>
          <strong style="color:#f3effa;font-size:14px;">${catMeta.icon || '✨'} Danh mục: ${catId}</strong>
          <div style="font-size:11px;color:#9d96b3;margin-top:2px;">${catMeta.desc}</div>
        </div>
        <span style="font-family:var(--mono);font-size:11px;color:#16f4d4;background:rgba(22,244,212,0.1);padding:3px 8px;border-radius:4px;border:1px solid rgba(22,244,212,0.3);">
          ${presets.length} Presets có sẵn
        </span>
      </div>
      ${catId === 'Phản ứng âm thanh' ? (() => {
        const activeVizId = resolveActiveAudioVisualizerId();
        const activeVizPreset = activeVizId && lib ? lib.get(activeVizId) : null;
        const isVizActive = Boolean(activeVizId);
        const vizDisplayName = activeVizPreset ? activeVizPreset.name : (activeVizId || '');
        return `
        <div class="amv-audio-viz-hero" style="background:linear-gradient(135deg, rgba(28,20,44,0.95), rgba(16,12,28,0.98));border:1.5px solid rgba(192,132,252,0.35);border-radius:10px;padding:14px;margin-bottom:14px;box-shadow:0 6px 24px rgba(0,0,0,0.45);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-size:28px;">${isVizActive ? '⚡' : '💤'}</span>
              <div>
                <div style="font-size:13.5px;font-weight:700;color:#fff;display:flex;align-items:center;gap:8px;">
                  <span>Sóng Nhạc Audio Visualizer Studio 4K</span>
                  <span style="font-size:10.5px;padding:2px 8px;border-radius:12px;font-weight:700;${isVizActive ? 'background:rgba(22,244,212,0.18);color:#16f4d4;border:1px solid rgba(22,244,212,0.4);' : 'background:rgba(255,90,106,0.18);color:#ff5a6a;border:1px solid rgba(255,90,106,0.4);'}">
                    ${isVizActive ? '✓ ĐANG BẬT: ' + vizDisplayName : '❌ ĐANG TẮT'}
                  </span>
                </div>
                <div style="font-size:11px;color:#a59abb;margin-top:2px;">
                  ${isVizActive ? 'Sóng nhạc đang chuyển động trực tiếp theo Bass & Kick trên màn hình và video xuất.' : 'Sóng nhạc đang được tắt hoàn toàn, không hiển thị trên video.'}
                </div>
              </div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              ${isVizActive ? `
                <button id="btnAmvVizTurnOff" type="button" style="background:linear-gradient(135deg, #ef4444, #dc2626);color:#fff;font-weight:700;font-size:12px;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 0 14px rgba(239,68,68,0.45);transition:all 0.2s;" title="Nhấn để TẮT hoàn toàn sóng nhạc visualizer">
                  <span>❌</span> TẮT SÓNG NHẠC (OFF)
                </button>
              ` : `
                <button id="btnAmvVizQuickOn" type="button" style="background:linear-gradient(135deg, #06b6d4, #0891b2);color:#fff;font-weight:700;font-size:12px;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 0 14px rgba(6,182,212,0.45);transition:all 0.2s;" title="Nhấn để bật ngay Trap Nation Pro">
                  <span>⚡</span> BẬT SÓNG NHẠC (ON)
                </button>
              `}
            </div>
          </div>
        </div>
        `;
      })() : ''}
      ${catId === 'Camera' ? `
        <div class="amv-cam-control-panel" style="background:rgba(20,16,36,0.85);border:1px solid rgba(192,132,252,0.3);border-radius:8px;padding:12px;margin-bottom:14px;box-shadow:0 4px 16px rgba(0,0,0,0.4);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong style="color:#c084fc;font-size:12.5px;display:flex;align-items:center;gap:6px;">
              <span>🎥 Đồng Bộ Camera AMV & Hiệu Ứng Chiều Sâu</span>
            </strong>
            <span style="font-size:10px;color:#16f4d4;background:rgba(22,244,212,0.1);padding:2px 6px;border-radius:4px;border:1px solid rgba(22,244,212,0.25);">
              Auto Sync Active
            </span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
            <div>
              <label style="font-size:10.5px;color:#a59abb;display:block;margin-bottom:3px;font-weight:600;">🎯 Điểm neo Camera:</label>
              <select id="amvModalCamAnchor" style="width:100%;font-size:11px;padding:4px 6px;border-radius:4px;background:#0d0b16;color:#f3effa;border:1px solid #382d54;">
                <option value="auto" ${state.cameraConfig.anchor==='auto'?'selected':''}>🎯 Tự động thông minh</option>
                <option value="character" ${state.cameraConfig.anchor==='character'?'selected':''}>🧍 Khóa vào Nhân vật</option>
                <option value="lyric" ${state.cameraConfig.anchor==='lyric'?'selected':''}>📝 Khóa vào Chữ Lyric</option>
                <option value="center" ${state.cameraConfig.anchor==='center'?'selected':''}>🌐 Tâm màn hình</option>
              </select>
            </div>
            <div>
              <label style="font-size:10.5px;color:#a59abb;display:block;margin-bottom:3px;font-weight:600;">🌟 Phạm vi tác động:</label>
              <select id="amvModalCamTarget" style="width:100%;font-size:11px;padding:4px 6px;border-radius:4px;background:#0d0b16;color:#f3effa;border:1px solid #382d54;">
                <option value="all" ${state.cameraConfig.target==='all'?'selected':''}>🌟 Toàn cảnh (Lyric + NV)</option>
                <option value="lyric_priority" ${state.cameraConfig.target==='lyric_priority'?'selected':''}>📝 Ưu tiên giật nảy Lyric</option>
                <option value="char_only" ${state.cameraConfig.target==='char_only'?'selected':''}>🧍 Chỉ Nhân vật & Cảnh</option>
                <option value="lyric_only" ${state.cameraConfig.target==='lyric_only'?'selected':''}>📺 Chỉ Lyric</option>
              </select>
            </div>
          </div>
          <div style="margin-bottom:8px;">
            <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">
              <span style="color:#a59abb;">Lực chấn lên chữ Lyric:</span>
              <span id="amvModalLyricInfVal" style="color:#16f4d4;font-family:var(--mono);font-weight:700;">${state.cameraConfig.lyricInfluence}%</span>
            </div>
            <input id="amvModalLyricInf" type="range" min="0" max="150" step="5" value="${state.cameraConfig.lyricInfluence}" style="width:100%;">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;border-top:1px dashed #382d54;padding-top:6px;">
            <label style="font-size:10.5px;color:#f3effa;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input id="amvModalParallax3D" type="checkbox" ${state.cameraConfig.parallax3D!==false?'checked':''}>
              <span>🌌 3D Parallax Multi-Plane</span>
            </label>
            <label style="font-size:10.5px;color:#f3effa;display:flex;align-items:center;gap:5px;cursor:pointer;">
              <input id="amvModalBeatImpact" type="checkbox" ${state.cameraConfig.beatImpact!==false?'checked':''}>
              <span>🥁 Beat Impact Squash & Glitch</span>
            </label>
          </div>
        </div>
      ` : ''}
      <div class="amv-presets-grid" id="amvPresetsGrid"></div>
    `;
    container.innerHTML = html;

    if (catId === 'Camera') {
      const elAnchor = container.querySelector('#amvModalCamAnchor');
      const elTarget = container.querySelector('#amvModalCamTarget');
      const elInf = container.querySelector('#amvModalLyricInf');
      const elInfVal = container.querySelector('#amvModalLyricInfVal');
      const el3D = container.querySelector('#amvModalParallax3D');
      const elBeat = container.querySelector('#amvModalBeatImpact');

      if (elAnchor) elAnchor.addEventListener('change', (e) => {
        state.cameraConfig.anchor = e.target.value;
        persistState();
        triggerMainRedraw();
      });
      if (elTarget) elTarget.addEventListener('change', (e) => {
        state.cameraConfig.target = e.target.value;
        persistState();
        triggerMainRedraw();
      });
      if (elInf) elInf.addEventListener('input', (e) => {
        state.cameraConfig.lyricInfluence = parseInt(e.target.value, 10);
        if (elInfVal) elInfVal.textContent = state.cameraConfig.lyricInfluence + '%';
        persistState();
        triggerMainRedraw();
      });
      if (el3D) el3D.addEventListener('change', (e) => {
        state.cameraConfig.parallax3D = e.target.checked;
        persistState();
        triggerMainRedraw();
      });
      if (elBeat) elBeat.addEventListener('change', (e) => {
        state.cameraConfig.beatImpact = e.target.checked;
        persistState();
        triggerMainRedraw();
      });
    }
    if (catId === 'Phản ứng âm thanh') {
      const btnOff = container.querySelector('#btnAmvVizTurnOff');
      const btnOn = container.querySelector('#btnAmvVizQuickOn');
      if (btnOff) btnOff.onclick = () => {
        state.activeAssets['Phản ứng âm thanh'] = null;
        state.audioVisualizerOff = true;
        if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.disable === 'function') {
          window.AudioVisualizerAPI.disable();
        }
        persistState();
        renderCategoriesList();
        renderPresetsForCategory('Phản ứng âm thanh');
        updateStudioVisualizerBadge();
        triggerMainRedraw();
        if (window.toast) window.toast('📊 Đã TẮT Sóng Nhạc Visualizer');
      };
      if (btnOn) btnOn.onclick = () => {
        state.activeAssets['Phản ứng âm thanh'] = 'audio_trap_nation_pro';
        state.audioVisualizerOff = false;
        if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.enable === 'function') {
          window.AudioVisualizerAPI.enable('circle_trap');
        }
        persistState();
        renderCategoriesList();
        renderPresetsForCategory('Phản ứng âm thanh');
        updateStudioVisualizerBadge();
        triggerMainRedraw();
        if (window.toast) window.toast('📊 Đã BẬT Sóng Nhạc: Trap Nation Pro 4K');
      };
    }

    const grid = container.querySelector('#amvPresetsGrid');

    // Prepend Turn OFF card when viewing Audio Visualizers
    if (catId === 'Phản ứng âm thanh') {
      const isOff = !resolveActiveAudioVisualizerId();
      const offCard = document.createElement('div');
      offCard.className = `amv-preset-card amv-card-turn-off ${isOff ? 'is-active' : ''}`;
      offCard.style.cssText = `border:1.5px dashed ${isOff ? '#ff5a6a' : 'rgba(255,90,106,0.35)'};background:${isOff ? 'rgba(255,90,106,0.12)' : 'rgba(20,16,30,0.6)'};cursor:pointer;`;
      offCard.innerHTML = `
        <div class="amv-preset-canvas-wrap" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:180px;background:rgba(12,10,18,0.85);">
          <span style="font-size:42px;margin-bottom:6px;">❌</span>
          <strong style="color:#ff5a6a;font-size:13.5px;letter-spacing:0.5px;">TẮT SÓNG NHẠC (OFF)</strong>
          <span style="color:#9d96b3;font-size:11px;margin-top:4px;">Không sử dụng visualizer trên video</span>
          ${isOff ? `<span class="amv-active-pill" style="background:#ff5a6a;color:#fff;">✓ ĐANG TẮT</span>` : ''}
        </div>
        <div class="amv-preset-info">
          <div class="amv-preset-name" style="color:#ff5a6a;">❌ Tắt Sóng Nhạc (None)</div>
          <div class="amv-preset-id">none_visualizer</div>
          <div class="amv-preset-actions">
            <button type="button" class="amv-btn-apply ${isOff ? 'active-state' : ''}" style="${isOff ? 'background:#ff5a6a;border-color:#ff5a6a;color:#fff;' : 'border-color:#ff5a6a;color:#ff5a6a;'}" id="btnCardTurnOffViz">
              ${isOff ? '✓ Đang Tắt' : '❌ Tắt Ngay'}
            </button>
          </div>
        </div>
      `;
      offCard.addEventListener('click', () => {
        state.activeAssets['Phản ứng âm thanh'] = null;
        if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.disable === 'function') {
          window.AudioVisualizerAPI.disable();
        }
        persistState();
        renderCategoriesList();
        renderPresetsForCategory('Phản ứng âm thanh');
        updateStudioVisualizerBadge();
        triggerMainRedraw();
        if (window.toast) window.toast('📊 Đã TẮT Sóng Nhạc Visualizer');
      });
      grid.appendChild(offCard);
    }

    presets.forEach(p => {
      const activeResolved = (catId === 'Phản ứng âm thanh') ? resolveActiveAudioVisualizerId() : state.activeAssets[catId];
      const isActive = activeResolved === p.id;
      const card = document.createElement('div');
      card.className = `amv-preset-card ${isActive ? 'is-active' : ''}`;
      card.dataset.id = p.id;

      card.innerHTML = `
        <div class="amv-preset-canvas-wrap">
          <canvas width="320" height="180" id="preview_${p.id}"></canvas>
          ${isActive ? `<span class="amv-active-pill">✓ ĐANG BẬT</span>` : ''}
        </div>
        <div class="amv-preset-info">
          <div class="amv-preset-name">${p.name}</div>
          <div class="amv-preset-id">${p.id}</div>
          <div class="amv-preset-actions">
            <button type="button" class="amv-btn-apply ${isActive ? 'active-state' : ''}" data-id="${p.id}">
              ${isActive ? '✓ Đang Dùng' : '⚡ Áp Dụng'}
            </button>
            <button type="button" class="amv-btn-tune" data-id="${p.id}" title="Tùy chỉnh tham số">
              ⚙️
            </button>
          </div>
        </div>
        <div class="amv-params-panel" id="params_${p.id}" style="display:none;"></div>
      `;

      // Apply button click
      const applyBtn = card.querySelector('.amv-btn-apply');
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAssetActive(catId, p.id);
      });

      // Tune button click
      const tuneBtn = card.querySelector('.amv-btn-tune');
      const paramsPanel = card.querySelector(`#params_${p.id}`);
      tuneBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = paramsPanel.style.display !== 'none';
        paramsPanel.style.display = isOpen ? 'none' : 'flex';
        if (!isOpen) {
          renderParameterControls(p, paramsPanel);
        }
      });

      grid.appendChild(card);

      // Register canvas for preview rendering
      const cv = card.querySelector(`#preview_${p.id}`);
      if (cv) {
        previewCanvasMap.set(p.id, {
          canvas: cv,
          ctx: cv.getContext('2d'),
          asset: p,
          w: cv.width,
          h: cv.height
        });
      }
    });
    if (state.isOpen && previewCanvasMap.size > 0) {
      startPreviewLoop();
    }
  }

  function getCurrentProjectScheme() {
    const lib = getLibrary();
    if (lib && typeof lib.getActiveProjectScheme === 'function') {
      const sc = lib.getActiveProjectScheme();
      if (sc) return sc;
    }
    try {
      const plan = (window.S && window.S.plan);
      const curT = window.S ? (window.S.exportT !== undefined ? window.S.exportT : (window.S.t || 0)) : 0;
      if (plan) {
        const cut = (window.J && window.J.cutAt) ? window.J.cutAt(plan, curT) : (plan.cuts && plan.cuts[0]);
        if (cut && cut.customScheme) return cut.customScheme;
        const st = plan.style;
        if (st && st.schemes && st.schemes.length > 0) {
          const idx = cut ? (cut.scheme % st.schemes.length) : 0;
          return st.schemes[idx] || st.schemes[0];
        }
      }
    } catch (e) {}
    return {
      accent: '#06b6d4',
      accent2: '#ec4899',
      fg: '#ffffff',
      bg: '#0c0a18',
      sub: '#a855f7',
      ghostA: '#38bdf8',
      ghostB: '#f43f5e',
      name: 'Mặc định'
    };
  }

  function mapParamToSchemeColor(key, sc) {
    const lib = getLibrary();
    if (lib && typeof lib.mapParamToSchemeColor === 'function') {
      return lib.mapParamToSchemeColor(key, sc);
    }
    if (!sc) return '#06b6d4';
    const lk = String(key || '').toLowerCase();
    if (lk.includes('secondary') || lk.includes('color2') || lk.includes('barcolor') || lk.includes('corecolor')) {
      return sc.accent2 || sc.fg || '#ec4899';
    }
    if (lk.includes('cap') || lk.includes('color3') || lk.includes('horizon') || lk.includes('text') || lk.includes('dot')) {
      return sc.fg || sc.ghostA || '#ffffff';
    }
    if (lk.includes('bg') || lk.includes('shadow') || lk.includes('dark')) {
      return sc.bg || '#0c0a18';
    }
    if (lk.includes('sub') || lk.includes('ring') || lk.includes('amber') || lk.includes('flare')) {
      return sc.ghostA || sc.sub || sc.accent || '#38bdf8';
    }
    return sc.accent || '#06b6d4';
  }

  function renderParameterControls(preset, panel) {
    panel.innerHTML = '';
    const lib = getLibrary();
    if (!lib || !preset.params) return;

    const currentOverrides = state.customParams[preset.id] || {};
    const colorKeys = Object.entries(preset.params).filter(([k, param]) => {
      const v = currentOverrides[k] !== undefined ? currentOverrides[k] : param.value;
      return (typeof v === 'string' && v.startsWith('#')) || k.toLowerCase().includes('color');
    }).map(([k]) => k);

    const hasColorParams = colorKeys.length > 0;
    const isAutoSync = Boolean(currentOverrides.__themeSync);

    if (hasColorParams) {
      const banner = document.createElement('div');
      banner.className = 'amv-param-theme-banner';
      banner.innerHTML = `
        <div style="font-size:11px;font-weight:700;color:#16f4d4;display:flex;align-items:center;gap:5px;">
          <span>🎨</span> Màu Theo Chủ Đề
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="amv-btn-theme-apply" title="Đồng bộ 1 lần bảng màu từ Chủ Đề hiện tại vào hiệu ứng (Khóa màu tĩnh, không giật theo cảnh)">⚡ Đồng bộ 1 lần click</button>
        </div>
      `;

      const btnApply = banner.querySelector('.amv-btn-theme-apply');
      btnApply.addEventListener('click', (e) => {
        e.stopPropagation();
        const sc = getCurrentProjectScheme();
        if (!state.customParams[preset.id]) state.customParams[preset.id] = {};
        state.customParams[preset.id].__themeSync = false;
        for (const k of colorKeys) {
          const col = mapParamToSchemeColor(k, sc);
          state.customParams[preset.id][k] = col;
          const inp = panel.querySelector(`input[data-color-key="${k}"]`);
          if (inp) inp.value = col;
          const valEl = panel.querySelector(`#val_${preset.id}_${k}`);
          if (valEl) valEl.textContent = col;
        }
        persistState();
        triggerMainRedraw();
        if (window.toast) window.toast(`🎨 Đã đồng bộ màu chủ đề (${sc.name || 'Theme'}) cho ${preset.name} (Khóa 1 lần click)`);
      });

      panel.appendChild(banner);
    }

    for (const [key, param] of Object.entries(preset.params)) {
      const val = currentOverrides[key] !== undefined ? currentOverrides[key] : param.value;
      const row = document.createElement('div');
      row.className = 'amv-param-row';

      if (typeof param.min === 'number' && typeof param.max === 'number') {
        row.innerHTML = `
          <span class="amv-param-label">${key}:</span>
          <input type="range" min="${param.min}" max="${param.max}" step="${param.step || 0.1}" value="${val}">
          <span class="amv-param-val">${Number(val).toFixed(param.step < 0.1 ? 2 : 1)}</span>
        `;
        const slider = row.querySelector('input');
        const valSpan = row.querySelector('.amv-param-val');
        slider.addEventListener('input', (e) => {
          const v = parseFloat(e.target.value);
          valSpan.textContent = v.toFixed(param.step < 0.1 ? 2 : 1);
          if (!state.customParams[preset.id]) state.customParams[preset.id] = {};
          state.customParams[preset.id][key] = v;
          persistState();
          triggerMainRedraw();
        });
      } else if ((typeof val === 'string' && val.startsWith('#')) || key.toLowerCase().includes('color')) {
        const hexVal = (typeof val === 'string' && val.startsWith('#')) ? val : '#16f4d4';
        row.innerHTML = `
          <span class="amv-param-label">${key}:</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <input type="color" data-color-key="${key}" value="${hexVal}">
            <span class="amv-param-val" id="val_${preset.id}_${key}">${hexVal}</span>
            <button type="button" class="amv-btn-row-theme" data-row-key="${key}" title="Áp dụng màu từ Chủ Đề dự án cho dòng này">🎨 Chủ đề</button>
          </div>
        `;
        const picker = row.querySelector('input');
        const valSpan = row.querySelector('.amv-param-val');
        picker.addEventListener('input', (e) => {
          valSpan.textContent = e.target.value;
          if (!state.customParams[preset.id]) state.customParams[preset.id] = {};
          state.customParams[preset.id][key] = e.target.value;
          persistState();
          triggerMainRedraw();
        });

        const btnRowTheme = row.querySelector('.amv-btn-row-theme');
        btnRowTheme.addEventListener('click', (e) => {
          e.stopPropagation();
          const sc = getCurrentProjectScheme();
          const targetColor = mapParamToSchemeColor(key, sc);
          picker.value = targetColor;
          valSpan.textContent = targetColor;
          if (!state.customParams[preset.id]) state.customParams[preset.id] = {};
          state.customParams[preset.id][key] = targetColor;
          persistState();
          triggerMainRedraw();
          if (window.toast) window.toast(`🎨 Đã gán "${key}" = ${targetColor} từ chủ đề (${sc.name || 'Dự án'})`);
        });
      } else {
        row.innerHTML = `
          <span class="amv-param-label">${key}:</span>
          <span class="amv-param-val" style="font-size:9px;">${val}</span>
        `;
      }
      panel.appendChild(row);
    }
  }

  // Update active state visual badges without recreating DOM & destroying canvas loop
  function updateActivePresetCards(catId) {
    const grid = modalEl ? modalEl.querySelector('#amvPresetsGrid') : null;
    if (!grid) return;
    const activeResolved = (catId === 'Phản ứng âm thanh') ? resolveActiveAudioVisualizerId() : state.activeAssets[catId];
    grid.querySelectorAll('.amv-preset-card').forEach(card => {
      if (card.classList.contains('amv-card-turn-off')) {
        const isOff = !activeResolved;
        card.classList.toggle('is-active', isOff);
        card.style.borderColor = isOff ? '#ff5a6a' : 'rgba(255,90,106,0.35)';
        card.style.background = isOff ? 'rgba(255,90,106,0.12)' : 'rgba(20,16,30,0.6)';
        const btn = card.querySelector('#btnCardTurnOffViz');
        if (btn) {
          btn.classList.toggle('active-state', isOff);
          btn.textContent = isOff ? '✓ Đang Tắt' : '❌ Tắt Ngay';
        }
        return;
      }
      const id = card.dataset.id;
      const isActive = (id === activeResolved);
      card.classList.toggle('is-active', isActive);
      const wrap = card.querySelector('.amv-preset-canvas-wrap');
      const pill = wrap ? wrap.querySelector('.amv-active-pill') : null;
      if (isActive && !pill && wrap) {
        const p = document.createElement('span');
        p.className = 'amv-active-pill';
        p.textContent = '✓ ĐANG BẬT';
        wrap.appendChild(p);
      } else if (!isActive && pill) {
        pill.remove();
      }
      const applyBtn = card.querySelector('.amv-btn-apply');
      if (applyBtn) {
        applyBtn.classList.toggle('active-state', isActive);
        applyBtn.textContent = isActive ? '✓ Đang Dùng' : '⚡ Áp Dụng';
      }
    });
  }

  function toggleAssetActive(catId, assetId) {
    if (catId === 'Phản ứng âm thanh') {
      const currentResolved = resolveActiveAudioVisualizerId();
      const lib = getLibrary();
      const targetPreset = lib ? lib.get(assetId) : null;
      const targetId = targetPreset ? targetPreset.id : assetId;
      if (currentResolved === targetId) {
        state.activeAssets[catId] = null;
        if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.disable === 'function') {
          window.AudioVisualizerAPI.disable();
        }
      } else {
        state.activeAssets[catId] = targetId;
        if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.enable === 'function') {
          window.AudioVisualizerAPI.enable(targetId);
        }
      }
      persistState();
      renderCategoriesList();
      renderPresetsForCategory('Phản ứng âm thanh');
      updateStudioVisualizerBadge();
      triggerMainRedraw();
      return;
    }

    if (state.activeAssets[catId] === assetId) {
      state.activeAssets[catId] = null;
    } else {
      state.activeAssets[catId] = assetId;
    }
    persistState();
    renderCategoriesList();
    updateActivePresetCards(catId);
    triggerMainRedraw();
  }

  function clearAllActiveAssets() {
    for (const k in state.activeAssets) {
      state.activeAssets[k] = null;
    }
    state.audioVisualizerOff = true;
    if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.disable === 'function') {
      window.AudioVisualizerAPI.disable();
    }
    if (state.postFilters) {
      Object.keys(state.postFilters).forEach(fid => {
        if (state.postFilters[fid]) state.postFilters[fid].enabled = false;
      });
    }
    persistState();
    renderCategoriesList();
    if (state.selectedCategory === 'post_processing') {
      const rackBody = modalEl ? modalEl.querySelector('#amvRackBody') : null;
      if (rackBody) renderPostProcessingRack(rackBody);
    } else {
      updateActivePresetCards(state.selectedCategory);
    }
    triggerMainRedraw();
  }

  function syncAllActiveAssetsToTheme() {
    const sc = getCurrentProjectScheme();
    const lib = getLibrary();
    if (!lib || !sc) return;
    let count = 0;
    for (const [cat, assetId] of Object.entries(state.activeAssets)) {
      if (!assetId) continue;
      const preset = lib.getAsset(assetId);
      if (!preset || !preset.params) continue;
      if (!state.customParams[assetId]) state.customParams[assetId] = {};
      state.customParams[assetId].__themeSync = false;
      for (const [k, p] of Object.entries(preset.params)) {
        if ((typeof p.value === 'string' && p.value.startsWith('#')) || k.toLowerCase().includes('color')) {
          const col = mapParamToSchemeColor(k, sc);
          state.customParams[assetId][k] = col;
          count++;
        }
      }
    }
    if (state.postFilters) {
      for (const [fId, cfg] of Object.entries(state.postFilters)) {
        if (!cfg || !cfg.enabled || !cfg.params) continue;
        for (const [k, v] of Object.entries(cfg.params)) {
          if (typeof v === 'string' && v.startsWith('#')) {
            cfg.params[k] = mapParamToSchemeColor(k, sc);
            count++;
          }
        }
      }
    }
    persistState();
    triggerMainRedraw();
    renderPresetsForCategory(state.selectedCategory);
    if (window.toast) {
      window.toast(`🎨 Đã đồng bộ màu Theme cho ${count} thông số AMV (1 lần click, khóa màu tĩnh)!`);
    }
  }

  function randomizeActiveAssets() {
    const lib = getLibrary();
    if (!lib) return;
    CATEGORY_META.forEach(cat => {
      if (state.lockedCategories[cat.id]) return;
      const presets = lib.byCategory(cat.id);
      if (presets && presets.length > 0) {
        // 70% pick a preset, 30% none
        if (Math.random() < 0.7) {
          const randIdx = Math.floor(Math.random() * presets.length);
          state.activeAssets[cat.id] = presets[randIdx].id;
        } else {
          state.activeAssets[cat.id] = null;
        }
      }
    });
    // keep the "visualizer off" flag in sync with the randomised asset
    state.audioVisualizerOff = !state.activeAssets['Phản ứng âm thanh'];
    if (window.AudioVisualizerAPI) {
      if (state.audioVisualizerOff) {
        if (typeof window.AudioVisualizerAPI.disable === 'function') window.AudioVisualizerAPI.disable();
      } else if (typeof window.AudioVisualizerAPI.enable === 'function') {
        window.AudioVisualizerAPI.enable(state.activeAssets['Phản ứng âm thanh']);
      }
    }
    persistState();
    renderCategoriesList();
    updateActivePresetCards(state.selectedCategory);
    triggerMainRedraw();
  }

  function triggerMainRedraw() {
    if (window.S) {
      window.S.need = true;
    }
    if (typeof window.triggerRedraw === 'function') {
      try { window.triggerRedraw(); } catch (e) {}
    }
    if (typeof window.draw === 'function') {
      try { window.draw(); } catch (e) {}
    }
  }

  // ----------------------------------------------------------- Auto-Looping Preview Engine
  let _previewRafId = null;
  let _lastPreviewTick = 0;

  function startPreviewLoop() {
    if (_previewRafId) return;
    _previewRafId = requestAnimationFrame(previewTick);
  }

  function stopPreviewLoop() {
    if (_previewRafId) {
      cancelAnimationFrame(_previewRafId);
      _previewRafId = null;
    }
  }

  function previewTick(now) {
    _previewRafId = null;
    if (!state.isOpen) return;
    if (previewCanvasMap.size === 0) return;

    _previewRafId = requestAnimationFrame(previewTick);

    // Cap modal preview cards to ~30 FPS to save 50%+ CPU/GPU resources
    if (now - _lastPreviewTick < 33) return;
    _lastPreviewTick = now;

    const lib = getLibrary();
    if (!lib) return;

    previewCanvasMap.forEach(({ canvas, ctx, asset, w, h }) => {
      if (!canvas.isConnected) return;

      try {
        ctx.clearRect(0, 0, w, h);
        const overrides = Object.assign({}, state.customParams[asset.id] || {});
        overrides.__preview = true; // Signals preview mode so placeholders are allowed
        const tPreview = (asset.category === 'Chuyển tiếp') ? ((now % 3000) / 3000) : ((now % 60000) / 1000);
        lib.render(asset, ctx, w, h, tPreview, overrides);
      } catch (err) {
        // Safe failover
      }
    });
  }

  // ------------------------------------------------------------- Integration Hooks
  // Persistent scene buffer for full-scene camera & layout interception
  let _sceneCanvas = null;
  function getSceneCanvas(w, h) {
    if (!_sceneCanvas) {
      _sceneCanvas = document.createElement('canvas');
    }
    if (_sceneCanvas.width !== w || _sceneCanvas.height !== h) {
      _sceneCanvas.width = w;
      _sceneCanvas.height = h;
    }
    return _sceneCanvas;
  }

  // Persistent stage buffer for post-processing stack chaining
  let _stageCanvas = null;
  function getStageCanvas(w, h) {
    if (!_stageCanvas) {
      _stageCanvas = document.createElement('canvas');
    }
    if (_stageCanvas.width !== w || _stageCanvas.height !== h) {
      _stageCanvas.width = w;
      _stageCanvas.height = h;
    }
    return _stageCanvas;
  }

  // Hook Character Idle Motion (CAT: Đứng)
  function hookDrawCharacter() {
    if (!window.__drawCharacter || window.__drawCharacter.__amvHooked) return;
    const origDrawChar = window.__drawCharacter;

    const hookedDrawChar = function(ctx, W, H, layer, t, meta) {
      const projAmv = (window.S && window.S.project && window.S.project.amv) || null;
      const activeAssets = Object.assign({}, state.activeAssets, (projAmv && projAmv.activeAssets) || {});
      const customParams = Object.assign({}, state.customParams, (projAmv && projAmv.customParams) || {});
      const idleAssetId = activeAssets['Đứng'];
      const lib = getLibrary();

      if (idleAssetId && lib) {
        const overrides = customParams[idleAssetId] || {};
        const spd = overrides.speed || 1;
        const inten = overrides.intensity || 1;

        // Xác định tọa độ chuẩn của nhân vật (sử dụng posX, posY từ __jizuraMedia)
        const m = window.__jizuraMedia;
        let charX = W * 0.5, charY = H * 0.55;
        if (m && m.character) {
          const px = m.character.posX !== undefined ? m.character.posX : m.character.x;
          const py = m.character.posY !== undefined ? m.character.posY : m.character.y;
          if (typeof px === 'number') charX = (px / 100) * W;
          if (typeof py === 'number') charY = (py / 100) * H;
        }

        ctx.save();
        if (idleAssetId === 'idle_breathe') {
          // Hít thở tự nhiên: Co giãn nhẹ chuẩn tâm nhân vật
          const ph = t * spd * Math.PI * 2;
          const sx = 1.0 + 0.012 * inten * Math.sin(ph);
          const sy = 1.0 + 0.024 * inten * Math.sin(ph);
          ctx.translate(charX, charY);
          ctx.scale(sx, sy);
          ctx.translate(-charX, -charY);
        } else if (idleAssetId === 'idle_glow_pulse') {
          ctx.shadowColor = overrides.color || '#ec4899';
          ctx.shadowBlur = (10 + 35 * (0.5 + 0.5 * Math.sin(t * spd * Math.PI * 2))) * inten;
        } else if (idleAssetId === 'idle_parallax_float') {
          const ph = t * spd * Math.PI * 2;
          ctx.translate(
            Math.cos(ph) * W * 0.012 * inten,
            Math.sin(ph * 0.8) * H * 0.018 * inten
          );
          ctx.translate(charX, charY);
          ctx.rotate(Math.sin(ph) * 0.012 * inten);
          ctx.translate(-charX, -charY);
        } else if (idleAssetId === 'idle_levitate_wings') {
          const ph = t * spd * Math.PI * 2;
          ctx.translate(0, Math.sin(ph) * H * 0.02 * inten);
          ctx.translate(charX, charY);
          ctx.rotate(Math.cos(ph) * 0.008 * inten);
          ctx.translate(-charX, -charY);
        } else if (idleAssetId === 'idle_heartbeat_pulse') {
          const cycle = (t * spd * 1.5) % 1;
          const p1 = Math.exp(-Math.pow((cycle - 0.12) / 0.06, 2));
          const p2 = Math.exp(-Math.pow((cycle - 0.28) / 0.06, 2)) * 0.7;
          const s = 1.0 + (p1 + p2) * 0.038 * inten;
          ctx.translate(charX, charY);
          ctx.scale(s, s);
          ctx.translate(-charX, -charY);
        } else if (idleAssetId === 'idle_shadow_echo') {
          const ph = t * spd * Math.PI * 2;
          ctx.translate(
            Math.sin(ph) * W * 0.015 * inten,
            Math.cos(ph) * H * 0.015 * inten
          );
        }

        origDrawChar(ctx, W, H, layer, t, meta);
        ctx.restore();
        return;
      }

      origDrawChar(ctx, W, H, layer, t, meta);
    };

    hookedDrawChar.__amvHooked = true;
    window.__drawCharacter = hookedDrawChar;
    window.__drawCharacterMedia = hookedDrawChar;
  }

  // AMV Frame Rendering logic for both preview and video export (MP4, WebM Alpha, GIF, PNG)
  function renderAMVFrame(origFrame, ctx, plan, t, opt = {}) {
    if (window.S) window.S.exportT = t;
    if (this.noAMV || this.isTechPreview || (opt && (opt.__isAMVNested || opt.noPost || opt.noAMV || opt.isTechPreview))) {
      return origFrame.call(this, ctx, plan, t, opt);
    }
    const lib = getLibrary();
    const W = (plan && plan.W) ? plan.W : 1920;
    const H = (plan && plan.H) ? plan.H : 1080;

    // Check active AMV assets from multiple sources (opt.project, plan.project, window.S.project, or local state)
    const projAmv = (opt && opt.project && opt.project.amv) ||
                    (plan && plan.project && plan.project.amv) ||
                    (window.S && window.S.project && window.S.project.amv) || null;

    const activeAssets = Object.assign({},
      state.activeAssets,
      (projAmv && projAmv.activeAssets) || {}
    );
    const customParams = Object.assign({},
      state.customParams,
      (projAmv && projAmv.customParams) || {}
    );
    const postFilters = Object.assign({},
      state.postFilters,
      (projAmv && projAmv.postFilters) || {}
    );

    const camAssetId = activeAssets['Camera'];
    const decoAssetId = activeAssets['Trang trí'];
    const fxAssetId = activeAssets['Hiệu ứng màn hình'];
    const layoutAssetId = activeAssets['Bố cục'];
    const trAssetId = activeAssets['Chuyển tiếp'];
    const rawAudioId = activeAssets['Phản ứng âm thanh'] || resolveActiveAudioVisualizerId();
    // IMPORTANT: no implicit fallback to 'audio_trap_nation_pro' here.
    // When the visualizer is switched OFF there must be NO audio-reactive layer at all,
    // otherwise the previous preset keeps rendering on the canvas.
    const audioVisualizerDisabled = state.audioVisualizerOff === true;
    const resolvedAudioPreset = rawAudioId && lib
      ? (lib.get(rawAudioId) || (audioVisualizerDisabled ? null : lib.get('audio_trap_nation_pro')))
      : null;
    const audioAssetId = audioVisualizerDisabled
      ? null
      : (resolvedAudioPreset ? resolvedAudioPreset.id : (rawAudioId || 'audio_trap_nation_pro'));

    const mainCut = (window.J && window.J.cutAt) ? window.J.cutAt(plan, t) : null;
    const st = plan && plan.style;
    const currentSc = (mainCut && mainCut.customScheme) || (st && st.schemes && st.schemes[mainCut ? mainCut.scheme % st.schemes.length : 0]) || (st && st.schemes && st.schemes[0]) || null;

    const hasActivePostFilters = Boolean(
      lib &&
      postFilters &&
      typeof lib.applyPostProcessingStack === 'function' &&
      !opt.noPost &&
      Object.values(postFilters).some(f => f && f.enabled)
    );

    const isLetterboxOrFocus = (layoutAssetId === 'layout_cinematic_letterbox' || layoutAssetId === 'layout_focus_target');
    const realLayoutSlicing = layoutAssetId && !isLetterboxOrFocus;
    const audioHasCamTransform = resolvedAudioPreset && typeof resolvedAudioPreset.applyCameraTransform === 'function';
    const needsFullFrameCapture = (camAssetId || fxAssetId || realLayoutSlicing || trAssetId || audioHasCamTransform || hasActivePostFilters) && lib;
    const scale = opt.scale || 1;

    // Không bật Camera, Bố cục chia khung, Screen FX hay Bộ lọc hậu kỳ: Vẽ trực tiếp tối ưu 100% hiệu năng
    if (!needsFullFrameCapture) {
      origFrame.call(this, ctx, plan, t, opt);

      // Lớp phủ Trang trí (Tia tốc độ Anime, Vết chém Katana, Tinh thể lấp lánh,...)
      if (decoAssetId && lib && !opt.lyricsOnly) {
        try {
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          const overrides = Object.assign({}, customParams[decoAssetId] || {});
          lib.render(decoAssetId, ctx, W, H, t, overrides);
          ctx.restore();
        } catch (e) {
          console.warn('AMV Deco render error:', e);
        }
      }

      // Lớp Phản ứng âm thanh (Sóng tròn, Cột EQ Bass, Shockwave,...)
      if (audioAssetId && lib && !opt.lyricsOnly) {
        try {
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          const audioOverrides = Object.assign({}, customParams[audioAssetId] || {});
          audioOverrides.source = ctx.canvas;
          audioOverrides.plan = plan;
          audioOverrides.t = t;
          audioOverrides.sc = currentSc;
          lib.render(audioAssetId, ctx, W, H, t, audioOverrides);
          ctx.restore();
        } catch (e) {
          console.warn('AMV Audio Reactive render error:', e);
        }
      }

      // Lớp Bố cục dạng Overlay (Letterbox 2.39:1, HUD ngắm tâm điểm - Vẽ trực tiếp không tốn frame capture)
      if (isLetterboxOrFocus && lib && !opt.lyricsOnly) {
        try {
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          const loOverrides = Object.assign({}, customParams[layoutAssetId] || {});
          loOverrides.__overlayOnly = true;
          loOverrides.source = ctx.canvas;
          lib.render(layoutAssetId, ctx, W, H, t, loOverrides);
          ctx.restore();
        } catch (e) {}
      }
      return;
    }

    // 1. Kết xuất sân khấu gốc vào offscreen sceneBuf ở tỉ lệ tối ưu cho thiết bị & preview
    const isMobile = (typeof window !== 'undefined') && (window.innerWidth <= 900 || (document.getElementById('app') && document.getElementById('app').classList.contains('is-mobile')));
    const previewTargetW = (opt && opt.scale && opt.scale > 0) ? Math.round(W * opt.scale) : (ctx.canvas ? ctx.canvas.width : 1280);
    const bufW = (opt.__preview && isMobile && W > 1280) ? 1280 : W;
    const bufH = Math.round(bufW / (W / H));
    const bufScale = bufW / W;

    const sceneBuf = getSceneCanvas(bufW, bufH);
    const sctx = sceneBuf.getContext('2d');
    sctx.clearRect(0, 0, bufW, bufH);
    origFrame.call(this, sctx, plan, t, Object.assign({}, opt, { scale: bufScale, __isAMVNested: true }));

    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;

    // 2. Chuẩn bị ngữ cảnh đích trung gian (stageBuf nếu có bộ lọc hậu kỳ, hoặc ctx trực tiếp)
    const targetCtx = hasActivePostFilters ? getStageCanvas(bufW, bufH).getContext('2d') : ctx;

    if (hasActivePostFilters) {
      targetCtx.save();
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
      targetCtx.clearRect(0, 0, bufW, bufH);
      if (bufScale !== 1) targetCtx.scale(bufScale, bufScale);
    } else {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    // 3. LAYER A: CAMERA & STAGE CONTENT (Đồng bộ Camera AMV với Anchor Target & 3D Multi-Plane)
    const camCfg = Object.assign({
      target: 'all',
      anchor: 'auto',
      lyricInfluence: 100,
      parallax3D: true,
      beatImpact: true,
      sandwichDepth: true
    }, state.cameraConfig, (projAmv && projAmv.cameraConfig) || {});

    // Tính toán Anchor Target (w/2, h/2 HOẶC vị trí nhân vật HOẶC vị trí lyric)
    let anchorX = W * 0.5, anchorY = H * 0.5;
    const m = window.__jizuraMedia;
    let charPosX = W * 0.5, charPosY = H * 0.55;
    if (m && m.character) {
      const px = m.character.posX !== undefined ? m.character.posX : m.character.x;
      const py = m.character.posY !== undefined ? m.character.posY : m.character.y;
      if (typeof px === 'number') charPosX = (px / 100) * W;
      if (typeof py === 'number') charPosY = (py / 100) * H;
    }

    const hasLyric = Boolean(mainCut && mainCut.text && mainCut.text.trim().length > 0);
    let lyricPosX = W * 0.5, lyricPosY = H * 0.65;

    if (camCfg.anchor === 'character') {
      anchorX = charPosX;
      anchorY = charPosY;
    } else if (camCfg.anchor === 'lyric') {
      anchorX = lyricPosX;
      anchorY = lyricPosY;
    } else if (camCfg.anchor === 'auto') {
      anchorX = hasLyric ? (charPosX * 0.35 + lyricPosX * 0.65) : charPosX;
      anchorY = hasLyric ? (charPosY * 0.35 + lyricPosY * 0.65) : charPosY;
    } else {
      anchorX = W * 0.5;
      anchorY = H * 0.5;
    }

    // Velocity tracking for Optical Shutter Motion Blur
    if (!window._lastAmvCam) window._lastAmvCam = { x: anchorX, y: anchorY, s: 1.0, t: t, cutIdx: mainCut ? mainCut.index : -1 };
    const prevCam = window._lastAmvCam;
    const curCutIdx = mainCut ? mainCut.index : -1;
    const isCutSwitch = prevCam.cutIdx !== undefined && prevCam.cutIdx !== curCutIdx;
    const dt = Math.max(0.001, Math.min(0.08, t - (prevCam.t || t)));
    let camVx = 0, camVy = 0, camVs = 0;
    if (dt > 0.001 && !isCutSwitch) {
      camVx = Math.max(-600, Math.min(600, (anchorX - prevCam.x) / dt));
      camVy = Math.max(-600, Math.min(600, (anchorY - prevCam.y) / dt));
      camVs = Math.max(-3, Math.min(3, (1.0 - (prevCam.s || 1.0)) / dt));
    }
    window._lastAmvCam = { x: anchorX, y: anchorY, s: 1.0, t: t, cutIdx: curCutIdx };

    // Rack Focus mode between Lyric and Character
    const dofFocus = hasLyric ? 'lyric' : 'character';

    window.__AMV_CAMERA_STATE = {
      active: Boolean(camAssetId),
      id: camAssetId,
      target: camCfg.target,
      anchor: camCfg.anchor,
      anchorX: anchorX,
      anchorY: anchorY,
      velocity: { vx: camVx, vy: camVy, vs: camVs },
      dofFocus: dofFocus,
      charX: charPosX,
      charY: charPosY,
      charW: W * 0.32,
      charH: H * 0.60,
      lyricInfluence: (camCfg.lyricInfluence ?? 100) / 100,
      parallax3D: camCfg.parallax3D !== false,
      beatImpact: camCfg.beatImpact !== false,
      sandwichDepth: camCfg.sandwichDepth !== false
    };

    targetCtx.save();
    if (camAssetId && lib) {
      const camPreset = lib.get(camAssetId);
      if (camPreset && camPreset.applyCameraTransform) {
        try {
          const camOverrides = Object.assign({}, customParams[camAssetId] || {});
          camOverrides.targetX = anchorX;
          camOverrides.targetY = anchorY;
          camOverrides.targetLayer = camCfg.target;
          camOverrides.parallax3D = camCfg.parallax3D;
          if (window.SmartSectionAPI && window.SmartSectionAPI.isDrop(t)) {
            camOverrides.intensity = (camOverrides.intensity || 1.0) * window.SmartSectionAPI.getDropImpactMultiplier(t);
          }
          camPreset.applyCameraTransform(targetCtx, W, H, t, lib.resolve(camPreset, camOverrides));
        } catch (e) {
          console.warn('AMV Camera transform error:', e);
        }
      }
    } else if (window.SmartSectionAPI && window.SmartSectionAPI.isDrop(t)) {
      // Fallback Drop Bass Impact when no Camera preset is loaded
      try {
        const isAutoDirector = Boolean(window.AutoDirectorAPI && window.AutoDirectorAPI.isEnabled());
        const dropMul = (window.SmartSectionAPI ? window.SmartSectionAPI.getDropImpactMultiplier(t) : 1.0) * (isAutoDirector ? 1.25 : 1.0);
        const bpm = (plan && plan.bpm) || 128;
        const bPhase = (t * (bpm / 60)) % 1;
        const kickPulse = Math.exp(-bPhase * 6.5);
        if (kickPulse > 0.05 && (dropMul > 1.0 || isAutoDirector)) {
          const punchZoom = 1.0 + kickPulse * (isAutoDirector ? 0.038 : 0.045 * (dropMul - 1.0));
          const jitterX = (Math.sin(t * 37) * 3) * kickPulse * (isAutoDirector ? 0.8 : (dropMul - 1.0));
          const jitterY = (Math.cos(t * 43) * 2.5) * kickPulse * (isAutoDirector ? 0.8 : (dropMul - 1.0));
          targetCtx.translate(W / 2 + jitterX, H / 2 + jitterY);
          targetCtx.scale(punchZoom, punchZoom);
          targetCtx.translate(-W / 2, -H / 2);
        }
      } catch (e) {}
    }
    if (audioAssetId && lib) {
      const audioPreset = lib.get(audioAssetId);
      if (audioPreset && audioPreset.applyCameraTransform) {
        try {
          const audioCamOverrides = Object.assign({}, customParams[audioAssetId] || {});
          audioCamOverrides.plan = plan;
          audioPreset.applyCameraTransform(targetCtx, W, H, t, lib.resolve(audioPreset, audioCamOverrides));
        } catch (e) {
          console.warn('AMV Audio Camera transform error:', e);
        }
      }
    }

    // Vẽ Bố cục chia khung hoặc vẽ trực tiếp sceneBuf
    if (layoutAssetId && lib && !opt.lyricsOnly) {
      try {
        const layoutPreset = lib.get(layoutAssetId);
        const layoutOverrides = Object.assign({}, customParams[layoutAssetId] || {});
        layoutOverrides.source = sceneBuf;

        if (layoutAssetId === 'layout_cinematic_letterbox' || layoutAssetId === 'layout_focus_target') {
          targetCtx.drawImage(sceneBuf, 0, 0, bufW, bufH, 0, 0, W, H);
        } else {
          lib.render(layoutAssetId, targetCtx, W, H, t, layoutOverrides);
        }
      } catch (e) {
        console.warn('AMV Layout render error:', e);
        targetCtx.drawImage(sceneBuf, 0, 0, bufW, bufH, 0, 0, W, H);
      }
    } else {
      targetCtx.drawImage(sceneBuf, 0, 0, bufW, bufH, 0, 0, W, H);
    }

    // Lớp Trang trí (Tia kiếm, hoa rơi, tàn lửa, tia tốc độ nằm trong không gian sân khấu)
    if (decoAssetId && lib && !opt.lyricsOnly) {
      try {
        const decoOverrides = Object.assign({}, customParams[decoAssetId] || {});
        decoOverrides.charX = charPosX;
        decoOverrides.charY = charPosY;
        decoOverrides.charW = W * 0.32;
        decoOverrides.charH = H * 0.60;
        lib.render(decoAssetId, targetCtx, W, H, t, decoOverrides);
      } catch (e) {
        console.warn('AMV Deco render error:', e);
      }
    }

    targetCtx.restore(); // KẾT THÚC LAYER CAMERA -> Trở về không gian màn hình chuẩn 1:1

    // 3.5 LAYER AUDIO: PHẢN ỨNG ÂM THANH (Sóng tròn, Cột EQ Bass, Shockwave, Hạt nảy, Lưới 3D)
    if (audioAssetId && lib && !opt.lyricsOnly) {
      try {
        const audioOverrides = Object.assign({}, customParams[audioAssetId] || {});
        audioOverrides.source = sceneBuf;
        audioOverrides.plan = plan;
        audioOverrides.t = t;
        audioOverrides.sc = currentSc;
        lib.render(audioAssetId, targetCtx, W, H, t, audioOverrides);
      } catch (e) {
        console.warn('AMV Audio Reactive render error:', e);
      }
    }

    // 4. LAYER B: LỚP PHỦ MÀN HÌNH CỐ ĐỊNH (Letterbox 2.39:1 & HUD ngắm tâm điểm không bị nghiêng lệch)
    if (layoutAssetId && lib && !opt.lyricsOnly) {
      if (layoutAssetId === 'layout_cinematic_letterbox' || layoutAssetId === 'layout_focus_target') {
        try {
          const layoutOverrides = Object.assign({}, customParams[layoutAssetId] || {});
          layoutOverrides.__overlayOnly = true;
          layoutOverrides.source = sceneBuf;
          lib.render(layoutAssetId, targetCtx, W, H, t, layoutOverrides);
        } catch (e) {}
      }
    }

    // 5. LAYER C: HIỆU ỨNG MÀN HÌNH (Screen FX: Scanlines CRT, Bloom, RGB Glitch, Sóng nhiệt, Chớp nháy)
    if (fxAssetId && lib && !opt.noPost) {
      try {
        const fxOverrides = Object.assign({}, customParams[fxAssetId] || {});
        fxOverrides.source = sceneBuf;
        lib.render(fxAssetId, targetCtx, W, H, t, fxOverrides);
      } catch (e) {
        console.warn('AMV Screen FX render error:', e);
      }
    }

    // 5.5 PMNDRS/POSTPROCESSING MULTI-PASS FILTER STACK (Bloom, Chromatic Aberration, Glitch, Film Grain, CRT, Radial Blur, Vignette, LUT, Heatwave, Pixelate)
    if (hasActivePostFilters) {
      targetCtx.restore(); // hoàn tất vẽ stageBuf

      // Chuẩn bị canvas đầu ra chính với scale
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);

      const stageBuf = getStageCanvas(bufW, bufH);
      try {
        lib.applyPostProcessingStack(ctx, stageBuf, bufW, bufH, t, postFilters, plan, Boolean(opt.__preview), W, H);
      } catch (postErr) {
        console.warn('AMV post-processing stack error:', postErr);
        ctx.drawImage(stageBuf, 0, 0, bufW, bufH, 0, 0, W, H);
      }
    }

    // 6. LAYER D: CHUYỂN CẢNH (Transitions: Kích hoạt tại đầu mỗi phân cảnh Cut)
    if (trAssetId && lib && !opt.noPost) {
      try {
        // Tính toán tiến trình chuyển cảnh theo nhịp cut
        let trProg = -1;
        const mainCut = (window.J && window.J.cutAt) ? window.J.cutAt(plan, t) : null;
        if (mainCut) {
          const dt = t - mainCut.start;
          if (dt >= 0 && dt <= 0.45) {
            trProg = dt / 0.45;
          }
        } else {
          // Nhịp lặp tuần hoàn 2 giây nếu không có dữ liệu cut
          const period = 2.0;
          const cycle = (t % period) / period;
          if (cycle <= 0.25) trProg = cycle / 0.25;
        }

        if (trProg >= 0) {
          const trOverrides = Object.assign({}, customParams[trAssetId] || {}, { __preview: !!opt.__preview });
          trOverrides.source = hasActivePostFilters ? getStageCanvas(bufW, bufH) : sceneBuf;
          lib.render(trAssetId, ctx, W, H, trProg, trOverrides);
        }
      } catch (e) {
        console.warn('AMV Transition render error:', e);
      }
    }

    ctx.restore();
  }

  let hookInterval = null;

  // Hook J.Renderer.prototype.frame so all Renderer instances (Preview AND Video Exporters) apply AMV assets
  function hookMainRenderer() {
    hookDrawCharacter();

    let isHooked = false;
    if (window.J && window.J.Renderer) {
      if (!window.J.Renderer.prototype.__amvHooked) {
        const origProtoFrame = window.J.Renderer.prototype.frame;
        window.J.Renderer.prototype.frame = function(ctx, plan, t, opt = {}) {
          return renderAMVFrame.call(this, origProtoFrame, ctx, plan, t, opt);
        };
        window.J.Renderer.prototype.frame.__isAMV = true;
        window.J.Renderer.prototype.__amvHooked = true;
      }
      isHooked = true;
    }

    if (window.S && window.S.renderer) {
      if (window.S.renderer.hasOwnProperty('frame') && !window.S.renderer.frame.__isAMV) {
        delete window.S.renderer.frame;
      }
      window.S.renderer.__amvHooked = true;
      isHooked = true;
    }

    if (isHooked && hookInterval) {
      clearInterval(hookInterval);
      hookInterval = null;
    }

    return isHooked;
  }

  window.__hookMainRenderer = hookMainRenderer;
  window.__hookAMVRenderer = hookMainRenderer;

  // ------------------------------------------------------------- Modal Controls
  function openModal(cat = 'Bộ lọc hậu kỳ') {
    state.selectedCategory = cat || 'Bộ lọc hậu kỳ';
    buildModal();
    if (!modalEl) return;
    modalEl.classList.add('open');
    state.isOpen = true;
    renderCategoriesList();
    renderPresetsForCategory(state.selectedCategory);
    startPreviewLoop();
    hookMainRenderer();
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.classList.remove('open');
    state.isOpen = false;
    stopPreviewLoop();
    previewCanvasMap.clear();
  }

  function toggleModal() {
    if (state.isOpen) closeModal();
    else openModal('Bộ lọc hậu kỳ');
  }

  function renderSideTabRack() {
    ensureStyles();
    const container = document.getElementById('sideTabRackContainer');
    if (!container) return;
    renderPostProcessingRack(container);
  }
  window.renderSideTabRack = renderSideTabRack;

  // Helper to keep studio toolbar visualizer badge updated
  function updateStudioVisualizerBadge() {
    const toggleBtn = document.getElementById('btnAudioVizQuickToggle');
    const mainBtn = document.getElementById('btnAudioVisualizer');
    const actId = resolveActiveAudioVisualizerId();
    const isAct = Boolean(actId);

    if (toggleBtn) {
      if (isAct) {
        toggleBtn.textContent = 'BẬT';
        toggleBtn.style.color = '#16f4d4';
        toggleBtn.style.borderColor = '#16f4d4';
        toggleBtn.style.background = 'rgba(22, 244, 212, 0.2)';
        toggleBtn.title = 'Sóng nhạc đang BẬT (' + (actId || '') + '). Nhấn để TẮT ngay!';
      } else {
        toggleBtn.textContent = 'TẮT';
        toggleBtn.style.color = '#ff5a6a';
        toggleBtn.style.borderColor = '#ff5a6a';
        toggleBtn.style.background = 'rgba(255, 90, 106, 0.2)';
        toggleBtn.title = 'Sóng nhạc đang TẮT. Nhấn để BẬT ngay!';
      }
    }
    if (mainBtn) {
      mainBtn.classList.toggle('active', isAct);
    }
  }
  window.updateStudioVisualizerBadge = updateStudioVisualizerBadge;

  // 1-Click Quick Toggle for Toolbar Button
  window.toggleAudioVisualizerQuick = function() {
    const actId = resolveActiveAudioVisualizerId();
    if (actId) {
      state.activeAssets['Phản ứng âm thanh'] = null;
      state.audioVisualizerOff = true;
      if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.disable === 'function') {
        window.AudioVisualizerAPI.disable();
      }
      persistState();
      renderCategoriesList();
      if (state.selectedCategory === 'Phản ứng âm thanh') renderPresetsForCategory('Phản ứng âm thanh');
      updateStudioVisualizerBadge();
      triggerMainRedraw();
      if (window.toast) window.toast('📊 Đã TẮT Sóng Nhạc Visualizer');
    } else {
      state.activeAssets['Phản ứng âm thanh'] = 'audio_trap_nation_pro';
      state.audioVisualizerOff = false;
      if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.enable === 'function') {
        window.AudioVisualizerAPI.enable('circle_trap');
      }
      persistState();
      renderCategoriesList();
      if (state.selectedCategory === 'Phản ứng âm thanh') renderPresetsForCategory('Phản ứng âm thanh');
      updateStudioVisualizerBadge();
      triggerMainRedraw();
      if (window.toast) window.toast('📊 Đã BẬT Sóng Nhạc: Trap Nation Pro 4K');
    }
  };

  // ------------------------------------------------------------- Toolbar Bindings
  function bindToolbarButtons() {
    // Sync visualizer strip buttons
    const vizMainBtn = document.getElementById('btnAudioVisualizer');
    if (vizMainBtn) {
      vizMainBtn.onclick = () => openModal('Phản ứng âm thanh');
    }
    const vizQuickBtn = document.getElementById('btnAudioVizQuickToggle');
    if (vizQuickBtn) {
      vizQuickBtn.onclick = (e) => {
        e.stopPropagation();
        window.toggleAudioVisualizerQuick();
      };
    }
    updateStudioVisualizerBadge();
    // 0. Wire up Top Bar Button
    const topBtn = document.getElementById('btnTopAMVAssets');
    if (topBtn) topBtn.onclick = () => openModal('Bộ lọc hậu kỳ');

    const vpBtn = document.getElementById('btnViewportAMV');
    if (vpBtn) vpBtn.remove();

    // 1. Add / Wire Studio Tools Strip Button
    const strip = document.getElementById('studioToolsStrip');
    let stripBtn = document.getElementById('btnAMVAssets');
    if (!stripBtn && strip) {
      stripBtn = document.createElement('button');
      stripBtn.id = 'btnAMVAssets';
      stripBtn.type = 'button';
      stripBtn.className = 'studio-strip-btn amv-pill-btn';
      stripBtn.title = 'Thư Viện Asset Chuyển Động AMV & Bộ Lọc Hậu Kỳ (Post-Processing Rack / Vizzy Style)';
      stripBtn.innerHTML = `<span>🪄</span> Bộ Lọc Hậu Kỳ AMV`;
      strip.insertBefore(stripBtn, strip.firstChild ? strip.firstChild.nextSibling : null);
    }
    if (stripBtn) stripBtn.onclick = () => openModal('Bộ lọc hậu kỳ');

    // 2. Add / Wire Mobile Strip Button
    const mobStrip = document.querySelector('.mobile-studio-strip');
    let mobBtn = document.getElementById('mobBtnAMVAssets');
    if (!mobBtn && mobStrip) {
      mobBtn = document.createElement('button');
      mobBtn.id = 'mobBtnAMVAssets';
      mobBtn.type = 'button';
      mobBtn.className = 'mob-tool-btn';
      mobBtn.style.borderColor = 'rgba(192, 132, 252, 0.45)';
      mobBtn.style.color = '#c084fc';
      mobBtn.style.background = 'rgba(192, 132, 252, 0.12)';
      mobBtn.innerHTML = `<span>🪄</span> Bộ Lọc AMV`;
      mobStrip.appendChild(mobBtn);
    }
    if (mobBtn) mobBtn.onclick = () => openModal('Bộ lọc hậu kỳ');

    // 3. Add / Wire Settings Tabs Bar
    const tabsNav = document.querySelector('nav.tabs[role="tablist"]');
    let tabBtn = document.querySelector('button[data-tab="amvassets"]');
    if (!tabBtn && tabsNav) {
      tabBtn = document.createElement('button');
      tabBtn.setAttribute('role', 'tab');
      tabBtn.dataset.tab = 'amvassets';
      tabBtn.setAttribute('aria-selected', 'false');
      tabBtn.title = 'Thư viện Asset chuyển động AMV & 10 Bộ Lọc Hậu Kỳ (Vizzy Style)';
      tabBtn.innerHTML = `🪄 Bộ Lọc AMV`;
      tabsNav.appendChild(tabBtn);
    }
    if (tabBtn) {
      tabBtn.addEventListener('click', () => {
        setTimeout(renderSideTabRack, 20);
      });
    }

    const openFullFromTab = document.getElementById('btnOpenFullModalFromTab');
    if (openFullFromTab) openFullFromTab.onclick = () => openModal('Bộ lọc hậu kỳ');

    // Render side tab rack immediately
    setTimeout(renderSideTabRack, 150);

    window.openAMVModal = openModal;
    hookMainRenderer();
  }

  function applyThemeSync(theme, palette) {
    state.currentTheme = theme;
    state.currentPalette = palette;
    const swatch = document.getElementById('amvActiveThemeSwatch');
    if (swatch && palette) {
      swatch.style.background = `linear-gradient(135deg, ${palette.primary || '#ff66aa'}, ${palette.secondary || '#66ffff'})`;
      swatch.style.boxShadow = `0 0 10px ${palette.primary || '#ff66aa'}88`;
      swatch.title = `Theme: ${theme}`;
    }
    const mEl = document.getElementById('amvAssetModal');
    if (mEl && theme) {
      mEl.setAttribute('data-theme', theme);
    }
    if (palette && palette.primary) {
      const themeSc = {
        accent: palette.primary,
        accent2: palette.secondary || palette.primary,
        fg: palette.cap || '#ffffff',
        bg: palette.bg || '#0c0a18',
        name: theme
      };
      const lib = getLibrary();
      for (const [cat, assetId] of Object.entries(state.activeAssets)) {
        if (!assetId) continue;
        const preset = lib && lib.getAsset(assetId);
        if (preset && preset.params) {
          if (!state.customParams[assetId]) state.customParams[assetId] = {};
          for (const [k, p] of Object.entries(preset.params)) {
            if ((typeof p.value === 'string' && p.value.startsWith('#')) || k.toLowerCase().includes('color')) {
              state.customParams[assetId][k] = mapParamToSchemeColor(k, themeSc);
            }
          }
        }
      }
    }
    triggerMainRedraw();
    return { theme, palette };
  }

  // ------------------------------------------------------------- Export API
  window.AMVAssetModalAPI = {
    open: openModal,
    close: closeModal,
    toggle: toggleModal,
    getState: () => state,
    getActiveAsset: (cat) => (cat === 'Phản ứng âm thanh' ? resolveActiveAudioVisualizerId() : state.activeAssets[cat]),
    hasActiveAudioVisualizer: () => Boolean(resolveActiveAudioVisualizerId() && getLibrary()),
    setActiveAsset: (cat, id) => {
      state.activeAssets[cat] = id;
      if (cat === 'Phản ứng âm thanh') {
        state.audioVisualizerOff = !id;
        if (window.AudioVisualizerAPI) {
          if (id) {
            if (typeof window.AudioVisualizerAPI.enable === 'function') window.AudioVisualizerAPI.enable(id);
          } else {
            if (typeof window.AudioVisualizerAPI.disable === 'function') window.AudioVisualizerAPI.disable();
          }
        }
      }
      updateStudioVisualizerBadge();
      triggerMainRedraw();
    },
    turnOffAudioVisualizer: () => {
      state.activeAssets['Phản ứng âm thanh'] = null;
      state.audioVisualizerOff = true;
      if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.disable === 'function') {
        window.AudioVisualizerAPI.disable();
      }
      persistState();
      renderCategoriesList();
      if (state.selectedCategory === 'Phản ứng âm thanh') renderPresetsForCategory('Phản ứng âm thanh');
      updateStudioVisualizerBadge();
      triggerMainRedraw();
    },
    syncThemeOneClick: syncAllActiveAssetsToTheme,
    turnOnAudioVisualizer: (presetId) => {
      state.audioVisualizerOff = false;
      const pId = presetId || 'audio_trap_nation_pro';
      const lib = getLibrary();
      const p = lib ? lib.get(pId) : null;
      // Safe fallback: if presetId cannot be resolved, fall back to audio_trap_nation_pro
      const targetId = p ? p.id : (lib && lib.get('audio_trap_nation_pro') ? 'audio_trap_nation_pro' : pId);
      state.activeAssets['Phản ứng âm thanh'] = targetId;
      if (window.AudioVisualizerAPI && typeof window.AudioVisualizerAPI.enable === 'function') {
        window.AudioVisualizerAPI.enable(targetId);
      }
      persistState();
      renderCategoriesList();
      if (state.selectedCategory === 'Phản ứng âm thanh') renderPresetsForCategory('Phản ứng âm thanh');
      updateStudioVisualizerBadge();
      triggerMainRedraw();
    },
    clearAll: clearAllActiveAssets,
    randomize: randomizeActiveAssets,
    updateVisualizerBadge: updateStudioVisualizerBadge,
    applyThemeSync: applyThemeSync,
    destroy: () => {
      if (hookInterval) {
        clearInterval(hookInterval);
        hookInterval = null;
      }
      stopPreviewLoop();
      previewCanvasMap.clear();
    }
  };

  // Init after DOM is ready
  try { ensureStyles(); } catch (_) {}
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      try { ensureStyles(); } catch (_) {}
      setTimeout(bindToolbarButtons, 150);
    });
  } else {
    setTimeout(bindToolbarButtons, 150);
  }

  hookInterval = setInterval(hookMainRenderer, 1000);
  hookMainRenderer();
})();
