import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Graph, GraphEdge, GraphGroup, GraphLabels, GraphNode } from '@components/graph';
import { CoreModule } from '@shared/core.module';
import { LanguageKey } from '@shared/language/language.models';
import { LanguageService } from '@shared/language/language.service';

import { NovelDialogsService } from '../novel.dialogs.service';
import { KnowledgeView } from '../novel.knowledge.models';
import { entitiesOf, flaggedIds, graphLinks, predicateLabel } from '../novel.knowledge.rules';
import { NovelKnowledgeService } from '../novel.knowledge.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-novel-knowledge-graph',
  imports: [Graph, CoreModule],
  templateUrl: './knowledge-graph.component.html',
})
export class NovelKnowledgeGraph {
  private readonly knowledge = inject(NovelKnowledgeService);
  private readonly dialogs = inject(NovelDialogsService);
  private readonly languageService = inject(LanguageService);

  readonly novelId = input.required<number>();

  readonly hiddenGroups: string[] = ['term', 'event'];

  readonly view = computed(this.buildView.bind(this));
  readonly nodes = computed(this.buildNodes.bind(this));
  readonly edges = computed(this.buildEdges.bind(this));
  readonly groups = computed(this.buildGroups.bind(this));
  readonly flagged = computed(this.buildFlagged.bind(this));
  readonly labels = computed(this.buildLabels.bind(this));
  readonly selected = computed(this.buildSelected.bind(this));

  onSelect(id: string | null): void {
    this.knowledge.select(this.novelId(), id);
  }

  onOpen(id: string): void {
    this.knowledge.select(this.novelId(), id);
    this.dialogs.openEdit(this.novelId(), [id]);
  }

  private text(key: LanguageKey): string {
    return this.languageService.translate(key);
  }

  private predText(pred: string): string {
    return predicateLabel(this.knowledge.ontology(), pred, this.text.bind(this));
  }

  private buildView(): KnowledgeView {
    return this.knowledge.viewOf(this.novelId());
  }

  private buildNodes(): GraphNode[] {
    return entitiesOf(this.knowledge.visibleOf(this.novelId()).items).map((entity) => ({
      id: entity.id,
      label: entity.name,
      group: entity.type,
    }));
  }

  private buildEdges(): GraphEdge[] {
    return graphLinks(this.knowledge.visibleOf(this.novelId()).items, this.predText.bind(this));
  }

  private buildGroups(): GraphGroup[] {
    return this.knowledge
      .ontology()
      .types.map((type) => ({ key: type.key, label: this.text(type.labelKey), color: type.color }));
  }

  private buildFlagged(): string[] {
    const open = this.knowledge.issuesOf(this.novelId());
    return [...flaggedIds(this.knowledge.of(this.novelId()).items, open)];
  }

  private buildSelected(): string | null {
    const sel = this.view().sel;
    return this.nodes().some((node) => node.id === sel) ? sel : null;
  }

  private buildLabels(): Partial<GraphLabels> {
    return {
      graph: this.text('novel.knowledge.graph.title'),
      empty: this.text('novel.knowledge.graph.empty'),
      zoomIn: this.text('novel.knowledge.graph.zoomIn'),
      zoomOut: this.text('novel.knowledge.graph.zoomOut'),
      fit: this.text('novel.knowledge.graph.fit'),
      controls: 'Graph controls',
      filters: this.text('novel.knowledge.graph.filters'),
      search: this.text('novel.knowledge.graph.search'),
      orphans: this.text('novel.knowledge.graph.orphans'),
      display: this.text('novel.knowledge.graph.display'),
      nodeLabels: this.text('novel.knowledge.graph.nodeLabels'),
      edgeLabels: this.text('novel.knowledge.graph.edgeLabels'),
      forces: this.text('novel.knowledge.graph.forces'),
      center: this.text('novel.knowledge.graph.center'),
      repel: this.text('novel.knowledge.graph.repel'),
      distance: this.text('novel.knowledge.graph.distance'),
      rearrange: this.text('novel.knowledge.graph.rearrange'),
    };
  }
}
