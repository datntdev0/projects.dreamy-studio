import { Component, ElementRef, effect, inject, viewChild } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { formatStamp } from "@app/features/novel/novel.rules";
import { AssistantAttachment, AssistantBlock, AssistantMessage, AssistantSession, KnowledgeChangeSet, ProposalResolution, TranslationReview } from "../assistant.models";
import { blocksOf } from "../assistant.rules";
import { AssistantService } from "../assistant.service";
import { AssistantChangesCard } from "./changes-card.component";
import { AssistantComposer } from "./composer.component";
import { AssistantReviewCard } from "./review-card.component";

@Component({
  selector: "app-assistant-chat",
  standalone: true,
  imports: [Button, Icon, CoreModule, AssistantChangesCard, AssistantComposer, AssistantReviewCard],
  templateUrl: "./chat.component.html",
})
export class AssistantChat {
  private readonly scroller = viewChild<ElementRef<HTMLElement>>("scroller");

  readonly assistant = inject(AssistantService);
  private followKey = "";

  constructor() {
    effect(this.followMessages.bind(this));
  }

  blocks(message: AssistantMessage): AssistantBlock[] {
    return blocksOf(message.text);
  }

  timeOf(message: AssistantMessage): string {
    return formatStamp(message.createdAt).slice(11);
  }


  title(session: AssistantSession | null): string {
    return session?.title ?? this.assistant.pendingText() ?? "";
  }

  attachmentsOf(message: AssistantMessage): AssistantAttachment[] {
    return message.attachments ?? [];
  }

  asReview(attachment: AssistantAttachment): TranslationReview | null {
    return attachment.kind === "translation_review" ? attachment : null;
  }

  asChanges(attachment: AssistantAttachment): KnowledgeChangeSet | null {
    return attachment.kind === "knowledge_changes" ? attachment : null;
  }

  isResolving(message: AssistantMessage): boolean {
    return this.assistant.resolving() === message.id;
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
    const key = `${session?.id ?? ""}:${session?.messages.length ?? 0}:${pending ?? ""}`;
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
    const replies = element.querySelectorAll<HTMLElement>('[data-testid="assistant-message-assistant"]');
    const last = replies.item(replies.length - 1);
    if (toEnd || !last) {
      element.scrollTop = element.scrollHeight;
      return;
    }
    element.scrollTop = last.offsetTop - element.offsetTop - 8;
  }
}
