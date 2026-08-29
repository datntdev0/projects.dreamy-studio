import { Component, computed, input, output } from "@angular/core";
import { Icon } from "@components/icon";
import { CoreModule } from "@core/core.module";
import { LanguageKey } from "@core/language/language.models";
import { DictProposal, MarkedText, ProposalDecision, ProposalResolution, ProposalStatus, TranslationFinding, TranslationReview } from "../assistant.models";
import { CATEGORY_KEYS, SEVERITY_BADGES, SEVERITY_KEYS, STATUS_KEYS, countResolved, countSeverity, markText, pendingIds } from "../assistant.proposals";

@Component({
  selector: "app-assistant-review-card",
  standalone: true,
  imports: [Icon, CoreModule],
  templateUrl: "./review-card.component.html",
})
export class AssistantReviewCard {
  readonly review = input.required<TranslationReview>();
  readonly messageId = input.required<string>();
  readonly busy = input(false);
  readonly resolved = output<ProposalResolution>();

  readonly pending = computed(this.buildPending.bind(this));
  readonly errors = computed(this.buildErrors.bind(this));
  readonly warnings = computed(this.buildWarnings.bind(this));
  readonly infos = computed(this.buildInfos.bind(this));
  readonly done = computed(this.buildDone.bind(this));
  readonly total = computed(this.buildTotal.bind(this));

  severityKey(finding: TranslationFinding): LanguageKey {
    return SEVERITY_KEYS[finding.severity];
  }

  severityBadge(finding: TranslationFinding): string {
    return SEVERITY_BADGES[finding.severity];
  }

  categoryKey(finding: TranslationFinding): LanguageKey {
    return CATEGORY_KEYS[finding.category];
  }

  statusKey(status: ProposalStatus): LanguageKey {
    return STATUS_KEYS[status];
  }

  currentOf(finding: TranslationFinding): MarkedText {
    return markText(finding.current, finding.from);
  }

  suggestedOf(finding: TranslationFinding): MarkedText {
    return markText(finding.suggested, finding.to);
  }

  decide(ids: string[], status: ProposalDecision): void {
    if (ids.length > 0 && !this.busy()) {
      this.resolved.emit({ messageId: this.messageId(), itemIds: ids, status });
    }
  }

  applyOne(item: TranslationFinding | DictProposal): void {
    this.decide([item.id], "applied");
  }

  rejectOne(item: TranslationFinding | DictProposal): void {
    this.decide([item.id], "rejected");
  }

  applyAll(): void {
    this.decide(this.pending(), "applied");
  }

  rejectAll(): void {
    this.decide(this.pending(), "rejected");
  }

  private buildPending(): string[] {
    return pendingIds(this.review());
  }

  private buildErrors(): number {
    return countSeverity(this.review().findings, "error");
  }

  private buildWarnings(): number {
    return countSeverity(this.review().findings, "warning");
  }

  private buildInfos(): number {
    return countSeverity(this.review().findings, "info");
  }

  private buildDone(): number {
    return countResolved([...this.review().findings, ...this.review().dictionary]);
  }

  private buildTotal(): number {
    return this.review().findings.length + this.review().dictionary.length;
  }
}
