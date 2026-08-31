import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';

// prettier-ignore
import { AssistantCitation, KnowledgeChange, KnowledgeChangeSet, ProposalDecision, ProposalResolution, ProposalStatus } from '../assistant.models';
import { OP_ICONS, OP_KEYS, STATUS_KEYS } from '../assistant.proposals';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-changes-card',
  imports: [Icon, CoreModule],
  templateUrl: './changes-card.component.html',
})
export class AssistantChangesCard {
  readonly changeSet = input.required<KnowledgeChangeSet>();
  readonly messageId = input.required<string>();
  readonly busy = input(false);
  readonly resolved = output<ProposalResolution>();

  opKey(change: KnowledgeChange): LanguageKey {
    return OP_KEYS[change.op];
  }

  opIcon(change: KnowledgeChange): string {
    return OP_ICONS[change.op];
  }

  statusKey(status: ProposalStatus): LanguageKey {
    return STATUS_KEYS[status];
  }

  citationLabel(citation: AssistantCitation): string {
    return `Ch.${citation.chapter} ¶${citation.p}`;
  }

  apply(): void {
    this.decide('applied');
  }

  reject(): void {
    this.decide('rejected');
  }

  private decide(status: ProposalDecision): void {
    const set = this.changeSet();
    if (set.status === 'pending' && !this.busy()) {
      this.resolved.emit({ messageId: this.messageId(), itemIds: [set.id], status });
    }
  }
}
