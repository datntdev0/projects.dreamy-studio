import { Component, Input } from '@angular/core';
// prettier-ignore
import { Graph, GraphEdge, GraphForces, GraphGroup, GraphLabels, GraphNode } from '@components/graph';
import type { Meta, StoryObj } from '@storybook/angular-vite';

const GROUPS: GraphGroup[] = [
  { key: 'character', label: 'Nhân vật', color: 'primary' },
  { key: 'location', label: 'Địa điểm', color: 'info' },
  { key: 'organization', label: 'Tổ chức', color: 'success' },
  { key: 'item', label: 'Vật phẩm', color: 'warning' },
  { key: 'event', label: 'Sự kiện', color: 'secondary' },
];

const LABELS: Partial<GraphLabels> = {
  graph: 'Đồ thị tri thức',
  empty: 'Chưa có tri thức',
  zoomIn: 'Phóng to',
  zoomOut: 'Thu nhỏ',
  fit: 'Vừa khung nhìn',
  controls: 'Điều khiển đồ thị',
  filters: 'Bộ lọc',
  search: 'Tìm nút…',
  orphans: 'Hiện nút không có liên kết',
  display: 'Hiển thị',
  nodeLabels: 'Nhãn nút',
  edgeLabels: 'Nhãn quan hệ',
  forces: 'Lực',
  center: 'Kéo về tâm',
  repel: 'Lực đẩy',
  distance: 'Độ dài liên kết',
  rearrange: 'Sắp xếp lại',
};

const RELATIONS: Record<string, string> = {
  'character:character': 'quen biết',
  'character:organization': 'thuộc về',
  'character:location': 'đến',
  'character:item': 'sở hữu',
  'character:event': 'tham gia',
  'organization:event': 'tổ chức',
  'organization:location': 'trụ sở',
  'location:event': 'diễn ra tại',
  'organization:organization': 'đối địch',
};

const SMALL_NODES: GraphNode[] = [
  { id: 'lam-phong', label: 'Lâm Phong', group: 'character' },
  { id: 'to-nhien', label: 'Tô Nhiên', group: 'character' },
  { id: 'han-nguyet', label: 'Hàn Nguyệt', group: 'character' },
  { id: 'truong-lao', label: 'Trương Lão', group: 'character' },
  { id: 'mo-dung-thien', label: 'Mộ Dung Thiên', group: 'character' },
  { id: 'ly-tuyet', label: 'Lý Tuyết', group: 'character' },
  { id: 'bach-ho', label: 'Bạch Hổ', group: 'character' },
  { id: 'thanh-van-tong', label: 'Thanh Vân Tông', group: 'organization' },
  { id: 'huyet-ma-giao', label: 'Huyết Ma Giáo', group: 'organization' },
  { id: 'van-hai-thuong-hoi', label: 'Vân Hải Thương Hội', group: 'organization' },
  { id: 'van-hai-thanh', label: 'Vân Hải Thành', group: 'location' },
  { id: 'hac-phong-coc', label: 'Hắc Phong Cốc', group: 'location' },
  { id: 'cam-dia', label: 'Cấm Địa', group: 'location' },
  { id: 'tang-kinh-cac', label: 'Tàng Kinh Các', group: 'location' },
  { id: 'kiem-han-quang', label: 'Kiếm Hàn Quang', group: 'item' },
  { id: 'co-ngoc', label: 'Cổ Ngọc', group: 'item' },
  { id: 'dan-phuong', label: 'Đan Phương', group: 'item' },
  { id: 'dai-hoi-tong-mon', label: 'Đại Hội Tông Môn', group: 'event' },
  { id: 'bien-co-hac-phong', label: 'Biến Cố Hắc Phong', group: 'event' },
  { id: 'tran-chien-van-hai', label: 'Trận Chiến Vân Hải', group: 'event' },
  { id: 'ghi-chu-mo-dau', label: 'Ghi chú mở đầu' },
];

