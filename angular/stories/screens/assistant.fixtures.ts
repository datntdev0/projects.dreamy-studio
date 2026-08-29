import { KnowledgeChangeSet, TranslationReview } from "@features/assistant/assistant.models";
import { NOVEL_ID } from "./novel-translation.mocks";

export function translationReview(chapter: number, chapterTitle: string): TranslationReview {
  return {
    kind: "translation_review",
    chapter,
    chapterTitle,
    target: "VI",
    checked: 18,
    findings: [
      {
        id: "f1",
        n: 4,
        severity: "error",
        category: "name",
        source: "雾气在天亮之前就锁住了哈罗米尔。",
        current: "Sương mù đã phủ kín Cảng Sương từ trước khi trời sáng.",
        suggested: "Sương mù đã phủ kín Harrowmere từ trước khi trời sáng.",
        from: "Cảng Sương",
        to: "Harrowmere",
        reason: "“哈罗米尔” được giữ nguyên là “Harrowmere” ở 9/11 lần trong chương 1–2. Riêng đoạn này lại dịch thành “Cảng Sương”.",
        status: "pending",
      },
      {
        id: "f2",
        n: 11,
        severity: "warning",
        category: "dict",
        source: "守灯人没有回答。",
        current: "Người canh đèn không trả lời.",
        suggested: "Người giữ đèn không trả lời.",
        from: "canh",
        to: "giữ",
        reason: "Từ điển quy định 守灯人 → “người giữ đèn”. Đây cũng là cảnh báo Dict đang mở của đoạn này.",
        status: "pending",
      },
      {
        id: "f3",
        n: 7,
        severity: "warning",
        category: "omission",
        source: "他把账簿夹在腋下，像夹着一块冰冷的墓碑。",
        current: "Anh kẹp cuốn sổ cái dưới nách.",
        suggested: "Anh kẹp cuốn sổ cái dưới nách, như kẹp một tấm bia mộ lạnh lẽo.",
        from: "nách",
        to: "nách, như kẹp một tấm bia mộ lạnh lẽo",
        reason: "Bản dịch bỏ mất phép so sánh ở nửa sau câu gốc (像夹着一块冰冷的墓碑).",
        status: "pending",
      },
      {
        id: "f4",
        n: 15,
        severity: "info",
        category: "style",
        source: "他抬头望向灯塔。",
        current: "Hắn ngẩng lên nhìn ngọn tháp đèn.",
        suggested: "Anh ngẩng lên nhìn ngọn tháp đèn.",
        from: "Hắn",
        to: "Anh",
        reason: "Hướng dẫn dịch yêu cầu ngôi thứ ba dùng “anh” / “cô”, không dùng “hắn”.",
        status: "pending",
      },
    ],
    dictionary: [
      { id: "d1", src: "哈罗米尔", dst: "Harrowmere", type: "place", note: "giữ nguyên tên gốc", occurrences: 11, status: "pending" },
      { id: "d2", src: "守灯人", dst: "người giữ đèn", type: "title", note: "danh xưng của Wren", occurrences: 7, status: "pending" },
    ],
  };
}

export type KnowledgeChangeSetRecord = KnowledgeChangeSet & { raw: Record<string, unknown>[] };

const KNOWLEDGE_RAW: Record<string, unknown>[] = [
  { k: "merge", sources: ["E7"], target: "E2" },
  { k: "props", id: "E2", aliases: ["Cô Wren", "Wren", "Người giữ đèn"] },
  { k: "fact", id: "F3", subject: "E2" },
  { k: "retype", id: "E16", type: "event" },
];

export function knowledgeChanges(): KnowledgeChangeSetRecord {
  return {
    kind: "knowledge_changes",
    id: "cs1",
    lang: "VI",
    novelId: NOVEL_ID,
    raw: KNOWLEDGE_RAW.map((edit) => ({ ...edit })),
    title: "Sửa 3 xung đột: thực thể trùng lặp và fact gắn sai vào character",
    edits: KNOWLEDGE_RAW.length,
    validation: { ok: true, resolves: 3, introduces: [] },
    status: "pending",
    changes: [
      {
        id: "c1",
        op: "merge",
        target: "“Người giữ đèn” → “Wren · người giữ đèn”",
        before: "2 persona: “Wren · người giữ đèn”, “Người giữ đèn”",
        after: "1 persona “Wren · người giữ đèn”, giữ toàn bộ evidence và fact của cả hai",
        reason: "Cùng một nhân dạng: chương 1 gọi Wren là “người giữ đèn cuối cùng”, và chưa có người giữ đèn nào khác xuất hiện.",
        ev: [{ novelId: NOVEL_ID, chapter: 1, p: 2, quote: "Wren là người giữ đèn cuối cùng của Harrowmere." }],
      },
      {
        id: "c2",
        op: "props",
        target: "Wren · người giữ đèn",
        before: "aliases: —",
        after: "aliases: Người giữ đèn, Wren",
        reason: "Giữ lại tên của persona bị gộp làm alias để lần phân tích sau nhận diện đúng.",
        ev: [],
      },
      {
        id: "c3",
        op: "fact",
        target: "resides_at",
        before: "Wren (character) → Tháp Đèn",
        after: "Wren · người giữ đèn (persona) → Tháp Đèn",
        reason: "Theo ontology, fact về một người phải gắn vào persona, không gắn trực tiếp vào character (rule character_predicate).",
        ev: [{ novelId: NOVEL_ID, chapter: 1, p: 5, quote: "Cô sống một mình trên đỉnh Tháp Đèn." }],
      },
      {
        id: "c4",
        op: "retype",
        target: "Kiểm kê",
        before: "term",
        after: "event",
        reason: "“Kiểm kê” là cuộc kiểm kê do Hội đồng tiến hành ở chương 2, không phải khái niệm trong thế giới truyện. Fact participates_in của Maro đang trỏ tới nó.",
        ev: [{ novelId: NOVEL_ID, chapter: 2, p: 3, quote: "Tôi được cử đến để đếm những gì còn lại." }],
      },
    ],
  };
}
