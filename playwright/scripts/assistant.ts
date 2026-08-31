import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect } from "@playwright/test";
import type { Ui } from "./fixtures.ts";
import { openFromSplash } from "./flows.ts";
import { seedKnowledgeWorkspace, CLEAN_ANALYSES, type KnowledgeWorkspaceSeed, type SeededKnowledgeWorkspace, type SeedAnalysis } from "./knowledge.ts";
import type { PickerStub } from "./picker.ts";
import { AZURE, EMBER, HARBOR } from "./pipeline.ts";
import type { ProviderAssistantReply, ProviderBehavior } from "./provider.ts";
import type { Sandbox } from "./sandbox.ts";
import { sampleChapters, sampleNovel, SAMPLE_TITLE, type TranslationWorkspaceSeed } from "./translation.ts";
import { readWorkspace, WORKSPACE_DB_FILE, type SeedChapter } from "./workspaces.ts";

export { AZURE, EMBER, HARBOR };

export const ASSISTANT_WORKSPACE_NAME = "assistant";
export const ASSISTANT_PROVIDER = { features: ["assistant"] } as const;

export const SCOPE_WORKSPACE = /toàn workspace|whole workspace/i;
export const SCOPE_WORKSPACE_COUNT = /^3 (novel|novels)\b/i;
export const SCOPE_NO_MATCH = /không có novel nào khớp|no novels match/i;
export const SCOPE_CHAPTERS = /^(\d+) (chương|chapters)$/i;
export const HISTORY_TITLE_TODAY = /hôm nay|today/i;
export const HISTORY_TITLE_YESTERDAY = /hôm qua|yesterday/i;
export const HISTORY_TITLE_WEEK = /7 ngày qua|previous 7 days/i;
export const HISTORY_TITLE_OLDER = /cũ hơn|older/i;
export const HISTORY_NO_MATCH = /không có phiên chat nào khớp|no chats match/i;
export const HISTORY_EMPTY_TITLE = /chưa có phiên chat|no chats yet/i;
export const HISTORY_EMPTY_DESCRIPTION = /sẽ được lưu ở đây|saved here/i;
export const HISTORY_LOAD_FAILED = /không tải được lịch sử chat|could not load chat history/i;
export const DELETE_WARNING = /xóa vĩnh viễn.*không bị ảnh hưởng|deleted permanently.*not affected/i;
export const DELETE_TOAST = /đã xóa phiên chat|deleted chat/i;
export const SEND_FAILED = /không gửi được tin nhắn|could not send the message/i;
export const THINKING = /assistant đang trả lời|assistant is replying/i;
export const WORKING = /đang tìm trong workspace|searching the workspace/i;
export const MODE_READ_ONLY = /^(chỉ đọc|read-only)$/i;
export const MODE_EDIT = /^(chỉnh sửa|modify)$/i;
export const EDIT_WARNING = /ghi thẳng vào workspace và không thể hoàn tác tự động|written straight to the workspace and cannot be undone automatically/i;
export const EDIT_NOTICE = /assistant có thể thay đổi novel, chương và knowledge|assistant can change novels, chapters and knowledge/i;
export const EDIT_DISABLED = /editing is not enabled for this session/i;
export const ASK_TRANSLATION = /rà soát bản dịch chương 1 · the arrival: tên riêng, từ điển, nghĩa và các câu bị sót|review the translation of chapter 1 · the arrival: proper names, dictionary, meaning and omissions/i;
export const SEVERITY_ERROR = /^(lỗi|error)$/i;
export const SEVERITY_WARNING = /^(cảnh báo|warning)$/i;
export const SEVERITY_INFO = /^(gợi ý|suggestion)$/i;
export const CATEGORY_NAME = /tên riêng không nhất quán|inconsistent proper name/i;
export const CATEGORY_DICT = /lệch từ điển|dictionary mismatch/i;
export const CATEGORY_OMISSION = /thiếu ý so với bản gốc|missing content/i;
export const CATEGORY_STYLE = /văn phong|style/i;
export const STATUS_APPLIED = /đã áp dụng|applied/i;
export const STATUS_REJECTED = /đã bỏ qua|dismissed/i;
export const REVIEW_FINISHED = /đã xử lý hết đề xuất|all proposals handled/i;
export const PROPOSAL_STALE = /không còn áp dụng được|no longer apply/i;

export function novelMeta(chapters: number, translated: number, analyzed: number): RegExp {
  return new RegExp(`^${chapters} (chương|chapters) · ${translated} (đã dịch|translated) · ${analyzed} (đã phân tích|analyzed)$`, "i");
}

