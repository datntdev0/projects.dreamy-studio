import { Component, signal, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { byId, type } from '@testing/dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Graph, GraphEdge, GraphForces, GraphGroup, GraphNode } from './graph';

@Component({
  selector: 'app-graph-host',
  imports: [Graph],
  template: `
    <ds-graph
      #graph
      [nodes]="nodes()"
      [edges]="edges()"
      [groups]="groups"
      [selectedId]="selected()"
      [flaggedIds]="flagged()"
      [query]="query()"
      [hiddenGroups]="hidden()"
      [showOrphans]="orphans()"
      [showEdgeLabels]="edgeLabels()"
      [forces]="forces()"
      [labels]="labels"
      (selectedIdChange)="picked.push($event)"
      (nodeOpen)="opened.push($event)"
    />
  `,
})
class Host {
  @ViewChild('graph', { static: true }) graph!: Graph;
  nodes = signal<GraphNode[]>([
    { id: 'a', label: 'Alpha', group: 'g1' },
    { id: 'b', label: 'Beta', group: 'g2' },
    { id: 'c', label: 'Gamma', group: 'g1' },
    { id: 'd', label: 'Orphan', group: 'g2' },
  ]);
  edges = signal<GraphEdge[]>([
    { source: 'a', target: 'b', label: 'knows' },
    { source: 'b', target: 'c' },
    { source: 'a', target: 'a' },
    { source: 'a', target: 'zzz' },
  ]);
  groups: GraphGroup[] = [
    { key: 'g1', label: 'One', color: 'primary' },
    { key: 'g2', label: 'Two', color: '#ff0000' },
  ];
  selected = signal<string | null>(null);
  flagged = signal<string[]>(['c']);
  query = signal('');
  hidden = signal<string[]>([]);
  orphans = signal(true);
  edgeLabels = signal(true);
  forces = signal<Partial<GraphForces>>({ repel: 100 });
  labels = { search: 'Find' };
  picked: (string | null)[] = [];
  opened: string[] = [];
}

type Internals = {
  simNodes: { id: string; x: number; y: number }[];
  transform: { applyX(x: number): number; applyY(y: number): number };
};

function context(): CanvasRenderingContext2D {
  return new Proxy(
    {},
    {
      get: (_target, name) => (name === 'measureText' ? () => ({ width: 10 }) : () => undefined),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D;
}

function toggle(root: HTMLElement, id: string): void {
  const box = byId(root, id) as HTMLInputElement;
  box.checked = !box.checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

async function mount() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await new Promise<void>((resolve) => setTimeout(resolve, 20));
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const canvas = byId(root, 'graph-canvas') as HTMLCanvasElement;
  return {
    fixture,
    root,
    canvas,
    host: fixture.componentInstance,
    internals: fixture.componentInstance.graph as unknown as Internals,
  };
}

function point(
  canvas: HTMLCanvasElement,
  internals: Internals,
  id: string,
): { clientX: number; clientY: number } {
  const node = internals.simNodes.find((entry) => entry.id === id) as { x: number; y: number };
  return {
    clientX: internals.transform.applyX(node.x),
    clientY: internals.transform.applyY(node.y),
  };
}

describe('Graph', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context());
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.stubGlobal(
      'requestAnimationFrame',
      (callback: () => void) => setTimeout(callback, 0) as unknown as number,
    );
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => clearTimeout(handle));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the canvas and the control panel', async () => {
    const { root } = await mount();
    expect(byId(root, 'graph')).not.toBeNull();
    expect(byId(root, 'graph-group-g1')).not.toBeNull();
    expect((byId(root, 'graph-search') as HTMLInputElement).placeholder).toBe('Find');
  });

  it('resolves css colors and force values', async () => {
    const { host } = await mount();
    expect(host.graph.cssColor(host.groups[0])).toBe('var(--primary)');
    expect(host.graph.cssColor(host.groups[1])).toBe('#ff0000');
    expect(host.graph.forceValue('repel')).toBe(100);
    expect(host.graph.forceValue('center')).toBeGreaterThan(0);
  });

  it('reacts to panel controls', async () => {
    const { fixture, root, host } = await mount();
    type(root, 'graph-search', 'alp');
    toggle(root, 'graph-group-g1');
    toggle(root, 'graph-orphans');
    toggle(root, 'graph-labels');
    toggle(root, 'graph-edge-labels');
    type(root, 'graph-force-center', '0.1');
    type(root, 'graph-force-repel', '200');
    type(root, 'graph-force-distance', '50');
    byId(root, 'graph-rearrange')?.click();
    host.graph.zoomIn();
    host.graph.zoomOut();
    host.graph.fit();
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(host.graph.isHidden('g1')).toBe(true);
  });

  it('selects and opens nodes through the canvas', async () => {
    const { fixture, canvas, host, internals } = await mount();
    const at = point(canvas, internals, 'a');
    canvas.dispatchEvent(new MouseEvent('click', { ...at, bubbles: true, view: window }));
    expect(host.picked.at(-1)).toBe('a');
    canvas.dispatchEvent(new MouseEvent('dblclick', { ...at, bubbles: true, view: window }));
    expect(host.opened).toEqual(['a']);
    canvas.dispatchEvent(
      new MouseEvent('dblclick', { clientX: -500, clientY: -500, bubbles: true, view: window }),
    );
    canvas.dispatchEvent(
      new MouseEvent('click', { clientX: -500, clientY: -500, bubbles: true, view: window }),
    );
    expect(host.picked.at(-1)).toBeNull();
    canvas.dispatchEvent(new MouseEvent('pointermove', { ...at, bubbles: true, view: window }));
    canvas.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
    fixture.detectChanges();
  });

  it('drags nodes and zooms with the wheel', async () => {
    const { canvas, internals } = await mount();
    const at = point(canvas, internals, 'b');
    canvas.dispatchEvent(
      new MouseEvent('mousedown', { ...at, bubbles: true, view: window, button: 0 }),
    );
    window.dispatchEvent(
      new MouseEvent('mousemove', {
        clientX: at.clientX + 40,
        clientY: at.clientY + 20,
        bubbles: true,
        view: window,
      }),
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', {
        clientX: at.clientX + 40,
        clientY: at.clientY + 20,
        bubbles: true,
        view: window,
      }),
    );
    canvas.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
    canvas.dispatchEvent(
      new MouseEvent('mousedown', {
        clientX: -400,
        clientY: -400,
        bubbles: true,
        view: window,
        button: 0,
      }),
    );
    window.dispatchEvent(
      new MouseEvent('mouseup', { clientX: -400, clientY: -400, bubbles: true, view: window }),
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(internals.simNodes).toHaveLength(4);
  });

  it('rebuilds when inputs change and when the theme changes', async () => {
    const { fixture, host, internals } = await mount();
    host.nodes.set([
      { id: 'a', label: 'Alpha', group: 'g1' },
      { id: 'x', label: 'Xi' },
    ]);
    host.edges.set([{ source: 'a', target: 'x' }]);
    host.selected.set('a');
    host.query.set('alp');
    host.hidden.set(['g2']);
    host.orphans.set(false);
    host.edgeLabels.set(false);
    host.forces.set({ repel: 50, center: 0.05, link: 0.5, distance: 40 });
    fixture.detectChanges();
    host.selected.set('x');
    host.flagged.set(['a']);
    fixture.detectChanges();
    document.documentElement.setAttribute('data-theme', 'light');
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    host.selected.set(null);
    host.query.set('');
    host.hidden.set([]);
    host.orphans.set(true);
    fixture.detectChanges();
    expect(internals.simNodes.map((node) => node.id).sort()).toEqual(['a', 'x']);
    fixture.destroy();
  });
});
