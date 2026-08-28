import type { Locator, Page } from "@playwright/test";

export type SettingsSectionId = "general" | "llm" | "backend" | "tts" | "speech";
export type GeneralTab = "interface" | "pipelines" | "storage";
export type LlmTab = "cli" | "cloud" | "features";
export type LlmFeatureId = "translation" | "knowledge" | "assistant";
export type CliId = "claude" | "codex" | "antigravity";
export type CloudId = "anthropic" | "openai" | "google" | "openrouter" | "custom";

export class SettingsDialogPage {
  constructor(private readonly page: Page) {}

  get panel(): Locator {
    return this.page.getByTestId("settings-dialog-panel");
  }

  get title(): Locator {
    return this.panel.getByTestId("dialog-title");
  }

  get close(): Locator {
    return this.panel.getByTestId("dialog-close");
  }

  get navItems(): Locator {
    return this.page.getByTestId("settings-nav").getByRole("button");
  }

  get emptyTitle(): Locator {
    return this.page.getByTestId("settings-empty-title");
  }

  get emptyDescription(): Locator {
    return this.page.getByTestId("settings-empty-description");
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
    return this.page.getByTestId("settings-general-tabs").getByTestId(`tab-${id}`);
  }

  get languageOptions(): Locator {
    return this.page.getByTestId("settings-general-language").getByRole("button");
  }

  get themeOptions(): Locator {
    return this.page.getByTestId("settings-general-theme").getByRole("button");
  }

  get maxPipelines(): Locator {
    return this.page.getByTestId("settings-general-max-pipelines-input").getByTestId("slider");
  }

  get maxPipelinesValue(): Locator {
    return this.page.getByTestId("settings-general-max-pipelines-value");
  }

  get maxTasks(): Locator {
    return this.page.getByTestId("settings-general-max-tasks-input").getByTestId("slider");
  }

  get maxTasksValue(): Locator {
    return this.page.getByTestId("settings-general-max-tasks-value");
  }

  get workspacePath(): Locator {
    return this.page.getByTestId("settings-general-workspace-path");
  }

  get workspaceOpen(): Locator {
    return this.page.getByTestId("settings-general-workspace-open");
  }

  get dataPath(): Locator {
    return this.page.getByTestId("settings-general-data-path");
  }

  get dataOpen(): Locator {
    return this.page.getByTestId("settings-general-data-open");
  }

  get note(): Locator {
    return this.page.getByTestId("settings-general-note");
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
    return this.part("name");
  }

  get badge(): Locator {
    return this.part("badge");
  }

  get install(): Locator {
    return this.part("install");
  }

  get path(): Locator {
    return this.part("path");
  }

  get manual(): Locator {
    return this.part("manual");
  }

  get usePath(): Locator {
    return this.part("usepath");
  }

  get pathError(): Locator {
    return this.part("path-error");
  }

  get signinStep(): Locator {
    return this.part("signin-step");
  }

  get signin(): Locator {
    return this.part("signin");
  }

  get signout(): Locator {
    return this.part("signout");
  }

  get account(): Locator {
    return this.part("account");
  }

  get profile(): Locator {
    return this.part("profile");
  }

  get profileOpen(): Locator {
    return this.part("profile-open");
  }

  get check(): Locator {
    return this.part("check");
  }

  get status(): Locator {
    return this.part("status");
  }

  get error(): Locator {
    return this.part("error");
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
    return this.part("name");
  }

  get hint(): Locator {
    return this.part("hint");
  }

  get provider(): Locator {
    return this.part("provider");
  }

  get providerOptions(): Locator {
    return this.provider.locator("option");
  }

  get providerSelected(): Locator {
    return this.provider.locator("option:checked");
  }

  get providerEmpty(): Locator {
    return this.part("provider-empty");
  }

  get model(): Locator {
    return this.part("model");
  }

  get modelSuggestions(): Locator {
    return this.page.locator(`datalist#settings-llm-feature-${this.id}-models option`);
  }

  get effort(): Locator {
    return this.part("effort");
  }

  get args(): Locator {
    return this.part("args");
  }
}

export class SettingsLlmPage {
  constructor(private readonly page: Page) {}

  tab(id: LlmTab): Locator {
    return this.page.getByTestId("settings-llm-tabs").getByTestId(`tab-${id}`);
  }

  get features(): Locator {
    return this.page.getByTestId("settings-llm-features");
  }

  get featureCards(): Locator {
    return this.features.locator("article");
  }

  get cloudSoon(): Locator {
    return this.page.getByTestId("settings-llm-cloud-soon");
  }

  get cloudIntro(): Locator {
    return this.page.getByTestId("settings-llm-cloud-intro");
  }

  get cloudCards(): Locator {
    return this.page.getByTestId("settings-llm-cloud").locator("article");
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

export class TitlebarMenu {
  constructor(private readonly page: Page) {}

  get viewButton(): Locator {
    return this.page.getByTestId("titlebar-menu-view");
  }

  get menu(): Locator {
    return this.page.getByTestId("titlebar-view-menu");
  }

  get switchTheme(): Locator {
    return this.page.getByTestId("titlebar-view-switch-theme");
  }

  get themeIcon(): Locator {
    return this.switchTheme.locator("use");
  }

  get languageName(): Locator {
    return this.page.getByTestId("titlebar-view-language-name");
  }
}

export class SettingsPage {
  readonly dialog: SettingsDialogPage;
  readonly general: SettingsGeneralPage;
  readonly llm: SettingsLlmPage;
  readonly titlebar: TitlebarMenu;

  constructor(private readonly page: Page) {
    this.dialog = new SettingsDialogPage(page);
    this.general = new SettingsGeneralPage(page);
    this.llm = new SettingsLlmPage(page);
    this.titlebar = new TitlebarMenu(page);
  }

  get rail(): Locator {
    return this.page.getByTestId("railbar-settings");
  }

  get html(): Locator {
    return this.page.locator("html");
  }
}
