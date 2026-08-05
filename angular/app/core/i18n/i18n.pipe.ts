import { Pipe, PipeTransform, inject } from "@angular/core";
import { I18nKey, I18nParams } from "./i18n.models";
import { I18nService } from "./i18n.service";

@Pipe({ name: "t", pure: false })
export class I18nPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: I18nKey, params?: I18nParams): string {
    return this.i18n.translate(key, params);
  }
}
