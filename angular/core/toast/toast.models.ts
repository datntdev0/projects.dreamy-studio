export type ToastTone = "success" | "warning" | "danger" | "info";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}
