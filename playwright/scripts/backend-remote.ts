import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32 } from 'node:zlib';

import type { BackendModelId } from '../pages/settings.ts';

const COMMIT = '0123456789abcdef0123456789abcdef01234567';
const TRICKLE_MS = 1000;
const TREE_PATH = /^\/api\/models\/([^/]+\/[^/]+)\/tree\/[^/?]+/;
const RESOLVE_PATH = /^\/([^/]+\/[^/]+)\/resolve\/[^/]+\/([^?]+)/;
const PYPI_PATH = /^\/pypi\/([^/]+)\/([^/]+)\/json$/;
const WHEEL_PATH = /^\/files\/([^/?]+)$/;
const ZIP_DATE = 0x21;

export const MODEL_FILE_BYTES = 262_144;
export const WHEEL_PAYLOAD_BYTES = 307_200;
export const MODEL_FILES = ['tokenizer.json', 'model.safetensors'];
export const MODEL_REPOS: Readonly<Record<BackendModelId, string>> = {
  'vieneu-turbo': 'pnnbao-ump/VieNeu-TTS-v3-Turbo',
  'vieneu-nano': 'pnnbao-ump/VieNeu-TTS-v3-Nano',
  omnivoice: 'k2-fsa/OmniVoice',
};

export const EXTRA_REPOS: readonly string[] = [
  'OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX',
  'openai/whisper-large-v3-turbo',
];

export interface RemoteRequest {
  readonly method: string;
  readonly path: string;
}

interface ZipEntry {
  readonly name: Buffer;
  readonly data: Buffer;
  readonly crc: number;
  readonly offset: number;
}

