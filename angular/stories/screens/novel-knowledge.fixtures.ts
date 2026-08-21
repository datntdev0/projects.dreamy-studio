import { AnalyzedChapter, EntityType, KnowledgeEntity, KnowledgeEvidence, KnowledgeFact, KnowledgeItem } from "@app/features/novel/novel.knowledge.models";

const STAMP = "2026-11-09T09:15:00Z";

interface EntitySpec {
  id: string;
  type: EntityType;
  name: string;
  summary?: string;
  stale?: string;
  ev: KnowledgeEvidence[];
}

interface FactSpec {
  id: string;
  pred: string;
  subject: string;
  object?: string;
  value?: string;
  ev: KnowledgeEvidence[];
}

export function evidence(chapter: number, p: number, q: string, verified = true): KnowledgeEvidence {
  return { chapter, p, q, verified };
}

function entity(spec: EntitySpec): KnowledgeEntity {
  return { id: spec.id, kind: "entity", type: spec.type, name: spec.name, summary: spec.summary ?? "", ev: spec.ev, stale: spec.stale ?? null };
}

function fact(spec: FactSpec): KnowledgeFact {
  return { id: spec.id, kind: "fact", pred: spec.pred, subject: spec.subject, object: spec.object ?? null, value: spec.value ?? null, ev: spec.ev, stale: null };
}

const LAMP = evidence(1, 1, "Wren Aldous leo ba trăm mười hai bậc thang của Tháp Đèn");
const CLERK = evidence(1, 3, "Viên thư lại bến cảng đã leo lên cầu thang mà không phát ra một tiếng động");
const NAMED = evidence(1, 5, "Viên thư lại tự giới thiệu tên là Maro Quill");
const ROOM = evidence(2, 1, "Maro Quill ngủ không yên trong căn phòng phía trên cửa hàng của người buôn muối");
const LETTER = evidence(2, 1, "lá thư của Phu nhân Sevrin gấp gọn trong cuốn sổ cái");
const CHAIR = evidence(2, 2, "dấu hiệu của chủ tịch Hội đồng");
const WOMAN = evidence(2, 4, "một bà lão bán cho anh một tách trà và một lời cảnh báo");

