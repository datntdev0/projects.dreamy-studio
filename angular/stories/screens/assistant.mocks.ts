import type { Decorator } from "@storybook/angular-vite";
import { AssistantAttachment, AssistantContext, AssistantMessage, AssistantScope, AssistantSession, AssistantSessionSummary, ProposalDecision } from "@app/features/assistant/assistant.models";
import { NovelSummary } from "@app/features/novel/novel.models";
import { knowledgeChanges, translationReview } from "./assistant.fixtures";
import { knowledgeScreenHandlers } from "./novel-knowledge.mocks";
import { LANTERN_VI_TITLES } from "./novel-translation.fixtures";
import { NOVEL_ID } from "./novel-translation.mocks";
import { IpcHandlers, withScreen } from "./screen.mocks";

export const SECOND_NOVEL_ID = 2;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REPLY_DELAY_MS = 900;

export interface AssistantScenario {
  sessions?: boolean;
  failSend?: boolean;
  resolveConflict?: boolean;
  replyDelayMs?: number;
  novels?: number;
}

interface MockState {
  scenario: AssistantScenario;
  sessions: AssistantSession[];
  nextSession: number;
  nextMessage: number;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  activities?: string[];
  citations?: AssistantMessage["citations"];
  attachments?: AssistantAttachment[];
}

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function novelScope(novelId: number): AssistantScope {
  return { kind: "novel", novelId };
}

function message(id: string, turn: Turn, createdAt: string): AssistantMessage {
  return { id, role: turn.role, text: turn.text, createdAt, activities: turn.activities ?? [], citations: turn.citations ?? [], attachments: structuredClone(turn.attachments ?? []) };
}

function session(id: string, title: string, scope: AssistantScope, updatedMs: number, turns: Turn[]): AssistantSession {
  const updatedAt = ago(updatedMs);
  const step = 2 * 60 * 1000;
  const messages = turns.map((turn, index) => message(`${id}-m${index + 1}`, turn, ago(updatedMs + (turns.length - 1 - index) * step)));
  const last = turns[turns.length - 1];
  return { id, title, scope, createdAt: messages[0]?.createdAt ?? updatedAt, updatedAt, messageCount: messages.length, preview: last ? last.text.split("\n")[0] : "", editGranted: false, messages };
}

const NAMES_TURNS: Turn[] = [
  { role: "user", text: "Rà soát giúp tôi cách dịch tên riêng trong 2 chương đã dịch đã nhất quán chưa?" },
  {
    role: "assistant",
    text: "Mình đã đối chiếu 14 tên riêng trong KB với bản dịch chương 1–2. Có 2 tên chưa nhất quán:\n\n- “Harrowmere”: 9 lần giữ nguyên, 2 lần dịch thành “Cảng Sương”.\n- “守灯人”: 6 lần “người giữ đèn”, 1 lần “người canh đèn”.\n\nĐề xuất thêm vào từ điển: Harrowmere → Harrowmere (place), 守灯人 → người giữ đèn (title). Bạn có muốn mình thêm và sửa lại 3 đoạn bị lệch không?",
    activities: ["kb_search(type=persona|location) → 14 entity", "name_renderings(14 tên) → 2 chương", "dictionary_list → 8 mục"],
    citations: [{ novelId: NOVEL_ID, chapter: 1, p: 4, quote: "Sương mù trên Cảng Sương dày đến mức…" }, { novelId: NOVEL_ID, chapter: 2, p: 11, quote: "Người canh đèn không trả lời." }],
  },
  { role: "user", text: "Thêm vào từ điển giúp tôi." },
  {
    role: "assistant",
    text: "Đã tạo đề xuất gồm 2 mục từ điển và 3 đoạn dịch cần sửa. Bạn xem lại trong thẻ thay đổi và bấm Áp dụng để ghi vào novel.",
    activities: ["propose_dict(add × 2)", "propose_passage(ch1 ¶4, ch1 ¶9, ch2 ¶11)"],
  },
];

