import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { Icon } from "../../components/icon";
import { I18nKey } from "../../app/core/i18n/i18n.models";
import { I18nPipe } from "../../app/core/i18n/i18n.pipe";
import { ThemeService } from "../../app/core/theme/theme.service";
import { WorkspaceService } from "../../app/features/workspace/workspace.service";
import { AppInfo } from "../../app/features/workspace/workspace.models";

@Component({
  selector: "app-statusbar",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./statusbar.html",
})
export class Statusbar implements OnInit {
  private readonly service = inject(WorkspaceService);
  private readonly themes = inject(ThemeService);

  readonly workspace = this.service.current;
  readonly info = signal<AppInfo | null>(null);
  readonly themeIcon = computed(this.currentThemeIcon.bind(this));
  readonly themeToggleKey = computed(this.currentThemeToggleKey.bind(this));

  ngOnInit(): void {
    void this.loadInfo();
  }

  toggleTheme(): void {
    this.themes.setTheme(this.themes.theme() === "dark" ? "light" : "dark");
  }

  private currentThemeIcon(): string {
    return this.themes.theme() === "dark" ? "sun" : "moon";
  }

  private currentThemeToggleKey(): I18nKey {
    return this.themes.theme() === "dark" ? "theme.toLight" : "theme.toDark";
  }

  private async loadInfo(): Promise<void> {
    try {
      this.info.set(await this.service.appInfo());
    } catch {
      this.info.set(null);
    }
  }
}
