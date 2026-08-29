import { Type } from "@angular/core";

export type DialogTone = "danger" | "primary";

export interface DialogItem {
  name: string;
  meta?: string;
  icon?: string;
  data?: unknown;
}

export interface DialogOptions {
  title: string;
  eyebrow?: string;
  message?: string;
  items?: DialogItem[];
  itemLimit?: number;
  thumb?: Type<unknown>;
  moreLabel?: string;
  warning?: string;
  note?: string;
  acknowledge?: string;
  confirmLabel: string;
  confirmIcon?: string;
  cancelLabel?: string;
  closeLabel?: string;
  tone?: DialogTone;
  onConfirm?: () => Promise<void>;
}

export interface DialogRequest {
  id: number;
  options: DialogOptions;
}

export interface DialogRow {
  item: DialogItem;
  inputs: Record<string, unknown>;
}
