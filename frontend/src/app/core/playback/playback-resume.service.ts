import { effect, inject, Injectable } from '@angular/core';
import { ShellState } from '../shell/shell.state';

/** Max time to resume after leaving the feed tab (ms). */
export const TAB_RETURN_TTL_MS = 60_000;

/** Max time to resume after scrolling away from a video (ms). */
export const SCROLL_RETURN_TTL_MS = 3_000;

const FEED_RESUME_STORAGE_KEY = 'scroll-me.feed-resume';

/** Ensures reload is detected only once per app session (not on component remount). */
let reloadHandled = false;

/** True only on the first call when the app booted from a hard reload (F5). */
export function isPageReload(): boolean {
  if (reloadHandled) {
    return false;
  }
  reloadHandled = true;
  const nav = performance.getEntriesByType(
    'navigation',
  )[0] as PerformanceNavigationTiming | undefined;
  if (nav?.type === 'reload') {
    return true;
  }
  const legacy = performance.navigation;
  return legacy?.type === legacy.TYPE_RELOAD;
}

interface PlaybackCheckpoint {
  currentTime: number;
  savedAt: number;
}

export interface TabLeaveCheckpoint {
  postId: string;
  currentTime: number;
}

interface StoredFeedResume extends PlaybackCheckpoint {
  postId: string;
}

@Injectable({ providedIn: 'root' })
export class PlaybackResumeService {
  private readonly shell = inject(ShellState);

  private readonly scrollCheckpoints = new Map<string, PlaybackCheckpoint>();
  private feedSnapshot: StoredFeedResume | null = null;

  constructor() {
    if (isPageReload()) {
      this.clearAll();
    }

    let lastTab = this.shell.tab();
    effect(() => {
      const tab = this.shell.tab();
      if (lastTab === 'feed' && tab !== 'feed') {
        this.flushFeedResumeToStorage();
      }
      lastTab = tab;
    });
  }

  /** Feed keeps this fresh while visible; also persisted to sessionStorage. */
  updateFeedSnapshot(postId: string, currentTime: number): void {
    if (!postId) {
      return;
    }
    const checkpoint: StoredFeedResume = {
      postId,
      currentTime: Math.max(0, currentTime),
      savedAt: Date.now(),
    };
    this.feedSnapshot = checkpoint;
    this.persistFeedResumeToStorage(checkpoint);
  }

  saveScroll(postId: string, currentTime: number): void {
    if (currentTime <= 0) {
      this.scrollCheckpoints.delete(postId);
      return;
    }
    this.scrollCheckpoints.set(postId, {
      currentTime,
      savedAt: Date.now(),
    });
  }

  consumeScroll(postId: string): number | null {
    const checkpoint = this.scrollCheckpoints.get(postId);
    if (!checkpoint) {
      return null;
    }
    this.scrollCheckpoints.delete(postId);
    if (Date.now() - checkpoint.savedAt > SCROLL_RETURN_TTL_MS) {
      return null;
    }
    return checkpoint.currentTime;
  }

  consumeTabLeave(): TabLeaveCheckpoint | null {
    const saved = this.feedSnapshot ?? this.readFeedResumeFromStorage();
    this.feedSnapshot = null;
    this.clearFeedResumeStorage();

    if (!saved) {
      return null;
    }
    if (Date.now() - saved.savedAt > TAB_RETURN_TTL_MS) {
      return null;
    }
    if (!saved.postId) {
      return null;
    }
    return { postId: saved.postId, currentTime: saved.currentTime };
  }

  clearAll(): void {
    this.scrollCheckpoints.clear();
    this.feedSnapshot = null;
    this.clearFeedResumeStorage();
  }

  private flushFeedResumeToStorage(): void {
    if (this.feedSnapshot) {
      this.persistFeedResumeToStorage(this.feedSnapshot);
      return;
    }
    const stored = this.readFeedResumeFromStorage();
    if (stored) {
      this.persistFeedResumeToStorage(stored);
    }
  }

  private persistFeedResumeToStorage(checkpoint: StoredFeedResume): void {
    try {
      sessionStorage.setItem(
        FEED_RESUME_STORAGE_KEY,
        JSON.stringify(checkpoint),
      );
    } catch {
      // ignore storage errors
    }
  }

  private readFeedResumeFromStorage(): StoredFeedResume | null {
    try {
      const raw = sessionStorage.getItem(FEED_RESUME_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as StoredFeedResume;
      if (
        typeof parsed.postId !== 'string' ||
        typeof parsed.currentTime !== 'number' ||
        typeof parsed.savedAt !== 'number'
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private clearFeedResumeStorage(): void {
    try {
      sessionStorage.removeItem(FEED_RESUME_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}
