import { Component, inject } from "@angular/core";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { LayoutService } from "../layout.service";
import { RAIL_ITEMS } from "../layout.models";

@Component({
  selector: "app-railbar",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./railbar.html",
})
export class Railbar {
  readonly layout = inject(LayoutService);
  readonly items = RAIL_ITEMS;
}
