import { CloudProvider } from './settings.models';

export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  claude: ['opus', 'sonnet', 'haiku'],
};

export const CLOUD_PROVIDERS: CloudProvider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic API',
    site: 'console.anthropic.com',
    note: 'settings.llm.cloud.anthropic',
    baseUrl: null,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    site: 'platform.openai.com',
    note: 'settings.llm.cloud.openai',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'google',
    name: 'Google AI Studio (Gemini)',
    site: 'aistudio.google.com',
    note: 'settings.llm.cloud.google',
    baseUrl: null,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    site: 'openrouter.ai',
    note: 'settings.llm.cloud.openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    site: '',
    note: 'settings.llm.cloud.custom',
    baseUrl: '',
  },
];
