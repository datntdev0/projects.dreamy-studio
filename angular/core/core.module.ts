import { NgModule } from "@angular/core";
import { Dialog } from "@core/dialog/dialog.component";
import { Toast } from "@core/toast/toast.component";
import { DialogHost } from "@core/dialog/dialog-host.component";
import { LanguagePipe } from "@core/language/language.pipe";
import { ToastHost } from "@core/toast/toast-host.component";

const CORE_DECLARABLES = [LanguagePipe, Dialog, Toast, DialogHost, ToastHost];

@NgModule({
  imports: CORE_DECLARABLES,
  exports: CORE_DECLARABLES,
})
export class CoreModule {}
