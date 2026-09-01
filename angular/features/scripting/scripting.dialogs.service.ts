import { Injectable, signal } from '@angular/core';

export type ScriptingDialogKind = 'check' | 'unlock' | 'reset' | 'default' | 'draft';

export interface ScriptingDialogRequest {
  kind: ScriptingDialogKind;
  projectId: number;
}

@Injectable({ providedIn: 'root' })
export class ScriptingDialogsService {
  readonly request = signal<ScriptingDialogRequest | null>(null);

  openCheck(projectId: number): void {
    this.open('check', projectId);
  }

  openUnlock(projectId: number): void {
    this.open('unlock', projectId);
  }

  openReset(projectId: number): void {
    this.open('reset', projectId);
  }

  openDefault(projectId: number): void {
    this.open('default', projectId);
  }

  openDraft(projectId: number): void {
    this.open('draft', projectId);
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
