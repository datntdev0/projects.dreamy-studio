import { kbCharactersOf, kbPlaceNames, kbStatusOf } from './scripting.knowledge';
// prettier-ignore
import { CastMember, KbSnapshot, RailRow, RailSummary, Script, ScriptContext, ScriptSource, ScriptUnit, ScriptView, SourceParagraph } from './scripting.models';
// prettier-ignore
import { activeUnit, castOf, chaptersOf, checkRowsOf, checkSummaryOf, DEFAULT_CHAPTER_MAX, findBlock, hasDefaultFor, issuesOf, metricsOf, railMarkOf, scenesOf, sourceRowsOf, staleRefsOf, uncoveredOf, unitStatsOf } from './scripting.rules';
import { unitSource } from './scripting.source';

export interface ContextInput {
  projectId: number;
  script: Script;
  view: ScriptView;
  kb: KbSnapshot | null;
  hasNovel: boolean;
  chapters: Record<number, SourceParagraph[] | null>;
  novelChapters: number;
  generating: string[];
}

const EMPTY_STATS = null;

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

function railRowOf(
  cast: CastMember[],
  unit: ScriptUnit,
  activeId: string | null,
  source: ScriptSource | null,
  generating: boolean,
): RailRow {
  const stale = staleRefsOf(unit, source).length;
  return {
    unit,
    active: unit.id === activeId,
    mark: railMarkOf(unit, stale),
    stale,
    generating,
    metrics: unit.blocks ? metricsOf(cast, unit.blocks) : null,
    meta: unit.meta,
    chapters: chaptersOf(unit),
  };
}

export function railSummaryOf(script: Script): RailSummary {
  const locked = script.units.filter((unit) => unit.status === 'locked').length;
  const total = script.units.length;
  return { locked, total, percent: total ? Math.round((locked / total) * 100) : 0 };
}

function railOf(
  input: ContextInput,
  cast: CastMember[],
  activeId: string | null,
  sources: Record<string, ScriptSource | null>,
): RailRow[] {
  return input.script.units.map((unit) =>
    railRowOf(cast, unit, activeId, sources[unit.id] ?? null, input.generating.includes(unit.id)),
  );
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
  const issues = unit ? issuesOf(config, unit, source) : [];
  const checks = checkRowsOf(config, issues, source !== null);
  const checkSummary = checkSummaryOf(checks);
  const locked = unit?.status === 'locked';
  const uncovered = unit ? uncoveredOf(unit, source) : [];
  return {
    projectId: input.projectId,
    script,
    config,
    view,
    choose: script.choose,
    cast,
    places: kbPlaceNames(kb),
    unit,
    locked,
    generating: unit ? input.generating.includes(unit.id) : false,
    source,
    hasDefault: hasDefaultFor(config, source),
    metrics,
    stats: metrics ? unitStatsOf(config, metrics, source, uncovered) : EMPTY_STATS,
    issues,
    checks,
    checkSummary,
    canLock: !!unit && !locked && checkSummary.errors === 0,
    scenes: scenesOf(blocks),
    staleRefs: unit ? staleRefsOf(unit, source) : [],
    uncovered,
    rows: config.source && source && unit && blocks ? sourceRowsOf(unit, source) : null,
    rail: railOf(input, cast, unit ? unit.id : null, sources),
    railSummary: railSummaryOf(script),
    kb: kbStatusOf(kb, input.hasNovel, unit ? chaptersOf(unit) : []),
    selected: findBlock(unit, view.sel) ?? null,
    chapterMax: input.novelChapters || DEFAULT_CHAPTER_MAX,
  };
}
