import { Injectable, signal } from '@angular/core';

export type ShellTab = 'feed' | 'create' | 'profile';

@Injectable({ providedIn: 'root' })
export class ShellState {
  readonly tab = signal<ShellTab>('feed');
  readonly profileReloadTick = signal(0);
  readonly feedReloadTick = signal(0);
  readonly pendingVideoFile = signal<File | null>(null);

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
  }

  openCreate(): void {
    this.tab.set('create');
  }

  openOwnProfile(): void {
    this.tab.set('profile');
  }
}
