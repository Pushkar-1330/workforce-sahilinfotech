/**
 * High-Fidelity Web Audio Synthesizer for Attendance & Leave Management
 * Produces pleasant, acoustic chime harmonics without relying on external MP3/WAV assets.
 */

// LocalStorage keys for audio preferences
const AUDIO_ENABLED_KEY = 'ams_sound_enabled';
const AUDIO_VOLUME_KEY = 'ams_sound_volume';

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => { });
    }
    return sharedAudioCtx;
  } catch (err) {
    console.warn('[Audio] Failed to initialize AudioContext:', err);
    return null;
  }
}

// User-gesture unlocker for browser autoplay policies
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().then(() => {
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      }).catch(() => { });
    }
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

export function isAudioEnabled(): boolean {
  try {
    const val = localStorage.getItem(AUDIO_ENABLED_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setAudioEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUDIO_ENABLED_KEY, String(enabled));
  } catch { }
}

export function getAudioVolume(): number {
  try {
    const val = localStorage.getItem(AUDIO_VOLUME_KEY);
    if (val !== null) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
    }
    return 0.75;
  } catch {
    return 0.75;
  }
}

export function setAudioVolume(vol: number): void {
  try {
    const clamped = Math.max(0, Math.min(1, vol));
    localStorage.setItem(AUDIO_VOLUME_KEY, clamped.toFixed(2));
  } catch { }
}

/**
 * Creates a single rich musical tone with layered fundamental and harmonic overtone
 */
function playHarmonicTone(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  duration: number,
  masterGainVal: number,
  type: 'sine' | 'triangle' = 'sine'
) {
  // Fundamental Oscillator
  const osc1 = ctx.createOscillator();
  const gain1 = ctx.createGain();
  osc1.type = type;
  osc1.frequency.setValueAtTime(freq, startTime);

  // Soft octave overtone for acoustic richness
  const osc2 = ctx.createOscillator();
  const gain2 = ctx.createGain();
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, startTime);

  // Filter for warmth
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(freq * 3.5, startTime);
  filter.Q.setValueAtTime(1.2, startTime);

  // ADSR Envelope: Fast attack (0.006s) to avoid click, smooth exponential decay
  const attack = 0.008;
  const decay = duration;

  gain1.gain.setValueAtTime(0.0001, startTime);
  gain1.gain.exponentialRampToValueAtTime(masterGainVal * 0.75, startTime + attack);
  gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);

  gain2.gain.setValueAtTime(0.0001, startTime);
  gain2.gain.exponentialRampToValueAtTime(masterGainVal * 0.22, startTime + attack);
  gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + decay * 0.7);

  osc1.connect(gain1);
  gain1.connect(filter);

  osc2.connect(gain2);
  gain2.connect(filter);

  filter.connect(ctx.destination);

  osc1.start(startTime);
  osc1.stop(startTime + decay + 0.05);

  osc2.start(startTime);
  osc2.stop(startTime + decay + 0.05);
}

/**
 * 1. PUNCH IN SOUND (Crisp, modern, welcoming 4-note ascending chime)
 * E5 (659Hz) -> G#5 (830Hz) -> B5 (988Hz) -> E6 (1319Hz)
 * Perfect tactile confirmation for checking in
 */
export function playPunchInSound(): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = getAudioVolume();
  const now = ctx.currentTime + 0.01;

  // 4 bright, sparkling marimba chime notes in rapid sequence
  const notes = [
    { f: 659.25, t: 0, d: 0.28, v: 0.28 * vol },
    { f: 830.61, t: 0.07, d: 0.28, v: 0.32 * vol },
    { f: 987.77, t: 0.14, d: 0.32, v: 0.35 * vol },
    { f: 1318.51, t: 0.21, d: 0.55, v: 0.40 * vol },
  ];

  notes.forEach(n => {
    playHarmonicTone(ctx, n.f, now + n.t, n.d, n.v, 'triangle');
  });
}

/**
 * 2. PUNCH OUT SOUND (Warm, soothing, concluding 3-note descending chime)
 * B5 (988Hz) -> G#5 (830Hz) -> E5 (659Hz)
 * Conveys shift completion and restful departure
 */
