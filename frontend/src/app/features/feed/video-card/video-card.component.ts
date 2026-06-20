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
import { AuthService } from '../../../core/auth/auth.service';
import { CommentsService } from '../../../core/comments/comments.service';
import { CommentSummary } from '../../../core/comments/comments.models';
import { PostsService } from '../../../core/posts/posts.service';
import { PostSummary } from '../../../core/posts/posts.models';
import { ShellState } from '../../../core/shell/shell.state';
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
  @Output() commentCountChange = new EventEmitter<number>();

  @ViewChild(VideoPlayerComponent) player?: VideoPlayerComponent;

  manifestSrc: string | null = null;
  liked = false;
  likeCount = 0;
  commentCount = 0;
  commentsOpen = false;
  comments: CommentSummary[] = [];
  commentsLoading = false;
  commentsNextCursor: string | null = null;
  commentDraft = '';
  commentSubmitting = false;
  toast: string | null = null;

  private readonly posts = inject(PostsService);
  private readonly commentsApi = inject(CommentsService);
  private readonly shell = inject(ShellState);
  private readonly auth = inject(AuthService);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);

  private fetching = false;
  private retried = false;
  private manifestBlobUrl: string | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  get hostElement(): HTMLElement {
    return this.host.nativeElement;
  }

  get currentUsername(): string | null {
    return this.auth.user()?.username ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['post']) {
      this.liked = this.post.likedByMe;
      this.likeCount = this.post.likeCount;
      this.commentCount = this.post.commentCount;
    }

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
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
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

  openProfile(): void {
    const reel = this.shell.profileReel();
    if (reel) {
      this.shell.openUserProfile(this.post.author.username, {
        type: 'reel',
        username: reel.username,
        startPostId: reel.startPostId,
      });
      return;
    }
    this.shell.openUserProfile(this.post.author.username, { type: 'feed' });
  }

  openCommentAuthorProfile(username: string): void {
    const reel = this.shell.profileReel();
    if (reel) {
      this.shell.openUserProfile(username, {
        type: 'reel',
        username: reel.username,
        startPostId: reel.startPostId,
      });
      return;
    }
    this.shell.openUserProfile(username, {
      type: 'comments',
      postId: this.post.id,
    });
  }

  toggleLike(): void {
    const next = !this.liked;
    this.liked = next;
    this.likeCount = Math.max(0, this.likeCount + (next ? 1 : -1));
    this.cdr.markForCheck();

    const request = next
      ? this.posts.like(this.post.id)
      : this.posts.unlike(this.post.id);

    request.subscribe({
      error: () => {
        this.liked = !next;
        this.likeCount = Math.max(0, this.likeCount + (next ? -1 : 1));
        this.cdr.markForCheck();
      },
    });
  }

  openComments(): void {
    this.commentsOpen = true;
    if (this.comments.length === 0) {
      this.loadComments();
    }
    this.cdr.markForCheck();
  }

  closeComments(): void {
    this.commentsOpen = false;
    this.cdr.markForCheck();
  }

  onCommentsScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (
      !this.commentsNextCursor ||
      this.commentsLoading ||
      el.scrollTop + el.clientHeight < el.scrollHeight - 48
    ) {
      return;
    }
    this.loadComments(this.commentsNextCursor);
  }

  submitComment(): void {
    const body = this.commentDraft.trim();
    if (!body || this.commentSubmitting) {
      return;
    }
    this.commentSubmitting = true;
    this.cdr.markForCheck();

    this.commentsApi.addComment(this.post.id, body).subscribe({
      next: (comment) => {
        this.comments = [comment, ...this.comments];
        this.commentDraft = '';
        this.commentCount += 1;
        this.commentCountChange.emit(this.commentCount);
        this.commentSubmitting = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.commentSubmitting = false;
        this.showToast('Não foi possível comentar');
        this.cdr.markForCheck();
      },
    });
  }

  deleteComment(comment: CommentSummary): void {
    this.commentsApi.deleteComment(comment.id).subscribe({
      next: () => {
        this.comments = this.comments.filter((item) => item.id !== comment.id);
        this.commentCount = Math.max(0, this.commentCount - 1);
        this.commentCountChange.emit(this.commentCount);
        this.cdr.markForCheck();
      },
      error: () => this.showToast('Não foi possível excluir'),
    });
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

  private loadComments(cursor?: string): void {
    this.commentsLoading = true;
    this.cdr.markForCheck();

    this.commentsApi.listByPost(this.post.id, cursor).subscribe({
      next: (page) => {
        this.comments = cursor
          ? [...this.comments, ...page.items]
          : page.items;
        this.commentsNextCursor = page.nextCursor;
        this.commentsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.commentsLoading = false;
        this.showToast('Não foi possível carregar comentários');
        this.cdr.markForCheck();
      },
    });
  }

  private showToast(message: string): void {
    this.toast = message;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toast = null;
      this.cdr.markForCheck();
    }, 1800);
    this.cdr.markForCheck();
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