export function chaptersShort(count: number): RegExp {
  return new RegExp(`^${count} (chương|chapters)$`, "i");
}

export function messageCount(count: number): RegExp {
  return new RegExp(`^(${count} tin nhắn|Messages: ${count})$`, "i");
}

export function deleteMeta(scope: string, count: number): RegExp {
  return new RegExp(`${scope} · (${count} tin nhắn|Messages: ${count})`, "i");
}

export function activitiesText(count: number): RegExp {
  return new RegExp(`(${count} thao tác đã chạy|Tool calls: ${count})`, "i");
}

export function reviewMeta(checked: number, findings: number, target: string): RegExp {
  return new RegExp(`(${checked} đoạn đã kiểm · ${findings} vấn đề · bản dịch ${target}|${checked} passages checked · ${findings} findings · ${target} translation)`, "i");
}

export function progressText(done: number, total: number): RegExp {
  return new RegExp(`(${done}/${total} đã xử lý|${done}/${total} handled)`, "i");
}

export function appliedToast(count: number): RegExp {
  return new RegExp(`(đã áp dụng ${count} đề xuất|proposals applied: ${count})`, "i");
}

export function rejectedToast(count: number): RegExp {
  return new RegExp(`(đã bỏ qua ${count} đề xuất|proposals dismissed: ${count})`, "i");
}

export function changesMeta(changes: number, edits: number): RegExp {
  return new RegExp(`(${changes} thay đổi · ${edits} thao tác KnowledgeEdit|${changes} changes · ${edits} KnowledgeEdit operations)`, "i");
}

export function validText(resolves: number): RegExp {
  return new RegExp(`(hợp lệ với ontology · giải quyết ${resolves} xung đột|valid against the ontology · resolves ${resolves} conflicts)`, "i");
}

export function invalidText(count: number): RegExp {
  return new RegExp(`(sẽ tạo ${count} xung đột mới|would introduce ${count} new conflicts)`, "i");
}

export function askKnowledge(count: number): RegExp {
  return new RegExp(`(đề xuất cách sửa ${count} xung đột|suggest fixes for the ${count} conflicts)`, "i");
}

export const OP_LABELS: Readonly<Record<string, RegExp>> = {
  merge: /^(gộp|merge)$/i,
  rename: /^(đổi tên|rename)$/i,
  retype: /^(đổi loại|retype)$/i,
  add_entity: /^(thêm thực thể|add entity)$/i,
  add_fact: /^(thêm fact|add fact)$/i,
  fact: /^(sửa fact|edit fact)$/i,
  del: /^(xoá|xóa|delete)$/i,
  props: /^(thuộc tính|properties)$/i,
  evidence: /^(bằng chứng|evidence)$/i,
};

export type SessionAge = "today" | "yesterday" | "week" | "older";

export interface SeedSession {
  readonly title: string;
  readonly age: SessionAge;
  readonly novel?: string;
  readonly messages: readonly (readonly ["user" | "assistant", string])[];
}

export interface OpenedAssistant {
  readonly folder: string;
  readonly seeded: SeededKnowledgeWorkspace;
  readonly novelIds: Readonly<Record<string, number>>;
}

