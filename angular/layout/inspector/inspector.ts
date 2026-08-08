import { Component, inject } from "@angular/core";
import { Button } from "../../components/button";
import { Icon } from "../../components/icon";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { NovelDisplayPanel } from "../../app/features/novel/components/display.panel";
import { NovelPanel } from "../../app/features/novel/components/novel.panel";
import { NovelLibraryPanel } from "../../app/features/novel/components/library.panel";
import { NovelMultiPanel } from "../../app/features/novel/components/multi.panel";
import { NovelReaderService } from "../../app/features/novel/novel.reader.service";
import { NovelService } from "../../app/features/novel/novel.service";
import { LayoutService } from "../layout.service";
import { RIGHT_TABS } from "../layout.models";
import { TabsService } from "../tabs.service";

@Component({
  selector: "app-inspector",
  standalone: true,
  imports: [Button, Icon, I18nPipe, NovelLibraryPanel, NovelMultiPanel, NovelPanel, NovelDisplayPanel],
  templateUrl: "./inspector.html",
})
export class Inspector {
  readonly layout = inject(LayoutService);
  readonly editorTabs = inject(TabsService);
  readonly novels = inject(NovelService);
  readonly reader = inject(NovelReaderService);
  readonly tabs = RIGHT_TABS;
}
