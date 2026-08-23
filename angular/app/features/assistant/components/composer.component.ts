import { Component, ElementRef, inject, viewChild } from "@angular/core";
import { Button } from "@components/button";
import { Icon } from "@components/icon";
import { CoreModule } from "@app/core/core.module";
import { AssistantService } from "../assistant.service";

@Component({
  selector: "app-assistant-composer",
  standalone: true,
  imports: [Button, Icon, CoreModule],
  templateUrl: "./composer.component.html",
})
export class AssistantComposer {
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>("field");

  readonly assistant = inject(AssistantService);

  focus(): void {
    this.field()?.nativeElement.focus();
  }

  onInput(event: Event): void {
    this.assistant.draft.set((event.target as HTMLTextAreaElement).value);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void this.submit();
    }
  }

  async submit(): Promise<void> {
    const text = this.assistant.draft();
    if (text.trim() === "" || this.assistant.sending()) {
      return;
    }
    this.assistant.draft.set("");
    const sent = await this.assistant.send(text);
    if (!sent && this.assistant.draft() === "") {
      this.assistant.draft.set(text);
    }
  }
}
