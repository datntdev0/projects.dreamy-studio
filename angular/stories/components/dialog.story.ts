import { Component, Input, inject } from "@angular/core";
import { Button } from "@components/button";
import type { Meta, StoryObj } from "@storybook/angular-vite";
import { CoreModule } from "@app/core/core.module";
import { DialogItem, DialogOptions } from "@app/core/dialog/dialog.models";
import { DialogService } from "@app/core/dialog/dialog.service";

const SAMPLE_ITEMS: DialogItem[] = [
  { name: "Chapter 01", meta: "Novel · 12 KB", icon: "film" },
  { name: "Narration.wav", meta: "Audio · 48 MB", icon: "music" },
  { name: "Cover.png", meta: "Image · 2.4 MB", icon: "film" },
];

function manyItems(count: number): DialogItem[] {
  return Array.from({ length: count }, (_, index) => ({ name: `Chapter ${String(index + 1).padStart(2, "0")}`, meta: "Novel · 12 KB", icon: "film" }));
}

@Component({
  selector: "app-dialog-story-thumb",
  standalone: true,
  template: `<span class="lb-th" [style.background]="color()" style="width: 52px; display: grid; place-items: center; color: #fff; font-weight: 600" data-testid="dialog-story-thumb">{{ initial() }}</span>`,
})
class DialogStoryThumb {
  @Input() item: DialogItem = { name: "" };

  color(): string {
    return String(this.item.data ?? "#6366f1");
  }

  initial(): string {
    return this.item.name.slice(0, 1).toUpperCase();
  }
}

const THUMB_ITEMS: DialogItem[] = [
  { name: "Cover.png", meta: "Image · 2.4 MB", data: "#0ea5e9" },
  { name: "Banner.png", meta: "Image · 1.1 MB", data: "#f97316" },
  { name: "Portrait.png", meta: "Image · 3.8 MB", data: "#22c55e" },
];

function wait(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

@Component({
  selector: "app-dialog-story",
  standalone: true,
  imports: [Button, CoreModule],
  template: `
    <div style="display: grid; gap: 12px; padding: 24px" data-testid="dialog-story">
      <div [style.display]="'flex'" [style.gap.px]="8" [style.flex-wrap]="'wrap'" data-testid="dialog-story-actions">
        <ds-button data-testid="dialog-story-simple" (pressed)="run(simple())">Đơn giản</ds-button>
        <ds-button data-testid="dialog-story-list" (pressed)="run(list(this.items, ''))">Có danh sách</ds-button>
        <ds-button data-testid="dialog-story-many" (pressed)="run(list(many, 'và 4 mục khác'))">Danh sách dài</ds-button>
        <ds-button data-testid="dialog-story-thumbnail" (pressed)="run(thumbnail())">Có thumbnail</ds-button>
        <ds-button data-testid="dialog-story-acknowledge" (pressed)="run(acknowledge())">Cần tích xác nhận</ds-button>
        <ds-button data-testid="dialog-story-primary" (pressed)="run(primary())">Nút chính (primary)</ds-button>
        <ds-button data-testid="dialog-story-async" (pressed)="run(asyncSuccess())">Xử lý bất đồng bộ</ds-button>
        <ds-button data-testid="dialog-story-failure" (pressed)="run(asyncFailure())">Xử lý thất bại</ds-button>
      </div>
      <div class="note" data-testid="dialog-story-result">Kết quả gần nhất: {{ result || "—" }}</div>
      <app-dialog-host />
    </div>
  `,
})
class DialogStory {
  readonly items = SAMPLE_ITEMS;
  readonly many = manyItems(12);
  result = "";

  private readonly dialogs = inject(DialogService);

  async run(options: DialogOptions): Promise<void> {
    const accepted = await this.dialogs.ask(options);
    this.result = accepted ? "Đã xác nhận" : "Đã huỷ";
  }

  simple(): DialogOptions {
    return { title: "Xoá collection", eyebrow: "Library", message: "Bạn có chắc muốn xoá Cảnh đêm?", warning: "Thao tác này không thể hoàn tác.", confirmLabel: "Xoá", confirmIcon: "trash", cancelLabel: "Huỷ", closeLabel: "Đóng" };
  }

  list(items: DialogItem[], moreLabel: string): DialogOptions {
    return { title: `Xoá ${items.length} mục`, eyebrow: "Library", items, moreLabel, warning: "Các tệp sẽ bị xoá vĩnh viễn.", confirmLabel: `Xoá ${items.length} mục`, confirmIcon: "trash", cancelLabel: "Huỷ", closeLabel: "Đóng" };
  }

  acknowledge(): DialogOptions {
    return { ...this.list(this.items, ""), title: "Xoá dự án", note: "Thư mục dự án trên đĩa sẽ được giữ nguyên.", acknowledge: "Tôi hiểu dự án sẽ bị xoá khỏi workspace" };
  }

  primary(): DialogOptions {
    return { title: "Gộp tag", eyebrow: "Library", message: "Gộp tag cũ vào tag mới?", warning: "12 tài nguyên sẽ được gắn lại tag.", confirmLabel: "Gộp", tone: "primary", cancelLabel: "Huỷ", closeLabel: "Đóng" };
  }

  asyncSuccess(): DialogOptions {
    return { ...this.simple(), title: "Xoá chương", onConfirm: this.delay.bind(this) };
  }

  thumbnail(): DialogOptions {
    return { ...this.list(THUMB_ITEMS, ""), title: "Xoá 3 ảnh", thumb: DialogStoryThumb };
  }

  asyncFailure(): DialogOptions {
    return { ...this.simple(), title: "Xoá workspace", onConfirm: this.fail.bind(this) };
  }

  private async delay(): Promise<void> {
    await wait(1200);
  }

  private async fail(): Promise<void> {
    await wait(600);
    throw new Error("Không thể xoá: thư mục đang được sử dụng.");
  }
}

const meta: Meta<DialogStory> = {
  title: "Components/Dialog",
  component: DialogStory,
  parameters: { layout: "fullscreen" },
};

export default meta;

type Story = StoryObj<DialogStory>;

export const Playground: Story = {};
