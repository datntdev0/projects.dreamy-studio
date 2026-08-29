import { Component, computed, effect, inject, input } from "@angular/core";
import { Icon } from "@components/icon";
import { coverBackground } from "@components/cover";
import { ProjectSummary } from "../project.models";
import { ProjectService } from "../project.service";

export type ProjectThumbKind = "th" | "card" | "hero";
export type ProjectThumbSize = "" | "xs" | "md";

const PLACEHOLDER_SIZES: Record<string, number> = { xs: 10, th: 16, md: 20, card: 32, hero: 40 };

@Component({
  selector: "app-project-thumb",
  standalone: true,
  imports: [Icon],
  templateUrl: "./thumb.component.html",
})
export class ProjectThumb {
  private readonly projects = inject(ProjectService);
  readonly project = input.required<ProjectSummary>();
  readonly kind = input<ProjectThumbKind>("th");
  readonly size = input<ProjectThumbSize>("");
  readonly image = computed(this.buildImage.bind(this));
  readonly background = computed(this.buildBackground.bind(this));
  readonly placeholderSize = computed(this.buildPlaceholderSize.bind(this));

  constructor() {
    effect(this.syncCover.bind(this));
  }

  private buildImage(): string {
    return this.projects.coverUrl(this.project().id) ?? "";
  }

  private buildBackground(): string {
    return coverBackground(this.image());
  }

  private buildPlaceholderSize(): number {
    const key = this.kind() === "th" ? this.size() || "th" : this.kind();
    return PLACEHOLDER_SIZES[key];
  }

  private syncCover(): void {
    this.projects.ensureCover(this.project().id);
  }
}