export function playPunchOutSound(): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = getAudioVolume();
  const now = ctx.currentTime + 0.01;

  const notes = [
    { f: 987.77, t: 0, d: 0.26, v: 0.35 * vol },
    { f: 830.61, t: 0.09, d: 0.30, v: 0.33 * vol },
    { f: 659.25, t: 0.18, d: 0.60, v: 0.38 * vol },
  ];

  notes.forEach(n => {
    playHarmonicTone(ctx, n.f, now + n.t, n.d, n.v, 'sine');
  });
}

/**
 * 3. LEAVE APPLICATION SUBMITTED SOUND
 * Elegant dual-tone paper/dispatch chime with rising shimmer
 * A4 (440Hz) rising to E5 (659Hz) with a resonant crystalline sparkle at C#6 (1108Hz)
 */
export function playLeaveSubmittedSound(): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = getAudioVolume();
  const now = ctx.currentTime + 0.01;

  // Note 1: Soft upward whoosh/pitch glide
  const oscGlide = ctx.createOscillator();
  const gainGlide = ctx.createGain();
  oscGlide.type = 'sine';
  oscGlide.frequency.setValueAtTime(440, now);
  oscGlide.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);

  gainGlide.gain.setValueAtTime(0.0001, now);
  gainGlide.gain.exponentialRampToValueAtTime(0.25 * vol, now + 0.02);
  gainGlide.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

  oscGlide.connect(gainGlide);
  gainGlide.connect(ctx.destination);
  oscGlide.start(now);
  oscGlide.stop(now + 0.25);

  // Note 2: Shimmering high confirmation bell
  playHarmonicTone(ctx, 880, now + 0.10, 0.35, 0.28 * vol, 'sine');
  playHarmonicTone(ctx, 1108.73, now + 0.18, 0.55, 0.32 * vol, 'triangle');
}

/**
 * 4. LEAVE APPROVED SOUND (Bright celebratory major fanfare chime)
 * C5 -> E5 -> G5 -> C6
 */
export function playLeaveApprovedSound(): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = getAudioVolume();
  const now = ctx.currentTime + 0.01;

  const notes = [
    { f: 523.25, t: 0, d: 0.22, v: 0.28 * vol },
    { f: 659.25, t: 0.08, d: 0.24, v: 0.32 * vol },
    { f: 783.99, t: 0.16, d: 0.28, v: 0.35 * vol },
    { f: 1046.50, t: 0.24, d: 0.60, v: 0.40 * vol },
  ];

  notes.forEach(n => {
    playHarmonicTone(ctx, n.f, now + n.t, n.d, n.v, 'triangle');
  });
}

/**
 * 5. LEAVE REJECTED / NOTICE SOUND (Gentle mellow double tone)
 * F4 (349Hz) -> D4 (293Hz) with soft low-pass filter
 */
export function playLeaveRejectedSound(): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = getAudioVolume();
  const now = ctx.currentTime + 0.01;

  const notes = [
    { f: 392.00, t: 0, d: 0.22, v: 0.25 * vol },
    { f: 329.63, t: 0.12, d: 0.35, v: 0.22 * vol },
  ];

  notes.forEach(n => {
    playHarmonicTone(ctx, n.f, now + n.t, n.d, n.v, 'sine');
  });
}

/**
 * 6. GENERAL NOTIFICATION CHIME (Modern dual glass ping)
 * 784Hz (G5) -> 1046Hz (C6)
 */
export function playNotificationChime(): void {
  if (!isAudioEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const vol = getAudioVolume();
  const now = ctx.currentTime + 0.01;

  playHarmonicTone(ctx, 783.99, now, 0.24, 0.30 * vol, 'sine');
  playHarmonicTone(ctx, 1046.50, now + 0.09, 0.45, 0.35 * vol, 'triangle');
}

/**
 * 7. TEST SOUND TRIGGER (Used in Audio Settings modal)
 */
export function testAudioTone(type: 'punch_in' | 'punch_out' | 'leave_submit' | 'leave_approve' | 'leave_reject' | 'notification'): void {
  switch (type) {
    case 'punch_in':
      playPunchInSound();
      break;
    case 'punch_out':
      playPunchOutSound();
      break;
    case 'leave_submit':
      playLeaveSubmittedSound();
      break;
    case 'leave_approve':
      playLeaveApprovedSound();
      break;
    case 'leave_reject':
      playLeaveRejectedSound();
      break;
    case 'notification':
    default:
      playNotificationChime();
      break;
  }
}
