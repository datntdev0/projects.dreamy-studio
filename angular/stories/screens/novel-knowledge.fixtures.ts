import { AnalyzedChapter, EntityType, KnowledgeEntity, KnowledgeEvidence, KnowledgeFact, KnowledgeItem } from "@app/features/novel/novel.knowledge.models";

const STAMP = "2026-11-09T09:15:00Z";
const STALE_CHAPTER = 2;
const SEEDED_CHAPTERS = [1, 2, 3, 4, 5, 6];
const LATER_CHAPTERS = [3, 4, 5, 6];

interface EntitySpec {
  id: string;
  type: EntityType;
  name: string;
  titles?: string[];
  aliases?: string[];
  stale?: number[];
  ev: KnowledgeEvidence[];
}

interface FactSpec {
  id: string;
  pred: string;
  subject: string;
  object?: string;
  ev: KnowledgeEvidence[];
}

export function evidence(chapter: number, p: number, q: string, verified = true): KnowledgeEvidence {
  return { chapter, p, q, verified };
}

function entity(spec: EntitySpec): KnowledgeEntity {
  return { id: spec.id, kind: "entity", type: spec.type, name: spec.name, titles: spec.titles ?? [], aliases: spec.aliases ?? [], ev: spec.ev, stale: spec.stale ?? [] };
}

function fact(spec: FactSpec): KnowledgeFact {
  return { id: spec.id, kind: "fact", pred: spec.pred, subject: spec.subject, object: spec.object ?? null, ev: spec.ev, stale: [] };
}

const LAMP = evidence(1, 1, "Wren Aldous leo ba trăm mười hai bậc thang của Tháp Đèn");
const CLERK = evidence(1, 3, "Viên thư lại bến cảng đã leo lên cầu thang mà không phát ra một tiếng động");
const NAMED = evidence(1, 5, "Viên thư lại tự giới thiệu tên là Maro Quill");
const ROOM = evidence(2, 1, "Maro Quill ngủ không yên trong căn phòng phía trên cửa hàng của người buôn muối");
const LETTER = evidence(2, 1, "lá thư của Phu nhân Sevrin gấp gọn trong cuốn sổ cái");
const CHAIR = evidence(2, 2, "dấu hiệu của chủ tịch Hội đồng");
const WOMAN = evidence(2, 4, "một bà lão bán cho anh một tách trà và một lời cảnh báo");
const COUNCIL = evidence(1, 3, "Hội đồng đã năm mùa đông không");
const LEDGER = evidence(1, 3, "ôm chặt cuốn sổ cái trước ngực");
const COAT = evidence(1, 3, "một người gầy trong chiếc áo khoác xám");