const SMALL_LINKS: GraphEdge[] = [
  { source: 'lam-phong', target: 'thanh-van-tong' },
  { source: 'lam-phong', target: 'to-nhien' },
  { source: 'lam-phong', target: 'han-nguyet' },
  { source: 'lam-phong', target: 'kiem-han-quang' },
  { source: 'lam-phong', target: 'co-ngoc' },
  { source: 'lam-phong', target: 'dai-hoi-tong-mon' },
  { source: 'lam-phong', target: 'bien-co-hac-phong' },
  { source: 'lam-phong', target: 'cam-dia' },
  { source: 'to-nhien', target: 'thanh-van-tong' },
  { source: 'to-nhien', target: 'dan-phuong' },
  { source: 'to-nhien', target: 'tang-kinh-cac' },
  { source: 'han-nguyet', target: 'huyet-ma-giao' },
  { source: 'han-nguyet', target: 'hac-phong-coc' },
  { source: 'han-nguyet', target: 'bien-co-hac-phong' },
  { source: 'truong-lao', target: 'thanh-van-tong' },
  { source: 'truong-lao', target: 'tang-kinh-cac' },
  { source: 'truong-lao', target: 'co-ngoc' },
  { source: 'truong-lao', target: 'dai-hoi-tong-mon' },
  { source: 'mo-dung-thien', target: 'huyet-ma-giao' },
  { source: 'mo-dung-thien', target: 'hac-phong-coc' },
  { source: 'mo-dung-thien', target: 'tran-chien-van-hai' },
  { source: 'mo-dung-thien', target: 'kiem-han-quang' },
  { source: 'ly-tuyet', target: 'van-hai-thuong-hoi' },
  { source: 'ly-tuyet', target: 'van-hai-thanh' },
  { source: 'ly-tuyet', target: 'dan-phuong' },
  { source: 'ly-tuyet', target: 'lam-phong' },
  { source: 'bach-ho', target: 'cam-dia' },
  { source: 'bach-ho', target: 'lam-phong' },
  { source: 'thanh-van-tong', target: 'dai-hoi-tong-mon' },
  { source: 'thanh-van-tong', target: 'van-hai-thanh' },
  { source: 'thanh-van-tong', target: 'huyet-ma-giao' },
  { source: 'huyet-ma-giao', target: 'bien-co-hac-phong' },
  { source: 'huyet-ma-giao', target: 'tran-chien-van-hai' },
  { source: 'van-hai-thanh', target: 'van-hai-thuong-hoi' },
  { source: 'van-hai-thanh', target: 'tran-chien-van-hai' },
  { source: 'hac-phong-coc', target: 'bien-co-hac-phong' },
  { source: 'cam-dia', target: 'co-ngoc' },
];

function relate(nodes: GraphNode[], edges: GraphEdge[]): GraphEdge[] {
  const groups = new Map(nodes.map((node) => [node.id, node.group ?? '']));
  return edges.map((edge) => {
    const pair = [groups.get(edge.source) ?? '', groups.get(edge.target) ?? ''].sort().join(':');
    return { ...edge, label: RELATIONS[pair] ?? 'liên quan' };
  });
}

const SMALL_EDGES = relate(SMALL_NODES, SMALL_LINKS);

const LARGE_PREFIXES: Record<string, string> = {
  character: 'Nhân vật',
  location: 'Địa điểm',
  organization: 'Tổ chức',
  item: 'Vật phẩm',
  event: 'Sự kiện',
};

const LARGE_COUNT = 700;

class SeededRandom {
  constructor(private state: number) {}

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

function largeGraph(count: number): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const random = new SeededRandom(20260101);
  const keys = GROUPS.map((group) => group.key);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const endpoints: number[] = [];
  for (let index = 0; index < count; index++) {
    const group = keys[Math.floor(random.next() ** 1.6 * keys.length)];
    nodes.push({
      id: `n${index}`,
      label: `${LARGE_PREFIXES[group]} ${String(index + 1).padStart(3, '0')}`,
      group,
    });
    if (index === 0) {
      continue;
    }
    if (index > 1 && random.next() < 0.06) {
      continue;
    }
    const links = random.next() < 0.3 ? 2 : 1;
    for (let link = 0; link < links; link++) {
      const target =
        endpoints.length && random.next() < 0.8
          ? endpoints[Math.floor(random.next() * endpoints.length)]
          : Math.floor(random.next() * index);
      if (target !== index) {
        edges.push({ source: `n${index}`, target: `n${target}` });
        endpoints.push(index, target);
      }
    }
  }
  return { nodes, edges: relate(nodes, edges) };
}

const LARGE = largeGraph(LARGE_COUNT);

@Component({
  selector: 'app-graph-story',
  imports: [Graph],
  template: `
    <div
      style="display: flex; flex-direction: column; gap: 12px; height: 100vh; min-height: 480px; padding: 16px; box-sizing: border-box"
      data-testid="graph-story"
    >
      <div style="display: flex; align-items: center; gap: 12px">
        <span class="note" data-testid="graph-story-selected">
          Đã chọn: {{ selectedId ?? '—' }}
        </span>
        <span class="note" data-testid="graph-story-opened">Đã mở: {{ openedId ?? '—' }}</span>
        <span class="note" data-testid="graph-story-count">
          {{ nodes.length }} nút · {{ edges.length }} liên kết
        </span>
      </div>
      <div
        style="flex: 1; min-height: 0; position: relative; border: 1px solid var(--hairline); border-radius: var(--r-md); overflow: hidden"
      >
        <ds-graph
          [nodes]="nodes"
          [edges]="edges"
          [groups]="groups"
          [forces]="forces"
          [labels]="labels"
          [(selectedId)]="selectedId"
          (nodeOpen)="openedId = $event"
          data-testid="graph-story-graph"
        />
      </div>
    </div>
  `,
})
class GraphStory {
  @Input() nodes: GraphNode[] = SMALL_NODES;
  @Input() edges: GraphEdge[] = SMALL_EDGES;
  @Input() forces: Partial<GraphForces> = {};

  readonly groups = GROUPS;
  readonly labels = LABELS;

  selectedId: string | null = null;
  openedId: string | null = null;
}

const meta: Meta<GraphStory> = {
  title: 'Components/Graph',
  component: GraphStory,
  parameters: { layout: 'fullscreen' },
};

export default meta;

type Story = StoryObj<GraphStory>;

export const Default: Story = {};

export const Large: Story = {
  args: { nodes: LARGE.nodes, edges: LARGE.edges, forces: { repel: 50, distance: 30 } },
};
