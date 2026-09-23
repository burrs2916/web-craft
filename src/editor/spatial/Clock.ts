export type ClockListener = (time: ClockTime) => void;

export type PlaybackMode = 'realtime' | 'playback' | 'scrub';

export interface ClockTime {
  elapsed: number;
  delta: number;
  tick: number;
  timestamp: number;
  isPaused: boolean;
  speed: number;
  currentTime: number;
  timeRange: { start: number; end: number } | null;
  playbackMode: PlaybackMode;
}

export class Clock {
  private _startTime = 0;
  private _lastTime = 0;
  private _elapsed = 0;
  private _delta = 0;
  private _tick = 0;
  private _speed = 1;
  private _isPaused = false;
  private _isRunning = false;
  private _animFrameId: number | null = null;
  private _listeners: Set<ClockListener> = new Set();
  private _maxDelta = 0.1;
  private _currentTime = 0;
  private _timeRange: { start: number; end: number } | null = null;
  private _playbackMode: PlaybackMode = 'realtime';
  private _timeChangeHandlers: Set<(time: number, deltaTime: number) => void> = new Set();

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this._startTime = performance.now();
    this._lastTime = this._startTime;
    this._tick = 0;
    this._elapsed = 0;
    this._scheduleFrame();
  }

  stop(): void {
    this._isRunning = false;
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId);
      this._animFrameId = null;
    }
  }

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    if (!this._isRunning) {
      this.start();
      return;
    }
    this._isPaused = false;
    this._lastTime = performance.now();
  }

  setSpeed(speed: number): void {
    this._speed = Math.max(0.01, speed);
  }

  setMaxDelta(maxDelta: number): void {
    this._maxDelta = Math.max(0.001, maxDelta);
  }

  setCurrentTime(time: number): void {
    const oldTime = this._currentTime;
    this._currentTime = time;
    const deltaTime = this._currentTime - oldTime;
    this._timeChangeHandlers.forEach(handler => {
      try {
        handler(this._currentTime, deltaTime);
      } catch (err) {
        console.error('[Clock] Time change handler error:', err);
      }
    });
  }

  getCurrentTime(): number {
    return this._currentTime;
  }

  setTimeRange(start: number, end: number): void {
    this._timeRange = { start, end };
    if (this._currentTime < start) {
      this._currentTime = start;
    } else if (this._currentTime > end) {
      this._currentTime = end;
    }
  }

  getTimeRange(): { start: number; end: number } | null {
    return this._timeRange;
  }

  clearTimeRange(): void {
    this._timeRange = null;
  }

  setPlaybackMode(mode: PlaybackMode): void {
    this._playbackMode = mode;
  }

  getPlaybackMode(): PlaybackMode {
    return this._playbackMode;
  }

  seekTo(time: number): void {
    if (this._timeRange) {
      time = Math.max(this._timeRange.start, Math.min(this._timeRange.end, time));
    }
    this.setCurrentTime(time);
  }

  seekToStart(): void {
    if (this._timeRange) {
      this.seekTo(this._timeRange.start);
    }
  }

  seekToEnd(): void {
    if (this._timeRange) {
      this.seekTo(this._timeRange.end);
    }
  }

  onTimeChange(handler: (time: number, deltaTime: number) => void): () => void {
    this._timeChangeHandlers.add(handler);
    return () => {
      this._timeChangeHandlers.delete(handler);
    };
  }

  getTime(): ClockTime {
    return {
      elapsed: this._elapsed,
      delta: this._delta,
      tick: this._tick,
      timestamp: this._lastTime,
      isPaused: this._isPaused,
      speed: this._speed,
      currentTime: this._currentTime,
      timeRange: this._timeRange,
      playbackMode: this._playbackMode,
    };
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  subscribe(listener: ClockListener): () => void {
    this._listeners.add(listener);
    if (this._listeners.size > 0 && !this._isRunning) {
      this.start();
    }
    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size === 0 && this._isRunning) {
        this.stop();
      }
    };
  }

  private _scheduleFrame(): void {
    this._animFrameId = requestAnimationFrame((now) => {
      this._update(now);
      if (this._isRunning) {
        this._scheduleFrame();
      }
    });
  }

  private _update(now: number): void {
    const rawDelta = (now - this._lastTime) / 1000;
    this._lastTime = now;

    if (!this._isPaused) {
      this._delta = Math.min(rawDelta, this._maxDelta) * this._speed;
      this._elapsed += this._delta;
      this._tick++;

      if (this._playbackMode === 'playback' || this._playbackMode === 'scrub') {
        const oldTime = this._currentTime;
        this._currentTime += this._delta * 1000;
        if (this._timeRange && this._currentTime > this._timeRange.end) {
          this._currentTime = this._timeRange.end;
          if (this._playbackMode === 'playback') {
            this._isPaused = true;
          }
        }
        const deltaTime = this._currentTime - oldTime;
        if (deltaTime !== 0) {
          this._timeChangeHandlers.forEach(handler => {
            try {
              handler(this._currentTime, deltaTime);
            } catch (err) {
              console.error('[Clock] Time change handler error:', err);
            }
          });
        }
      } else {
        this._currentTime = Date.now();
      }
    } else {
      this._delta = 0;
    }

    const time = this.getTime();
    for (const listener of this._listeners) {
      try {
        listener(time);
      } catch (err) {
        console.error('[Clock] Listener error:', err);
      }
    }
  }

  destroy(): void {
    this.stop();
    this._listeners.clear();
    this._timeChangeHandlers.clear();
  }
}

export const globalClock = new Clock();