const RELATION_TURNS: Turn[] = [
  { role: "user", text: "Mối quan hệ giữa Wren và Maro Quill là gì?" },
  {
    role: "assistant",
    text: "Theo knowledgebase (đến chương 3), Wren là người giữ đèn cuối cùng của Harrowmere, còn Maro Quill là thư lại được Hội đồng phái đến để kiểm kê.\n\nHọ chưa có quan hệ đồng minh được văn bản xác nhận. Ban đầu Maro đến với tư cách người đánh giá, nhưng ở chương 3 Wren đưa Maro lên Tháp Đèn. Đây là dấu hiệu tin tưởng (suy luận, chưa có fact ally_of).",
    activities: ["kb_entity(Wren · người giữ đèn)", "kb_facts(subject=Wren, object=Maro)", "read_paragraphs(ch3 ¶2–¶8)"],
    citations: [{ novelId: NOVEL_ID, chapter: 2, p: 3, quote: "Tôi được cử đến để đếm những gì còn lại." }, { novelId: NOVEL_ID, chapter: 3, p: 6, quote: "Wren dẫn anh lên bậc thang xoắn của Tháp Đèn." }],
  },
];

const REALM_TURNS: Turn[] = [
  { role: "user", text: "Tách giúp tôi các term về chuông và thủy triều thành nhóm riêng." },
  { role: "assistant", text: "Mình tìm thấy 5 term liên quan. Trước khi đề xuất gộp, bạn muốn giữ “Chuông triều” là term riêng hay gộp vào “Chiếc chuông không được rung”?", activities: ["kb_search(type=term) → 5 term"] },
];

function reviewTurn(chapter: number): Turn {
  const title = LANTERN_VI_TITLES[chapter - 1] ?? "";
  return {
    role: "assistant",
    text: `Mình đã rà soát 18 đoạn của chương ${chapter}, đối chiếu với từ điển, hướng dẫn dịch và tên riêng trong knowledgebase.

Có 1 lỗi tên riêng, 2 cảnh báo (lệch từ điển, thiếu ý) và 1 gợi ý văn phong. Ngoài ra nên thêm 2 mục vào từ điển để các chương sau dịch nhất quán. Bạn có thể áp dụng từng đề xuất hoặc tất cả cùng lúc.`,
    activities: [`read_paragraphs(ch${chapter}, side=both) → 18 đoạn`, "translation_warnings(ch" + chapter + ") → 1 cảnh báo Dict", "name_renderings(kb personas, locations) → 14 tên", "dictionary_list → 8 mục", "propose_passage × 4", "propose_dict(add × 2)"],
    attachments: [translationReview(chapter, title)],
  };
}

function knowledgeTurn(count: number): Turn {
  const rest = Math.max(count - 3, 0);
  const tail = rest > 0 ? `

${rest} xung đột còn lại (Evidence, Source changed) cần phân tích lại chương 2 nên mình không đưa vào bộ thay đổi này.` : "";
  return {
    role: "assistant",
    text: `Mình đã đọc ${count} xung đột trong tab Xem xét cùng các đoạn dẫn chứng. 3 xung đột sửa được ngay mà không cần phân tích lại:

- Hai persona “Wren · người giữ đèn” và “Người giữ đèn” là cùng một nhân dạng, nên gộp lại.
- Fact resides_at đang gắn vào character Wren thay vì persona.
- “Kiểm kê” bị xếp nhầm loại term, đúng ra là event.${tail}

Bộ thay đổi dưới đây đã chạy thử với ontology và không tạo xung đột mới.`,
    activities: [`kb_issues(rule=all) → ${count} xung đột`, "kb_entity × 3", "read_paragraphs(ch1 ¶2–¶5, ch2 ¶3)", "propose_kb(6 edits) → dry-run OK"],
    citations: [{ novelId: NOVEL_ID, chapter: 1, p: 2, quote: "Wren là người giữ đèn cuối cùng của Harrowmere." }],
    attachments: [knowledgeChanges()],
  };
}

const REVIEW_TURNS: Turn[] = [{ role: "user", text: "Rà soát bản dịch chương 2 · Viên thư lại từ bến cảng: tên riêng, từ điển, nghĩa và các câu bị sót." }, reviewTurn(2)];

const KNOWLEDGE_TURNS: Turn[] = [{ role: "user", text: "Đề xuất cách sửa 5 xung đột trong phần phân tích knowledgebase." }, knowledgeTurn(5)];

