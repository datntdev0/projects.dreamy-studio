import { NgModule } from "@angular/core";
import { Dialog } from "@app/core/dialog/dialog.component";
import { Toast } from "@app/core/toast/toast.component";
import { DialogHost } from "@app/core/dialog/dialog-host.component";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { ToastHost } from "@app/core/toast/toast-host.component";

const CORE_DECLARABLES = [LanguagePipe, Dialog, Toast, DialogHost, ToastHost];

@NgModule({
  imports: CORE_DECLARABLES,
  exports: CORE_DECLARABLES,
})
export class CoreModule {}
