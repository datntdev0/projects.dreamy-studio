import { ChangeDetectionStrategy, Component, input, model, signal } from '@angular/core';

const KEY_STEP = 10;
const KEY_STEP_LARGE = 40;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ds-resizer',
  templateUrl: './resizer.html',
})
export class Resizer {
  readonly size = model.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();
  readonly initial = input.required<number>();
  readonly label = input('');
  readonly dragging = signal(false);
  private startX = 0;
  private startSize = 0;

  begin(event: PointerEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.startX = event.clientX;
    this.startSize = this.size();
    this.dragging.set(true);
  }

  move(event: PointerEvent): void {
    if (this.dragging()) {
      this.apply(this.startSize + event.clientX - this.startX);
    }
  }

  end(): void {
    this.dragging.set(false);
  }

  reset(): void {
    this.apply(this.initial());
  }

  handleKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    const delta = { ArrowRight: step, ArrowLeft: -step }[event.key] ?? 0;
    if (event.key === 'Home') {
      event.preventDefault();
      this.reset();
    } else if (delta) {
      event.preventDefault();
      this.apply(this.size() + delta);
    }
  }

  private apply(size: number): void {
    this.size.set(Math.max(this.min(), Math.min(this.max(), Math.round(size))));
  }
}
