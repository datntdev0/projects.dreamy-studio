import { AfterViewInit, Component, DestroyRef, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild, inject } from "@angular/core";
import { Simulation, SimulationLinkDatum, SimulationNodeDatum, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { D3DragEvent, drag } from "d3-drag";
import { D3ZoomEvent, ZoomBehavior, ZoomTransform, zoom, zoomIdentity } from "d3-zoom";
import { pointer, select } from "d3-selection";
import "d3-transition";

export type GraphNode = { id: string; label: string; group?: string };

export type GraphEdge = { source: string; target: string; label?: string };

export type GraphGroup = { key: string; label: string; color: string };

export type GraphForces = { center: number; repel: number; link: number; distance: number };

export type GraphLabels = {
  graph: string;
  empty: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  controls: string;
  filters: string;
  search: string;
  orphans: string;
  display: string;
  nodeLabels: string;
  edgeLabels: string;
  forces: string;
  center: string;
  repel: string;
  distance: string;
  rearrange: string;
};

export type GraphForceKey = "center" | "repel" | "distance";

type GraphTheme = { node: string; link: string; text: string; accent: string; ring: string; flag: string; font: string };

type SimNode = SimulationNodeDatum & { id: string; label: string; group: string; color: string; radius: number; degree: number; alpha: number; target: number; x: number; y: number };

type SimLink = SimulationLinkDatum<SimNode> & { source: SimNode; target: SimNode; label: string };

type Spot = { x: number; y: number };

type DragSubject = { x: number; y: number; node: SimNode };

type GraphDragEvent = D3DragEvent<HTMLCanvasElement, unknown, DragSubject | undefined>;

const DEFAULT_FORCES: GraphForces = { center: 0.05, repel: 120, link: 1, distance: 60 };

const DEFAULT_LABELS: GraphLabels = {
  graph: "Graph",
  empty: "No data",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  fit: "Fit to view",
  controls: "Graph controls",
  filters: "Filters",
  search: "Search nodes…",
  orphans: "Show nodes without links",
  display: "Display",
  nodeLabels: "Node labels",
  edgeLabels: "Relation labels",
  forces: "Forces",
  center: "Pull to center",
  repel: "Repulsion",
  distance: "Link distance",
  rearrange: "Rearrange",
};

const DIM_ALPHA = 0.1;
const EDGE_LABEL_ZOOM = 0.6;
const FORCE_RESTART_ALPHA = 0.6;
const FADE_SPEED = 0.2;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;
const FIT_PADDING = 48;
const FIT_MAX_ZOOM = 2;
const ZOOM_STEP = 1.5;
const ZOOM_DURATION = 250;
const FIT_DURATION = 400;
const HIT_PADDING = 3;
const HIT_RADIUS = 24;
const CULL_PADDING = 24;
const RESTART_ALPHA = 0.5;
const WARM_TICKS = 120;
const WARM_TICKS_LARGE = 60;
const LARGE_GRAPH = 500;
const COLOR_TOKEN = /^[a-z][a-z0-9-]*$/;

@Component({
  selector: "ds-graph",
  standalone: true,
  templateUrl: "./graph.html",
})
export class Graph implements AfterViewInit, OnChanges {
  @Input() nodes: GraphNode[] = [];
  @Input() edges: GraphEdge[] = [];
  @Input() groups: GraphGroup[] = [];
  @Input() selectedId: string | null = null;
  @Input() flaggedIds: string[] = [];
  @Input() flagLabel = "";
  @Input() query = "";
  @Input() hiddenGroups: string[] = [];
  @Input() showOrphans = true;
  @Input() showLabels = true;
  @Input() showEdgeLabels = false;
  @Input() showLegend = true;
  @Input() showPanel = true;
  @Input() forces: Partial<GraphForces> = {};
  @Input() labels: Partial<GraphLabels> = {};
  @Output() selectedIdChange = new EventEmitter<string | null>();
  @Output() nodeOpen = new EventEmitter<string>();

  @ViewChild("surface", { static: true }) private surface!: ElementRef<HTMLElement>;
  @ViewChild("canvas", { static: true }) private canvas!: ElementRef<HTMLCanvasElement>;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  private flagged = new Set<string>();
  private context: CanvasRenderingContext2D | null = null;
  private simulation: Simulation<SimNode, SimLink> | null = null;
  private zoomBehavior: ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private themeObserver: MutationObserver | null = null;
  private transform: ZoomTransform = zoomIdentity;
  private theme: GraphTheme = { node: "#888", link: "#444", text: "#ddd", accent: "#7c3aed", ring: "#c4b5fd", flag: "#e5484d", font: "sans-serif" };
  private simNodes: SimNode[] = [];
  private simLinks: SimLink[] = [];
  private byId = new Map<string, SimNode>();
  private memory = new Map<string, Spot>();
  private neighbors = new Map<string, Set<string>>();
  private hovered: SimNode | null = null;
  private dragged: SimNode | null = null;
  private focus: SimNode | null = null;
  private dimming = false;
  private fading = false;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private frame = 0;
  private fitPending = true;
  private ready = false;

  text: GraphLabels = DEFAULT_LABELS;

  ngAfterViewInit(): void {
    const canvas = this.canvas.nativeElement;
    this.context = canvas.getContext("2d");
    this.simulation = forceSimulation<SimNode, SimLink>().alphaDecay(0.03).velocityDecay(0.35).on("tick", this.requestDraw).stop();
    this.zoomBehavior = zoom<HTMLCanvasElement, unknown>().scaleExtent([MIN_ZOOM, MAX_ZOOM]).on("zoom", this.onZoom);
    select(canvas)
      .call(drag<HTMLCanvasElement, unknown, DragSubject | undefined>().container(canvas).clickDistance(4).subject(this.dragSubject).on("start", this.onDragStart).on("drag", this.onDrag).on("end", this.onDragEnd))
      .call(this.zoomBehavior)
      .on("dblclick.zoom", null);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("click", this.onClick);
    canvas.addEventListener("dblclick", this.onDblClick);
    this.resizeObserver = new ResizeObserver(this.onResize);
    this.resizeObserver.observe(this.surface.nativeElement);
    this.themeObserver = new MutationObserver(this.onTheme);
    this.themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    this.destroyRef.onDestroy(this.destroy);
    this.ready = true;
    this.readTheme();
    this.measure();
    this.rebuild();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["labels"]) {
      this.text = { ...DEFAULT_LABELS, ...this.labels };
    }
    if (changes["flaggedIds"]) {
      this.flagged = new Set(this.flaggedIds);
    }
    if (!this.ready) {
      return;
    }
    if (changes["nodes"] || changes["edges"] || changes["groups"] || changes["query"] || changes["hiddenGroups"] || changes["showOrphans"]) {
      this.rebuild();
      return;
    }
    if (changes["forces"]) {
      this.configureForces();
      this.simulation?.alpha(RESTART_ALPHA).restart();
    }
    if (changes["selectedId"]) {
      this.applyFocus();
    }
    this.requestDraw();
  }

  cssColor(group: GraphGroup): string {
    return COLOR_TOKEN.test(group.color) ? `var(--${group.color})` : group.color;
  }

  isHidden(key: string): boolean {
    return this.hiddenGroups.includes(key);
  }

  forceValue(key: GraphForceKey): number {
    return this.forceValues()[key];
  }

  onQuery(event: Event): void {
    this.query = (event.target as HTMLInputElement).value;
    this.rebuild();
  }

  onGroup(key: string, event: Event): void {
    const visible = (event.target as HTMLInputElement).checked;
    this.hiddenGroups = visible ? this.hiddenGroups.filter((item) => item !== key) : [...this.hiddenGroups, key];
    this.rebuild();
  }

  onOrphans(event: Event): void {
    this.showOrphans = (event.target as HTMLInputElement).checked;
    this.rebuild();
  }

  onLabels(event: Event): void {
    this.showLabels = (event.target as HTMLInputElement).checked;
    this.requestDraw();
  }

  onEdgeLabels(event: Event): void {
    this.showEdgeLabels = (event.target as HTMLInputElement).checked;
    this.requestDraw();
  }

  onForce(key: GraphForceKey, event: Event): void {
    this.forces = { ...this.forces, [key]: Number((event.target as HTMLInputElement).value) };
    this.configureForces();
    this.simulation?.alpha(FORCE_RESTART_ALPHA).restart();
  }

  rearrange(): void {
    const simulation = this.simulation;
    if (!simulation || !this.simNodes.length) {
      return;
    }
    for (const node of this.simNodes) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 60 + Math.random() * 90;
      node.x = Math.cos(angle) * radius;
      node.y = Math.sin(angle) * radius;
      node.vx = 0;
      node.vy = 0;
    }
    this.memory.clear();
    simulation.stop();
    simulation.alpha(1).tick(this.warmTicks());
    this.fitView(FIT_DURATION);
    simulation.alpha(RESTART_ALPHA).restart();
    this.requestDraw();
  }

  zoomIn(): void {
    this.zoomBy(ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }

  fit(): void {
    this.fitView(FIT_DURATION);
  }

  private readonly destroy = (): void => {
    const canvas = this.canvas.nativeElement;
    this.simulation?.stop();
    this.resizeObserver?.disconnect();
    this.themeObserver?.disconnect();
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerleave", this.onPointerLeave);
    canvas.removeEventListener("click", this.onClick);
    canvas.removeEventListener("dblclick", this.onDblClick);
    select(canvas).interrupt().on(".zoom", null).on(".drag", null);
    cancelAnimationFrame(this.frame);
    this.ready = false;
  };

  private readonly requestDraw = (): void => {
    if (this.frame || !this.ready) {
      return;
    }
    this.frame = requestAnimationFrame(this.draw);
  };

  private readonly onZoom = (event: D3ZoomEvent<HTMLCanvasElement, unknown>): void => {
    this.transform = event.transform;
    this.requestDraw();
  };

  private readonly onResize = (): void => {
    const previousWidth = this.width;
    const previousHeight = this.height;
    this.measure();
    if (!this.width || !this.height) {
      return;
    }
    if (this.fitPending && this.simNodes.length) {
      this.fitView(0);
      return;
    }
    if (previousWidth && previousHeight && this.zoomBehavior) {
      const t = this.transform;
      const shifted = zoomIdentity.translate(t.x + (this.width - previousWidth) / 2, t.y + (this.height - previousHeight) / 2).scale(t.k);
      select(this.canvas.nativeElement).call(this.zoomBehavior.transform, shifted);
    }
    this.requestDraw();
  };

  private readonly onTheme = (): void => {
    this.readTheme();
    this.requestDraw();
  };

  private readonly dragSubject = (event: GraphDragEvent): DragSubject | undefined => {
    const node = this.nodeAt(event.x, event.y);
    return node ? { x: this.transform.applyX(node.x), y: this.transform.applyY(node.y), node } : undefined;
  };

  private readonly onDragStart = (event: GraphDragEvent): void => {
    const node = event.subject?.node;
    if (!node) {
      return;
    }
    if (!event.active) {
      this.simulation?.alphaTarget(0.3).restart();
    }
    node.fx = node.x;
    node.fy = node.y;
    this.dragged = node;
    this.applyFocus();
  };

  private readonly onDrag = (event: GraphDragEvent): void => {
    const node = event.subject?.node;
    if (!node) {
      return;
    }
    node.fx = this.transform.invertX(event.x);
    node.fy = this.transform.invertY(event.y);
  };

  private readonly onDragEnd = (event: GraphDragEvent): void => {
    const node = event.subject?.node;
    if (!node) {
      return;
    }
    if (!event.active) {
      this.simulation?.alphaTarget(0);
    }
    node.fx = null;
    node.fy = null;
    this.dragged = null;
    this.applyFocus();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.dragged) {
      return;
    }
    const [x, y] = pointer(event, this.canvas.nativeElement);
    this.setHovered(this.nodeAt(x, y));
  };

  private readonly onPointerLeave = (): void => {
    if (!this.dragged) {
      this.setHovered(null);
    }
  };

  private readonly onClick = (event: MouseEvent): void => {
    const [x, y] = pointer(event, this.canvas.nativeElement);
    const id = this.nodeAt(x, y)?.id ?? null;
    this.selectedId = id;
    this.applyFocus();
    this.selectedIdChange.emit(id);
  };

  private readonly onDblClick = (event: MouseEvent): void => {
    const [x, y] = pointer(event, this.canvas.nativeElement);
    const node = this.nodeAt(x, y);
    if (node) {
      this.nodeOpen.emit(node.id);
    }
  };

  private readonly collideRadius = (node: SimNode): number => node.radius + 2;

  private readonly linkStrength = (link: SimLink): number => this.forceValues().link / Math.min(link.source.degree, link.target.degree);

  private forceValues(): GraphForces {
    return { ...DEFAULT_FORCES, ...this.forces };
  }

  private measure(): void {
    const surface = this.surface.nativeElement;
    const canvas = this.canvas.nativeElement;
    this.width = surface.clientWidth;
    this.height = surface.clientHeight;
    this.ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(this.width * this.ratio));
    canvas.height = Math.max(1, Math.round(this.height * this.ratio));
  }

  private readTheme(): void {
    const style = getComputedStyle(this.host.nativeElement);
    const theme = this.theme;
    this.theme = {
      node: this.token(style, "--mute", theme.node),
      link: this.token(style, "--hairline-strong", theme.link),
      text: this.token(style, "--body", theme.text),
      accent: this.token(style, "--primary", theme.accent),
      ring: this.token(style, "--primary-text", theme.ring),
      flag: this.token(style, "--danger", theme.flag),
      font: this.token(style, "--font", theme.font),
    };
    this.paintNodes();
  }

  private token(style: CSSStyleDeclaration, name: string, fallback: string): string {
    return style.getPropertyValue(name).trim() || fallback;
  }

  private paintNodes(): void {
    const style = getComputedStyle(this.host.nativeElement);
    const colors = new Map<string, string>();
    for (const group of this.groups) {
      const value = COLOR_TOKEN.test(group.color) ? this.token(style, `--${group.color}`, "") : group.color;
      colors.set(group.key, value || this.theme.node);
    }
    for (const node of this.simNodes) {
      node.color = colors.get(node.group) ?? this.theme.node;
    }
  }

  private rebuild(): void {
    const simulation = this.simulation;
    if (!simulation) {
      return;
    }
    this.remember();
    const candidates = this.createNodes();
    const links = this.createLinks(candidates);
    const nodes = this.showOrphans ? candidates : candidates.filter((node) => node.degree > 0);
    const placed = nodes.filter((node) => this.memory.has(node.id)).length;
    for (const node of nodes) {
      node.radius = Math.min(18, 3.2 + 1.7 * Math.sqrt(node.degree));
    }
    this.simNodes = nodes;
    this.simLinks = links;
    this.byId = new Map(nodes.map((node) => [node.id, node]));
    if (this.hovered && !this.byId.has(this.hovered.id)) {
      this.hovered = null;
    }
    this.paintNodes();
    simulation.stop();
    simulation.nodes(nodes);
    this.configureForces();
    if (nodes.length && !placed) {
      simulation.alpha(1).tick(this.warmTicks());
      this.fitPending = true;
    }
    this.applyFocus();
    if (this.fitPending && this.width && this.height && nodes.length) {
      this.fitView(0);
    }
    simulation.alpha(RESTART_ALPHA).restart();
    this.requestDraw();
  }

  private remember(): void {
    for (const node of this.simNodes) {
      this.memory.set(node.id, { x: node.x, y: node.y });
    }
  }

  private warmTicks(): number {
    return this.simNodes.length > LARGE_GRAPH ? WARM_TICKS_LARGE : WARM_TICKS;
  }

  private createNodes(): SimNode[] {
    const needle = this.query.trim().toLowerCase();
    const hidden = new Set(this.hiddenGroups);
    const nodes: SimNode[] = [];
    const seen = new Set<string>();
    for (const input of this.nodes) {
      const group = input.group ?? "";
      if (seen.has(input.id) || hidden.has(group) || (needle && !input.label.toLowerCase().includes(needle))) {
        continue;
      }
      seen.add(input.id);
      const spot = this.memory.get(input.id);
      const alpha = this.byId.get(input.id)?.alpha ?? 1;
      nodes.push({ id: input.id, label: input.label, group, color: this.theme.node, radius: 0, degree: 0, alpha, target: 1, x: spot?.x ?? NaN, y: spot?.y ?? NaN });
    }
    return nodes;
  }

  private createLinks(nodes: SimNode[]): SimLink[] {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = [];
    const neighbors = new Map<string, Set<string>>();
    const seen = new Set<string>();
    for (const edge of this.edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      const key = edge.source < edge.target ? `${edge.source}\n${edge.target}` : `${edge.target}\n${edge.source}`;
      if (!source || !target || source === target || seen.has(key)) {
        continue;
      }
      seen.add(key);
      links.push({ source, target, label: edge.label ?? "" });
      source.degree += 1;
      target.degree += 1;
      this.neighborSet(neighbors, source.id).add(target.id);
      this.neighborSet(neighbors, target.id).add(source.id);
    }
    this.neighbors = neighbors;
    return links;
  }

  private neighborSet(map: Map<string, Set<string>>, id: string): Set<string> {
    let set = map.get(id);
    if (!set) {
      set = new Set<string>();
      map.set(id, set);
    }
    return set;
  }

  private configureForces(): void {
    const simulation = this.simulation;
    if (!simulation) {
      return;
    }
    const values = this.forceValues();
    simulation
      .force("link", forceLink<SimNode, SimLink>(this.simLinks).distance(values.distance).strength(this.linkStrength))
      .force("charge", forceManyBody<SimNode>().strength(-values.repel).distanceMax(500).theta(0.9))
      .force("x", forceX<SimNode>(0).strength(values.center))
      .force("y", forceY<SimNode>(0).strength(values.center))
      .force("collide", forceCollide<SimNode>(this.collideRadius));
  }

  private applyFocus(): void {
    const focus = this.dragged ?? this.hovered ?? (this.selectedId ? this.byId.get(this.selectedId) ?? null : null);
    const around = focus ? this.neighbors.get(focus.id) : undefined;
    this.focus = focus;
    this.dimming = !!focus;
    for (const node of this.simNodes) {
      node.target = !focus || node === focus || around?.has(node.id) ? 1 : DIM_ALPHA;
    }
    this.requestDraw();
  }

  private setHovered(node: SimNode | null): void {
    if (node === this.hovered) {
      return;
    }
    this.hovered = node;
    this.canvas.nativeElement.classList.toggle("is-hover", !!node);
    this.applyFocus();
  }

  private nodeAt(x: number, y: number): SimNode | null {
    const t = this.transform;
    const worldX = t.invertX(x);
    const worldY = t.invertY(y);
    const hit = this.simulation?.find(worldX, worldY, HIT_RADIUS / t.k);
    if (!hit) {
      return null;
    }
    return Math.hypot(hit.x - worldX, hit.y - worldY) <= hit.radius + HIT_PADDING / t.k ? hit : null;
  }

  private zoomBy(factor: number): void {
    if (!this.zoomBehavior) {
      return;
    }
    select(this.canvas.nativeElement).transition().duration(ZOOM_DURATION).call(this.zoomBehavior.scaleBy, factor);
  }

  private fitView(duration: number): void {
    const behavior = this.zoomBehavior;
    if (!behavior || !this.simNodes.length || !this.width || !this.height) {
      return;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const node of this.simNodes) {
      x0 = Math.min(x0, node.x - node.radius);
      y0 = Math.min(y0, node.y - node.radius);
      x1 = Math.max(x1, node.x + node.radius);
      y1 = Math.max(y1, node.y + node.radius);
    }
    const k = Math.max(MIN_ZOOM, Math.min(FIT_MAX_ZOOM, (this.width - FIT_PADDING * 2) / Math.max(x1 - x0, 1), (this.height - FIT_PADDING * 2) / Math.max(y1 - y0, 1)));
    const target = zoomIdentity.translate(this.width / 2 - (k * (x0 + x1)) / 2, this.height / 2 - (k * (y0 + y1)) / 2).scale(k);
    const selection = select(this.canvas.nativeElement);
    this.fitPending = false;
    if (duration > 0) {
      selection.transition().duration(duration).call(behavior.transform, target);
    } else {
      selection.call(behavior.transform, target);
    }
  }

  private readonly draw = (): void => {
    this.frame = 0;
    const context = this.context;
    if (!context) {
      return;
    }
    const t = this.transform;
    const canvas = this.canvas.nativeElement;
    this.fading = this.stepFade();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.setTransform(this.ratio * t.k, 0, 0, this.ratio * t.k, this.ratio * t.x, this.ratio * t.y);
    this.drawLinks(context, t);
    this.drawNodes(context, t);
    if (this.showEdgeLabels && t.k >= EDGE_LABEL_ZOOM) {
      this.drawEdgeLabels(context, t);
    }
    if (this.showLabels) {
      this.drawLabels(context, t);
    }
    if (this.fading) {
      this.requestDraw();
    }
  };

  private stepFade(): boolean {
    let fading = false;
    for (const node of this.simNodes) {
      const delta = node.target - node.alpha;
      if (Math.abs(delta) < 0.01) {
        node.alpha = node.target;
      } else {
        node.alpha += delta * FADE_SPEED;
        fading = true;
      }
    }
    return fading;
  }

  private drawLinks(context: CanvasRenderingContext2D, t: ZoomTransform): void {
    const bounds = this.viewBounds(t);
    const focus = this.focus;
    context.lineWidth = Math.pow(t.k, -0.7);
    context.strokeStyle = this.theme.link;
    if (!this.dimming && !this.fading) {
      context.beginPath();
      for (const link of this.simLinks) {
        if (this.linkVisible(link, bounds)) {
          context.moveTo(link.source.x, link.source.y);
          context.lineTo(link.target.x, link.target.y);
        }
      }
      context.stroke();
      return;
    }
    for (const link of this.simLinks) {
      const alpha = Math.min(link.source.alpha, link.target.alpha);
      if (alpha < 0.02 || !this.linkVisible(link, bounds) || (focus && (link.source === focus || link.target === focus))) {
        continue;
      }
      context.globalAlpha = alpha;
      context.beginPath();
      context.moveTo(link.source.x, link.source.y);
      context.lineTo(link.target.x, link.target.y);
      context.stroke();
    }
    if (focus) {
      context.globalAlpha = 1;
      context.strokeStyle = this.theme.accent;
      context.beginPath();
      for (const link of this.simLinks) {
        if (link.source === focus || link.target === focus) {
          context.moveTo(link.source.x, link.source.y);
          context.lineTo(link.target.x, link.target.y);
        }
      }
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  private drawNodes(context: CanvasRenderingContext2D, t: ZoomTransform): void {
    const bounds = this.viewBounds(t);
    const focus = this.focus;
    const selected = this.selectedId ? this.byId.get(this.selectedId) : undefined;
    for (const node of this.simNodes) {
      if (node.alpha < 0.02 || node.x < bounds.x0 - node.radius || node.x > bounds.x1 + node.radius || node.y < bounds.y0 - node.radius || node.y > bounds.y1 + node.radius) {
        continue;
      }
      context.globalAlpha = node.alpha;
      context.fillStyle = node === focus ? this.theme.accent : node.color;
      context.beginPath();
      context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      context.fill();
      if (this.flagged.has(node.id)) {
        context.strokeStyle = this.theme.flag;
        context.lineWidth = 3 / t.k;
        context.beginPath();
        context.arc(node.x, node.y, node.radius + 1.5 / t.k, 0, Math.PI * 2);
        context.stroke();
      }
      if (node === selected) {
        context.strokeStyle = this.theme.ring;
        context.lineWidth = 1.5 / t.k;
        context.beginPath();
        context.arc(node.x, node.y, node.radius + 2.5 / t.k, 0, Math.PI * 2);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }

  private drawEdgeLabels(context: CanvasRenderingContext2D, t: ZoomTransform): void {
    const bounds = this.viewBounds(t);
    const scale = Math.pow(t.k, -0.8);
    context.font = `${10 * scale}px ${this.theme.font}`;
    context.textAlign = "center";
    context.textBaseline = "alphabetic";
    context.fillStyle = this.theme.node;
    for (const link of this.simLinks) {
      const alpha = Math.min(link.source.alpha, link.target.alpha);
      if (!link.label || alpha < 0.03 || !this.linkVisible(link, bounds)) {
        continue;
      }
      context.globalAlpha = alpha;
      context.fillText(link.label, (link.source.x + link.target.x) / 2, (link.source.y + link.target.y) / 2 - 3 * scale);
    }
    context.globalAlpha = 1;
  }

  private drawLabels(context: CanvasRenderingContext2D, t: ZoomTransform): void {
    const bounds = this.viewBounds(t);
    const scale = Math.pow(t.k, -0.8);
    context.font = `${11 * scale}px ${this.theme.font}`;
    context.textAlign = "center";
    context.textBaseline = "top";
    context.fillStyle = this.theme.text;
    for (const node of this.simNodes) {
      if (node.alpha < 0.02 || node.x < bounds.x0 || node.x > bounds.x1 || node.y < bounds.y0 || node.y > bounds.y1) {
        continue;
      }
      const zoomAlpha = Math.max(0, Math.min(1, (t.k * (0.5 + node.radius / 8) - 1.1) / 0.5));
      const emphasis = this.dimming && node.target === 1 ? 1 : 0;
      const alpha = Math.max(zoomAlpha, emphasis) * node.alpha;
      if (alpha < 0.03) {
        continue;
      }
      context.globalAlpha = alpha;
      context.fillText(node.label, node.x, node.y + node.radius + 3 * scale);
    }
    context.globalAlpha = 1;
  }

  private viewBounds(t: ZoomTransform): { x0: number; y0: number; x1: number; y1: number } {
    const margin = CULL_PADDING / t.k;
    return { x0: t.invertX(0) - margin, y0: t.invertY(0) - margin, x1: t.invertX(this.width) + margin, y1: t.invertY(this.height) + margin };
  }

  private linkVisible(link: SimLink, bounds: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const { source, target } = link;
    return !((source.x < bounds.x0 && target.x < bounds.x0) || (source.x > bounds.x1 && target.x > bounds.x1) || (source.y < bounds.y0 && target.y < bounds.y0) || (source.y > bounds.y1 && target.y > bounds.y1));
  }
}
