import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { ShellState } from '../../core/shell/shell.state';

@Component({
  selector: 'app-shell',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.component.html',
  styleUrls: ['./app-shell.component.scss'],
})
export class AppShellComponent {
  protected readonly state = inject(ShellState);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly fileInput =
    viewChild<ElementRef<HTMLInputElement>>('fileInput');

  openFilePicker(): void {
    const input = this.fileInput()?.nativeElement;
    if (!input) {
      return;
    }
    input.value = '';
    input.click();
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (!file) {
      return;
    }
    this.state.pendingVideoFile.set(file);
    this.state.openCreate();
    this.cdr.markForCheck();
  }
}