export const KNOWLEDGE_ENTITIES: KnowledgeEntity[] = [
  entity({ id: "E1", type: "character", name: "Wren Aldous", ev: [LAMP] }),
  entity({ id: "E2", type: "persona", name: "Wren · người giữ đèn", titles: ["người giữ đèn", "người coi đèn"], aliases: ["Cô Wren"], ev: [LAMP, evidence(1, 4, "“Hội đồng đâu có thắp đèn,” cô nói. “Tôi thắp.”")] }),
  entity({ id: "E3", type: "character", name: "Maro Quill", ev: [NAMED] }),
  entity({ id: "E4", type: "persona", name: "Maro · thư lại bến cảng", titles: ["thư lại bến cảng"], aliases: ["Maro"], ev: [CLERK, NAMED] }),
  entity({ id: "E5", type: "character", name: "Phu nhân Sevrin", ev: [LETTER] }),
  entity({ id: "E6", type: "persona", name: "Phu nhân Sevrin", titles: ["chủ tịch Hội đồng"], aliases: ["Sevrin"], ev: [LETTER, CHAIR] }),
  entity({ id: "E7", type: "persona", name: "Wren", ev: [evidence(2, 3, "Wren không trả lời, chỉ nhìn ra phía sương mù.")] }),
  entity({ id: "E8", type: "persona", name: "Bà lão bán trà", titles: ["bà lão"], ev: [WOMAN] }),
  entity({ id: "E9", type: "location", name: "Tháp Đèn", ev: [LAMP] }),
  entity({ id: "E10", type: "location", name: "Bến Chìm", ev: [evidence(1, 6, "sương mù phủ dày lên Bến Chìm"), evidence(2, 4, "Ở Bến Chìm, một bà lão bán cho anh một tách trà")] }),
  entity({ id: "E11", type: "location", name: "Harrowmere", ev: [evidence(1, 1, "ngọn đèn cuối cùng của Harrowmere")] }),
  entity({ id: "E12", type: "location", name: "Cửa hàng buôn muối", ev: [ROOM] }),
  entity({ id: "E13", type: "organization", name: "Hội đồng Harrowmere", ev: [COUNCIL] }),
  entity({ id: "E14", type: "artifact", name: "Cuốn sổ cái", stale: [STALE_CHAPTER], ev: [LEDGER, evidence(2, 2, "cuốn sổ cái nằm mở trên bàn của Maro")] }),
  entity({ id: "E15", type: "artifact", name: "Lá thư của Phu nhân Sevrin", ev: [LETTER] }),
  entity({ id: "E16", type: "skill", name: "Kiểm kê", ev: [evidence(1, 5, "được cử đến để kiểm kê những gì còn lại của Harrowmere")] }),
  entity({ id: "E17", type: "term", name: "Người giữ đèn", ev: [evidence(2, 4, "Người coi đèn không thắp đèn cho tàu thuyền")] }),
  entity({ id: "E18", type: "event", name: "Maro lên Tháp Đèn", ev: [CLERK, evidence(1, 5, "Anh không nói ai đã cử mình.")] }),
  entity({ id: "E19", type: "event", name: "Maro nhận lá thư", ev: [LETTER] }),
];

export const KNOWLEDGE_FACTS: KnowledgeFact[] = [
  fact({ id: "F1", pred: "persona_of", subject: "E2", object: "E1", ev: [LAMP] }),
  fact({ id: "F2", pred: "persona_of", subject: "E4", object: "E3", ev: [NAMED] }),
  fact({ id: "F3", pred: "persona_of", subject: "E6", object: "E5", ev: [LETTER] }),
  fact({ id: "F4", pred: "persona_of", subject: "E7", object: "E1", ev: [evidence(2, 3, "Wren không trả lời, chỉ nhìn ra phía sương mù.")] }),
  fact({ id: "F5", pred: "occupation", subject: "E2", ev: [evidence(1, 4, "“Hội đồng đâu có thắp đèn,” cô nói. “Tôi thắp.”")] }),
  fact({ id: "F6", pred: "occupation", subject: "E4", ev: [CLERK] }),
  fact({ id: "F7", pred: "occupation", subject: "E6", ev: [CHAIR] }),
  fact({ id: "F8", pred: "appearance", subject: "E4", ev: [COAT] }),
  fact({ id: "F9", pred: "age", subject: "E4", ev: [evidence(1, 3, "một người đàn ông chừng ba mươi tuổi"), evidence(2, 5, "Lần đầu tiên trong sự nghiệp gần bốn mươi năm")] }),
  fact({ id: "F10", pred: "appearance", subject: "E2", ev: [evidence(1, 2, "mái tóc bạc buộc gọn sau gáy")] }),
  fact({ id: "F11", pred: "resides_at", subject: "E2", object: "E9", ev: [LAMP] }),
  fact({ id: "F12", pred: "resides_at", subject: "E4", object: "E12", ev: [ROOM] }),
  fact({ id: "F13", pred: "leader_of", subject: "E6", object: "E13", ev: [CHAIR] }),
  fact({ id: "F14", pred: "member_of", subject: "E4", object: "E13", ev: [evidence(1, 5, "Anh không nói ai đã cử mình.")] }),
  fact({ id: "F15", pred: "owns", subject: "E4", object: "E14", ev: [{ ...LEDGER, verified: false }] }),
  fact({ id: "F16", pred: "owns", subject: "E4", object: "E15", ev: [LETTER] }),
  fact({ id: "F17", pred: "created_by", subject: "E15", object: "E6", ev: [evidence(2, 2, "“Hãy đếm những ngọn đèn,” lá thư viết.")] }),
  fact({ id: "F18", pred: "has_skill", subject: "E4", object: "E16", ev: [evidence(1, 5, "được cử đến để kiểm kê những gì còn lại của Harrowmere")] }),
  fact({ id: "F19", pred: "located_in", subject: "E9", object: "E11", ev: [LAMP] }),
  fact({ id: "F20", pred: "located_in", subject: "E10", object: "E11", ev: [evidence(1, 6, "sương mù phủ dày lên Bến Chìm")] }),
  fact({ id: "F21", pred: "participates_in", subject: "E2", object: "E18", ev: [CLERK] }),
  fact({ id: "F22", pred: "participates_in", subject: "E4", object: "E18", ev: [CLERK] }),
  fact({ id: "F23", pred: "occurs_at", subject: "E18", object: "E9", ev: [CLERK] }),
  fact({ id: "F24", pred: "occurred_at", subject: "E18", ev: [evidence(1, 2, "Trời đã chạng vạng khi anh lên tới đỉnh tháp")] }),
  fact({ id: "F25", pred: "participates_in", subject: "E4", object: "E19", ev: [LETTER] }),
  fact({ id: "F26", pred: "occurs_at", subject: "E19", object: "E12", ev: [ROOM] }),
  fact({ id: "F27", pred: "occurred_at", subject: "E19", ev: [evidence(2, 1, "Sáng hôm sau, anh mở cuốn sổ cái và thấy lá thư")] }),
  fact({ id: "F28", pred: "mentor_of", subject: "E8", object: "E4", ev: [WOMAN] }),
  fact({ id: "F29", pred: "located_in", subject: "E13", object: "E11", ev: [COUNCIL] }),
];

