import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import Hls from 'hls.js';

const HLS_MIME = 'application/vnd.apple.mpegurl';

@Component({
  selector: 'app-video-player',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-player.component.html',
  styleUrls: ['./video-player.component.scss'],
})
export class VideoPlayerComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  @Input() src: string | null = null;
  @Input() active = false;
  @Input() preload = false;
  @Input() muted = true;
  @Input() resumeFrom: number | null = null;

  @Output() fatalError = new EventEmitter<void>();
  @Output() resumeApplied = new EventEmitter<void>();

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  playing = false;
  buffering = false;
  firstFrameReady = false;
  failed = false;
  userPaused = false;
  progress = 0;

  private hls: Hls | null = null;
  private loadedSrc: string | null = null;
  private bound = false;
  private pendingSeek: number | null = null;
  private seekBeforePlay = false;
  private preloadStopped = false;
  private seekBufferListener: (() => void) | null = null;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.syncPlayer();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['resumeFrom']) {
      const next = changes['resumeFrom'].currentValue as number | null;
      if (next != null && next > 0) {
        this.pendingSeek = next;
      }
    }

    if (
      changes['active']?.currentValue === true &&
      this.resumeFrom != null &&
      this.resumeFrom > 0
    ) {
      this.pendingSeek = this.resumeFrom;
    }

    if (changes['src'] && this.active && this.resumeFrom != null && this.resumeFrom > 0) {
      this.pendingSeek = this.resumeFrom;
    }

    if (changes['src']) {
      this.firstFrameReady = false;
    }

    if (changes['active']?.currentValue === true) {
      this.firstFrameReady = false;
      if (!this.src) {
        this.setBuffering(true);
      }
    } else if (changes['active']?.currentValue === false) {
      this.setBuffering(false);
      this.firstFrameReady = false;
    }

    if (this.videoRef) {
      this.syncPlayer();
    }

    if (changes['muted'] && this.videoRef) {
      this.videoRef.nativeElement.muted = this.muted;
    }
  }

  ngOnDestroy(): void {
    const video = this.videoRef?.nativeElement;
    if (video) {
      this.teardown(video);
    }
  }

  get showSpinner(): boolean {
    return (
      this.active &&
      !this.failed &&
      !this.userPaused &&
      (this.buffering || !this.firstFrameReady)
    );
  }

  getCurrentTime(): number {
    return this.videoRef?.nativeElement?.currentTime ?? 0;
  }

  seekTo(time: number): void {
    if (time <= 0) {
      return;
    }
    this.pendingSeek = time;
    const video = this.videoRef?.nativeElement;
    if (!video || this.loadedSrc !== this.src) {
      return;
    }
    if (this.hls && this.active) {
      if (!this.isTimeSeekable(video, time)) {
        this.hls.stopLoad();
        this.hls.startLoad(time);
        this.seekBeforePlay = true;
        this.waitForResumeBuffer(video, this.hls);
        return;
      }
    }
    void this.applyPendingSeek(video);
  }

  pause(): void {
    const video = this.videoRef?.nativeElement;
    if (video) {
      video.pause();
    }
  }

  togglePlay(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || !this.src || !this.active) {
      return;
    }

    if (video.paused) {
      this.userPaused = false;
      void video.play().catch(() => this.setPlaying(false));
    } else {
      this.userPaused = true;
      video.pause();
    }
    this.cdr.markForCheck();
  }

  private shouldLoad(): boolean {
    return (this.active || this.preload) && !!this.src;
  }

  private syncPlayer(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) {
      return;
    }

    this.bindEvents(video);
    video.muted = this.muted;
    video.loop = true;

    if (this.shouldLoad()) {
      const preloadOnly = this.preload && !this.active;
      this.load(video, this.src!, preloadOnly);

      if (this.active) {
        if (!this.src) {
          this.setBuffering(true);
        }
        this.userPaused = false;
        if (this.resumeFrom != null && this.resumeFrom > 0) {
          this.pendingSeek = this.resumeFrom;
        }
        this.resumePreloadIfNeeded();
        const hlsReady = !!this.hls && this.hls.levels.length > 0;
        if (hlsReady) {
          this.beginActivePlayback(video, this.hls!);
        } else if (!this.hls && video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          this.beginActivePlayback(video);
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          this.markFirstFrameReady();
        }
      } else if (!this.hasPendingResume()) {
        this.seekBeforePlay = false;
        this.pauseAtFirstFrame(video);
      }
    } else {
      this.teardown(video);
    }
  }

  private bindEvents(video: HTMLVideoElement): void {
    if (this.bound) {
      return;
    }
    this.bound = true;

    video.addEventListener('canplay', () => {
      if (this.active) {
        if (!this.applyPendingSeek(video)) {
          this.tryAutoplay(video);
        }
      } else if (this.preload) {
        this.pauseAtFirstFrame(video);
      }
    });

    video.addEventListener('seeked', () => {
      this.onSeekCompleted(video);
    });

    video.addEventListener('loadeddata', () => {
      if (this.active && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.markFirstFrameReady();
      }
      if (this.preload && !this.active) {
        this.pauseAtFirstFrame(video);
      }
    });

    video.addEventListener('playing', () => {
      this.setPlaying(true);
      this.setBuffering(false);
      this.markFirstFrameReady();
    });

    video.addEventListener('canplay', () => {
      if (this.active && !this.seekBeforePlay) {
        this.setBuffering(false);
      }
    });

    video.addEventListener('canplaythrough', () => {
      if (this.active && !this.seekBeforePlay) {
        this.setBuffering(false);
      }
    });

    video.addEventListener('pause', () => this.setPlaying(false));
    video.addEventListener('waiting', () => {
      if (this.active && !this.userPaused) {
        this.setBuffering(true);
      }
    });
    video.addEventListener('stalled', () => {
      if (this.active && !this.userPaused) {
        this.setBuffering(true);
      }
    });
    video.addEventListener('timeupdate', () => this.updateProgress(video));

    video.addEventListener('ended', () => {
      if (!this.active) {
        return;
      }
      video.currentTime = 0;
      void video.play().catch(() => this.setPlaying(false));
    });

    video.addEventListener('error', () => this.fail());
  }

  private tryAutoplay(video: HTMLVideoElement): void {
    if (
      !this.active ||
      this.userPaused ||
      !this.src ||
      video.paused === false ||
      this.seekBeforePlay ||
      this.hasPendingResume()
    ) {
      return;
    }
    if (this.applyPendingSeek(video)) {
      return;
    }
    video.muted = this.muted;
    void video.play().catch(() => this.setPlaying(false));
  }

  private pauseAtFirstFrame(video: HTMLVideoElement): void {
    video.pause();
    try {
      if (video.currentTime > 0.05) {
        video.currentTime = 0;
      }
    } catch {
      // Safari may reject seek before enough data is buffered.
    }
    this.setPlaying(false);
    this.setBuffering(false);
  }

  private resumePreloadIfNeeded(): void {
    if (!this.hls || !this.preloadStopped) {
      return;
    }
    const video = this.videoRef?.nativeElement;
    if (!video) {
      return;
    }
    const startAt =
      this.pendingSeek !== null && this.pendingSeek > 0
        ? this.pendingSeek
        : -1;
    this.hls.startLoad(startAt);
    this.preloadStopped = false;
    if (startAt > 0) {
      this.seekBeforePlay = true;
      this.waitForResumeBuffer(video, this.hls);
      return;
    }
    if (!this.applyPendingSeek(video)) {
      this.tryAutoplay(video);
    }
  }

  private updateProgress(video: HTMLVideoElement): void {
    const next =
      video.duration > 0 ? video.currentTime / video.duration : 0;
    if (next === this.progress) {
      return;
    }
    this.progress = next;
    this.cdr.markForCheck();
  }

  private setPlaying(value: boolean): void {
    this.playing = value;
    this.cdr.markForCheck();
  }

  private markFirstFrameReady(): void {
    if (this.firstFrameReady || !this.active || this.failed) {
      return;
    }
    this.firstFrameReady = true;
    this.cdr.markForCheck();
  }

  private setBuffering(value: boolean): void {
    if (value && !this.active) {
      return;
    }
    if (this.buffering === value) {
      return;
    }
    this.buffering = value;
    this.cdr.markForCheck();
  }

  private fail(): void {
    this.failed = true;
    this.fatalError.emit();
    this.cdr.markForCheck();
  }

  private load(
    video: HTMLVideoElement,
    src: string,
    preloadOnly = false,
  ): void {
    if (this.loadedSrc === src) {
      if (this.active && this.pendingSeek !== null) {
        this.applyPendingSeek(video);
      }
      return;
    }

    this.teardown(video);
    this.loadedSrc = src;
    this.failed = false;
    this.progress = 0;
    this.preloadStopped = false;

    if (!preloadOnly && this.active) {
      this.setBuffering(true);
    }

    if (video.canPlayType(HLS_MIME)) {
      video.src = src;
      video.addEventListener(
        'loadedmetadata',
        () => {
          if (this.active) {
            this.beginActivePlayback(video);
          } else {
            this.pauseAtFirstFrame(video);
          }
        },
        { once: true },
      );
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        autoStartLoad: false,
        maxBufferLength: preloadOnly ? 4 : 30,
        maxMaxBufferLength: preloadOnly ? 6 : 600,
      });
      this.hls = hls;
      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (this.active) {
          this.beginActivePlayback(video, hls);
        } else if (this.preload) {
          hls.startLoad();
          this.pauseAtFirstFrame(video);
        } else {
          this.pauseAtFirstFrame(video);
        }
      });

      if (preloadOnly) {
        hls.on(Hls.Events.FRAG_BUFFERED, () => {
          if (!this.preload || this.active || this.preloadStopped) {
            return;
          }
          this.preloadStopped = true;
          hls.stopLoad();
          this.pauseAtFirstFrame(video);
        });
      }

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (
          data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR &&
          this.active
        ) {
          this.setBuffering(true);
        }
        if (data.fatal) {
          this.fail();
        }
      });

      this.bindHlsLoadingEvents(hls);
      return;
    }

    this.fail();
  }

  private hasPendingResume(): boolean {
    return this.pendingSeek !== null && this.pendingSeek > 0;
  }

  private beginActivePlayback(video: HTMLVideoElement, hls?: Hls): void {
    if (this.active) {
      this.setBuffering(true);
    }

    if (hls) {
      const startAt =
        this.hasPendingResume() && this.pendingSeek! > 0
          ? this.pendingSeek!
          : -1;
      if (startAt > 0) {
        this.seekBeforePlay = true;
        hls.startLoad(startAt);
        this.waitForResumeBuffer(video, hls);
        return;
      }
      hls.startLoad();
    }

    if (!this.applyPendingSeek(video)) {
      this.tryAutoplay(video);
    }
  }

  private waitForResumeBuffer(video: HTMLVideoElement, hls: Hls): void {
    this.clearSeekBufferListener(hls);
    const target = this.pendingSeek!;
    const trySeek = (): void => {
      if (!this.active || !this.hasPendingResume()) {
        this.clearSeekBufferListener(hls);
        return;
      }
      if (!this.isTimeSeekable(video, target)) {
        return;
      }
      if (this.applyPendingSeek(video)) {
        return;
      }
      this.clearSeekBufferListener(hls);
      this.onSeekCompleted(video);
    };

    this.seekBufferListener = trySeek;
    hls.on(Hls.Events.FRAG_BUFFERED, trySeek);
    video.addEventListener('canplay', trySeek, { once: true });
    trySeek();
  }

  private isTimeSeekable(video: HTMLVideoElement, time: number): boolean {
    for (let i = 0; i < video.seekable.length; i++) {
      if (time >= video.seekable.start(i) && time <= video.seekable.end(i)) {
        return true;
      }
    }
    return false;
  }

  private clearSeekBufferListener(hls?: Hls | null): void {
    if (this.seekBufferListener && hls) {
      hls.off(Hls.Events.FRAG_BUFFERED, this.seekBufferListener);
    }
    this.seekBufferListener = null;
  }

  private bindHlsLoadingEvents(hls: Hls): void {
    hls.on(Hls.Events.FRAG_LOADING, () => {
      if (!this.active || !this.videoRef) {
        return;
      }
      const video = this.videoRef.nativeElement;
      if (video.paused || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        this.setBuffering(true);
      }
    });

    hls.on(Hls.Events.FRAG_BUFFERED, () => {
      if (!this.active || !this.videoRef || this.seekBeforePlay) {
        return;
      }
      const video = this.videoRef.nativeElement;
      if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        this.setBuffering(false);
      }
    });
  }

  private onSeekCompleted(video: HTMLVideoElement): void {
    if (!this.hasPendingResume()) {
      if (this.seekBeforePlay) {
        this.seekBeforePlay = false;
      }
      if (this.active && !this.userPaused && video.paused) {
        this.tryAutoplay(video);
      }
      return;
    }

    const target = this.pendingSeek!;
    if (Math.abs(video.currentTime - target) > 1.5) {
      this.applyPendingSeek(video);
      return;
    }

    this.pendingSeek = null;
    this.seekBeforePlay = false;
    this.resumeApplied.emit();

    if (this.active && !this.userPaused && video.paused) {
      this.tryAutoplay(video);
    }
  }

  private applyPendingSeek(video: HTMLVideoElement): boolean {
    if (!this.hasPendingResume()) {
      return false;
    }
    const time = this.pendingSeek!;
    if (!Number.isFinite(time)) {
      return false;
    }
    if (Math.abs(video.currentTime - time) < 0.5) {
      this.pendingSeek = null;
      this.seekBeforePlay = false;
      this.resumeApplied.emit();
      if (this.active && !this.userPaused && video.paused) {
        this.tryAutoplay(video);
      }
      return false;
    }
    try {
      video.currentTime = time;
      this.seekBeforePlay = true;
      return true;
    } catch {
      return false;
    }
  }

  private teardown(video: HTMLVideoElement): void {
    video.pause();
    if (this.hls) {
      this.clearSeekBufferListener(this.hls);
      this.hls.destroy();
      this.hls = null;
    }
    if (this.loadedSrc !== null) {
      video.removeAttribute('src');
      video.load();
    }
    this.loadedSrc = null;
    this.preloadStopped = false;
    this.seekBeforePlay = false;
    this.userPaused = false;
    this.progress = 0;
    this.firstFrameReady = false;
    this.setPlaying(false);
    this.setBuffering(false);
  }
}
