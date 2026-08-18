import { Component, EventEmitter, Input, Output } from "@angular/core";
import { Icon } from "./icon";

export type TabOption = { value: string; label: string; icon?: string; disabled?: boolean };

@Component({
  selector: "ds-tabs",
  standalone: true,
  imports: [Icon],
  templateUrl: "./tabs.html",
})
export class Tabs {
  @Input() label = "Tabs";
  @Input() idPrefix = "tabs";
  @Input() options: TabOption[] = [];
  @Input() value = "";
  @Output() valueChange = new EventEmitter<string>();

  select(value: string): void {
    this.value = value;
    this.valueChange.emit(value);
  }

  tabId(value: string): string {
    return `${this.idPrefix}-tab-${value}`;
  }

  panelId(value: string): string {
    return `${this.idPrefix}-panel-${value}`;
  }

  onKeydown(event: KeyboardEvent): void {
    const enabled = this.options.filter(this.isEnabled);
    const target = this.targetOption(enabled, event.key);
    if (!target) {
      return;
    }
    event.preventDefault();
    this.select(target.value);
    this.focusTab(event.currentTarget as HTMLElement, target.value);
  }

  private isEnabled(option: TabOption): boolean {
    return !option.disabled;
  }

  private targetOption(enabled: TabOption[], key: string): TabOption | undefined {
    const count = enabled.length;
    const index = enabled.findIndex((option) => option.value === this.value);
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    };
    return key in targets ? enabled[targets[key]] : undefined;
  }

  private focusTab(list: HTMLElement, value: string): void {
    list.querySelector<HTMLElement>(`#${this.tabId(value)}`)?.focus();
  }
}
