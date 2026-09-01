import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const [stateDir, ...args] = process.argv.slice(2);
const PARENT_POLL_MS = 150;
const HANG_LIMIT_MS = 600_000;
const LOCK_STALE_MS = 3000;

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withLock(work) {
  const lock = join(stateDir, 'lock');
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      mkdirSync(lock);
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { recursive: true, force: true });
        }
      } catch {
        continue;
      }
      sleepSync(10);
    }
  }
  try {
    return work();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

function parentAlive() {
  try {
    process.kill(process.ppid, 0);
    return true;
  } catch {
    return false;
  }
}

function logLine(entry) {
  appendFileSync(join(stateDir, 'calls.jsonl'), `${JSON.stringify(entry)}\n`);
}

function finish(index, code, extra) {
  if (index !== null) {
    logLine({ event: 'end', index, exitCode: code, at: new Date().toISOString(), ...extra });
  }
  process.exit(code);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function norm(text) {
  return text.normalize('NFC').split(/\s+/).filter(Boolean).join(' ').toLowerCase();
}

function option(name) {
  const at = args.indexOf(name);
  return at >= 0 ? (args[at + 1] ?? null) : null;
}

function probeKind() {
  if (args[0] === '--version') {
    return 'version';
  }
  if (
    (args[0] === 'auth' && args[1] === 'status') ||
    (args[0] === 'login' && args[1] === 'status')
  ) {
    return 'status';
  }
  if ((args[0] === 'auth' && args[1] === 'login') || (args.length === 1 && args[0] === 'login')) {
    return 'login';
  }
  if ((args[0] === 'auth' && args[1] === 'logout') || (args.length === 1 && args[0] === 'logout')) {
    return 'logout';
  }
  return null;
}

function runAuth(kind) {
  const profile = process.env.CLAUDE_CONFIG_DIR ?? process.env.CODEX_HOME ?? '';
  appendFileSync(
    join(stateDir, 'auth.jsonl'),
    `${JSON.stringify({ action: kind, profile, at: new Date().toISOString() })}\n`,
  );
  if (kind === 'logout') {
    writeFileSync(join(stateDir, 'auth.json'), JSON.stringify({ signedIn: false }));
    process.exit(0);
  }
  const release = join(stateDir, 'login.release');
  const timer = setInterval(() => {
    if (existsSync(release)) {
      clearInterval(timer);
      rmSync(release, { force: true });
      writeFileSync(join(stateDir, 'auth.json'), JSON.stringify({ signedIn: true }));
      process.exit(0);
    }
    if (!parentAlive()) {
      process.exit(1);
    }
  }, PARENT_POLL_MS);
}

function runProbe(kind, behavior) {
  if (kind === 'login' || kind === 'logout') {
    runAuth(kind);
    return;
  }
  const probe = behavior.probe ?? 'ok';
  const auth = readJson(join(stateDir, 'auth.json'), null);
  const signedOut = auth === null ? probe === 'signed-out' : auth.signedIn === false;
  const codex = args[0] === 'login';
  const index = withLock(() => {
    logLine({ event: 'start', kind: 'probe', probe: kind, args, at: new Date().toISOString() });
    return null;
  });
  if (kind === 'version') {
    if (probe === 'broken') {
      process.stderr.write('stub provider is broken', () => finish(index, 1, {}));
      return;
    }
    process.stdout.write('9.9.9 (Stub CLI)\n', () => finish(index, 0, {}));
    return;
  }
  if (signedOut) {
    process.stderr.write('not signed in', () => finish(index, 1, {}));
    return;
  }
  const text = codex
    ? 'Logged in using a stub account\n'
    : `${JSON.stringify({ email: 'stub@dreamy.test' })}\n`;
  process.stdout.write(text, () => finish(index, 0, {}));
}

function sessionPath(id) {
  return join(stateDir, 'sessions', `${id}.json`);
}

function sessionOf() {
  const resumeIndex = args.indexOf('resume');
  if (resumeIndex >= 0) {
    const tail = args.filter(
      (value, at) => at > resumeIndex && value !== '-' && !value.startsWith('-'),
    );
    return { id: tail[tail.length - 1] ?? null, resume: true };
  }
  const resumeFlag = option('--resume');
  if (resumeFlag !== null) {
    return { id: resumeFlag, resume: true };
  }
  return { id: option('--session-id'), resume: false };
}

function purposeOf(prompt) {
  if (
    args.includes('--mcp-config') ||
    args.some((value) => value.startsWith('mcp_servers.dreamy'))
  ) {
    return 'assistant';
  }
  if (prompt.startsWith('You are a professional literary translator')) {
    return 'translation';
  }
  if (prompt.includes('extract the facts it states')) {
    return 'facts';
  }
  if (prompt.includes('list the named entities they mention')) {
    return 'candidates';
  }
  return 'unknown';
}

function parseAssistant(prompt) {
  const marker = '\n## Question\n';
  const at = prompt.lastIndexOf(marker);
  let question = prompt.split('\n\n(If you cite')[0].trim();
  if (at >= 0) {
    const tail = prompt.slice(at + marker.length);
    const end = tail.indexOf('\n## Skill:');
    question = (end < 0 ? tail : tail.slice(0, end)).trim();
  }
  const skill = /## Skill: (\w+)/.exec(prompt);
  return { question, skill: skill ? skill[1] : null };
}

function assistantEndpoint() {
  const file = option('--mcp-config');
  const config = file === null ? {} : readJson(file, {});
  return config.mcpServers?.dreamy?.url ?? null;
}

function toolValue(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callTool(call, index, position) {
  const url = assistantEndpoint();
  const token = process.env.DREAMY_MCP_TOKEN ?? '';
  const body = {
    jsonrpc: '2.0',
    id: position + 1,
    method: 'tools/call',
    params: { name: call.name, arguments: call.arguments ?? {} },
  };
  let outcome = { isError: true, text: 'the assistant endpoint is not configured' };
  if (url !== null) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      outcome = {
        isError: payload.result?.isError ?? true,
        text: payload.result?.content?.[0]?.text ?? payload.error?.message ?? '',
      };
    } catch (error) {
      outcome = { isError: true, text: String(error) };
    }
  }
  appendFileSync(
    join(stateDir, 'tools.jsonl'),
    `${JSON.stringify({ index, name: call.name, arguments: call.arguments ?? {}, isError: outcome.isError, text: outcome.text })}\n`,
  );
  return toolValue(outcome.text);
}

function lookup(value, path) {
  let current = value;
  for (const key of path.split('.')) {
    if (current === undefined || current === null) {
      return '';
    }
    current = key === 'length' && Array.isArray(current) ? current.length : current[key];
  }
  if (current === undefined || current === null) {
    return '';
  }
  return typeof current === 'object' ? JSON.stringify(current) : String(current);
}

function fillText(template, results) {
  return template.replace(/\{\{(\d+)\.([^}]+)\}\}/g, (_, at, path) =>
    lookup(results[Number(at)], path),
  );
}

