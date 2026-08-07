import { Injectable, signal } from "@angular/core";
import { ToastItem, ToastTone } from "./toast.models";

const TOAST_LIFETIME_MS = 3800;

@Injectable({ providedIn: "root" })
export class ToastService {
  private nextId = 1;

  readonly items = signal<ToastItem[]>([]);

  show(message: string, tone: ToastTone = "success"): void {
    const id = this.nextId++;
    this.items.set([...this.items(), { id, message, tone }]);
    setTimeout(this.dismiss.bind(this, id), TOAST_LIFETIME_MS);
  }

  dismiss(id: number): void {
    const next: ToastItem[] = [];
    for (const item of this.items()) {
      if (item.id !== id) {
        next.push(item);
      }
    }
    this.items.set(next);
  }
}
