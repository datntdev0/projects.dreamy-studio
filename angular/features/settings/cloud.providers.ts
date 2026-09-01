import { LanguageKey } from '@shared/language/language.models';

import { CloudAccount, CloudServiceKind } from './cloud.models';

export const CLOUD_SERVICE_KINDS: CloudServiceKind[] = ['speech', 'image'];

export const DEFAULT_CLOUD_ACCOUNTS: CloudAccount[] = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    site: 'elevenlabs.io',
    services: ['speech', 'image'],
    requiresKey: true,
    connected: false,
    keyHint: '',
    status: 'none',
    error: '',
    checkedAt: '',
  },
  {
    id: 'edge-read-aloud',
    name: 'Microsoft Edge Read Aloud',
    site: 'microsoft.com/edge',
    services: ['speech'],
    requiresKey: false,
    connected: true,
    keyHint: '',
    status: 'none',
    error: '',
    checkedAt: '',
  },
];

export type BackendCloudAccount = Partial<CloudAccount> & { id: string };

function normaliseAccount(item: BackendCloudAccount): CloudAccount {
  const base = DEFAULT_CLOUD_ACCOUNTS.find((account) => account.id === item.id);
  const merged = { ...base, ...item } as CloudAccount;
  const requiresKey = item.requiresKey ?? base?.requiresKey ?? true;
  return { ...merged, requiresKey, connected: requiresKey ? merged.connected : true };
}

function isCatalogued(account: CloudAccount): boolean {
  return DEFAULT_CLOUD_ACCOUNTS.some((entry) => entry.id === account.id);
}

export function mergeCloudCatalogue(list: BackendCloudAccount[]): CloudAccount[] {
  const accounts = list.map(normaliseAccount);
  const catalogued = DEFAULT_CLOUD_ACCOUNTS.map(
    (entry) => accounts.find((account) => account.id === entry.id) ?? entry,
  );
  return [...catalogued, ...accounts.filter((account) => !isCatalogued(account))];
}

export const CLOUD_DISCONNECTED: Partial<CloudAccount> = {
  connected: false,
  keyHint: '',
  status: 'none',
  error: '',
  checkedAt: '',
};

export const CLOUD_NOTE_KEYS: Record<CloudServiceKind, Record<string, LanguageKey>> = {
  speech: {
    elevenlabs: 'settings.cloud.note.speech.elevenlabs',
    'edge-read-aloud': 'settings.cloud.note.speech.edgeReadAloud',
  },
  image: { elevenlabs: 'settings.cloud.note.image.elevenlabs' },
};
