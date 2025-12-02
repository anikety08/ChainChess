// Simple sound manager for move sounds
export class SoundManager {
  private static instance: SoundManager;
  private enabled: boolean = true;

  private constructor() {
    // Check if user has interacted with page (required for audio)
    if (typeof window !== 'undefined') {
      document.addEventListener('click', () => {
        this.enabled = true;
      }, { once: true });
    }
  }

  static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  playMove() {
    if (!this.enabled) return;
    this.playTone(200, 50);
  }

  playCapture() {
    if (!this.enabled) return;
    this.playTone(150, 80);
  }

  playCheck() {
    if (!this.enabled) return;
    this.playTone(400, 100);
  }

  playCheckmate() {
    if (!this.enabled) return;
    this.playTone(300, 200);
    setTimeout(() => this.playTone(400, 200), 100);
    setTimeout(() => this.playTone(500, 300), 200);
  }

  private playTone(frequency: number, duration: number) {
    if (typeof window === 'undefined' || !window.AudioContext) return;
    
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
      // Silently fail if audio context is not available
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }
}

