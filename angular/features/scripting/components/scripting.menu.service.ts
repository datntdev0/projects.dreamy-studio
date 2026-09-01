import { Injectable, signal } from '@angular/core';

export interface ScriptingMenuItem {
  kind: 'item';
  label: string;
  icon: string;
  disabled: boolean;
  run: () => void;
}

export interface ScriptingMenuDivider {
  kind: 'divider';
}

export type ScriptingMenuRow = ScriptingMenuItem | ScriptingMenuDivider;

export interface ScriptingMenuState {
  anchor: HTMLElement;
  left: number;
  top: number;
  rows: ScriptingMenuRow[];
}

const MENU_OFFSET = 2;

export function menuItem(
  label: string,
  icon: string,
  disabled: boolean,
  run: () => void,
): ScriptingMenuItem {
  return { kind: 'item', label, icon, disabled, run };
}

export const MENU_DIVIDER: ScriptingMenuDivider = { kind: 'divider' };

@Injectable({ providedIn: 'root' })
export class ScriptingMenuService {
  readonly state = signal<ScriptingMenuState | null>(null);

  open(anchor: HTMLElement, rows: ScriptingMenuRow[]): void {
    const rect = anchor.getBoundingClientRect();
    this.state.set({ anchor, left: rect.left, top: rect.bottom + MENU_OFFSET, rows });
  }

  close(): void {
    this.state.set(null);
  }
}
