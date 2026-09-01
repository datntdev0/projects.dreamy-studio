// prettier-ignore
import { KnowledgeEntity, KnowledgeEvidence, NovelKnowledge } from '../novel/novel.knowledge.models';
// prettier-ignore
import { KbCharacter, KbPlace, KbSnapshot, KbStatus } from './scripting.models';

export const KB_TYPE_CHARACTER = 'character';
export const KB_TYPE_LOCATION = 'location';
export const KB_TYPE_ORGANIZATION = 'organization';

export const EMPTY_KB: KbSnapshot = {
  analyzed: [],
  characters: [],
  places: [],
};

function refOf(evidence: KnowledgeEvidence): string {
  return `${evidence.chapter}.${evidence.p}`;
}

function refsOf(entity: KnowledgeEntity): string[] {
  return [...new Set(entity.ev.map(refOf))];
}

function isDuplicate(entity: KnowledgeEntity, all: KnowledgeEntity[]): boolean {
  return all.some(
    (other) =>
      other !== entity &&
      other.type === entity.type &&
      other.name.length > entity.name.length &&
      other.name.includes(entity.name),
  );
}

function entitiesOf(knowledge: NovelKnowledge, type: string): KnowledgeEntity[] {
  const all: KnowledgeEntity[] = [];
  for (const item of knowledge.items) {
    if (item.kind === 'entity' && item.type === type) {
      all.push(item);
    }
  }
  return all.filter((entity) => !isDuplicate(entity, all));
}

function placesOf(knowledge: NovelKnowledge): KbPlace[] {
  const places: KbPlace[] = [];
  for (const type of [KB_TYPE_LOCATION, KB_TYPE_ORGANIZATION]) {
    for (const entity of entitiesOf(knowledge, type)) {
      places.push({
        id: entity.id,
        name: entity.name,
        refs: refsOf(entity),
      });
    }
  }
  return places;
}

export function kbSnapshotOf(knowledge: NovelKnowledge): KbSnapshot {
  const characters: KbCharacter[] = entitiesOf(knowledge, KB_TYPE_CHARACTER).map((entity) => ({
    id: entity.id,
    name: entity.name,
    refs: refsOf(entity),
  }));
  return {
    analyzed: Object.keys(knowledge.analyzed)
      .map(Number)
      .sort((a, b) => a - b),
    characters,
    places: placesOf(knowledge),
  };
}

export function kbAvailable(kb: KbSnapshot | null): boolean {
  return kb !== null && kb.analyzed.length > 0;
}

export function kbMissing(kb: KbSnapshot | null, chapters: number[]): number[] {
  return kb !== null && kbAvailable(kb)
    ? chapters.filter((chapter) => !kb.analyzed.includes(chapter))
    : [];
}

export function kbStatusOf(kb: KbSnapshot | null, hasNovel: boolean, chapters: number[]): KbStatus {
  return {
    novel: hasNovel,
    available: hasNovel && kbAvailable(kb),
    missing: hasNovel ? kbMissing(kb, chapters) : [],
  };
}

export function kbCharactersOf(kb: KbSnapshot | null): KbCharacter[] {
  return kb?.characters ?? [];
}

export function kbPlaceNames(kb: KbSnapshot | null): string[] {
  return (kb?.places ?? []).map((place) => place.name);
}