export interface AssistantOpenOptions {
  readonly sessions?: readonly SeedSession[];
  readonly historyBroken?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const AGE_DAYS: Readonly<Record<SessionAge, number>> = { today: 0, yesterday: 1, week: 3, older: 20 };

function flagged(count: number, translated: number, analyzed: number): SeedChapter[] {
  return sampleChapters(count).map((chapter, index) => ({ ...chapter, translated: index < translated, analyzed: index < analyzed }));
}

export function scopeSeed(): KnowledgeWorkspaceSeed {
  return {
    novels: [
      sampleNovel({ title: AZURE, chapters: flagged(3, 2, 1) }),
      sampleNovel({ title: HARBOR, chapters: flagged(2, 0, 0) }),
      sampleNovel({ title: EMBER, chapters: flagged(1, 1, 1) }),
    ],
  };
}

export const SCOPE_META: Readonly<Record<string, RegExp>> = {
  [AZURE]: novelMeta(3, 2, 1),
  [HARBOR]: novelMeta(2, 0, 0),
  [EMBER]: novelMeta(1, 1, 1),
};

export const SCOPE_CHAPTERS_OF: Readonly<Record<string, number>> = { [AZURE]: 3, [HARBOR]: 2, [EMBER]: 1 };

export const DICTIONARY_ENTRY = { src: "Lin Feng", dst: "Lâm Phong", type: "name" } as const;

export function qaSeed(): KnowledgeWorkspaceSeed {
  const translations: TranslationWorkspaceSeed["translations"] = [{ novel: SAMPLE_TITLE, target: "VI", dictionary: [DICTIONARY_ENTRY], chapters: [{ chapter: 1 }] }];
  return {
    novels: [sampleNovel({ title: SAMPLE_TITLE, chapters: flagged(3, 1, 1) })],
    translations,
    knowledge: [{ novel: SAMPLE_TITLE, analyses: CLEAN_ANALYSES }],
  };
}

export function sessionsSeed(): readonly SeedSession[] {
  return [
    { title: "Today workspace chat", age: "today", messages: [["user", "Today workspace chat"], ["assistant", "The workspace has three novels."]] },
    {
      title: "Yesterday azure chat",
      age: "yesterday",
      novel: AZURE,
      messages: [["user", "Yesterday azure chat"], ["assistant", "Azure Chronicle has three chapters."], ["user", "Who leads the sect?"], ["assistant", "Master Chen leads the Sky Sword Sect."]],
    },
    { title: "Week harbor notes", age: "week", novel: HARBOR, messages: [["user", "Week harbor notes"], ["assistant", "Harbor Lights has two chapters."]] },
    {
      title: "Older ember plan",
      age: "older",
      novel: EMBER,
      messages: [
        ["user", "Older ember plan"],
        ["assistant", "Ember Vale has one chapter."],
        ["user", "Is it translated?"],
        ["assistant", "Yes, it is translated."],
        ["user", "Is it analyzed?"],
        ["assistant", "Yes, it is analyzed."],
      ],
    },
  ];
}

export async function seedSessions(folder: string, sessions: readonly SeedSession[]): Promise<void> {
  const rows: { session: SeedSession; novelId: number | null }[] = [];
  for (const session of sessions) {
    const novelId = session.novel === undefined ? null : await readWorkspace(folder, (db) => db.novelId(session.novel ?? ""));
    rows.push({ session, novelId });
  }
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    database.exec("BEGIN");
    const insertSession = database.prepare(
      "INSERT INTO ws_assistant_sessions (id, title, scope_kind, novel_id, provider, cli_session, message_count, preview, created_at, updated_at, edit_granted) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0)",
    );
    const insertMessage = database.prepare(
      "INSERT INTO ws_assistant_messages (id, session_id, seq, role, text, activities, citations, attachments, created_at) VALUES (?, ?, ?, ?, ?, '[]', '[]', '[]', ?)",
    );
    for (const [index, row] of rows.entries()) {
      const base = Date.now() - AGE_DAYS[row.session.age] * DAY_MS - index * 1000;
      const id = randomUUID();
      const last = row.session.messages.filter((message) => message[0] === "assistant").pop();
      insertSession.run(id, row.session.title, row.novelId === null ? "workspace" : "novel", row.novelId, row.session.messages.length, last?.[1] ?? "", new Date(base).toISOString(), new Date(base).toISOString());
      for (const [position, message] of row.session.messages.entries()) {
        insertMessage.run(randomUUID(), id, position + 1, message[0], message[1], new Date(base + position * 100).toISOString());
      }
    }
    database.exec("COMMIT");
  } finally {
    database.close();
  }
}

export function breakHistory(folder: string): void {
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    database.exec("ALTER TABLE ws_assistant_sessions RENAME TO ws_assistant_sessions_off");
  } finally {
    database.close();
  }
}

export function restoreHistory(folder: string): void {
  const database = new DatabaseSync(join(folder, WORKSPACE_DB_FILE));
  try {
    database.exec("ALTER TABLE ws_assistant_sessions_off RENAME TO ws_assistant_sessions");
  } finally {
    database.close();
  }
}

export async function openAssistant(ui: Ui, picker: PickerStub, sandbox: Sandbox, seed: KnowledgeWorkspaceSeed, options: AssistantOpenOptions = {}): Promise<OpenedAssistant> {
  const folder = sandbox.workspace(ASSISTANT_WORKSPACE_NAME);
  const seeded = await seedKnowledgeWorkspace(folder, seed);
  await seedSessions(folder, options.sessions ?? []);
  if (options.historyBroken) {
    breakHistory(folder);
  }
  await openFromSplash(ui, picker, folder);
  const novelIds: Record<string, number> = {};
  for (const [title, place] of Object.entries(seeded.novels)) {
    novelIds[title] = place.id;
  }
  return { folder, seeded, novelIds };
}

