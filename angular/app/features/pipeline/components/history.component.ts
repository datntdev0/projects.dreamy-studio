import { Component, OnInit, computed, inject, signal } from "@angular/core";
import { Datatable, DatatableCell, DatatableColumn, DatatableRowEvent } from "@components/datatable";
import { Icon } from "@components/icon";
import { LanguageKey } from "@app/core/language/language.models";
import { CoreModule } from "@app/core/core.module";
import { LanguageService } from "@app/core/language/language.service";
import { formatStamp } from "@app/features/novel/novel.rules";
import { PipelineSnapshot, PipelineStatus } from "@app/features/novel/novel.translation.models";
import { PipelineFilter } from "../pipeline.models";
import { PIPELINE_FILTERS, PIPELINE_FILTER_KEYS, PIPELINE_STATUS_BADGES, PIPELINE_STATUS_KEYS, durationMs, formatDuration, kindIcon, kindKey, kindSize, matchesFilter, matchesQuery, percentOf } from "../pipeline.rules";
import { PipelineService } from "../pipeline.service";
import { PipelineStrip } from "./strip.component";

@Component({
  selector: "app-pipeline-history",
  standalone: true,
  imports: [Datatable, DatatableCell, Icon, CoreModule, PipelineStrip],
  templateUrl: "./history.component.html",
})
export class PipelineHistory implements OnInit {
  private readonly languageService = inject(LanguageService);

  readonly pipelines = inject(PipelineService);
  readonly filters = PIPELINE_FILTERS;
  readonly query = signal("");
  readonly filter = signal<PipelineFilter>("all");
  readonly visible = computed(this.buildVisible.bind(this));
  readonly filterActive = computed(this.buildFilterActive.bind(this));

  readonly tableRowClass = (row: object): Record<string, boolean> => ({
    "is-selected": this.pipelines.selectedId() === this.snapshotOf(row).id,
  });

  get tableColumns(): DatatableColumn[] {
    return [
      { key: "novel", label: this.languageService.translate("pipeline.col.novel"), ellipsis: true },
      { key: "started", label: this.languageService.translate("pipeline.col.started"), width: "148px" },
      { key: "status", label: this.languageService.translate("pipeline.col.status"), width: "112px" },
      { key: "progress", label: this.languageService.translate("pipeline.col.progress"), width: "200px" },
    ];
  }

  ngOnInit(): void {
    void this.pipelines.load();
  }

  snapshotOf(row: object): PipelineSnapshot {
    return row as PipelineSnapshot;
  }

  novelOf(pipeline: PipelineSnapshot): string {
    return this.pipelines.novelName(pipeline.novelId);
  }

  kindOf(pipeline: PipelineSnapshot): LanguageKey | null {
    return kindKey(pipeline.kind);
  }

  iconOf(pipeline: PipelineSnapshot): string {
    return kindIcon(pipeline.kind);
  }

  sizeOf(pipeline: PipelineSnapshot): number {
    return kindSize(pipeline.kind);
  }

  stampOf(pipeline: PipelineSnapshot): string {
    return formatStamp(pipeline.startedAt ?? pipeline.createdAt);
  }

  percent(pipeline: PipelineSnapshot): number {
    return percentOf(pipeline);
  }

  durationOf(pipeline: PipelineSnapshot): string {
    return formatDuration(durationMs(pipeline));
  }

  statusKey(status: PipelineStatus): LanguageKey {
    return PIPELINE_STATUS_KEYS[status];
  }

  statusBadge(status: PipelineStatus): string {
    return PIPELINE_STATUS_BADGES[status];
  }

  filterKey(filter: PipelineFilter): LanguageKey {
    return PIPELINE_FILTER_KEYS[filter];
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  onFilter(event: Event): void {
    this.filter.set((event.target as HTMLSelectElement).value as PipelineFilter);
  }

  clearFilters(): void {
    this.query.set("");
    this.filter.set("all");
  }

  onRowClick(event: DatatableRowEvent): void {
    this.pipelines.openLog(this.snapshotOf(event.row).id);
  }

  refresh(): void {
    void this.pipelines.load();
  }

  private buildFilterActive(): boolean {
    return this.query().trim() !== "" || this.filter() !== "all";
  }

  private buildVisible(): PipelineSnapshot[] {
    const out: PipelineSnapshot[] = [];
    for (const pipeline of this.pipelines.history()) {
      if (matchesFilter(pipeline.status, this.filter()) && matchesQuery(this.novelOf(pipeline), this.query())) {
        out.push(pipeline);
      }
    }
    return out;
  }
}
