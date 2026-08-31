import { isReady, LlmService } from '../settings/llm.service';
import { LlmCapability } from '../settings/settings.models';
import { AnalyzeProvider } from './components/provider-status.component';

export function buildFeatureProvider(llm: LlmService, featureId: LlmCapability): AnalyzeProvider {
  const feature = llm.features().find((item) => item.id === featureId);
  const provider = llm.providers().find((item) => item.id === feature?.provider);
  if (!feature || !provider) {
    return { name: '', detail: '', state: 'unset' };
  }
  const effort = feature.effort ?? '—';
  return {
    name: provider.name,
    detail: `${feature.model || '—'} · ${effort}`,
    state: isReady(provider) ? 'ready' : 'unready',
  };
}
