import {
  ChangeDetectionStrategy,
  Component,
  HostBinding,
  Input,
} from '@angular/core';

@Component({
  selector: 'app-ig-spinner',
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ig-spinner.component.html',
  styleUrls: ['./ig-spinner.component.scss'],
  host: {
    class: 'ig-spinner-host',
  },
})
export class IgSpinnerComponent {
  @Input() overlay = false;

  @HostBinding('class.ig-spinner-host--overlay')
  get isOverlay(): boolean {
    return this.overlay;
  }
}