function replyMatches(item, parsed) {
  const asked = item.ask === undefined || norm(parsed.question).includes(norm(item.ask));
  return asked && (item.skill === undefined || item.skill === parsed.skill);
}

async function assistantReply(parsed, behavior, index) {
  const replies = behavior.assistant?.replies ?? [];
  const found = replies.find((item) => replyMatches(item, parsed)) ?? {};
  const results = [];
  for (const [position, call] of (found.tools ?? []).entries()) {
    results.push(await callTool(call, index, position));
  }
  return { text: fillText(found.text ?? 'Stub assistant reply.', results), delayMs: found.delayMs };
}

function between(text, start, end) {
  const from = text.indexOf(start);
  if (from < 0) {
    return '';
  }
  const rest = text.slice(from + start.length);
  const to = rest.indexOf(end);
  return to < 0 ? rest : rest.slice(0, to);
}

function parseTranslation(prompt) {
  const json = between(prompt, 'The source is this JSON:\n', '\n\nReply with only one JSON object');
  let source = { paragraphs: [] };
  try {
    source = JSON.parse(json);
  } catch {
    source = { paragraphs: [] };
  }
  const english = prompt.includes('into English');
  const dict = [];
  const section = between(
    prompt,
    'Dictionary. Always translate these terms exactly as given:\n',
    '\nThe source is this JSON',
  );
  for (const line of section.split('\n')) {
    const match = /^- (.+?) => (.+?) \((\w+)\)(?:: .*)?$/.exec(line);
    if (match) {
      dict.push({ src: match[1], dst: match[2], kind: match[3] });
    }
  }
  return {
    paragraphs: source.paragraphs ?? [],
    title: typeof source.title === 'string' ? source.title : null,
    tag: english ? 'EN' : 'VI',
    dict,
  };
}

