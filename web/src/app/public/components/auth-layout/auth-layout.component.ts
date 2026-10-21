import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { LogoComponent } from 'src/app/shared/logo/logo.component';
import { IconComponent } from '../../../shared/icon/icon.component';


@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
    selector: 'app-auth-layout',
    templateUrl: './auth-layout.component.html',
    styleUrls: ['./auth-layout.component.scss'],
    imports: [
    LogoComponent,
    IconComponent,
  ],
})
export class AuthLayoutComponent {
  readonly heading = input('');
  readonly subheading = input('');
}
