/**
 * JIZURA STUDIO - Smart Audio Timeline & Anti-Glitch Beat/Transient Engine v2.0
 * Nâng cấp: Xử lý âm thanh đa băng tần (Sub-bass Kick & Mid-punch Snare),
 * Ngưỡng thích ứng động (Dynamic Adaptive Threshold), Lọc khử nhiễu/glitch âm thanh (Anti-Glitch Spike Rejection),
 * Chống spam trigger (Debounce Refractory Window), hỗ trợ phân loại cường độ và phân bổ vế Trái/Phải thông minh.
 */

export async function detectAudioBeats(audioInput, opts = {}) {
  const {
    threshold = 1.38,
    minGap = 0.28,             // Debounce tối thiểu 280ms chống spam trigger liên hồi
    bassFreq = 140,            // Tần số cắt lọc Sub-bass / Kick (Hz)
    midLow = 500,              // Dải lọc Mid-punch (Snare/Clap) bắt đầu (Hz)
    midHigh = 2200,            // Dải lọc Mid-punch kết thúc (Hz)
    antiGlitch = true,         // Bật lọc loại trừ spike giật/nhiễu tần số cao
  } = opts;

  if (!audioInput) throw new Error('audioInput is required (Blob or AudioBuffer)');

  let audioBuffer;
  if (audioInput instanceof AudioBuffer) {
    audioBuffer = audioInput;
  } else {
    const arrayBuffer = await audioInput.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AC();
    try {
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
      try { await audioCtx.close(); } catch (e) {}
    }
  }

  const sampleRate = audioBuffer.sampleRate;
  if (audioBuffer.numberOfChannels === 0 || audioBuffer.length === 0) {
    return { beats: [], triggers: [] };
  }

  const channelCount = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  // 1. Chuyển thành Mono Downmix
  const mono = new Float32Array(length);
  for (let c = 0; c < channelCount; c++) {
    const chData = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += chData[i] / channelCount;
    }
  }

  // 2. Chạy OfflineAudioContext tách băng tần Sub-Bass (Kick/808) & Mid-Punch (Snare/Clap)
  // và loại bỏ hoàn toàn nhiễu tần số cao / click / glitch pop
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const src = offlineCtx.createBufferSource();
  const tempBuf = offlineCtx.createBuffer(1, length, sampleRate);
  tempBuf.copyToChannel(mono, 0);
  src.buffer = tempBuf;

  // Kênh 1: Lowpass Sub-Bass
  const bassFilter = offlineCtx.createBiquadFilter();
  bassFilter.type = 'lowpass';
  bassFilter.frequency.value = bassFreq;
  bassFilter.Q.value = 1.0;

  // Kênh 2: Bandpass Mid-Punch
  const midFilter = offlineCtx.createBiquadFilter();
  midFilter.type = 'bandpass';
  midFilter.frequency.value = (midLow + midHigh) / 2;
  midFilter.Q.value = 1.2;

  const merger = offlineCtx.createChannelMerger(2);

  src.connect(bassFilter);
  bassFilter.connect(merger, 0, 0); // Kênh 0 = Bass

  src.connect(midFilter);
  midFilter.connect(merger, 0, 1);  // Kênh 1 = Mid

  merger.connect(offlineCtx.destination);
  src.start(0);

  const filteredBuffer = await offlineCtx.startRendering();
  const bassData = filteredBuffer.getChannelData(0);
  const midData = filteredBuffer.getChannelData(1);

  // 3. Phân tích Onset & Năng lượng với Sliding Window (30ms)
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.03));
  const numWindows = Math.floor(length / windowSize);

  const rawEnergy = new Float32Array(numWindows);
  const bandSource = new Uint8Array(numWindows); // 0 = Bass, 1 = Mid

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSize;
    const end = Math.min(start + windowSize, length);
    const winLen = end - start;

    let bSum = 0;
    let mSum = 0;
    for (let i = start; i < end; i++) {
      bSum += Math.abs(bassData[i]);
      mSum += Math.abs(midData[i]);
    }

    const bEnergy = bSum / winLen;
    const mEnergy = mSum / winLen;

    // Trọng số ưu tiên nhịp Bass (Kick) hơn Mid (Snare), hoàn toàn miễn nhiễm với glitch cao tần
    if (bEnergy * 1.25 >= mEnergy) {
      rawEnergy[w] = bEnergy * 1.25;
      bandSource[w] = 0;
    } else {
      rawEnergy[w] = mEnergy * 0.85;
      bandSource[w] = 1;
    }
  }

  // 4. Phát hiện nhịp thông minh với Dynamic Adaptive Threshold & Debounce Window
  const triggers = [];
  const beats = [];
  const minEnergyFloor = 0.012; // Ngưỡng sàn loại trừ tạp âm nền / xì tĩnh
  let localAvg = 0;
  let dynamicThresholdMul = threshold;
  let lastBeatTime = -minGap;
  let sideToggle = false;

  for (let w = 1; w < numWindows - 1; w++) {
    const currentTime = (w * windowSize) / sampleRate;
    const instantEnergy = rawEnergy[w];
    const prevEnergy = rawEnergy[w - 1];
    const nextEnergy = rawEnergy[w + 1];

    // Phát hiện đỉnh cục bộ (Local Peak)
    const isLocalPeak = instantEnergy >= prevEnergy && instantEnergy >= nextEnergy;

    // Kiểm tra Anti-Glitch: Nếu năng lượng tăng đột ngột bất thường (> 5x) trong 1 frame duy nhất
    // nhưng frame kế tiếp tụt dốc ngay lập tức, đây là xung glitch/click -> bỏ qua
    if (antiGlitch && isLocalPeak) {
      const riseRatio = instantEnergy / Math.max(1e-4, prevEnergy);
      const fallRatio = instantEnergy / Math.max(1e-4, nextEnergy);
      if (riseRatio > 4.5 && fallRatio > 4.5 && instantEnergy < 0.15) {
        // Bỏ qua glitch spike
        continue;
      }
    }

    const currentThreshold = Math.max(minEnergyFloor, localAvg * dynamicThresholdMul);

    // Điều kiện Trigger: Vượt ngưỡng thích ứng, đạt đỉnh năng lượng, và đã qua khoảng chờ minGap (chống spam)
    if (isLocalPeak && instantEnergy > currentThreshold && (currentTime - lastBeatTime) >= minGap) {
      const energyRatio = instantEnergy / Math.max(1e-4, localAvg);
      const intensity = energyRatio > 2.2 ? 'heavy' : (energyRatio > 1.5 ? 'medium' : 'light');
      const side = sideToggle ? 'right' : 'left';
      sideToggle = !sideToggle;

      const triggerObj = {
        time: +currentTime.toFixed(3),
        intensity,
        band: bandSource[w] === 0 ? 'bass' : 'mid',
        energy: +instantEnergy.toFixed(4),
        side,
        index: triggers.length + 1
      };

      triggers.push(triggerObj);
      beats.push(+currentTime.toFixed(3));
      lastBeatTime = currentTime;

      // Ngay sau khi trigger, nâng ngưỡng động lên để triệt tiêu các dư âm micro-bounce ngay sau đó
      dynamicThresholdMul = threshold * 1.55;
    } else {
      // Hồi phục dần ngưỡng động về mức tiêu chuẩn (Decay)
      dynamicThresholdMul = Math.max(threshold, dynamicThresholdMul * 0.96);
    }

    // Cập nhật Running Average (trung bình trượt mềm mại)
    localAvg = localAvg === 0 ? instantEnergy : (localAvg * 0.92 + instantEnergy * 0.08);
  }

  return {
    beats,
    triggers,
    sampleRate,
    duration: audioBuffer.duration
  };
}
