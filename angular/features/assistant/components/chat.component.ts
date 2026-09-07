// prettier-ignore
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { Button } from '@components/button';
import { Icon } from '@components/icon';
import { formatStamp } from '@features/novel/novel.rules';
import { CoreModule } from '@shared/core.module';
import { openUrl } from '@tauri-apps/plugin-opener';

// prettier-ignore
import { AssistantAttachment, AssistantMessage, AssistantSession, KnowledgeChangeSet, PipelineRun, PipelineRunLaunch, ProposalResolution, ScriptDraft, TranslationReview } from '../assistant.models';
import { renderMarkdown } from '../assistant.rules';
import { AssistantService } from '../assistant.service';
import { AssistantChangesCard } from './changes-card.component';
import { AssistantComposer } from './composer.component';
import { AssistantPaneHeader } from './pane-header.component';
import { AssistantPipelineCard } from './pipeline-card.component';
import { AssistantReviewCard } from './review-card.component';
import { AssistantScriptDraftCard } from './script-draft-card.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assistant-chat',
  imports: [
    Button,
    Icon,
    CoreModule,
    AssistantChangesCard,
    AssistantComposer,
    AssistantPaneHeader,
    AssistantPipelineCard,
    AssistantReviewCard,
    AssistantScriptDraftCard,
  ],
  templateUrl: './chat.component.html',
})
export class AssistantChat {
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  readonly assistant = inject(AssistantService);
  private followKey = '';
  private readonly rendered = new Map<string, { text: string; html: string }>();

  constructor() {
    effect(this.followMessages.bind(this));
  }

  html(message: AssistantMessage): string {
    const cached = this.rendered.get(message.id);
    if (cached && cached.text === message.text) {
      return cached.html;
    }
    const html = renderMarkdown(message.text);
    this.rendered.set(message.id, { text: message.text, html });
    return html;
  }

  onTextClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    if (!anchor) {
      return;
    }
    event.preventDefault();
    const href = anchor.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      void openUrl(href);
    }
  }

  timeOf(message: AssistantMessage): string {
    return formatStamp(message.createdAt).slice(11);
  }

  title(session: AssistantSession | null): string {
    return session?.title ?? this.assistant.pendingText() ?? '';
  }

  attachmentsOf(message: AssistantMessage): AssistantAttachment[] {
    return message.attachments ?? [];
  }

  asReview(attachment: AssistantAttachment): TranslationReview | null {
    return attachment.kind === 'translation_review' ? attachment : null;
  }

  asChanges(attachment: AssistantAttachment): KnowledgeChangeSet | null {
    return attachment.kind === 'knowledge_changes' ? attachment : null;
  }

  asPipelineRun(attachment: AssistantAttachment): PipelineRun | null {
    return attachment.kind === 'pipeline_run' ? attachment : null;
  }

  asScriptDraft(attachment: AssistantAttachment): ScriptDraft | null {
    return attachment.kind === 'script_draft' ? attachment : null;
  }

  isResolving(message: AssistantMessage): boolean {
    return this.assistant.resolving() === message.id || this.assistant.launching() === message.id;
  }

  onLaunched(launch: PipelineRunLaunch): void {
    void this.assistant.runPipelineRun(launch.messageId, launch.run);
  }

  onOpened(pipelineId: number): void {
    this.assistant.openPipeline(pipelineId);
  }

  onResolved(resolution: ProposalResolution): void {
    void this.assistant.resolve(resolution);
  }

  remove(session: AssistantSession): void {
    void this.assistant.confirmDelete(session.id);
  }

  private followMessages(): void {
    const session = this.assistant.active();
    const pending = this.assistant.pendingText();
    const key = `${session?.id ?? ''}:${session?.messages.length ?? 0}:${pending ?? ''}`;
    if (key === this.followKey) {
      return;
    }
    this.followKey = key;
    setTimeout(this.reveal.bind(this, pending !== null));
  }

  private reveal(toEnd: boolean): void {
    const element = this.scroller()?.nativeElement;
    if (!element) {
      return;
    }
    const replies = element.querySelectorAll<HTMLElement>(
      '[data-testid="assistant-message-assistant"]',
    );
    const last = replies.item(replies.length - 1);
    if (toEnd || !last) {
      element.scrollTop = element.scrollHeight;
      return;
    }
    element.scrollTop = last.offsetTop - element.offsetTop - 8;
  }
}
