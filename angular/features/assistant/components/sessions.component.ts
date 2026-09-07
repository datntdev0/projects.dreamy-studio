import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { NovelSummary } from '@features/novel/novel.models';
import { displayName } from '@features/novel/novel.rules';
import { NovelService } from '@features/novel/novel.service';
import { ProjectService } from '@features/project/project.service';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { fieldValue } from '@shared/utils/dom';

import { AssistantScopeFilter, AssistantSessionSummary } from '../assistant.models';
// prettier-ignore
import { dayKey, matchesScopeFilter, matchesSessionQuery, parseScopeFilter, scopeFilterValue, shortStamp } from '../assistant.rules';
import { AssistantService } from '../assistant.service';
import { AssistantPaneHeader } from './pane-header.component';

type DayGroup = 'today' | 'yesterday' | 'week' | 'older';

interface SessionGroup {
  key: DayGroup;
  labelKey: LanguageKey;
  sessions: AssistantSessionSummary[];
}

const DAY_GROUPS: DayGroup[] = ['today', 'yesterday', 'week', 'older'];

const DAY_KEYS: Record<DayGroup, LanguageKey> = {
  today: 'assistant.history.today',
  yesterday: 'assistant.history.yesterday',
  week: 'assistant.history.week',
  older: 'assistant.history.older',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-sessions',
  imports: [Button, Icon, CoreModule, AssistantPaneHeader],
  templateUrl: './sessions.component.html',
})
export class AssistantSessions {
  readonly assistant = inject(AssistantService);
  readonly novels = inject(NovelService);
  readonly projects = inject(ProjectService);
  readonly query = signal('');
  readonly filter = signal<AssistantScopeFilter>('all');
  readonly visible = computed(this.buildVisible.bind(this));
  readonly groups = computed(this.buildGroups.bind(this));
  readonly filterActive = computed(this.buildFilterActive.bind(this));

  nameOf(novel: NovelSummary): string {
    return displayName(novel);
  }

  filterValue(): string {
    return scopeFilterValue(this.filter());
  }

  stampOf(session: AssistantSessionSummary): string {
    return shortStamp(session.updatedAt, new Date());
  }

  isActive(session: AssistantSessionSummary): boolean {
    return this.assistant.active()?.id === session.id;
  }

  onQuery(event: Event): void {
    this.query.set(fieldValue(event));
  }

  onFilter(event: Event): void {
    this.filter.set(parseScopeFilter(fieldValue(event)));
  }

  clearFilters(): void {
    this.query.set('');
    this.filter.set('all');
  }

  remove(session: AssistantSessionSummary): void {
    void this.assistant.confirmDelete(session.id);
  }

  private buildFilterActive(): boolean {
    return this.query().trim() !== '' || this.filter() !== 'all';
  }

  private buildVisible(): AssistantSessionSummary[] {
    const out: AssistantSessionSummary[] = [];
    for (const session of this.assistant.sessions()) {
      if (
        matchesScopeFilter(session, this.filter()) &&
        matchesSessionQuery(session, this.query())
      ) {
        out.push(session);
      }
    }
    return out;
  }

  private buildGroups(): SessionGroup[] {
    const now = new Date();
    const buckets = new Map<DayGroup, AssistantSessionSummary[]>();
    for (const session of this.visible()) {
      const key = dayKey(session.updatedAt, now);
      buckets.set(key, [...(buckets.get(key) ?? []), session]);
    }
    const out: SessionGroup[] = [];
    for (const key of DAY_GROUPS) {
      const sessions = buckets.get(key);
      if (sessions) {
        out.push({ key, labelKey: DAY_KEYS[key], sessions });
      }
    }
    return out;
  }
}
