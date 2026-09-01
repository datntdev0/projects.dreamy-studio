// prettier-ignore
import { KnowledgeEntity, KnowledgeEvidence, KnowledgeFact, NovelKnowledge } from '../novel/novel.knowledge.models';
// prettier-ignore
import { KbCharacter, KbEvent, KbPlace, KbSnapshot, KbStatus, ScriptBeat } from './scripting.models';
import { paragraphChapter, paragraphNumber } from './scripting.rules';

export const KB_TYPE_CHARACTER = 'character';
export const KB_TYPE_PERSONA = 'persona';
export const KB_TYPE_LOCATION = 'location';
export const KB_TYPE_ORGANIZATION = 'organization';
export const KB_TYPE_EVENT = 'event';
export const KB_PRED_PERSONA_OF = 'persona_of';
export const KB_PRED_PARTICIPATES = 'participates_in';
export const KB_PRED_OCCURS_AT = 'occurs_at';
export const KB_PRED_LOCATED_IN = 'located_in';
export const BEAT_TIME = 'DAY';

const FAR_DISTANCE = 99;

export const EMPTY_KB: KbSnapshot = {
  analyzed: [],
  characters: [],
  places: [],
  events: [],
  participants: {},
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

function factsOf(knowledge: NovelKnowledge, pred: string): KnowledgeFact[] {
  const facts: KnowledgeFact[] = [];
  for (const item of knowledge.items) {
    if (item.kind === 'fact' && item.pred === pred) {
      facts.push(item);
    }
  }
  return facts;
}

function containerIds(knowledge: NovelKnowledge): Set<string> {
  const ids = new Set<string>();
  for (const fact of factsOf(knowledge, KB_PRED_LOCATED_IN)) {
    if (fact.object) {
      ids.add(fact.object);
    }
  }
  return ids;
}

function placesOf(knowledge: NovelKnowledge): KbPlace[] {
  const containers = containerIds(knowledge);
  const places: KbPlace[] = [];
  for (const type of [KB_TYPE_LOCATION, KB_TYPE_ORGANIZATION]) {
    for (const entity of entitiesOf(knowledge, type)) {
      places.push({
        id: entity.id,
        name: entity.name,
        refs: refsOf(entity),
        container: containers.has(entity.id),
        organization: type === KB_TYPE_ORGANIZATION,
      });
    }
  }
  return places;
}

function personaOwners(knowledge: NovelKnowledge): Record<string, string> {
  const owners: Record<string, string> = {};
  for (const fact of factsOf(knowledge, KB_PRED_PERSONA_OF)) {
    if (fact.object) {
      owners[fact.subject] = fact.object;
    }
  }
  return owners;
}

function participantsOf(
  knowledge: NovelKnowledge,
  characters: Set<string>,
): Record<string, string[]> {
  const owners = personaOwners(knowledge);
  const participants: Record<string, string[]> = {};
  for (const fact of factsOf(knowledge, KB_PRED_PARTICIPATES)) {
    const character = characters.has(fact.subject) ? fact.subject : owners[fact.subject];
    if (fact.object && character) {
      const list = participants[fact.object] ?? [];
      participants[fact.object] = list.includes(character) ? list : [...list, character];
    }
  }
  return participants;
}

function eventPlaces(knowledge: NovelKnowledge): Record<string, string> {
  const places: Record<string, string> = {};
  for (const fact of factsOf(knowledge, KB_PRED_OCCURS_AT)) {
    if (fact.object) {
      places[fact.subject] = fact.object;
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
  const places = eventPlaces(knowledge);
  const events: KbEvent[] = entitiesOf(knowledge, KB_TYPE_EVENT).map((entity, order) => ({
    id: entity.id,
    name: entity.name,
    refs: refsOf(entity),
    place: places[entity.id] ?? null,
    order,
  }));
  return {
    analyzed: Object.keys(knowledge.analyzed)
      .map(Number)
      .sort((a, b) => a - b),
    characters,
    places: placesOf(knowledge),
    events,
    participants: participantsOf(knowledge, new Set(characters.map((item) => item.id))),
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

export function kbReady(kb: KbSnapshot | null, chapters: number[]): boolean {
  return kbAvailable(kb) && chapters.length > 0 && kbMissing(kb, chapters).length === 0;
}

export function kbStatusOf(kb: KbSnapshot | null, hasNovel: boolean, chapters: number[]): KbStatus {
  return {
    novel: hasNovel,
    available: hasNovel && kbAvailable(kb),
    ready: hasNovel && kbReady(kb, chapters),
    missing: hasNovel ? kbMissing(kb, chapters) : [],
  };
}

export function kbCharactersOf(kb: KbSnapshot | null): KbCharacter[] {
  return kb?.characters ?? [];
}

export function kbPlaceNames(kb: KbSnapshot | null): string[] {
  return (kb?.places ?? []).map((place) => place.name);
}

function distanceTo(place: KbPlace, ref: string): number {
  const chapter = paragraphChapter(ref);
  const distances = place.refs
    .filter((candidate) => paragraphChapter(candidate) === chapter)
    .map((candidate) => Math.abs(paragraphNumber(candidate) - paragraphNumber(ref)));
  return Math.min(FAR_DISTANCE, ...distances);
}

function nearestPlace(places: KbPlace[], ref: string): string {
  let best: KbPlace | null = null;
  let bestDistance = FAR_DISTANCE;
  for (const place of places) {
    const distance = distanceTo(place, ref);
    if (distance < bestDistance) {
      best = place;
      bestDistance = distance;
    }
  }
  return best ? best.name.toUpperCase() : '';
}

function placeFor(kb: KbSnapshot, event: KbEvent, refs: string[]): string {
  const explicit = kb.places.find((place) => place.id === event.place);
  if (explicit) {
    return explicit.name.toUpperCase();
  }
  const candidates = kb.places.filter((place) => !place.organization && !place.container);
  return refs.length ? nearestPlace(candidates, refs[0]) : '';
}

function charactersFor(kb: KbSnapshot, event: KbEvent, refs: string[]): string[] {
  const linked = kb.participants[event.id] ?? [];
  return kb.characters
    .filter(
      (character) =>
        linked.includes(character.id) || character.refs.some((ref) => refs.includes(ref)),
    )
    .map((character) => character.id);
}

export function kbBeatsOf(kb: KbSnapshot | null, chapters: number[]): ScriptBeat[] | null {
  if (kb === null || !kbReady(kb, chapters)) {
    return null;
  }
  const beats: ScriptBeat[] = [];
  const events = kb.events.filter((event) =>
    event.refs.some((ref) => chapters.includes(paragraphChapter(ref))),
  );
  for (const event of events.sort((a, b) => a.order - b.order)) {
    const refs = [...new Set(event.refs.filter((ref) => chapters.includes(paragraphChapter(ref))))];
    beats.push({
      event: event.id,
      text: event.name,
      refs,
      chars: charactersFor(kb, event, refs),
      loc: placeFor(kb, event, refs),
      time: BEAT_TIME,
    });
  }
  return beats;
}
