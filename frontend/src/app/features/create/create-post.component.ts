import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { friendlyHttpError } from '../../core/http/http-error-message';
import { AuthService } from '../../core/auth/auth.service';
import { PostsService } from '../../core/posts/posts.service';
import { ShellState } from '../../core/shell/shell.state';

type CreateStep = 'pick' | 'preview' | 'caption' | 'uploading' | 'done';
const MAX_BYTES = 50 * 1024 * 1024;

@Component({
  selector: 'app-create-post',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-post.component.html',
  styleUrls: ['./create-post.component.scss'],
})
export class CreatePostComponent implements OnInit, OnDestroy {
  private readonly posts = inject(PostsService);
  private readonly auth = inject(AuthService);
  private readonly shell = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);

  step: CreateStep = 'pick';
  error: string | null = null;
  progress = 0;
  previewUrl: string | null = null;

  readonly captionControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(2200)],
  });

  private selectedFile: File | null = null;

  ngOnInit(): void {
    if (!this.auth.isAuthenticated()) {
      this.auth.requireAuth('post');
      this.shell.openFeed();
      return;
    }
    const pending = this.shell.consumePendingVideoFile();
    if (pending) {
      this.applyFile(pending);
    }
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file) {
      this.applyFile(file);
    }
  }

  goToCaption(): void {
    this.step = 'caption';
    this.cdr.markForCheck();
  }

  reset(): void {
    this.revokePreview();
    this.selectedFile = null;
    this.error = null;
    this.step = 'pick';
    this.cdr.markForCheck();
  }

  cancel(): void {
    this.shell.openFeed();
  }

  publish(): void {
    if (!this.selectedFile) {
      this.error =
        'Nenhum vídeo selecionado. Volte e escolha um arquivo .mp4.';
      this.step = 'pick';
      this.cdr.markForCheck();
      return;
    }
    this.error = null;
    this.progress = 0;
    this.step = 'uploading';
    this.cdr.markForCheck();

    const caption = this.captionControl.value.trim();

    this.posts
      .upload({ video: this.selectedFile, caption: caption || undefined })
      .subscribe({
        next: (event) => {
          if (event.type === 'progress') {
            this.progress = event.progress;
          } else {
            this.step = 'done';
            this.finish();
          }
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          this.step = 'caption';
          this.error = friendlyHttpError(
            err,
            'Não foi possível publicar. Verifique o arquivo e tente novamente.',
          );
          this.cdr.markForCheck();
        },
      });
  }

  private applyFile(file: File): void {
    this.error = null;
    if (!file.name.toLowerCase().endsWith('.mp4')) {
      this.error = 'Selecione um arquivo .mp4.';
      this.cdr.markForCheck();
      return;
    }
    if (file.size > MAX_BYTES) {
      this.error = 'Arquivo excede 50 MB.';
      this.cdr.markForCheck();
      return;
    }

    this.selectedFile = file;
    this.revokePreview();
    this.previewUrl = URL.createObjectURL(file);
    this.step = 'preview';
    this.cdr.markForCheck();
  }

  private finish(): void {
    setTimeout(() => {
      this.revokePreview();
      this.selectedFile = null;
      this.captionControl.reset();
      this.shell.bumpProfileReload();
      this.shell.bumpFeedReload();
      this.shell.openFeed();
      this.cdr.markForCheck();
    }, 700);
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
  }
}
