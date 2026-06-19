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
  @Input() muted = true;

  @Output() fatalError = new EventEmitter<void>();

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  playing = false;
  buffering = false;
  failed = false;
  userPaused = false;
  progress = 0;

  private hls: Hls | null = null;
  private loadedSrc: string | null = null;
  private bound = false;

  constructor(private readonly cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.syncPlayer();
  }

  ngOnChanges(changes: SimpleChanges): void {
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

  private syncPlayer(): void {
    const video = this.videoRef?.nativeElement;
    if (!video) {
      return;
    }
    this.bindEvents(video);
    video.muted = this.muted;
    video.loop = true;

    if (this.active && this.src) {
      this.userPaused = false;
      this.load(video, this.src);
      void video.play().catch(() => this.setPlaying(false));
    } else {
      this.teardown(video);
    }
  }

  private bindEvents(video: HTMLVideoElement): void {
    if (this.bound) {
      return;
    }
    this.bound = true;

    video.addEventListener('playing', () => {
      this.setPlaying(true);
      this.setBuffering(false);
    });
    video.addEventListener('pause', () => this.setPlaying(false));
    video.addEventListener('waiting', () => this.setBuffering(true));
    video.addEventListener('timeupdate', () => this.updateProgress(video));
    video.addEventListener('ended', () => {
      video.currentTime = 0;
      void video.play().catch(() => this.setPlaying(false));
    });
    video.addEventListener('error', () => this.fail());
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

  private setBuffering(value: boolean): void {
    this.buffering = value;
    this.cdr.markForCheck();
  }

  private fail(): void {
    this.failed = true;
    this.fatalError.emit();
    this.cdr.markForCheck();
  }

  private load(video: HTMLVideoElement, src: string): void {
    if (this.loadedSrc === src) {
      return;
    }
    this.teardown(video);
    this.loadedSrc = src;
    this.failed = false;
    this.progress = 0;

    if (video.canPlayType(HLS_MIME)) {
      video.src = src;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      this.hls = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          this.fail();
        }
      });
      return;
    }

    this.fail();
  }

  private teardown(video: HTMLVideoElement): void {
    video.pause();
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
    if (this.loadedSrc !== null) {
      video.removeAttribute('src');
      video.load();
    }
    this.loadedSrc = null;
    this.userPaused = false;
    this.progress = 0;
    this.setPlaying(false);
    this.setBuffering(false);
  }
}
