import { Component, Input } from '@angular/core';
// prettier-ignore
import { Datatable, DatatableAction, DatatableCell, DatatableCellEdit, DatatableColumn, DatatableEmpty, DatatableRow, DatatableVariant } from '@components/datatable';
import type { FormOption } from '@components/form';
import type { Meta, StoryObj } from '@storybook/angular-vite';

const COLUMNS: DatatableColumn[] = [
  { key: 'name', label: 'Tên' },
  { key: 'type', label: 'Loại' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'size', label: 'Dung lượng', align: 'right' },
];

const TYPE_OPTIONS: FormOption[] = [
  { value: 'Novel', label: 'Novel' },
  { value: 'Audio', label: 'Audio' },
  { value: 'Image', label: 'Image' },
];

const EDITABLE_COLUMNS: DatatableColumn[] = [
  { key: 'name', label: 'Tên', editable: true },
  { key: 'type', label: 'Loại', editable: true, editor: 'select', options: TYPE_OPTIONS },
  { key: 'status', label: 'Trạng thái', editable: true },
  { key: 'size', label: 'Dung lượng', align: 'right' },
];

const FEW_ROWS: DatatableRow[] = [
  { id: 1, name: 'Chapter 01', type: 'Novel', status: 'Hoàn tất', size: '12 KB', locked: false },
  { id: 2, name: 'Narration.wav', type: 'Audio', status: 'Đang tạo', size: '48 MB', locked: true },
  { id: 3, name: 'Cover.png', type: 'Image', status: 'Sẵn sàng', size: '2.4 MB', locked: false },
];

function manyRows(count: number): DatatableRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Chapter ${String(index + 1).padStart(2, '0')}`,
    type: 'Novel',
    status: index % 3 === 0 ? 'Hoàn tất' : 'Đang tạo',
    size: `${12 + index} KB`,
    locked: index % 4 === 3,
  }));
}

@Component({
  selector: 'app-datatable-story',
  imports: [Datatable, DatatableCell, DatatableEmpty],
  template: `
    <div style="display: grid; gap: 12px; padding: 24px" data-testid="datatable-story">
      <div
        [style.height]="height || null"
        [style.display]="height ? 'flex' : null"
        data-testid="datatable-story-host"
      >
        @if (customEmpty) {
          <ds-datatable
            [columns]="editable ? editableColumns : columns"
            [rows]="rows"
            trackKey="id"
            [variant]="variant"
            [actions]="withActions ? actions : null"
            actionsLabel="Thao tác"
            (cellEdit)="onCellEdit($event)"
            data-testid="datatable-story-table"
          >
            <ng-template dsEmpty>
              <strong data-testid="datatable-story-empty">Chưa có tài nguyên nào</strong>
              <div>Nhập tệp để bắt đầu.</div>
            </ng-template>
          </ds-datatable>
        } @else {
          <ds-datatable
            [columns]="editable ? editableColumns : columns"
            [rows]="rows"
            trackKey="id"
            [variant]="variant"
            [actions]="withActions ? actions : null"
            actionsLabel="Thao tác"
            emptyMessage="Không có dữ liệu"
            (cellEdit)="onCellEdit($event)"
            data-testid="datatable-story-table"
          >
            <ng-template dsCell="name" let-row>
              <strong>{{ textOf(row, 'name') }}</strong>
            </ng-template>
          </ds-datatable>
        }
      </div>
      <div class="note" data-testid="datatable-story-last-action">
        Thao tác gần nhất: {{ lastAction || '—' }}
      </div>
    </div>
  `,
})
class DatatableStory {
  @Input() rows: DatatableRow[] = FEW_ROWS;
  @Input() variant: DatatableVariant = 'card';
  @Input() withActions = true;
  @Input() customEmpty = false;
  @Input() height = '';
  @Input() editable = false;

  lastAction = '';

  readonly columns = COLUMNS;
  readonly editableColumns = EDITABLE_COLUMNS;

  readonly actions = (row: DatatableRow): DatatableAction[] => [
    { key: 'rename', label: 'Đổi tên', icon: 'pen', handler: this.record.bind(this, 'Đổi tên') },
    { key: 'copy', label: 'Nhân bản', icon: 'copy', handler: this.record.bind(this, 'Nhân bản') },
    {
      key: 'delete',
      label: 'Xóa',
      icon: 'trash',
      danger: true,
      disabled: Reflect.get(row, 'locked') === true,
      handler: this.record.bind(this, 'Xóa'),
    },
  ];

  textOf(row: object, key: string): string {
    return String(Reflect.get(row, key) ?? '');
  }

  onCellEdit(edit: DatatableCellEdit): void {
    this.rows = this.rows.map((row) =>
      row === edit.row ? { ...row, [edit.key]: edit.value } : row,
    );
    this.lastAction = `Sửa ${edit.key}: ${String(edit.previousValue)} → ${edit.value}`;
  }

  private record(verb: string, row: DatatableRow): void {
    this.lastAction = `${verb} ${this.textOf(row, 'name')}`;
  }
}

const meta: Meta<DatatableStory> = {
  title: 'Components/Datatable',
  component: DatatableStory,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<DatatableStory>;

export const WithActions: Story = {};

export const InlineEdit: Story = {
  args: { editable: true },
};

export const FillWithScroll: Story = {
  args: { rows: manyRows(24), variant: 'fill', height: '320px' },
};

export const WithoutActions: Story = {
  args: { withActions: false },
};

export const EmptyDefault: Story = {
  args: { rows: [] },
};

export const EmptyCustomTemplate: Story = {
  args: { rows: [], customEmpty: true },
};
