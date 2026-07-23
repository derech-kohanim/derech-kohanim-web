import type { Language, VoiceClip } from '@dk/shared';

import { api } from '@/api';

import type { AssembledPhrase } from './phrase';

export type AnnouncementPriority = 'maneuver' | 'zone';

/** Silence marker in a clip sequence, not a real clip. */
const PAUSE_KEY = 'pause.short';
const PAUSE_SECONDS = 0.28;

export interface Announcement {
  /** Stable id, so the same instruction is never spoken twice. */
  id: string;
  /**
   * What this announcement is about: the manoeuvre id, or the zone. Two announcements with the
   * same group are the same situation at a different rung; different groups mean the vehicle has
   * moved on, which is when a mid-clip announcement is cut and the engine jumps to the current
   * one instead of chaining through the passed one.
   */
  groupId: string;
  phrase: AssembledPhrase;
  priority: AnnouncementPriority;
}

/**
 * Plays assembled clips through Web Audio, falls back to the device speech engine, and then
 * to nothing at all. Navigation never waits for audio: a missing clip shortens the
 * announcement, it does not delay it.
 *
 * Only one announcement is ever audible, and it is always the current one. Announcements that
 * are superseded while audio is busy are dropped, not queued: a single `pending` slot holds the
 * latest and is played when the current clip ends, so the voice can never fall behind the
 * vehicle by reading a backlog of passed manoeuvres.
 */
export class VoiceEngine {
  private context: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private spoken = new Set<string>();
  private playing: AudioBufferSourceNode[] = [];
  private enabled = true;

  /** The announcement whose audio is playing right now, or null when silent. */
  private current: Announcement | null = null;
  /** At most one waiting announcement, always the most recent; older ones are discarded. */
  private pending: Announcement | null = null;
  /** Bumped on every play/stop so a late end-callback from a superseded clip is ignored. */
  private sequence = 0;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Must be called from a user gesture, which is what unlocks audio in the browser. */
  unlock(): void {
    if (this.context) {
      void this.context.resume();
      return;
    }
    try {
      this.context = new AudioContext();
    } catch {
      this.context = null;
    }
  }

  reset(): void {
    this.spoken.clear();
    this.stop();
  }

  /** Fetches every clip the route will need, while the driver is still parked. */
  async preload(keys: string[], language: Language, voiceId: string): Promise<void> {
    if (keys.length === 0) return;
    let clips: VoiceClip[] = [];
    try {
      const response = await api.resolveVoiceClips({ language, voiceId, keys });
      clips = response.clips;
    } catch {
      return;
    }
    await Promise.all(clips.map((clip) => this.load(clip)));
  }

  private async load(clip: VoiceClip): Promise<void> {
    if (!this.context || this.buffers.has(clip.key)) return;
    try {
      const response = await fetch(clip.url);
      const bytes = await response.arrayBuffer();
      this.buffers.set(clip.key, await this.context.decodeAudioData(bytes));
    } catch {
      /* the fallback ladder takes it from here */
    }
  }

  /** For logging and verification: what the assembler produced for this announcement. */
  onAnnounce?: (text: string, channel: 'clips' | 'speech' | 'silent') => void;

  announce(announcement: Announcement): void {
    if (!this.enabled) return;
    if (this.spoken.has(announcement.id)) return;
    this.spoken.add(announcement.id);

    // A zone warning outranks everything and interrupts whatever is playing, clearing any
    // backlog so it is heard immediately.
    if (announcement.priority === 'zone') {
      this.stop();
      this.play(announcement);
      return;
    }

    // Nothing playing: speak it now.
    if (!this.current) {
      this.play(announcement);
      return;
    }

    // Never cut a zone warning short with a driving instruction; let it finish, then this one
    // becomes the current situation.
    if (this.current.priority === 'zone') {
      this.pending = announcement;
      return;
    }

    // Same manoeuvre, a nearer rung: don't stutter by cutting. Let the short current clip finish
    // and then play the latest rung, dropping any intermediate rungs.
    if (this.current.groupId === announcement.groupId) {
      this.pending = announcement;
      return;
    }

    // A different manoeuvre: the vehicle has passed the one being spoken. Drop it and jump
    // straight to the current instruction rather than chaining through the stale one.
    this.stop();
    this.play(announcement);
  }