export async function showAssistant(ui: Ui): Promise<void> {
  if (!(await ui.main.assistant.root.isVisible())) {
    await ui.main.assistant.rail.click();
  }
  await expect(ui.main.assistant.root).toBeVisible();
}

export async function revealNovels(ui: Ui): Promise<void> {
  if (!(await ui.main.explorer.management.isVisible())) {
    await ui.main.showNovels();
  }
  await expect(ui.main.explorer.management).toBeVisible();
}

export async function chooseScope(ui: Ui, novel: string): Promise<void> {
  const start = ui.main.assistant.start;
  await start.scopeToggle.click();
  await expect(start.scopePanel).toBeVisible();
  await start.novelOption(novel).click();
  await expect(start.scopeCurrent).toHaveText(novel);
}

export async function sendMessage(ui: Ui, text: string): Promise<void> {
  const composer = ui.main.assistant.composer;
  await composer.field.fill(text);
  await composer.field.press("Enter");
}

export async function expectReplies(ui: Ui, count: number): Promise<void> {
  await expect(ui.main.assistant.chat.replies).toHaveCount(count);
  await expect(ui.main.assistant.chat.pending).toBeHidden();
}

export async function startChat(ui: Ui, novel: string, text: string): Promise<void> {
  await showAssistant(ui);
  await chooseScope(ui, novel);
  await sendMessage(ui, text);
  await expectReplies(ui, 1);
}

export function behaviorOf(...replies: ProviderAssistantReply[]): ProviderBehavior {
  return { assistant: { replies } };
}

export const REVIEW_TARGET = "VI";

export const REVIEW_FINDINGS = [
  { n: 1, severity: "error", category: "name", from: "Lam Phong", to: "Lâm Phong", reason: "Tên nhân vật phải theo từ điển." },
  { n: 2, severity: "warning", category: "dict", from: "Truong lao Tran", to: "Trưởng lão Trần", reason: "Danh xưng chưa đúng chính tả." },
  { n: 3, severity: "info", category: "style", from: "di vat", to: "di vật", reason: "Nên viết đủ dấu." },
  { n: 4, severity: "warning", category: "omission", from: "lam nghe ren", to: "lam nghe ren tu nho", reason: "Bản dịch bỏ sót ý tuổi thơ." },
] as const;

export const REVIEW_DICTIONARY = [
  { src: "Sky Sword Sect", dst: "Thien Kiem Mon", type: "org", note: "tên tông môn" },
  { src: "Frost Blade", dst: "Bang Kiem", type: "term" },
] as const;

export const LATE_FINDING = { n: 1, severity: "warning", category: "style", from: "binh minh", to: "bình minh", reason: "Nên viết đủ dấu." } as const;

export function reviewReply(novelId: number, findings: readonly object[], dictionary: readonly object[]): ProviderAssistantReply {
  return {
    skill: "review_translation",
    tools: [
      { name: "read_translation_guide", arguments: { novelId, target: REVIEW_TARGET } },
      { name: "read_translation", arguments: { novelId, target: REVIEW_TARGET, chapter: 1 } },
      { name: "submit_translation_review", arguments: { novelId, target: REVIEW_TARGET, chapter: 1, checked: 4, findings, dictionary } },
    ],
    text: "Đã rà soát: {{2.accepted.findings}} vấn đề và {{2.accepted.dictionary}} mục từ.",
  };
}

const CONFLICT_EVIDENCE = { chapter: 1, p: 1, quote: "Lin Feng arrived at the gates of Azure City at dawn." } as const;

export const CONFLICT_ANALYSES: readonly SeedAnalysis[] = [
  {
    chapter: 1,
    personas: [{ name: "Lin Feng" }, { name: "Master Chen" }],
    entities: [
      { type: "organization", name: "Sky Sword Sect" },
      { type: "artifact", name: "Frost Blade" },
      { type: "location", name: "Azure City", ev: [] },
    ],
    facts: [
      { pred: "owns", subject: "character:Lin Feng", object: "Frost Blade", p: 3 },
      { pred: "leader_of", subject: "Master Chen", object: "Sky Sword Sect" },
      { pred: "leader_of", subject: "Lin Feng", object: "Sky Sword Sect", p: 3, quote: "Lin Feng carried the Frost Blade, a relic left by his late father." },
    ],
  },
  { chapter: 2, personas: [{ name: "Feng", character: "Lin Feng" }, { name: "Su Yan" }], entities: [{ type: "term", name: "courtyard" }] },
  {
    chapter: 3,
    personas: [{ name: "Lin Feng" }, { name: "Master Chen" }, { name: "Su Yan" }],
    entities: [{ type: "term", name: "banner" }],
    facts: [{ pred: "ally_of", subject: "Lin Feng", object: "Master Chen", p: 2 }],
  },
];

