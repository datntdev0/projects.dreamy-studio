import { computed, effect, untracked } from '@angular/core';

import { WorkspaceService } from '../workspace/workspace.service';
import { LibraryService } from './library.service';

export interface LibraryWorkspaceSyncOptions {
  workspace: WorkspaceService;
  library: LibraryService;
  reset: () => void;
  load: () => Promise<void>;
  isLoaded: () => boolean;
}

export class LibraryWorkspaceSync {
  private readonly workspacePath = computed(this.currentPath.bind(this));
  private lastWorkspacePath: string | null | undefined = undefined;
  private lastRevision: number | undefined = undefined;

  constructor(private readonly options: LibraryWorkspaceSyncOptions) {}

  start(): void {
    effect(this.syncWorkspace.bind(this));
    effect(this.syncRevision.bind(this));
  }

  private currentPath(): string | null {
    return this.options.workspace.current()?.path ?? null;
  }

  private syncWorkspace(): void {
    untracked(this.applyWorkspace.bind(this, this.workspacePath()));
  }

  private applyWorkspace(path: string | null): void {
    if (path === this.lastWorkspacePath) return;
    this.lastWorkspacePath = path;
    this.options.reset();
    if (path !== null) void this.options.load();
  }

  private syncRevision(): void {
    untracked(this.applyRevision.bind(this, this.options.library.revision()));
  }

  private applyRevision(revision: number): void {
    if (revision === this.lastRevision) return;
    this.lastRevision = revision;
    if (this.options.isLoaded()) void this.options.load();
  }
}
