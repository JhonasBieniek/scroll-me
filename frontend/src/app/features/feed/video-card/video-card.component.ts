import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { PostsService } from '../../../core/posts/posts.service';
import { PostSummary } from '../../../core/posts/posts.models';
import { VideoPlayerComponent } from '../../../shared/ui/video-player/video-player.component';

@Component({
  selector: 'app-video-card',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-card.component.html',
  styleUrls: ['./video-card.component.scss'],
})
export class VideoCardComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) post!: PostSummary;
  @Input() active = false;
  @Input() preload = false;
  @Input() muted = true;
  @Input() badge: string | null = null;

  @Output() toggleMuted = new EventEmitter<void>();

  @ViewChild(VideoPlayerComponent) player?: VideoPlayerComponent;

  manifestSrc: string | null = null;

  private readonly posts = inject(PostsService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);

  private fetching = false;
  private retried = false;
  private manifestBlobUrl: string | null = null;

  get hostElement(): HTMLElement {
    return this.host.nativeElement;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['active'] || changes['preload']) &&
      (this.active || this.preload) &&
      !this.manifestSrc &&
      !this.fetching
    ) {
      this.fetchManifest();
    }
  }

  ngOnDestroy(): void {
    this.revokeManifestBlob();
  }

  scrollIntoView(): void {
    this.hostElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  togglePlay(): void {
    this.player?.togglePlay();
  }

  onToggleMuted(): void {
    this.toggleMuted.emit();
  }

  onPlayerError(): void {
    if (this.retried || !this.active) {
      return;
    }
    this.retried = true;
    this.revokeManifestBlob();
    this.manifestSrc = null;
    this.fetchManifest();
  }

  private fetchManifest(): void {
    this.fetching = true;
    this.posts.getManifest(this.post.id).subscribe({
      next: (manifest) => {
        this.revokeManifestBlob();
        const blob = new Blob([manifest.playlist], {
          type: 'application/vnd.apple.mpegurl',
        });
        this.manifestBlobUrl = URL.createObjectURL(blob);
        this.manifestSrc = this.manifestBlobUrl;
        this.fetching = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.fetching = false;
        this.cdr.markForCheck();
      },
    });
  }

  private revokeManifestBlob(): void {
    if (this.manifestBlobUrl) {
      URL.revokeObjectURL(this.manifestBlobUrl);
      this.manifestBlobUrl = null;
    }
  }
}
