import { kbCharactersOf, kbPlaceNames, kbStatusOf } from './scripting.knowledge';
// prettier-ignore
import { CastMember, KbSnapshot, RailRow, RailSummary, Script, ScriptContext, ScriptSource, ScriptUnit, ScriptView, SourceParagraph } from './scripting.models';
// prettier-ignore
import { activeUnit, castOf, chaptersOf, DEFAULT_CHAPTER_MAX, hasContent, hasDefaultFor, metricsOf, scenesOf } from './scripting.rules';
import { unitSource } from './scripting.source';

export interface ContextInput {
  projectId: number;
  script: Script;
  view: ScriptView;
  kb: KbSnapshot | null;
  hasNovel: boolean;
  chapters: Record<number, SourceParagraph[] | null>;
  novelChapters: number;
}

export function unitSources(
  script: Script,
  chapters: Record<number, SourceParagraph[] | null>,
): Record<string, ScriptSource | null> {
  const sources: Record<string, ScriptSource | null> = {};
  for (const unit of script.units) {
    sources[unit.id] = unitSource(unit, chapters);
  }
  return sources;
}

export function castFor(script: Script, kb: KbSnapshot | null): CastMember[] {
  return castOf(script.cfg.preset, kbCharactersOf(kb), script.extraCast);
}

function railRowOf(cast: CastMember[], unit: ScriptUnit, activeId: string | null): RailRow {
  return {
    unit,
    active: unit.id === activeId,
    metrics: unit.blocks ? metricsOf(cast, unit.blocks) : null,
    meta: unit.meta,
    chapters: chaptersOf(unit),
  };
}

export function railSummaryOf(rows: RailRow[]): RailSummary {
  const done = rows.filter((row) => hasContent(row.unit)).length;
  const total = rows.length;
  return { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
}

function railOf(script: Script, cast: CastMember[], activeId: string | null): RailRow[] {
  return script.units.map((unit) => railRowOf(cast, unit, activeId));
}

export function buildContext(input: ContextInput): ScriptContext {
  const { script, view, kb } = input;
  const config = script.cfg;
  const cast = castFor(script, kb);
  const unit = script.choose ? null : activeUnit(script, view.unit);
  const sources = unitSources(script, input.chapters);
  const source = unit ? (sources[unit.id] ?? null) : null;
  const blocks = unit?.blocks ?? null;
  const metrics = blocks ? metricsOf(cast, blocks) : null;
  const rail = railOf(script, cast, unit ? unit.id : null);
  return {
    projectId: input.projectId,
    script,
    config,
    view,
    choose: script.choose,
    cast,
    places: kbPlaceNames(kb),
    unit,
    source,
    hasDefault: hasDefaultFor(config, source),
    metrics,
    scenes: scenesOf(blocks),
    rail,
    railSummary: railSummaryOf(rail),
    kb: kbStatusOf(kb, input.hasNovel, unit ? chaptersOf(unit) : []),
    chapterMax: input.novelChapters || DEFAULT_CHAPTER_MAX,
  };
}