export const KNOWLEDGE_ENTITIES: KnowledgeEntity[] = [
  entity({ id: "E1", type: "character", name: "Wren Aldous", summary: "Người giữ ngọn đèn cuối cùng của Harrowmere.", ev: [LAMP] }),
  entity({ id: "E2", type: "persona", name: "Wren · người giữ đèn", summary: "Wren trong vai người giữ đèn của Tháp Đèn.", ev: [LAMP, evidence(1, 4, "“Hội đồng đâu có thắp đèn,” cô nói. “Tôi thắp.”")] }),
  entity({ id: "E3", type: "character", name: "Maro Quill", summary: "Người được cử đến kiểm kê Harrowmere.", ev: [NAMED] }),
  entity({ id: "E4", type: "persona", name: "Maro · thư lại bến cảng", summary: "Maro Quill trong vai viên thư lại bến cảng.", ev: [CLERK, NAMED] }),
  entity({ id: "E5", type: "character", name: "Phu nhân Sevrin", summary: "Người viết lá thư giao việc cho Maro.", ev: [LETTER] }),
  entity({ id: "E6", type: "persona", name: "Phu nhân Sevrin", summary: "Chủ tịch Hội đồng Harrowmere.", ev: [LETTER, CHAIR] }),
  entity({ id: "E7", type: "persona", name: "Sevrin", summary: "Cách gọi ngắn của Phu nhân Sevrin.", ev: [CHAIR] }),
  entity({ id: "E8", type: "persona", name: "Bà lão bán trà", summary: "Bà lão ở Bến Chìm đã cảnh báo Maro.", ev: [WOMAN] }),
  entity({ id: "E9", type: "location", name: "Tháp Đèn", summary: "Ngọn tháp ba trăm mười hai bậc nơi Wren thắp đèn.", ev: [LAMP] }),
  entity({ id: "E10", type: "location", name: "Bến Chìm", summary: "Bến cảng chìm trong sương mù.", ev: [evidence(1, 6, "sương mù phủ dày lên Bến Chìm"), evidence(2, 4, "Ở Bến Chìm, một bà lão bán cho anh một tách trà")] }),
  entity({ id: "E11", type: "location", name: "Harrowmere", summary: "Thị trấn cảng bị sương mù nuốt chửng.", ev: [evidence(1, 1, "ngọn đèn cuối cùng của Harrowmere")] }),
  entity({ id: "E12", type: "location", name: "Cửa hàng buôn muối", summary: "Nơi Maro thuê phòng ở tầng trên.", ev: [ROOM] }),
  entity({ id: "E13", type: "organization", name: "Hội đồng Harrowmere", summary: "Cơ quan cai quản thị trấn, đã bỏ mặc ngọn đèn.", ev: [evidence(1, 3, "Hội đồng đã năm mùa đông không")] }),
  entity({ id: "E14", type: "artifact", name: "Cuốn sổ cái", summary: "Sổ Maro dùng để kiểm kê.", stale: "Chương 2 đã thay đổi sau khi phân tích.", ev: [evidence(1, 3, "ôm chặt cuốn sổ cái trước ngực")] }),
  entity({ id: "E15", type: "artifact", name: "Lá thư của Phu nhân Sevrin", summary: "Thư gấp trong sổ cái, giao nhiệm vụ cho Maro.", ev: [LETTER] }),
  entity({ id: "E16", type: "skill", name: "Kiểm kê", summary: "Nghề đếm và ghi sổ của Maro.", ev: [evidence(1, 5, "được cử đến để kiểm kê những gì còn lại của Harrowmere")] }),
  entity({ id: "E17", type: "term", name: "Người giữ đèn", summary: "Danh xưng của người thắp ngọn đèn cuối cùng.", ev: [evidence(2, 4, "Người coi đèn không thắp đèn cho tàu thuyền")] }),
  entity({ id: "E18", type: "event", name: "Maro lên Tháp Đèn", summary: "Maro gặp Wren lần đầu trên tháp.", ev: [CLERK, evidence(1, 5, "Anh không nói ai đã cử mình.")] }),
  entity({ id: "E19", type: "event", name: "Maro nhận lá thư", summary: "Maro thấy thư của Phu nhân Sevrin trong sổ cái.", ev: [LETTER] }),
];