function parseCandidates(prompt) {
  const body = between(
    prompt,
    '\nLanguage of the text:',
    '\nReply with only one JSON object shaped like {"entities"',
  );
  const chapters = [];
  const parts = body.split(/\n## Chapter (\d+): /);
  for (let at = 1; at < parts.length; at += 2) {
    const [title, ...rest] = parts[at + 1].split('\n');
    chapters.push({
      seq: Number(parts[at]),
      title,
      paragraphs: rest
        .join('\n')
        .split('\n\n')
        .map((text) => text.trim())
        .filter(Boolean),
    });
  }
  return { chapters };
}

function parseFacts(prompt) {
  const title = between(prompt, '\nChapter title: ', '\n').trim();
  const body = between(
    prompt,
    '\nParagraphs:\n',
    '\nReply with only one JSON object shaped like {"facts"',
  );
  const paragraphs = [];
  for (const line of body.split('\n')) {
    const match = /^\[(\d+)\] (.*)$/.exec(line);
    if (match) {
      paragraphs.push(match[2]);
    }
  }
  const entities = [];
  for (const line of prompt.split('\n')) {
    const match = /^- (E\d+) \| ([a-z_]+) \| ([^|]+?)(?: \|.*)?$/.exec(line);
    if (match) {
      entities.push({ id: match[1], type: match[2], name: match[3].trim() });
    }
  }
  return { title, paragraphs, entities };
}

function cleanWord(word) {
  return word.replace(/[^\p{L}\p{N}'-]/gu, '');
}

function isCapital(word) {
  const clean = cleanWord(word);
  return /^\p{Lu}[\p{L}'-]+$/u.test(clean) && clean.length > 2;
}

function sentenceNames(sentence) {
  const words = sentence.split(/\s+/).filter(Boolean);
  const names = [];
  let run = [];
  let start = 0;
  for (let at = 0; at <= words.length; at += 1) {
    const word = words[at];
    if (word !== undefined && isCapital(word)) {
      if (run.length === 0) {
        start = at;
      }
      run.push(cleanWord(word));
    }
    if (word === undefined || !isCapital(word) || /[,;:.!?]$/.test(word)) {
      if (run.length > 1 || (run.length === 1 && start > 0)) {
        names.push(run.join(' '));
      }
      run = [];
    }
  }
  return names;
}

function capitalizedNames(paragraphs) {
  const names = [];
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) {
      names.push(...sentenceNames(sentence));
    }
  }
  return [...new Set(names)];
}

function mentions(paragraphs, name) {
  const needle = norm(name);
  return needle !== '' && paragraphs.some((paragraph) => norm(paragraph).includes(needle));
}

function applyDictionary(text, dict) {
  let out = text;
  for (const entry of dict) {
    out = out.replace(
      new RegExp(entry.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
      entry.dst,
    );
  }
  return out;
}

function translationReply(parsed, mode, behavior) {
  const settings = behavior.translation ?? {};
  const tag = settings.tag === false ? '' : `[${parsed.tag}] `;
  const dict = settings.dictionary === false ? [] : parsed.dict;
  let paragraphs = parsed.paragraphs.map((text) => `${tag}${applyDictionary(text, dict)}`);
  if (mode === 'wrong-count') {
    paragraphs =
      paragraphs.length > 1 ? paragraphs.slice(0, -1) : [...paragraphs, `${tag}extra paragraph`];
  }
  const reply =
    parsed.title === null
      ? { paragraphs }
      : { title: `${tag}${applyDictionary(parsed.title, dict)}`, paragraphs };
  return JSON.stringify(reply);
}

function configuredEntities(behavior, paragraphs) {
  const analysis = behavior.analysis ?? {};
  if (Array.isArray(analysis.entities)) {
    return analysis.entities;
  }
  return capitalizedNames(paragraphs).map((name) => ({ type: 'persona', name }));
}

function candidatesReply(parsed, mode, behavior) {
  const analysis = behavior.analysis ?? {};
  const paragraphs = parsed.chapters.flatMap((chapter) => chapter.paragraphs);
  const present = configuredEntities(behavior, paragraphs).filter((entity) => {
    const names = [entity.name, ...(entity.aliases ?? [])];
    return entity.type !== 'character' && names.some((name) => mentions(paragraphs, name));
  });
  if (mode === 'bad-entity') {
    present.push({ type: 'persona', name: 'Ghost Of Nowhere' });
  }
  const links = analysis.links ?? [];
  const entities = present.map((entity) => ({
    type: entity.type,
    name: entity.name,
    titles: entity.titles ?? [],
    aliases: entity.aliases ?? [],
  }));
  const facts = [];
  const characters = new Set();
  for (const entity of present.filter((item) => item.type === 'persona')) {
    const link = links.find((item) => norm(item.persona) === norm(entity.name));
    const character = link?.character ?? entity.name;
    characters.add(character);
    facts.push({ pred: 'persona_of', subject: entity.name, object: character });
  }
  for (const character of characters) {
    entities.push({ type: 'character', name: character, titles: [], aliases: [] });
  }
  return JSON.stringify({ entities, facts: mode === 'no-link' ? [] : facts });
}

function factsReply(parsed, mode, behavior) {
  const analysis = behavior.analysis ?? {};
  const byName = new Map(parsed.entities.map((entity) => [norm(entity.name), entity.id]));
  const out = [];
  for (const fact of analysis.facts ?? []) {
    const subject = byName.get(norm(fact.subject));
    const object = fact.object === undefined ? undefined : byName.get(norm(fact.object));
    if (subject === undefined || (fact.object !== undefined && object === undefined)) {
      continue;
    }
    const needle = fact.quote ?? fact.subject;
    let at = parsed.paragraphs.findIndex((paragraph) => norm(paragraph).includes(norm(needle)));
    if (at < 0 && fact.quote === undefined) {
      continue;
    }
    if (fact.quote === undefined && fact.object !== undefined) {
      const both = parsed.paragraphs.findIndex(
        (paragraph) =>
          norm(paragraph).includes(norm(fact.subject)) &&
          norm(paragraph).includes(norm(fact.object)),
      );
      at = both >= 0 ? both : at;
    }
    if (at < 0) {
      continue;
    }
    const q = fact.quote ?? parsed.paragraphs[at];
    const ev =
      mode === 'bad-evidence'
        ? [{ p: at + 1, q: `${q} (never written in the text)` }]
        : [{ p: at + 1, q }];
    out.push({ pred: fact.pred, subject, ...(object === undefined ? {} : { object }), ev });
  }
  return JSON.stringify({ facts: out });
}

function reply(context, mode, behavior) {
  if (context.purpose === 'translation') {
    return translationReply(context.parsed, mode, behavior);
  }
  if (context.purpose === 'candidates') {
    return candidatesReply(context.parsed, mode, behavior);
  }
  if (context.purpose === 'facts') {
    return factsReply(context.parsed, mode, behavior);
  }
  if (context.purpose === 'assistant') {
    return context.reply.text;
  }
  return JSON.stringify({ paragraphs: [] });
}

function actionOf(raw, behavior) {
  const base = typeof raw === 'string' ? { mode: raw } : { ...raw };
  return {
    mode: base.mode ?? behavior.mode ?? 'ok',
    delayMs: base.delayMs ?? behavior.delayMs ?? 0,
    stderr: base.stderr ?? behavior.stderr ?? 'stub provider failed',
    exitCode: base.exitCode ?? behavior.exitCode ?? 1,
    text: base.text ?? behavior.text ?? '',
  };
}

function pickAction(behavior, context, runIndex) {
  const sequence = behavior.sequence ?? [];
  if (runIndex < sequence.length && sequence[runIndex] !== null) {
    return actionOf(sequence[runIndex], behavior);
  }
  const chapters = behavior.chapters ?? {};
  if (context.purpose !== 'candidates') {
    for (const title of context.titles) {
      if (title in chapters) {
        return actionOf(chapters[title], behavior);
      }
    }
  }
  const modes = behavior.modes ?? {};
  if (context.purpose in modes) {
    return actionOf(modes[context.purpose], behavior);
  }
  return actionOf(null, behavior);
}

function wait(ms, index) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (!parentAlive()) {
        clearInterval(timer);
        finish(index, 1, { aborted: true });
        return;
      }
      if (Date.now() - started >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, PARENT_POLL_MS);
    if (ms <= 0) {
      clearInterval(timer);
      resolve();
    }
  });
}

