import type { Locator, Page } from '@playwright/test';

export type SettingsSectionId = 'general' | 'llm' | 'backend' | 'cloud';
export type GeneralTab = 'interface' | 'pipelines' | 'storage';
export type LlmTab = 'cli' | 'cloud' | 'features';
export type LlmFeatureId = 'translation' | 'knowledge' | 'assistant';
export type CliId = 'claude' | 'codex' | 'antigravity';
export type CloudId = 'anthropic' | 'openai' | 'google' | 'openrouter' | 'custom';
export type BackendTab = 'general' | 'models';
export type BackendModelId = 'vieneu-turbo' | 'vieneu-nano' | 'omnivoice';

export class SettingsDialogPage {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId('settings-dialog-panel');
  }

  get title(): Locator {
    return this.panel.getByTestId('dialog-title');
  }

  get close(): Locator {
    return this.panel.getByTestId('dialog-close');
  }

  get navItems(): Locator {
    return this.page.getByTestId('settings-nav').getByRole('button');
  }

  nav(id: SettingsSectionId): Locator {
    return this.page.getByTestId(`settings-nav-${id}`);
  }

  pane(id: SettingsSectionId): Locator {
    return this.page.getByTestId(`settings-pane-${id}`);
  }
}

export class SettingsGeneralPage {
  constructor(private readonly page: Page) {}

  tab(id: GeneralTab): Locator {
    return this.page.getByTestId('settings-general-tabs').getByTestId(`tab-${id}`);
  }

  get languageOptions(): Locator {
    return this.page.getByTestId('settings-general-language').getByRole('button');
  }

  get themeOptions(): Locator {
    return this.page.getByTestId('settings-general-theme').getByRole('button');
  }

  get maxPipelines(): Locator {
    return this.page.getByTestId('settings-general-max-pipelines-input').getByTestId('slider');
  }

  get maxPipelinesValue(): Locator {
    return this.page.getByTestId('settings-general-max-pipelines-value');
  }

  get maxTasks(): Locator {
    return this.page.getByTestId('settings-general-max-tasks-input').getByTestId('slider');
  }

  get maxTasksValue(): Locator {
    return this.page.getByTestId('settings-general-max-tasks-value');
  }

  get workspacePath(): Locator {
    return this.page.getByTestId('settings-general-workspace-path');
  }

  get workspaceOpen(): Locator {
    return this.page.getByTestId('settings-general-workspace-open');
  }

  get dataPath(): Locator {
    return this.page.getByTestId('settings-general-data-path');
  }

  get dataOpen(): Locator {
    return this.page.getByTestId('settings-general-data-open');
  }

  get note(): Locator {
    return this.page.getByTestId('settings-general-note');
  }
}

export class SettingsCliCard {
  constructor(
    private readonly page: Page,
    private readonly id: CliId,
  ) {}

  private part(name: string): Locator {
    return this.page.getByTestId(`settings-llm-${this.id}-${name}`);
  }

  get root(): Locator {
    return this.page.getByTestId(`settings-llm-${this.id}`);
  }

  get name(): Locator {
    return this.part('name');
  }

  get badge(): Locator {
    return this.part('badge');
  }

  get install(): Locator {
    return this.part('install');
  }

  get path(): Locator {
    return this.part('path');
  }

  get manual(): Locator {
    return this.part('manual');
  }

  get usePath(): Locator {
    return this.part('usepath');
  }

  get pathError(): Locator {
    return this.part('path-error');
  }

  get signinStep(): Locator {
    return this.part('signin-step');
  }

  get signin(): Locator {
    return this.part('signin');
  }

  get signout(): Locator {
    return this.part('signout');
  }

  get account(): Locator {
    return this.part('account');
  }

  get profile(): Locator {
    return this.part('profile');
  }

  get profileOpen(): Locator {
    return this.part('profile-open');
  }

  get check(): Locator {
    return this.part('check');
  }

  get status(): Locator {
    return this.part('status');
  }

  get error(): Locator {
    return this.part('error');
  }
}

