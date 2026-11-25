// prettier-ignore
import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

// prettier-ignore
import { AssistantContextUsage, AssistantQuota, AssistantQuotaSnapshot, AssistantQuotaStatus, AssistantQuotaWindow } from '../assistant.models';
// prettier-ignore
import { compactTokens, elapsedDelay, quotaPercent, quotaTone, ResetDelay, resetDelay, usagePercent, UsageTone, usageTone, worstTone } from '../assistant.usage';

const RING_RADIUS = 6;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const WINDOW_KEYS: Record<AssistantQuotaWindow, LanguageKey> = {
  session: 'assistant.usage.quota.session',
  weekly: 'assistant.usage.quota.weekly',
};

const STATUS_KEYS: Record<AssistantQuotaStatus, LanguageKey> = {
  ok: 'assistant.usage.status.ok',
  warning: 'assistant.usage.status.warning',
  limited: 'assistant.usage.status.limited',
};

const CONTEXT_NOTE_KEYS: Record<UsageTone, LanguageKey> = {
  ok: 'assistant.usage.context.ok',
  warning: 'assistant.usage.context.warning',
  danger: 'assistant.usage.context.danger',
};

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
};

interface QuotaRow {
  window: AssistantQuotaWindow;
  labelKey: LanguageKey;
  statusKey: LanguageKey;
  limited: boolean;
  percent: number | null;
  tone: UsageTone;
  reset: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-usage',
  imports: [CoreModule],
  templateUrl: './usage.component.html',
})
export class AssistantUsageMeter {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly language = inject(LanguageService);

  readonly context = input<AssistantContextUsage | null>(null);
  readonly quota = input<AssistantQuotaSnapshot | null>(null);
  readonly open = signal(false);

  readonly percent = computed(() => {
    const context = this.context();
    return context === null ? null : usagePercent(context.usedTokens, context.maxTokens);
  });
  readonly tone = computed(() => usageTone(this.percent()));
  readonly ringDash = computed(
    () => `${((this.percent() ?? 0) / 100) * RING_LENGTH} ${RING_LENGTH}`,
  );
  readonly quotas = computed(() => (this.quota()?.quotas ?? []).map(this.quotaRow.bind(this)));
  readonly alert = computed(() =>
    worstTone([this.tone(), ...this.quotas().map((quota) => quota.tone)]),
  );
  readonly contextNoteKey = computed<LanguageKey>(() =>
    this.percent() === null ? 'assistant.usage.context.unknown' : CONTEXT_NOTE_KEYS[this.tone()],
  );
  readonly updated = computed(() => {
    const quota = this.quota();
    return quota === null ? '' : this.updatedLabel(quota.updatedAt);
  });

  tokens(value: number): string {
    return compactTokens(value, this.language.locale());
  }

  freeTokens(): string {
    const context = this.context();
    if (context === null || context.maxTokens === null) {
      return '';
    }
    return this.tokens(Math.max(0, context.maxTokens - context.usedTokens));
  }

  toggle(): void {
    this.open.update((value) => !value);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.open.set(false);
  }

  private quotaRow(quota: AssistantQuota): QuotaRow {
    const percent = quotaPercent(quota);
    return {
      window: quota.window,
      labelKey: WINDOW_KEYS[quota.window],
      statusKey: STATUS_KEYS[quota.status],
      limited: percent !== null && (quota.status === 'limited' || percent === 100),
      percent,
      tone: quotaTone(quota),
      reset: quota.resetsAt === null ? '' : this.resetLabel(quota.resetsAt),
    };
  }

  private resetLabel(resetsAt: string): string {
    const delay = resetDelay(resetsAt, Date.now());
    if (delay === null) {
      return this.language.translate('assistant.usage.reset.at', { date: this.date(resetsAt) });
    }
    return this.language.translate('assistant.usage.reset.in', { time: this.duration(delay) });
  }

  private updatedLabel(updatedAt: string): string {
    const delay = elapsedDelay(updatedAt, Date.now());
    if (delay === null) {
      return this.language.translate('assistant.usage.updated.at', { date: this.date(updatedAt) });
    }
    if (delay.hours === 0 && delay.minutes === 0) {
      return this.language.translate('assistant.usage.updated.now');
    }
    return this.language.translate('assistant.usage.updated.ago', { time: this.duration(delay) });
  }

  private duration(delay: ResetDelay): string {
    if (delay.hours > 0) {
      return this.language.translate('assistant.usage.duration.hm', {
        h: delay.hours,
        m: delay.minutes,
      });
    }
    return this.language.translate('assistant.usage.duration.m', { m: delay.minutes });
  }

  private date(value: string): string {
    return new Intl.DateTimeFormat(this.language.locale(), DATE_FORMAT).format(new Date(value));
  }
}
