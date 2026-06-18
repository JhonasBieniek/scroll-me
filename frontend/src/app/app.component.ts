import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<router-outlet />',
})
export class AppComponent {}