export class SettingsFeatureCard {
  constructor(
    private readonly page: Page,
    private readonly id: LlmFeatureId,
  ) {}

  private part(name: string): Locator {
    return this.page.getByTestId(`settings-llm-feature-${this.id}-${name}`);
  }

  get root(): Locator {
    return this.page.getByTestId(`settings-llm-feature-${this.id}`);
  }

  get name(): Locator {
    return this.part('name');
  }

  get hint(): Locator {
    return this.part('hint');
  }

  get provider(): Locator {
    return this.part('provider');
  }

  get providerOptions(): Locator {
    return this.provider.locator('option');
  }

  get providerSelected(): Locator {
    return this.provider.locator('option:checked');
  }

  get providerEmpty(): Locator {
    return this.part('provider-empty');
  }

  get model(): Locator {
    return this.part('model');
  }

  get modelSuggestions(): Locator {
    return this.page.locator(`datalist#settings-llm-feature-${this.id}-models option`);
  }

  get effort(): Locator {
    return this.part('effort');
  }

  get args(): Locator {
    return this.part('args');
  }
}

export class SettingsLlmPage {
  constructor(private readonly page: Page) {}

  tab(id: LlmTab): Locator {
    return this.page.getByTestId('settings-llm-tabs').getByTestId(`tab-${id}`);
  }

  get features(): Locator {
    return this.page.getByTestId('settings-llm-features');
  }

  get featureCards(): Locator {
    return this.features.locator('article');
  }

  get cloudSoon(): Locator {
    return this.page.getByTestId('settings-llm-cloud-soon');
  }

  get cloudIntro(): Locator {
    return this.page.getByTestId('settings-llm-cloud-intro');
  }

  get cloudCards(): Locator {
    return this.page.getByTestId('settings-llm-cloud').locator('article');
  }

  cli(id: CliId): SettingsCliCard {
    return new SettingsCliCard(this.page, id);
  }

  feature(id: LlmFeatureId): SettingsFeatureCard {
    return new SettingsFeatureCard(this.page, id);
  }

  cloud(id: CloudId): Locator {
    return this.page.getByTestId(`settings-llm-cloud-${id}`);
  }

  cloudKey(id: CloudId): Locator {
    return this.page.getByTestId(`settings-llm-cloud-${id}-key`);
  }
}

export class SettingsBackendModelCard {
  constructor(
    private readonly page: Page,
    private readonly id: BackendModelId,
  ) {}

  private part(name: string): Locator {
    return this.page.getByTestId(`settings-backend-model-${this.id}-${name}`);
  }

  get root(): Locator {
    return this.page.getByTestId(`settings-backend-model-${this.id}`);
  }

  get name(): Locator {
    return this.part('name');
  }

  get badge(): Locator {
    return this.part('badge');
  }

  get source(): Locator {
    return this.part('source');
  }

  get note(): Locator {
    return this.part('note');
  }

  get tags(): Locator {
    return this.part('tags').locator('.tag');
  }

  get size(): Locator {
    return this.part('size');
  }

  get cpuWarning(): Locator {
    return this.part('cpu-warning');
  }

  get progress(): Locator {
    return this.part('progress');
  }

  get progressBar(): Locator {
    return this.part('progress-bar');
  }

  get progressText(): Locator {
    return this.part('progress-text');
  }

  get error(): Locator {
    return this.part('error');
  }

  get status(): Locator {
    return this.part('status');
  }

  get download(): Locator {
    return this.part('download');
  }

  get cancel(): Locator {
    return this.part('cancel');
  }

  get retry(): Locator {
    return this.part('retry');
  }

  get remove(): Locator {
    return this.part('remove');
  }
}

export class SettingsBackendPage {
  constructor(private readonly page: Page) {}

  private part(name: string): Locator {
    return this.page.getByTestId(`settings-backend-${name}`);
  }

  tab(id: BackendTab): Locator {
    return this.part('tabs').getByTestId(`tab-${id}`);
  }

  get server(): Locator {
    return this.part('server');
  }

  get serverName(): Locator {
    return this.part('server-name');
  }

