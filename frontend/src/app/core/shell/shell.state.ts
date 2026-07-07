import { Injectable, signal } from '@angular/core';

export const MUTED_STORAGE_KEY = 'scroll-me.muted';

function readMutedFromSession(): boolean {
  try {
    const stored = sessionStorage.getItem(MUTED_STORAGE_KEY);
    if (stored === null) {
      return true;
    }
    return stored === 'true';
  } catch {
    return true;
  }
}

export function clearMutedStorage(): void {
  try {
    sessionStorage.removeItem(MUTED_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

export type ShellTab = 'feed' | 'create' | 'profile';

export interface ProfileReelState {
  username: string;
  startPostId: string;
}

export type ProfileReturnContext =
  | { type: 'feed' }
  | { type: 'comments'; postId: string }
  | { type: 'reel'; username: string; startPostId: string }
  | null;

@Injectable({ providedIn: 'root' })
export class ShellState {
  readonly tab = signal<ShellTab>('feed');
  readonly profileUsername = signal<string | null>(null);
  readonly profileReel = signal<ProfileReelState | null>(null);
  readonly profileReturnContext = signal<ProfileReturnContext>(null);
  readonly pendingCommentsPostId = signal<string | null>(null);
  readonly editProfileOpen = signal(false);
  readonly loginPromptOpen = signal(false);
  readonly loginPromptAction = signal<string | null>(null);
  readonly profileReloadTick = signal(0);
  readonly feedReloadTick = signal(0);
  readonly pendingVideoFile = signal<File | null>(null);
  readonly feedMuted = signal(readMutedFromSession());

  toggleFeedMuted(): void {
    this.feedMuted.update((muted) => {
      const next = !muted;
      this.persistMuted(next);
      return next;
    });
  }

  resetFeedMutedPreference(): void {
    clearMutedStorage();
    this.feedMuted.set(true);
  }

  private persistMuted(muted: boolean): void {
    try {
      sessionStorage.setItem(MUTED_STORAGE_KEY, String(muted));
    } catch {
      // ignore storage errors
    }
  }

  bumpProfileReload(): void {
    this.profileReloadTick.update((value) => value + 1);
  }

  bumpFeedReload(): void {
    this.feedReloadTick.update((value) => value + 1);
  }

  consumePendingVideoFile(): File | null {
    const file = this.pendingVideoFile();
    this.pendingVideoFile.set(null);
    return file;
  }

  openFeed(): void {
    this.tab.set('feed');
    this.profileUsername.set(null);
    this.profileReel.set(null);
    this.profileReturnContext.set(null);
  }

  openCreate(): void {
    this.tab.set('create');
    this.profileReel.set(null);
    this.profileReturnContext.set(null);
  }

  openOwnProfile(): void {
    this.tab.set('profile');
    this.profileUsername.set(null);
    this.profileReel.set(null);
    this.profileReturnContext.set(null);
  }

  openUserProfile(username: string, returnContext?: ProfileReturnContext): void {
    if (returnContext !== undefined) {
      this.profileReturnContext.set(returnContext);
    }
    this.tab.set('profile');
    this.profileUsername.set(username);
    this.profileReel.set(null);
  }

  goBackFromProfile(): void {
    const context = this.profileReturnContext();
    this.profileReturnContext.set(null);
    this.profileUsername.set(null);

    switch (context?.type) {
      case 'feed':
        this.tab.set('feed');
        this.profileReel.set(null);
        break;
      case 'comments':
        this.pendingCommentsPostId.set(context.postId);
        this.tab.set('feed');
        this.profileReel.set(null);
        break;
      case 'reel':
        this.tab.set('profile');
        this.profileUsername.set(context.username);
        this.profileReel.set({
          username: context.username,
          startPostId: context.startPostId,
        });
        break;
      default:
        this.openFeed();
    }
  }

  openProfileReel(username: string, startPostId: string): void {
    this.profileReel.set({ username, startPostId });
  }

  closeProfileReel(): void {
    this.profileReel.set(null);
  }

  openEditProfile(): void {
    this.editProfileOpen.set(true);
  }

  closeEditProfile(): void {
    this.editProfileOpen.set(false);
  }

  openLoginPrompt(action: string): void {
    this.loginPromptAction.set(action);
    this.loginPromptOpen.set(true);
  }

  closeLoginPrompt(): void {
    this.loginPromptOpen.set(false);
    this.loginPromptAction.set(null);
  }
}
