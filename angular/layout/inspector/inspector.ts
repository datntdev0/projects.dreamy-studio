import { Component, inject } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { LanguagePipe } from "@app/core/language/language.pipe";
import { NovelDisplayPanel } from "@app/features/novel/components/display.panel";
import { NovelPanel } from "@app/features/novel/components/novel.panel";
import { NovelReaderService } from "@app/features/novel/novel.reader.service";
import { NovelService } from "@app/features/novel/novel.service";
import { ProjectLibraryPanel } from "@app/features/project/components/library.panel";
import { ProjectPanel } from "@app/features/project/components/project.panel";
import { ProjectService } from "@app/features/project/project.service";
import { LibraryCollectionAssetsService } from "@app/features/library/library.collection-assets.service";
import { LibraryService } from "@app/features/library/library.service";
import { LibraryTaxonomyPanel } from "@app/features/library/components/taxonomy.panel";
import { LibraryCollectionPanel } from "@app/features/library/components/collection.panel";
import { LibraryImagePanel } from "@app/features/library/components/image.panel";
import { LibraryTagPanel } from "@app/features/library/components/tag.panel";
import { LibraryImageService } from "@app/features/library/library.images.service";
import { LibrarySoundPanel } from "@app/features/library/components/sound.panel";
import { LibrarySoundService } from "@app/features/library/library.sounds.service";
import { LibraryVideoPanel } from "@app/features/library/components/video.panel";
import { LibraryVideoService } from "@app/features/library/library.videos.service";
import { LibraryPromptPanel } from "@app/features/library/components/prompt.panel";
import { LibraryPromptsPanel } from "@app/features/library/components/prompts.panel";
import { LibraryPromptService } from "@app/features/library/library.prompts.service";
import { LayoutService } from "../layout.service";
import { RIGHT_TABS } from "../layout.models";
import { TabsService } from "../tabs.service";

@Component({
  selector: "app-inspector",
  standalone: true,
  imports: [Button, Icon, LanguagePipe, NovelPanel, NovelDisplayPanel, ProjectLibraryPanel, ProjectPanel, LibraryTaxonomyPanel, LibraryCollectionPanel, LibraryImagePanel, LibraryTagPanel, LibrarySoundPanel, LibraryVideoPanel, LibraryPromptPanel, LibraryPromptsPanel],
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