  get serverBadge(): Locator {
    return this.part('server-badge');
  }

  get facts(): Locator {
    return this.part('facts').locator('dt');
  }

  get address(): Locator {
    return this.part('address');
  }

  get version(): Locator {
    return this.part('version');
  }

  get python(): Locator {
    return this.part('python');
  }

  get uptime(): Locator {
    return this.part('uptime');
  }

  get serverError(): Locator {
    return this.part('server-error');
  }

  get status(): Locator {
    return this.part('status');
  }

  get logs(): Locator {
    return this.part('logs');
  }

  get check(): Locator {
    return this.part('check');
  }

  get restart(): Locator {
    return this.part('restart');
  }

  get gpuHint(): Locator {
    return this.part('gpu-hint');
  }

  get gpuBadge(): Locator {
    return this.part('gpu-badge');
  }

  get gpuRescan(): Locator {
    return this.part('gpu-rescan');
  }

  get cudaRow(): Locator {
    return this.part('cuda-row');
  }

  get cudaHint(): Locator {
    return this.part('cuda-hint');
  }

  get cudaNeedGpu(): Locator {
    return this.part('cuda-need-gpu');
  }

  get cudaDownload(): Locator {
    return this.part('cuda-download');
  }

  get cudaProgress(): Locator {
    return this.part('cuda-progress');
  }

  get cudaProgressBar(): Locator {
    return this.part('cuda-progress-bar');
  }

  get cudaProgressText(): Locator {
    return this.part('cuda-progress-text');
  }

  get cudaCancel(): Locator {
    return this.part('cuda-cancel');
  }

  get cudaBadge(): Locator {
    return this.part('cuda-badge');
  }

  get cudaRemove(): Locator {
    return this.part('cuda-remove');
  }

  get cudaError(): Locator {
    return this.part('cuda-error');
  }

  get cudaRetry(): Locator {
    return this.part('cuda-retry');
  }

  get deviceHint(): Locator {
    return this.part('device-hint');
  }

  get deviceOptions(): Locator {
    return this.part('device').getByRole('button');
  }

  device(label: string): Locator {
    return this.part('device').getByRole('button', { name: label, exact: true });
  }

  get note(): Locator {
    return this.part('note');
  }

  get modelCards(): Locator {
    return this.part('model-list').locator('article');
  }

  get modelsEmpty(): Locator {
    return this.part('models-empty');
  }

  get folder(): Locator {
    return this.part('folder');
  }

  get folderPath(): Locator {
    return this.part('folder-path');
  }

  get folderOpen(): Locator {
    return this.part('folder-open');
  }

  get folderHint(): Locator {
    return this.part('folder-hint');
  }

  model(id: BackendModelId): SettingsBackendModelCard {
    return new SettingsBackendModelCard(this.page, id);
  }
}

export class TitlebarMenu {
  constructor(private readonly page: Page) {}

  get viewButton(): Locator {
    return this.page.getByTestId('titlebar-menu-view');
  }

  get menu(): Locator {
    return this.page.getByTestId('titlebar-view-menu');
  }

  get switchTheme(): Locator {
    return this.page.getByTestId('titlebar-view-switch-theme');
  }

  get themeIcon(): Locator {
    return this.switchTheme.locator('use');
  }

  get languageName(): Locator {
    return this.page.getByTestId('titlebar-view-language-name');
  }
}

export class SettingsPage {
  readonly dialog: SettingsDialogPage;
  readonly general: SettingsGeneralPage;
  readonly llm: SettingsLlmPage;
  readonly backend: SettingsBackendPage;
  readonly titlebar: TitlebarMenu;

  constructor(private readonly page: Page) {
    this.dialog = new SettingsDialogPage(page);
    this.general = new SettingsGeneralPage(page);
    this.llm = new SettingsLlmPage(page);
    this.backend = new SettingsBackendPage(page);
    this.titlebar = new TitlebarMenu(page);
  }

  get rail(): Locator {
    return this.page.getByTestId('railbar-settings');
  }

  get html(): Locator {
    return this.page.locator('html');
  }
}