export const KNOWLEDGE_FACTS: KnowledgeFact[] = [
  fact({ id: "F1", pred: "persona_of", subject: "E2", object: "E1", ev: [LAMP] }),
  fact({ id: "F2", pred: "persona_of", subject: "E4", object: "E3", ev: [NAMED] }),
  fact({ id: "F3", pred: "persona_of", subject: "E6", object: "E5", ev: [LETTER] }),
  fact({ id: "F4", pred: "persona_of", subject: "E7", object: "E5", ev: [CHAIR] }),
  fact({ id: "F5", pred: "occupation", subject: "E2", value: "người giữ đèn", ev: [LAMP] }),
  fact({ id: "F6", pred: "occupation", subject: "E4", value: "thư lại bến cảng", ev: [CLERK] }),
  fact({ id: "F7", pred: "occupation", subject: "E6", value: "chủ tịch Hội đồng", ev: [CHAIR] }),
  fact({ id: "F8", pred: "appearance", subject: "E4", value: "gầy, mặc áo khoác xám", ev: [evidence(1, 3, "một người gầy trong chiếc áo khoác xám")] }),
  fact({ id: "F9", pred: "age", subject: "E4", value: "khoảng 30 tuổi", ev: [evidence(1, 3, "một người gầy trong chiếc áo khoác xám")] }),
  fact({ id: "F10", pred: "age", subject: "E4", value: "gần 40 tuổi", ev: [evidence(2, 5, "Lần đầu tiên trong sự nghiệp")] }),
  fact({ id: "F11", pred: "resides_at", subject: "E2", object: "E9", ev: [LAMP] }),
  fact({ id: "F12", pred: "resides_at", subject: "E4", object: "E12", ev: [ROOM] }),
  fact({ id: "F13", pred: "leader_of", subject: "E6", object: "E13", ev: [CHAIR] }),
  fact({ id: "F14", pred: "leader_of", subject: "E7", object: "E13", ev: [CHAIR] }),
  fact({ id: "F15", pred: "member_of", subject: "E3", object: "E13", ev: [NAMED] }),
  fact({ id: "F16", pred: "owns", subject: "E4", object: "E14", ev: [evidence(1, 3, "ôm chặt cuốn sổ cái trước ngực", false)] }),
  fact({ id: "F17", pred: "owns", subject: "E4", object: "E15", ev: [LETTER] }),
  fact({ id: "F18", pred: "created_by", subject: "E15", object: "E6", ev: [evidence(2, 2, "“Hãy đếm những ngọn đèn,” lá thư viết.")] }),
  fact({ id: "F19", pred: "has_skill", subject: "E4", object: "E16", ev: [evidence(1, 5, "được cử đến để kiểm kê những gì còn lại của Harrowmere")] }),
  fact({ id: "F20", pred: "located_in", subject: "E9", object: "E11", ev: [LAMP] }),
  fact({ id: "F21", pred: "located_in", subject: "E10", object: "E11", ev: [evidence(1, 6, "sương mù phủ dày lên Bến Chìm")] }),
  fact({ id: "F22", pred: "participates_in", subject: "E2", object: "E18", ev: [CLERK] }),
  fact({ id: "F23", pred: "participates_in", subject: "E4", object: "E18", ev: [CLERK] }),
  fact({ id: "F24", pred: "occurs_at", subject: "E18", object: "E9", ev: [CLERK] }),
  fact({ id: "F25", pred: "occurred_at", subject: "E18", value: "buổi chiều chạng vạng", ev: [LAMP] }),
  fact({ id: "F26", pred: "participates_in", subject: "E4", object: "E19", ev: [LETTER] }),
  fact({ id: "F27", pred: "occurs_at", subject: "E19", object: "E12", ev: [ROOM] }),
  fact({ id: "F28", pred: "occurred_at", subject: "E19", value: "buổi sáng", ev: [LETTER] }),
  fact({ id: "F29", pred: "mentor_of", subject: "E8", object: "E4", ev: [WOMAN] }),
  fact({ id: "F30", pred: "located_in", subject: "E13", object: "E11", ev: [evidence(1, 3, "Hội đồng đã năm mùa đông không")] }),
];

const LATER_CHAPTERS = [3, 4, 5, 6];

export const KNOWLEDGE_ITEMS: KnowledgeItem[] = [...KNOWLEDGE_ENTITIES, ...KNOWLEDGE_FACTS, ...LATER_CHAPTERS.flatMap((seq) => chapterItems(seq))];

export const KNOWLEDGE_ANALYZED: Record<number, AnalyzedChapter> = {
  1: { lang: "VI", at: STAMP, entities: 12, facts: 18 },
  2: { lang: "VI", at: STAMP, entities: 9, facts: 12 },
  3: { lang: "src", at: STAMP, entities: 1, facts: 3 },
  4: { lang: "src", at: STAMP, entities: 1, facts: 3 },
  5: { lang: "src", at: STAMP, entities: 1, facts: 3 },
  6: { lang: "src", at: STAMP, entities: 1, facts: 3 },
};

export const CHARACTER_PREDICATE_FACT = fact({ id: "F31", pred: "member_of", subject: "E1", object: "E13", ev: [evidence(1, 3, "“Hội đồng đâu có thắp đèn,” cô nói.")] });

export function chapterItems(seq: number): KnowledgeItem[] {
  const event = entity({ id: `G${seq}-event`, type: "event", name: `Sự kiện ở chương ${seq}`, summary: "Mục sinh ra bởi lần phân tích mẫu.", ev: [evidence(seq, 1, "Đoạn mẫu của lần phân tích.")] });
  const place = fact({ id: `G${seq}-place`, pred: "occurs_at", subject: event.id, object: "E10", ev: [evidence(seq, 1, "Đoạn mẫu của lần phân tích.")] });
  const actor = fact({ id: `G${seq}-actor`, pred: "participates_in", subject: "E2", object: event.id, ev: [evidence(seq, 2, "Đoạn mẫu của lần phân tích.")] });
  const when = fact({ id: `G${seq}-when`, pred: "occurred_at", subject: event.id, value: `đêm thứ ${seq}`, ev: [evidence(seq, 1, "Đoạn mẫu của lần phân tích.")] });
  return [event, place, actor, when];
}
