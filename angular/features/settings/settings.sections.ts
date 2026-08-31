import { SettingsSection } from './settings.models';

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: 'general', icon: 'settings', labelKey: 'settings.section.general' },
  { id: 'llm', icon: 'nodes', labelKey: 'settings.section.llm' },
  { id: 'backend', icon: 'server', labelKey: 'settings.section.backend' },
  { id: 'tts', icon: 'cpu', labelKey: 'settings.section.tts' },
  { id: 'speech', icon: 'cloud', labelKey: 'settings.section.speech' },
];