const WORKSPACE_TURNS: Turn[] = [
  { role: "user", text: "Novel nào còn nhiều chương chưa dịch?" },
  { role: "assistant", text: "Workspace có 2 novel:\n\n- Người giữ đèn Harrowmere: 2/12 chương đã dịch.\n- Thành phố Muối: chưa dịch chương nào.\n\nBạn nên ưu tiên dịch thử 1 chương của Thành phố Muối để xem chi phí ước tính.", activities: ["novel_outline × 2"] },
];

function seedSessions(): AssistantSession[] {
  return [
    session("s-review", "Rà soát bản dịch chương 2", novelScope(NOVEL_ID), 8 * 60 * 1000, REVIEW_TURNS),
    session("s-kb-fix", "Sửa xung đột knowledgebase", novelScope(NOVEL_ID), 15 * 60 * 1000, KNOWLEDGE_TURNS),
    session("s-names", "Rà soát tên riêng chương 1–2", novelScope(NOVEL_ID), 25 * 60 * 1000, NAMES_TURNS),
    session("s-relations", "Quan hệ giữa Wren và Maro", novelScope(NOVEL_ID), 3 * HOUR_MS, RELATION_TURNS),
    session("s-workspace", "Tiến độ dịch toàn workspace", { kind: "workspace", novelId: null }, DAY_MS + 2 * HOUR_MS, WORKSPACE_TURNS),
    session("s-terms", "Tách nhóm term chuông và thủy triều", novelScope(NOVEL_ID), 4 * DAY_MS, REALM_TURNS),
    session("s-salt", "Bối cảnh Thành phố Muối", novelScope(SECOND_NOVEL_ID), 16 * DAY_MS, [{ role: "user", text: "Tóm tắt bối cảnh của Thành phố Muối." }, { role: "assistant", text: "Novel này chưa được phân tích nên mình chỉ có thể đọc trực tiếp nội dung chương. Bạn có muốn mình tóm tắt 3 chương đầu không?" }]),
  ];
}

function summaryOf(value: AssistantSession): AssistantSessionSummary {
  const { messages: _messages, ...summary } = value;
  return summary;
}

function clone(value: AssistantSession): AssistantSession {
  return structuredClone(value);
}

function find(state: MockState, id: string): AssistantSession {
  const found = state.sessions.find((item) => item.id === id);
  if (!found) {
    throw { code: "not_found", detail: `session ${id}` };
  }
  return found;
}

function titleOf(text: string): string {
  const line = text.trim().split("\n")[0];
  return line.length > 48 ? `${line.slice(0, 47)}…` : line;
}

function replyFor(text: string, scope: AssistantScope, context: AssistantContext | null): Turn {
  if (context?.kind === "translation_review") {
    return reviewTurn(Number(context.chapterId.replace("ch-", "")) || 1);
  }
  if (context?.kind === "knowledge_review") {
    return knowledgeTurn(context.issueIds.length);
  }
  const lower = text.toLowerCase();
  if (lower.includes("quan hệ")) {
    return RELATION_TURNS[1];
  }
  if (lower.includes("tên riêng")) {
    return NAMES_TURNS[1];
  }
  if (scope.kind === "workspace") {
    return WORKSPACE_TURNS[1];
  }
  return {
    role: "assistant",
    text: "Mình đã đọc các chương liên quan trong phạm vi novel này.\n\nĐây là câu trả lời mẫu trong Storybook. Khi nối backend, nội dung sẽ được sinh bởi provider đã cấu hình trong Settings > LLM > Assistant.",
    activities: ["novel_outline", "search_text(\"" + titleOf(text).slice(0, 24) + "\")"],
    citations: [{ novelId: NOVEL_ID, chapter: 1, p: 2, quote: "Ngọn đèn cuối cùng vẫn còn cháy." }],
  };
}

