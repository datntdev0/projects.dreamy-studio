import type { Locator, Page } from '@playwright/test';

import { AssistantPage } from './assistant.ts';
import { AudiobookPage } from './audiobook.ts';
import { ConfirmDialog, SwitchDialog } from './dialogs.ts';
import { KnowledgePage } from './knowledge.ts';
import { LibraryNav } from './library.ts';
// prettier-ignore
import { AddChapterDialog, DisplayPanel, NovelChapters, NovelCreateDialog, NovelExplorer, NovelImportDialog, NovelList, NovelPanel, NovelReader } from './novels.ts';
import { PipelinesNav } from './pipeline.ts';
import { ProjectPages } from './project.ts';
import { ScriptingPage } from './scripting.ts';
import { SettingsPage } from './settings.ts';
import { TranslationPage } from './translation.ts';

export class MainPage {
  readonly switchDialog: SwitchDialog;
  readonly confirm: ConfirmDialog;
  readonly explorer: NovelExplorer;
  readonly novels: NovelList;
  readonly createDialog: NovelCreateDialog;
  readonly importDialog: NovelImportDialog;
  readonly panel: NovelPanel;
  readonly display: DisplayPanel;
  readonly chapters: NovelChapters;
  readonly addChapterDialog: AddChapterDialog;
  readonly reader: NovelReader;
  readonly library: LibraryNav;
  readonly translation: TranslationPage;
  readonly knowledge: KnowledgePage;
  readonly pipelines: PipelinesNav;
  readonly assistant: AssistantPage;
  readonly settings: SettingsPage;
  readonly project: ProjectPages;
  readonly scripting: ScriptingPage;
  readonly audiobook: AudiobookPage;

  constructor(private readonly page: Page) {
    this.switchDialog = new SwitchDialog(page);
    this.confirm = new ConfirmDialog(page);
    this.explorer = new NovelExplorer(page);
    this.novels = new NovelList(page);
    this.createDialog = new NovelCreateDialog(page);
    this.importDialog = new NovelImportDialog(page);
    this.panel = new NovelPanel(page);
    this.display = new DisplayPanel(page);
    this.chapters = new NovelChapters(page);
    this.addChapterDialog = new AddChapterDialog(page);
    this.reader = new NovelReader(page);
    this.library = new LibraryNav(page);
    this.translation = new TranslationPage(page);
    this.knowledge = new KnowledgePage(page);
    this.pipelines = new PipelinesNav(page);
    this.assistant = new AssistantPage(page);
    this.settings = new SettingsPage(page);
    this.project = new ProjectPages(page);
    this.scripting = new ScriptingPage(page);
    this.audiobook = new AudiobookPage(page);
  }

  get root(): Locator {
    return this.page.getByTestId('main-page');
  }

  get workspaceButton(): Locator {
    return this.page.getByTestId('main-workspace');
  }

  get workspaceName(): Locator {
    return this.page.getByTestId('main-workspace-name');
  }

  get statusPath(): Locator {
    return this.page.getByTestId('statusbar-workspace');
  }

  get switchNotice(): Locator {
    return this.page.getByTestId('main-switch-notice');
  }

  get novelRail(): Locator {
    return this.page.locator('[data-testid=railbar-item][data-rail=novels]');
  }

  get novelRows(): Locator {
    return this.page.getByTestId('novel-explorer-novel');
  }

  get toasts(): Locator {
    return this.page.getByTestId('toast');
  }

  toast(text: string): Locator {
    return this.toasts.filter({ hasText: text });
  }

  async showNovels(): Promise<void> {
    await this.novelRail.click();
  }

  async openSwitchDialog(): Promise<void> {
    await this.workspaceButton.click();
  }
}
