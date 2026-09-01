import { Injectable, signal } from '@angular/core';

export type ScriptingDialogKind = 'reset' | 'default';

export interface ScriptingDialogRequest {
  kind: ScriptingDialogKind;
  projectId: number;
}

@Injectable({ providedIn: 'root' })
export class ScriptingDialogsService {
  readonly request = signal<ScriptingDialogRequest | null>(null);

  openReset(projectId: number): void {
    this.open('reset', projectId);
  }

  openDefault(projectId: number): void {
    this.open('default', projectId);
  }

  close(): void {
    this.request.set(null);
  }

  projectIdOf(kind: ScriptingDialogKind): number | null {
    const request = this.request();
    return request?.kind === kind ? request.projectId : null;
  }

  private open(kind: ScriptingDialogKind, projectId: number): void {
    this.request.set({ kind, projectId });
  }
}
