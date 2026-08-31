import { NgModule } from '@angular/core';
import { Dialog } from '@shared/dialog/dialog.component';
import { DialogHost } from '@shared/dialog/dialog-host.component';
import { LanguagePipe } from '@shared/language/language.pipe';
import { Toast } from '@shared/toast/toast.component';
import { ToastHost } from '@shared/toast/toast-host.component';

const CORE_DECLARABLES = [LanguagePipe, Dialog, Toast, DialogHost, ToastHost];

@NgModule({
  imports: CORE_DECLARABLES,
  exports: CORE_DECLARABLES,
})
export class CoreModule {}
