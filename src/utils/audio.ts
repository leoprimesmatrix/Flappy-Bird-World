// Web Audio Context for synthesized sounds
let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
};

const playSynthesizedSound = (type: 'hover' | 'click') => {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  const now = ctx.currentTime;

  if (type === 'hover') {
    // A soft, subtle percussive click
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(400, now);
    oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.05);

    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.05, now + 0.005);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    oscillator.start(now);
    oscillator.stop(now + 0.05);
  } else if (type === 'click') {
    // A more premium, dampened wooden click
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(300, now);
    oscillator.frequency.exponentialRampToValueAtTime(50, now + 0.08);

    gainNode.gain.setValueAtTime(0.2, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    // Add a second harmonic for a "clack"
    const noise = ctx.createOscillator();
    const noiseGain = ctx.createGain();
    noise.type = 'square';
    noise.frequency.setValueAtTime(800, now);
    noise.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseGain.gain.setValueAtTime(0.03, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.02);

    oscillator.start(now);
    oscillator.stop(now + 0.08);
    noise.start(now);
    noise.stop(now + 0.02);
  }
};

export const playSound = (type: 'flap' | 'score' | 'hit' | 'die' | 'hover' | 'click') => {
  if (type === 'hover' || type === 'click') {
    playSynthesizedSound(type);
    return;
  }

  const sounds = {
    // flap: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b8f7f45c.mp3?filename=swoosh-sound-effect-for-fight-scenes-149889.mp3',
    // score: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_bb630cc098.mp3?filename=coin-win-4799.mp3',
    // hit: 'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3?filename=punch-140236.mp3',
    // die: 'https://cdn.pixabay.com/download/audio/2021/08/04/audio_c6ccf3232f.mp3?filename=negative_beeps-6008.mp3',
    flap: 'https://raw.githubusercontent.com/ImKennyYip/flappy-bird/master/sfx_wing.wav',
    score: 'https://raw.githubusercontent.com/ImKennyYip/flappy-bird/master/sfx_point.wav',
    hit: 'https://raw.githubusercontent.com/ImKennyYip/flappy-bird/master/sfx_hit.wav',
    die: 'https://raw.githubusercontent.com/ImKennyYip/flappy-bird/master/sfx_die.wav',
  };

  const audio = new Audio((sounds as any)[type]);
  audio.volume = 0.5;
  audio.play().catch(() => { });
};