function sha1(data: Buffer): string {
  return createHash('sha1').update(data).digest('hex');
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function localHeader(entry: ZipEntry): Buffer {
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(ZIP_DATE, 12);
  head.writeUInt32LE(entry.crc, 14);
  head.writeUInt32LE(entry.data.length, 18);
  head.writeUInt32LE(entry.data.length, 22);
  head.writeUInt16LE(entry.name.length, 26);
  return Buffer.concat([head, entry.name, entry.data]);
}

function centralHeader(entry: ZipEntry): Buffer {
  const head = Buffer.alloc(46);
  head.writeUInt32LE(0x02014b50, 0);
  head.writeUInt16LE(20, 4);
  head.writeUInt16LE(20, 6);
  head.writeUInt16LE(ZIP_DATE, 14);
  head.writeUInt32LE(entry.crc, 16);
  head.writeUInt32LE(entry.data.length, 20);
  head.writeUInt32LE(entry.data.length, 24);
  head.writeUInt16LE(entry.name.length, 28);
  head.writeUInt32LE(entry.offset, 42);
  return Buffer.concat([head, entry.name]);
}

function endRecord(count: number, size: number, offset: number): Buffer {
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(size, 12);
  end.writeUInt32LE(offset, 16);
  return end;
}

export function buildZip(files: Readonly<Record<string, Buffer>>): Buffer {
  const entries: ZipEntry[] = [];
  const locals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(files)) {
    const entry = { name: Buffer.from(name), data, crc: crc32(data), offset };
    const local = localHeader(entry);
    entries.push(entry);
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(entries.map(centralHeader));
  return Buffer.concat([...locals, central, endRecord(entries.length, central.length, offset)]);
}

export function wheelModule(name: string): string {
  return name
    .replace(/^nvidia-/, '')
    .replace(/-cu12$/, '')
    .replace(/-/g, '_');
}

export function wheelName(name: string, version: string): string {
  return `${name.replace(/-/g, '_')}-${version}-py3-none-win_amd64.whl`;
}

function buildWheel(name: string, version: string): Buffer {
  const module = wheelModule(name);
  return buildZip({
    [`nvidia/${module}/bin/${module}64_12.dll`]: Buffer.alloc(WHEEL_PAYLOAD_BYTES, module),
    [`${name.replace(/-/g, '_')}-${version}.dist-info/METADATA`]: Buffer.from('meta'),
  });
}

function modelFile(repo: string, path: string): Buffer {
  return Buffer.alloc(MODEL_FILE_BYTES, `${repo}/${path}`);
}

function servedRepo(repo: string): boolean {
  return Object.values(MODEL_REPOS).includes(repo) || EXTRA_REPOS.includes(repo);
}

function rangeOffset(request: IncomingMessage): number {
  const match = /^bytes=(\d+)-/.exec(request.headers.range ?? '');
  return match ? Number(match[1]) : 0;
}

class HeldBody {
  private sent = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly response: ServerResponse,
    private readonly data: Buffer,
  ) {}

  begin(): void {
    this.sent = Math.floor(this.data.length / 2);
    this.response.write(this.data.subarray(0, this.sent));
    this.timer = setInterval(this.trickle.bind(this), TRICKLE_MS);
  }

  finish(): void {
    this.stop();
    if (!this.response.destroyed) {
      this.response.end(this.data.subarray(this.sent));
    }
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private trickle(): void {
    if (this.response.destroyed || this.sent >= this.data.length - 1) {
      this.stop();
      return;
    }
    this.response.write(this.data.subarray(this.sent, this.sent + 1));
    this.sent += 1;
  }
}

export class BackendRemote {
  readonly requests: RemoteRequest[] = [];
  private readonly failing = new Set<string>();
  private readonly holding = new Set<string>();
  private readonly held = new Map<string, HeldBody[]>();
  private readonly wheels = new Map<string, Buffer>();
  private url = '';

  constructor(private readonly server: Server) {}

  get baseUrl(): string {
    return this.url;
  }

  async listen(): Promise<void> {
    this.server.on('request', this.handle.bind(this));
    await new Promise<void>((done) => this.server.listen(0, '127.0.0.1', done));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  fail(fragment: string): void {
    this.failing.add(fragment);
  }

  recover(fragment: string): void {
    this.failing.delete(fragment);
  }

  hold(fragment: string): void {
    this.holding.add(fragment);
  }

  release(fragment: string): void {
    this.holding.delete(fragment);
    for (const body of this.held.get(fragment) ?? []) {
      body.finish();
    }
    this.held.delete(fragment);
  }

  heldCount(fragment: string): number {
    return this.held.get(fragment)?.length ?? 0;
  }

  gets(fragment: string): RemoteRequest[] {
    return this.requests.filter(
      (request) => request.method === 'GET' && request.path.includes(fragment),
    );
  }

  async stop(): Promise<void> {
    for (const bodies of this.held.values()) {
      bodies.forEach((body) => body.stop());
    }
    this.held.clear();
    this.server.closeAllConnections();
    await new Promise((done) => this.server.close(done));
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const path = request.url ?? '/';
    this.requests.push({ method: request.method ?? 'GET', path });
    response.on('error', () => undefined);
    if ([...this.failing].some((fragment) => path.includes(fragment))) {
      this.sendJson(response, { error: 'forbidden by the stub' }, 403);
      return;
    }
    const tree = TREE_PATH.exec(path);
    const resolve = RESOLVE_PATH.exec(path);
    const pypi = PYPI_PATH.exec(path);
    const wheel = WHEEL_PATH.exec(path);
    if (tree?.[1] !== undefined && servedRepo(tree[1])) {
      this.sendJson(response, this.tree(tree[1]));
    } else if (resolve?.[1] !== undefined && resolve[2] !== undefined) {
      this.sendFile(request, response, path, modelFile(resolve[1], resolve[2]));
    } else if (pypi?.[1] !== undefined && pypi[2] !== undefined) {
      this.sendJson(response, this.pypiRelease(pypi[1], pypi[2]));
    } else if (wheel?.[1] !== undefined && this.wheels.has(wheel[1])) {
      this.sendFile(request, response, path, this.wheels.get(wheel[1]) ?? Buffer.alloc(0));
    } else {
      this.sendJson(response, { error: 'not found' }, 404);
    }
  }

  private tree(repo: string): unknown[] {
    return MODEL_FILES.map((path) => {
      const data = modelFile(repo, path);
      return { type: 'file', oid: sha1(data), size: data.length, path };
    });
  }

  private pypiRelease(name: string, version: string): unknown {
    const filename = wheelName(name, version);
    const data = this.wheels.get(filename) ?? buildWheel(name, version);
    this.wheels.set(filename, data);
    return {
      urls: [
        {
          filename,
          url: `${this.url}/files/${filename}`,
          size: data.length,
          digests: { sha256: sha256(data) },
        },
      ],
    };
  }

  private sendJson(response: ServerResponse, payload: unknown, status = 200): void {
    const body = Buffer.from(JSON.stringify(payload));
    response.writeHead(status, {
      'Content-Type': 'application/json',
      'Content-Length': String(body.length),
    });
    response.end(body);
  }

  private sendFile(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    data: Buffer,
  ): void {
    const offset = rangeOffset(request);
    const body = data.subarray(offset);
    response.writeHead(offset > 0 ? 206 : 200, {
      'Content-Length': String(body.length),
      ETag: `"${sha1(data)}"`,
      'X-Repo-Commit': COMMIT,
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const fragment = [...this.holding].find((item) => path.includes(item));
    if (fragment === undefined) {
      response.end(body);
      return;
    }
    const held = new HeldBody(response, body);
    this.held.set(fragment, [...(this.held.get(fragment) ?? []), held]);
    held.begin();
  }
}

export async function startRemote(): Promise<BackendRemote> {
  const remote = new BackendRemote(createServer());
  await remote.listen();
  return remote;
}
