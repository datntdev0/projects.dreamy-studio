import { Component, inject } from "@angular/core";
import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { LayoutService } from "../layout.service";
import { RIGHT_TABS } from "../layout.models";

@Component({
  selector: "app-inspector",
  standalone: true,
  imports: [Button, Icon, I18nPipe],
  templateUrl: "./inspector.html",
})
export class Inspector {
  readonly layout = inject(LayoutService);
  readonly tabs = RIGHT_TABS;
}