  /** Assembles and starts an announcement, arranging for the next pending one to follow it. */
  private play(announcement: Announcement): void {
    this.current = announcement;
    this.sequence += 1;
    const token = this.sequence;
    const complete = () => {
      if (token === this.sequence) this.finish();
    };

    const { clipKeys, utterances, text } = announcement.phrase;
    const realKeys = clipKeys.filter((key) => key !== PAUSE_KEY);
    const haveAllClips =
      this.context !== null && realKeys.length > 0 && realKeys.every((key) => this.buffers.has(key));

    if (haveAllClips) {
      const duration = this.playSequence(clipKeys, complete);
      this.onAnnounce?.(text, 'clips');
      this.armSafety(duration, complete);
      return;
    }

    if (this.speakSequence(utterances, complete)) {
      this.onAnnounce?.(text, 'speech');
      this.armSafety(estimateSpeechSeconds(utterances), complete);
      return;
    }

    // Nothing to play: it is "over" instantly, so let any pending one through immediately.
    this.onAnnounce?.(text, 'silent');
    this.finish();
  }

  /** Current audio finished (or its safety timer fired): promote the latest pending, if any. */
  private finish(): void {
    this.clearEndTimer();
    this.current = null;
    this.playing = [];
    const next = this.pending;
    this.pending = null;
    if (next && this.enabled) this.play(next);
  }

  /**
   * Plays clips in order, honouring the pause marker as real silence between segments. Calls
   * `onComplete` when the last real clip ends and returns the total scheduled duration.
   */
  private playSequence(clipKeys: string[], onComplete: () => void): number {
    if (!this.context) {
      onComplete();
      return 0;
    }
    const start = this.context.currentTime;
    let at = start;
    let last: AudioBufferSourceNode | null = null;
    for (const key of clipKeys) {
      if (key === PAUSE_KEY) {
        at += PAUSE_SECONDS;
        continue;
      }
      const buffer = this.buffers.get(key);
      if (!buffer) continue;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      source.start(at);
      at += buffer.duration;
      this.playing.push(source);
      last = source;
    }
    if (last) last.onended = () => onComplete();
    else onComplete();
    return at - start;
  }

  /**
   * Speaks each segment as its own utterance. Queuing them separately is what puts a natural
   * pause between the distance clause and the action clause. `onComplete` fires after the last.
   */
  private speakSequence(utterances: string[], onComplete: () => void): boolean {
    if (typeof speechSynthesis === 'undefined') return false;
    const lang = document.documentElement.lang === 'en' ? 'en-GB' : 'he-IL';
    const texts = utterances.map((text) => text.trim()).filter(Boolean);
    if (texts.length === 0) return false;
    try {
      texts.forEach((text, index) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        if (index === texts.length - 1) utterance.onend = () => onComplete();
        speechSynthesis.speak(utterance);
      });
    } catch {
      return false;
    }
    return true;
  }

  /** Backstop so a dropped end-event can never strand `current` and mute all later guidance. */
  private armSafety(seconds: number, complete: () => void): void {
    this.clearEndTimer();
    const ms = Math.max(500, Math.round(seconds * 1000) + 600);
    this.endTimer = setTimeout(complete, ms);
  }

  private clearEndTimer(): void {
    if (this.endTimer !== null) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
  }

  stop(): void {
    // Invalidate any outstanding end-callbacks so a stopped clip cannot promote a pending one.
    this.sequence += 1;
    this.clearEndTimer();
    for (const source of this.playing) {
      try {
        source.stop();
      } catch {
        /* already finished */
      }
    }
    this.playing = [];
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    this.current = null;
    this.pending = null;
  }
}

/** Generous upper bound on how long the speech engine will take, for the safety timer only. */
function estimateSpeechSeconds(utterances: string[]): number {
  const chars = utterances.join(' ').length;
  return 1 + chars * 0.09;
}

export const voiceEngine = new VoiceEngine();