function create(state: MockState, args: Record<string, unknown>): AssistantSession {
  const scope = args["scope"] as AssistantScope;
  const now = new Date().toISOString();
  const created: AssistantSession = { id: `s-new-${state.nextSession++}`, title: "", scope: { ...scope }, createdAt: now, updatedAt: now, messageCount: 0, preview: "", editGranted: false, messages: [] };
  state.sessions.unshift(created);
  return clone(created);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function playActivities(args: Record<string, unknown>, activities: string[], total: number): Promise<void> {
  const channel = args["onEvent"] as { emit: (event: { kind: "activity"; label: string }) => void } | undefined;
  const gap = total / (activities.length + 1);
  for (const label of activities) {
    await delay(gap);
    channel?.emit({ kind: "activity", label });
  }
  await delay(gap);
}

async function send(state: MockState, args: Record<string, unknown>): Promise<AssistantSession> {
  const total = state.scenario.replyDelayMs ?? REPLY_DELAY_MS;
  if (state.scenario.failSend) {
    await delay(total);
    throw { code: "task", detail: "Claude Code CLI exited with exit code: 1: not logged in." };
  }
  const target = find(state, String(args["sessionId"]));
  const text = String(args["text"]);
  const reply = replyFor(text, target.scope, (args["context"] as AssistantContext | null | undefined) ?? null);
  await playActivities(args, reply.activities ?? [], total);
  const now = new Date().toISOString();
  target.messages.push(message(`m-${state.nextMessage++}`, { role: "user", text }, now));
  target.messages.push(message(`m-${state.nextMessage++}`, reply, now));
  target.title = target.title || titleOf(text);
  target.updatedAt = now;
  target.messageCount = target.messages.length;
  target.preview = reply.text.split("\n")[0];
  return clone(target);
}

function decideAttachment(attachment: AssistantAttachment, ids: Set<string>, status: ProposalDecision): void {
  if (attachment.kind === "knowledge_changes") {
    if (ids.has(attachment.id) && attachment.status === "pending") {
      attachment.status = status;
    }
    return;
  }
  for (const item of [...attachment.findings, ...attachment.dictionary]) {
    if (ids.has(item.id) && item.status === "pending") {
      item.status = status;
    }
  }
}

async function resolveProposal(state: MockState, args: Record<string, unknown>): Promise<AssistantSession> {
  await delay(250);
  if (state.scenario.resolveConflict) {
    throw { code: "conflict", detail: "f2" };
  }
  const target = find(state, String(args["sessionId"]));
  const owner = target.messages.find((item) => item.id === String(args["messageId"]));
  if (!owner) {
    throw { code: "not_found", detail: `message ${String(args["messageId"])}` };
  }
  const ids = new Set((args["itemIds"] as string[]) ?? []);
  for (const attachment of owner.attachments ?? []) {
    decideAttachment(attachment, ids, args["status"] as ProposalDecision);
  }
  return clone(target);
}

function secondNovel(base: NovelSummary): NovelSummary {
  return { ...base, id: SECOND_NOVEL_ID, title: "盐之城", name: "Thành phố Muối", author: "Corin Vale", description: "Một thành phố xây trên mỏ muối cổ.", updatedAt: ago(30 * DAY_MS), chapterCount: 24, wordCount: 61000, translatedCount: 0, analyzedCount: 0, tags: ["奇幻"] };
}

const EXTRA_NOVELS: { title: string; name: string; author: string }[] = [
  { title: "剑起天南", name: "Kiếm Khởi Thiên Nam", author: "Lục Thanh Vân" },
  { title: "大梦主", name: "Đại Mộng Chủ", author: "Tiểu Phong" },
  { title: "星河彼岸", name: "Bờ Bên Kia Tinh Hà", author: "Mạc Ly" },
  { title: "长夜行", name: "Đêm Dài Lữ Hành", author: "Tạ Văn" },
  { title: "青山剑意", name: "Kiếm Ý Thanh Sơn", author: "Giang Hạc" },
  { title: "龙脉守护者", name: "Người Giữ Long Mạch", author: "Phương Dịch" },
  { title: "雾都侦探", name: "Thám Tử Sương Đô", author: "Hạ Lâm" },
  { title: "我在异界开酒馆", name: "Mở Quán Rượu Ở Dị Giới", author: "Tô Mặc" },
  { title: "寒江雪", name: "Tuyết Trên Hàn Giang", author: "Liễu Yên" },
  { title: "诸神黄昏", name: "Hoàng Hôn Chư Thần", author: "Bạch Khởi" },
  { title: "九州风云录", name: "Phong Vân Cửu Châu", author: "Đoàn Sinh" },
  { title: "机械纪元", name: "Kỷ Nguyên Cơ Giới", author: "Triệu Ngôn" },
  { title: "月下听潮", name: "Nghe Thủy Triều Dưới Trăng", author: "Thẩm Y" },
  { title: "", name: "Ký sự Hải Đăng Phương Bắc", author: "Corin Vale" },
  { title: "北境王座", name: "Vương Tọa Bắc Cảnh", author: "Hàn Lập" },
  { title: "山海异闻", name: "Dị Văn Sơn Hải", author: "Kỷ Nguyên" },
  { title: "Clockwork Orchard", name: "", author: "Ivy Marsh" },
  { title: "烬余之城", name: "Thành Phố Tro Tàn", author: "Úc Ly" },
  { title: "半夏听雨", name: "Bán Hạ Nghe Mưa", author: "Lăng Tố" },
  { title: "天机阁", name: "Thiên Cơ Các", author: "Ôn Dạ" },
  { title: "落日城的信使", name: "Sứ Giả Thành Lạc Nhật", author: "Cố Minh" },
  { title: "万象之书", name: "Vạn Tượng Chi Thư", author: "Phó Chu" },
  { title: "Glass Tide", name: "Thủy Triều Thủy Tinh", author: "Noor Hale" },
  { title: "逆剑狂歌", name: "Nghịch Kiếm Cuồng Ca", author: "Tần Tiêu" },
];

function extraNovel(base: NovelSummary, index: number): NovelSummary {
  const entry = EXTRA_NOVELS[index % EXTRA_NOVELS.length];
  const round = Math.floor(index / EXTRA_NOVELS.length);
  const chapterCount = 8 + ((index * 37) % 1400);
  const translatedCount = Math.min(chapterCount, (index * 11) % 90);
  const analyzedCount = Math.min(chapterCount, (index * 7) % 60);
  return {
    ...base,
    id: SECOND_NOVEL_ID + 1 + index,
    title: entry.title || entry.name,
    name: round === 0 ? entry.name : entry.name ? `${entry.name} ${round + 1}` : "",
    author: entry.author,
    description: "",
    chapterCount,
    wordCount: chapterCount * 2600,
    translatedCount,
    analyzedCount,
    tags: [],
    updatedAt: ago((index + 1) * 19 * HOUR_MS + index * 7 * 60 * 1000),
  };
}

function extraNovels(base: NovelSummary, count: number): NovelSummary[] {
  const rows: NovelSummary[] = [];
  for (let index = 0; index < count; index += 1) {
    rows.push(extraNovel(base, index));
  }
  return rows;
}

function assistantHandlers(scenario: AssistantScenario): IpcHandlers {
  const base = knowledgeScreenHandlers({});
  const state: MockState = { scenario, sessions: scenario.sessions === false ? [] : seedSessions(), nextSession: 1, nextMessage: 1 };
  const listNovels = base["novel_list"];
  return {
    ...base,
    novel_list: (args) => {
      const rows = listNovels(args) as NovelSummary[];
      const first = rows[0];
      if (!first) {
        return rows;
      }
      return [{ ...first, name: "Người giữ đèn Harrowmere", analyzedCount: 3 }, secondNovel(first), ...extraNovels(first, scenario.novels ?? 0)];
    },
    assistant_session_list: () => state.sessions.filter((item) => item.messageCount > 0).map(summaryOf),
    assistant_session_get: (args) => clone(find(state, String(args["id"]))),
    assistant_session_create: (args) => create(state, args),
    assistant_message_send: (args) => send(state, args),
    assistant_proposal_resolve: (args) => resolveProposal(state, args),
    assistant_session_permit: (args) => {
      const target = find(state, String(args["id"]));
      target.editGranted = Boolean(args["editGranted"]);
      return clone(target);
    },
    assistant_session_delete: (args) => {
      state.sessions = state.sessions.filter((item) => item.id !== String(args["id"]));
      return null;
    },
  };
}

export function withAssistant(scenario: AssistantScenario = {}): { decorators: Decorator[] } {
  return withScreen(assistantHandlers(scenario));
}
