import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from './icon/icon.component';
import { InitialsPipe, TonePipe } from './pipes/avatar.pipes';
import { LinkifyPipe } from './pipes/linkify.pipe';
import { ToastHostComponent } from './toast/toast-host.component';

@NgModule({
  declarations: [IconComponent, TonePipe, InitialsPipe, LinkifyPipe, ToastHostComponent],
  imports: [CommonModule],
  exports: [IconComponent, TonePipe, InitialsPipe, LinkifyPipe, ToastHostComponent],
})
export class SharedModule {}
