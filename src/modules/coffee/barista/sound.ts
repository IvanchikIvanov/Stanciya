'use client';

let audioCtx: AudioContext | null = null;

export function unlockAudioContext(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return false;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return true;
  } catch {
    return false;
  }
}

export function playNewOrderBeep(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!unlockAudioContext() || !audioCtx) return false;

    const now = audioCtx.currentTime;
    // Двухтональный приятный сигнал уведомления (587 Гц D5 -> 880 Гц A5)
    const freqs = [587.33, 880];
    freqs.forEach((freq, idx) => {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);

      gain.gain.setValueAtTime(0.001, now + idx * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.16 + 0.15);

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.start(now + idx * 0.16);
      osc.stop(now + idx * 0.16 + 0.16);
    });

    return true;
  } catch {
    return false;
  }
}
