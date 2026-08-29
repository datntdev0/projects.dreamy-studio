import { Component, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { CoreModule } from "@core/core.module";
import { AssistantPanel } from "@features/assistant/components/panel.component";
import { NovelDisplayPanel } from "@features/novel/components/display.panel";
import { NovelKnowledgeInspector } from "@features/novel/components/knowledge-inspector.component";
import { NovelPanel } from "@features/novel/components/novel.panel";
import { NovelReaderService } from "@features/novel/novel.reader.service";
import { NovelService } from "@features/novel/novel.service";
import { ProjectLibraryPanel } from "@features/project/components/library.panel";
import { ProjectPanel } from "@features/project/components/project.panel";
import { ProjectService } from "@features/project/project.service";
import { LibraryCollectionAssetsService } from "@features/library/library.collection-assets.service";
import { LibraryService } from "@features/library/library.service";
import { LibraryTaxonomyPanel } from "@features/library/components/taxonomy.panel";
import { LibraryCollectionPanel } from "@features/library/components/collection.panel";
import { LibraryImagePanel } from "@features/library/components/image.panel";
import { LibraryTagPanel } from "@features/library/components/tag.panel";
import { LibraryImageService } from "@features/library/library.images.service";
import { LibrarySoundPanel } from "@features/library/components/sound.panel";
import { LibrarySoundService } from "@features/library/library.sounds.service";
import { LibraryVideoPanel } from "@features/library/components/video.panel";
import { LibraryVideoService } from "@features/library/library.videos.service";
import { LibraryPromptPanel } from "@features/library/components/prompt.panel";
import { LibraryPromptsPanel } from "@features/library/components/prompts.panel";
import { LibraryPromptService } from "@features/library/library.prompts.service";
import { LayoutService } from "../layout.service";
import { RIGHT_TABS } from "../layout.models";
import { TabsService } from "../tabs.service";

@Component({
  selector: "app-inspector",
  standalone: true,
  imports: [Button, Icon, CoreModule, AssistantPanel, NovelKnowledgeInspector, NovelPanel, NovelDisplayPanel, ProjectLibraryPanel, ProjectPanel, LibraryTaxonomyPanel, LibraryCollectionPanel, LibraryImagePanel, LibraryTagPanel, LibrarySoundPanel, LibraryVideoPanel, LibraryPromptPanel, LibraryPromptsPanel],
  templateUrl: "./inspector.html",
})
export class Inspector {
  readonly layout = inject(LayoutService);
  readonly editorTabs = inject(TabsService);
  readonly novels = inject(NovelService);
  readonly projects = inject(ProjectService);
  readonly library = inject(LibraryService);
  readonly collectionAssets = inject(LibraryCollectionAssetsService);
  readonly images = inject(LibraryImageService);
  readonly sounds = inject(LibrarySoundService);
  readonly videos = inject(LibraryVideoService);
  readonly prompts = inject(LibraryPromptService);
  readonly reader = inject(NovelReaderService);
  readonly tabs = RIGHT_TABS;
}
