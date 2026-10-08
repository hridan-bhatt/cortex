/**
 * Web Audio synth for tactical UI sound cues.
 * DEFAULT OFF: AudioContext is only created on explicit user toggle on.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let isEnabled = false;

const STORAGE_KEY = 'cortex_audio_enabled';

// Load stored preference (default false)
if (typeof window !== 'undefined') {
  try {
    isEnabled = localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (e) {
    isEnabled = false;
  }
}

function getAudioContext(): AudioContext | null {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(isEnabled ? 1.0 : 0.0, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export const soundManager = {
  get isEnabled() {
    return isEnabled;
  },

  setEnabled(enabled: boolean) {
    isEnabled = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
    } catch (e) {}

    if (enabled) {
      const ctx = getAudioContext();
      if (masterGain && ctx) {
        masterGain.gain.setValueAtTime(1.0, ctx.currentTime);
      }
    } else if (masterGain && audioCtx) {
      masterGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    }
  },

  toggle(): boolean {
    this.setEnabled(!isEnabled);
    return isEnabled;
  },

  play(name: 'tick' | 'glide' | 'ping' | 'fail' | 'fact') {
    if (!isEnabled) return;
    const ctx = getAudioContext();
    if (!ctx || !masterGain) return;

    const t = ctx.currentTime;

    try {
      if (name === 'tick') {
        // 'tick': 2ms noise burst + 1200Hz blip, gain 0.04 (node select / navigate)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(600, t + 0.025);

        gain.gain.setValueAtTime(0.04, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.028);

        // Noise burst
        const bufferSize = Math.floor(ctx.sampleRate * 0.003); // ~3ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = (Math.random() * 2 - 1) * 0.03;
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.02, t);
        noiseGain.gain.linearRampToValueAtTime(0, t + 0.003);
        noise.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start(t);
        noise.stop(t + 0.004);
      } else if (name === 'glide') {
        // 'glide': filtered noise swell 300ms, gain 0.06 (camera glides)
        const bufferSize = Math.floor(ctx.sampleRate * 0.3); // 300ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(400, t);
        filter.frequency.exponentialRampToValueAtTime(1200, t + 0.15);
        filter.frequency.exponentialRampToValueAtTime(300, t + 0.3);
        filter.Q.setValueAtTime(3.0, t);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, t);
        gain.gain.linearRampToValueAtTime(0.06, t + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        noise.start(t);
        noise.stop(t + 0.31);
      } else if (name === 'ping') {
        // 'ping': sine 880→440 sweep, 400ms, lowpassed, gain 0.08 (palette fly-to)
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.exponentialRampToValueAtTime(440, t + 0.4);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, t);

        gain.gain.setValueAtTime(0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.41);
      } else if (name === 'fail') {
        // 'fail': deep resonant sub-bass drop 180→60Hz, 200ms, gain 0.09 (cascade failure asserted)
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.20);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(320, t);

        gain.gain.setValueAtTime(0.09, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.23);
      } else if (name === 'fact') {
        // 'fact': crisp high crystalline blip 1100→1350Hz, 32ms, gain 0.05 (fact inferred / asserted)
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1100, t);
        osc.frequency.exponentialRampToValueAtTime(1350, t + 0.03);

        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.032);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + 0.035);
      }
    } catch (e) {
      // Audio safety: silent fallback
    }
  },
};