export function conflictSeed(): KnowledgeWorkspaceSeed {
  return { novels: [sampleNovel()], knowledge: [{ novel: SAMPLE_TITLE, analyses: CONFLICT_ANALYSES }] };
}

export interface PlannedChange {
  readonly op: string;
  readonly target: string;
  readonly before: string | null;
  readonly after: string | null;
  readonly edit: Readonly<Record<string, unknown>>;
}

export interface KnowledgeIds {
  readonly entityIds: Readonly<Record<string, string>>;
  readonly factIds: Readonly<Record<string, string>>;
}

export function validChanges(ids: KnowledgeIds): PlannedChange[] {
  const entity = ids.entityIds;
  const fact = ids.factIds;
  return [
    { op: "merge", target: "Feng → Lin Feng", before: "Feng, Lin Feng", after: "Lin Feng", edit: { k: "merge", sources: [entity["persona:Feng"]], target: entity["persona:Lin Feng"] } },
    { op: "rename", target: "banner", before: "banner", after: "sect banner", edit: { k: "rename", id: entity["term:banner"], name: "sect banner" } },
    { op: "retype", target: "courtyard", before: "term", after: "location", edit: { k: "retype", id: entity["term:courtyard"], type: "location" } },
    { op: "props", target: "Su Yan", before: "aliases: (none)", after: "aliases: White Lotus", edit: { k: "props", id: entity["persona:Su Yan"], aliases: ["White Lotus"] } },
    {
      op: "evidence",
      target: "Azure City",
      before: "no evidence",
      after: "Ch.1 ¶1",
      edit: { k: "evidence", id: entity["location:Azure City"], add: [{ chapter: 1, p: 1, q: CONFLICT_EVIDENCE.quote }] },
    },
    {
      op: "add_entity",
      target: "duel",
      before: null,
      after: "event: duel",
      edit: { k: "add_entity", ref: "e1", type: "event", name: "duel", ev: [{ chapter: 3, p: 1, q: "Su Yan, also known as the White Lotus, joined the duel at noon." }] },
    },
    {
      op: "add_fact",
      target: "participates_in",
      before: null,
      after: "Su Yan → duel",
      edit: { k: "add_fact", ref: "f1", pred: "participates_in", subject: entity["persona:Su Yan"], object: "e1", ev: [{ chapter: 3, p: 1, q: "Su Yan, also known as the White Lotus, joined the duel at noon." }] },
    },
    { op: "fact", target: "Lin Feng → Master Chen", before: "ally_of", after: "enemy_of", edit: { k: "fact", id: fact["ally_of:Lin Feng>Master Chen"], pred: "enemy_of" } },
    { op: "del", target: "owns", before: "character Lin Feng owns Frost Blade", after: null, edit: { k: "del", id: fact["owns:Lin Feng>Frost Blade"] } },
  ];
}

export function unsafeChanges(ids: KnowledgeIds): PlannedChange[] {
  return [
    {
      op: "fact",
      target: "Lin Feng → Sky Sword Sect",
      before: "leader_of Sky Sword Sect",
      after: "leader_of Frost Blade",
      edit: { k: "fact", id: ids.factIds["leader_of:Lin Feng>Sky Sword Sect"], object: ids.entityIds["artifact:Frost Blade"] },
    },
  ];
}

export function knowledgeReply(novelId: number, title: string, changes: readonly PlannedChange[]): ProviderAssistantReply {
  const items = changes.map((change) => ({
    target: change.target,
    before: change.before,
    after: change.after,
    reason: `Sửa ${change.target}.`,
    ev: [CONFLICT_EVIDENCE],
    edit: change.edit,
  }));
  return {
    skill: "review_knowledgebase",
    tools: [
      { name: "read_knowledge_issues", arguments: { novelId, lang: "src" } },
      { name: "submit_knowledge_changes", arguments: { novelId, lang: "src", title, changes: items } },
    ],
    text: "Đề xuất sẽ giải quyết {{1.validation.resolves}} xung đột.",
  };
}