function emit(text, code, index, extra) {
  const json = args.includes('--json') || args.includes('resume');
  let out = text;
  if (json && code === 0) {
    const session = sessionOf().id ?? 'stub-thread';
    out = `${JSON.stringify({ type: 'thread.started', thread_id: session })}\n${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text } })}\n`;
  }
  process.stdout.write(out, () => finish(index, code, extra));
}

function contextOf(prompt, session) {
  const stored =
    session.resume && session.id !== null ? readJson(sessionPath(session.id), null) : null;
  const source = stored?.prompt ?? prompt;
  const purpose = stored?.purpose ?? purposeOf(prompt);
  let parsed = {};
  let titles = [];
  if (purpose === 'translation') {
    parsed = parseTranslation(source);
    titles = parsed.title === null ? [] : [parsed.title];
  } else if (purpose === 'candidates') {
    parsed = parseCandidates(source);
    titles = parsed.chapters.map((chapter) => chapter.title);
  } else if (purpose === 'facts') {
    parsed = parseFacts(source);
    titles = [parsed.title];
  } else if (purpose === 'assistant') {
    parsed = parseAssistant(prompt);
  }
  return { purpose, parsed, titles, source, reply: null };
}

async function runCall(behavior) {
  const prompt = await readStdin();
  const session = sessionOf();
  const context = contextOf(prompt, session);
  if (!session.resume && session.id !== null) {
    mkdirSync(join(stateDir, 'sessions'), { recursive: true });
    writeFileSync(sessionPath(session.id), JSON.stringify({ purpose: context.purpose, prompt }));
  }
  const entry = withLock(() => {
    const counter = join(stateDir, 'runs.count');
    const index = existsSync(counter) ? Number(readFileSync(counter, 'utf8')) : 0;
    writeFileSync(counter, String(index + 1));
    const action = pickAction(behavior, context, index);
    logLine({
      event: 'start',
      kind: 'run',
      index,
      at: new Date().toISOString(),
      args,
      prompt,
      purpose: context.purpose,
      session: session.id,
      resume: session.resume,
      chapters: context.titles,
      mode: action.mode,
      delayMs: action.delayMs,
    });
    return { index, action };
  });
  const { index, action } = entry;
  if (action.mode === 'hang') {
    await wait(HANG_LIMIT_MS, index);
    finish(index, 1, {});
    return;
  }
  if (context.purpose === 'assistant' && action.mode !== 'fail-exit') {
    context.reply = await assistantReply(context.parsed, behavior, index);
  }
  await wait(context.reply?.delayMs ?? action.delayMs, index);
  if (action.mode === 'fail-exit') {
    process.stderr.write(action.stderr, () => finish(index, action.exitCode, {}));
    return;
  }
  if (action.mode === 'empty') {
    emit('', 0, index, {});
    return;
  }
  if (action.mode === 'raw') {
    emit(action.text, 0, index, {});
    return;
  }
  if (action.mode === 'invalid-json') {
    emit('{"title": "broken", "paragraphs": ["truncated', 0, index, {});
    return;
  }
  if (action.mode === 'no-json') {
    emit('Sorry, I cannot produce a structured answer for this text.', 0, index, {});
    return;
  }
  emit(reply(context, action.mode, behavior), 0, index, {});
}

mkdirSync(stateDir, { recursive: true });
const behavior = readJson(join(stateDir, 'behavior.json'), {});
const kind = probeKind();
if (kind !== null) {
  setTimeout(() => runProbe(kind, behavior), behavior.probeDelayMs ?? 0);
} else {
  runCall(behavior);
}
