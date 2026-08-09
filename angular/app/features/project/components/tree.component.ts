import { Component, effect, inject, input } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { DirEntry } from "../project.models";
import { ProjectService } from "../project.service";
import { treeKey } from "../project.rules";

@Component({
  selector: "app-project-tree",
  standalone: true,
  imports: [Icon, I18nPipe],
  templateUrl: "./tree.component.html",
})
export class ProjectTree {
  readonly projectId = input.required<number>();
  readonly path = input("");
  readonly depth = input(0);
  readonly indent = input(8);
  readonly projects = inject(ProjectService);

  constructor() {
    effect(this.ensureDirectory.bind(this));
  }

  entries(): DirEntry[] {
    return this.projects.dirEntries(this.projectId(), this.path());
  }

  childPath(entry: DirEntry): string {
    return this.path() ? `${this.path()}/${entry.name}` : entry.name;
  }

  keyFor(entry: DirEntry): string {
    return treeKey(this.projectId(), this.childPath(entry));
  }

  toggle(entry: DirEntry): void {
    if (entry.kind !== "dir") {
      return;
    }
    const key = this.keyFor(entry);
    this.projects.toggleExpanded(key);
    if (this.projects.isExpanded(key)) {
      void this.projects.ensureDir(this.projectId(), this.childPath(entry));
    }
  }

  onKeydown(entry: DirEntry, event: KeyboardEvent): void {
    if (event.key === "ArrowRight" && entry.kind === "dir" && !this.projects.isExpanded(this.keyFor(entry))) {
      event.preventDefault();
      this.toggle(entry);
    }
    if (event.key === "ArrowLeft" && entry.kind === "dir" && this.projects.isExpanded(this.keyFor(entry))) {
      event.preventDefault();
      this.toggle(entry);
    }
    if (event.key === "Enter" && entry.kind === "dir") {
      event.preventDefault();
      this.toggle(entry);
    }
  }

  sizeLabel(entry: DirEntry): string {
    if (entry.kind === "dir") {
      return "";
    }
    if (entry.size < 1024) {
      return `${entry.size} B`;
    }
    if (entry.size < 1048576) {
      return `${(entry.size / 1024).toFixed(1)} KB`;
    }
    return `${(entry.size / 1048576).toFixed(1)} MB`;
  }

  private ensureDirectory(): void {
    void this.projects.ensureDir(this.projectId(), this.path());
  }
}