export function chapterItems(seq: number): KnowledgeItem[] {
  const quote = `Đêm thứ ${seq} trôi qua trong sương mù của Harrowmere.`;
  const event = entity({ id: `G${seq}-event`, type: "event", name: `Sự kiện ở chương ${seq}`, ev: [evidence(seq, 1, quote)] });
  const place = entity({ id: `G${seq}-place`, type: "location", name: `Địa điểm ở chương ${seq}`, ev: [evidence(seq, 1, quote)] });
  const where = fact({ id: `G${seq}-where`, pred: "occurs_at", subject: event.id, object: place.id, ev: [evidence(seq, 1, quote)] });
  const when = fact({ id: `G${seq}-when`, pred: "occurred_at", subject: event.id, ev: [evidence(seq, 2, `Đêm thứ ${seq}, khi ngọn đèn vừa được thắp.`)] });
  return [event, place, where, when];
}

export const CHARACTER_PREDICATE_FACT = fact({ id: "F30", pred: "member_of", subject: "E1", object: "E13", ev: [evidence(1, 3, "“Hội đồng đâu có thắp đèn,” cô nói.")] });

export const KNOWLEDGE_ITEMS: KnowledgeItem[] = [...KNOWLEDGE_ENTITIES, ...KNOWLEDGE_FACTS, ...LATER_CHAPTERS.flatMap((seq) => chapterItems(seq))];

function analyzedOf(items: KnowledgeItem[], seq: number): AnalyzedChapter {
  const inChapter = items.filter((item) => item.ev.some((entry) => entry.chapter === seq));
  const entities = inChapter.filter((item) => item.kind === "entity").length;
  return { at: STAMP, entities, facts: inChapter.length - entities, stale: seq === STALE_CHAPTER };
}

export const KNOWLEDGE_ANALYZED: Record<number, AnalyzedChapter> = Object.fromEntries(SEEDED_CHAPTERS.map((seq) => [seq, analyzedOf(KNOWLEDGE_ITEMS, seq)]));
