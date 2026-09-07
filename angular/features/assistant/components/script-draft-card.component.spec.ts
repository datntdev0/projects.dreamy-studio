import { TestBed } from '@angular/core/testing';
import { ScriptingService } from '@features/scripting/scripting.service';
import { LanguageService } from '@shared/language/language.service';
import { ToastService } from '@shared/toast/toast.service';
import { allById, byId, click } from '@testing/dom';
import { mount, Mounted, settle } from '@testing/exercise';
import { FakeIpc } from '@testing/fake-ipc';
import { scriptDraft } from '@testing/fixtures';
import { setupWorld, warmWorld, worldSession } from '@testing/world';
import { describe, expect, it, vi } from 'vitest';

import { AssistantMessage, ProposalResolution, ScriptDraft } from '../assistant.models';
import { DRAFT_COLLAPSED_ROWS } from '../assistant.proposals';
import { AssistantService } from '../assistant.service';
import { AssistantChat } from './chat.component';
import { AssistantScriptDraftCard } from './script-draft-card.component';

interface Deferred {
  promise: Promise<void>;
  release: () => void;
}

function deferred(): Deferred {
  const pending: Partial<Deferred> = {};
  pending.promise = new Promise<void>(releaseWith.bind(null, pending));
  return pending as Deferred;
}

function releaseWith(pending: Partial<Deferred>, resolve: () => void): void {
  pending.release = resolve;
}

function mountCard(draft: ScriptDraft, busy = false): Promise<Mounted<AssistantScriptDraftCard>> {
  return mount(AssistantScriptDraftCard, { draft, messageId: 'm2', busy }, () => {
    setupWorld();
  });
}

function textOf(mounted: Mounted<unknown>, id: string): string {
  return byId(mounted.root, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function translate(key: Parameters<LanguageService['translate']>[0], params = {}): string {
  return TestBed.inject(LanguageService).translate(key, params);
}

function isDisabled(mounted: Mounted<unknown>, id: string): boolean {
  return (byId(mounted.root, id) as HTMLButtonElement).disabled;
}

function longDraft(count: number): ScriptDraft {
  const base = scriptDraft();
  const blocks = Array.from({ length: count }, (_, index) => ({
    ...base.blocks[1],
    text: `Line ${index + 1}`,
  }));
  return scriptDraft({ blocks });
}

describe('AssistantScriptDraftCard', () => {
  describe('pending', () => {
    it('describes the unit, the summary and the statistics', async () => {
      const mounted = await mountCard(scriptDraft());
      expect(textOf(mounted, 'assistant-script-draft-name')).toBe('Opening');
      expect(textOf(mounted, 'assistant-script-draft-meta')).toContain('Audiobook project');
      expect(textOf(mounted, 'assistant-script-draft-meta')).toContain(
        translate('assistant.draft.chapter', { n: 1 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-summary')).toBe('Narration with two speakers');
      expect(textOf(mounted, 'assistant-script-draft-blocks')).toBe(
        translate('assistant.draft.blocks', { count: 3 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-narration')).toBe(
        translate('assistant.draft.narration', { count: 1 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-dialogue')).toBe(
        translate('assistant.draft.dialogue', { count: 2 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-words')).toBe(
        translate('assistant.draft.words', { count: 5 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-kept')).toBe(
        translate('assistant.draft.kept', { count: 1 }),
      );
      expect(byId(mounted.root, 'assistant-script-draft-stale')).toBeNull();
      expect(byId(mounted.root, 'assistant-script-draft-unresolved')).toBeNull();
      expect(byId(mounted.root, 'assistant-script-draft-status')).toBeNull();
    });

    it('omits the chapter and the summary when they are missing', async () => {
      const mounted = await mountCard(scriptDraft({ chapter: null, summary: '' }));
      expect(textOf(mounted, 'assistant-script-draft-meta')).not.toContain(
        translate('assistant.draft.chapter', { n: 1 }),
      );
      expect(byId(mounted.root, 'assistant-script-draft-summary')).toBeNull();
    });

    it('lists the speakers and flags the new ones', async () => {
      const mounted = await mountCard(scriptDraft());
      expect(allById(mounted.root, 'assistant-script-draft-speaker')).toHaveLength(3);
      expect(allById(mounted.root, 'assistant-script-draft-speaker-new')).toHaveLength(1);
      expect(allById(mounted.root, 'assistant-script-draft-speaker')[2].textContent).toContain(
        'Innkeeper',
      );
    });

    it('hides the speaker list when no one speaks', async () => {
      const mounted = await mountCard(scriptDraft({ speakers: [] }));
      expect(byId(mounted.root, 'assistant-script-draft-speakers')).toBeNull();
    });

    it('warns about outdated audio, unresolved lines and extra warnings', async () => {
      const draft = scriptDraft({ unresolved: 2, warnings: ['Long unit'] });
      draft.stats.staleAudio = 4;
      const mounted = await mountCard(draft);
      expect(textOf(mounted, 'assistant-script-draft-stale')).toBe(
        translate('assistant.draft.staleAudio', { count: 4 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-unresolved')).toBe(
        translate('assistant.draft.unresolved', { count: 2 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-warning')).toBe('Long unit');
    });

    it('shows only the changed blocks with a gap for the unchanged ones', async () => {
      const mounted = await mountCard(scriptDraft());
      const rows = allById(mounted.root, 'assistant-script-draft-row');
      expect(rows).toHaveLength(3);
      expect(rows[0].classList.contains('is-del')).toBe(true);
      expect(rows[0].dataset['kind']).toBe('removed');
      expect(rows[0].textContent).toContain('Old line');
      expect(rows[1].classList.contains('is-ins')).toBe(true);
      expect(rows[1].dataset['type']).toBe('dialogue');
      expect(rows[1].textContent).toContain('Lin Mo');
      expect(rows[1].textContent).toContain('(softly)');
      expect(rows[1].textContent).toContain('Hello there');
      expect(rows[2].textContent).toContain('Innkeeper');
      expect(mounted.root.textContent).not.toContain('Old narration');
      expect(textOf(mounted, 'assistant-script-draft-gap')).toBe(
        translate('assistant.draft.gap', { count: 1 }),
      );
    });

    it('marks every row with its sign', async () => {
      const mounted = await mountCard(scriptDraft());
      const signs = allById(mounted.root, 'assistant-script-draft-row-sign').map((sign) =>
        sign.textContent?.trim(),
      );
      expect(signs).toEqual(['\u2212', '+', '+']);
    });

    it('summarizes the added and removed blocks and hides the moved count when none moved', async () => {
      const mounted = await mountCard(scriptDraft());
      expect(textOf(mounted, 'assistant-script-draft-added')).toBe(
        translate('assistant.draft.added', { count: 2 }),
      );
      expect(textOf(mounted, 'assistant-script-draft-removed')).toBe(
        translate('assistant.draft.removed', { count: 1 }),
      );
      expect(byId(mounted.root, 'assistant-script-draft-moved')).toBeNull();
    });

    it('shows a moved block when the order changes', async () => {
      const base = scriptDraft();
      const reordered = scriptDraft({
        blocks: [
          { ...base.blocks[0], id: 'b2', text: 'Old line', who: 'kb-1', type: 'dialogue' },
          { ...base.blocks[0], id: 'b1', text: 'Old narration' },
        ],
      });
      const mounted = await mountCard(reordered);
      const rows = allById(mounted.root, 'assistant-script-draft-row');
      expect(rows).toHaveLength(1);
      expect(rows[0].classList.contains('is-move')).toBe(true);
      expect(textOf(mounted, 'assistant-script-draft-moved')).toBe(
        translate('assistant.draft.moved', { count: 1 }),
      );
    });

    it('shows the truncation notice when the current script is truncated', async () => {
      const mounted = await mountCard(scriptDraft({ currentTruncated: true }));
      expect(byId(mounted.root, 'assistant-script-draft-truncated')).not.toBeNull();
    });

    it('does not show the truncation notice when the current script is complete', async () => {
      const mounted = await mountCard(scriptDraft());
      expect(byId(mounted.root, 'assistant-script-draft-truncated')).toBeNull();
    });

    it('collapses a long list and expands it on demand', async () => {
      const extra = 5;
      const mounted = await mountCard(longDraft(DRAFT_COLLAPSED_ROWS + extra));
      const total = DRAFT_COLLAPSED_ROWS + extra + 2;
      expect(allById(mounted.root, 'assistant-script-draft-row')).toHaveLength(
        DRAFT_COLLAPSED_ROWS,
      );
      expect(textOf(mounted, 'assistant-script-draft-more')).toBe(
        translate('assistant.draft.more', { count: total - DRAFT_COLLAPSED_ROWS }),
      );
      click(mounted.root, 'assistant-script-draft-more');
      await settle(mounted.fixture);
      expect(allById(mounted.root, 'assistant-script-draft-row')).toHaveLength(total);
      expect(byId(mounted.root, 'assistant-script-draft-more')).toBeNull();
    });

    it('shows an empty notice when the draft changes nothing', async () => {
      const base = scriptDraft();
      const same = scriptDraft({
        current: [base.current[0]],
        blocks: [base.blocks[0]],
      });
      const mounted = await mountCard(same);
      expect(byId(mounted.root, 'assistant-script-draft-empty')).not.toBeNull();
      expect(byId(mounted.root, 'assistant-script-draft-rows')).toBeNull();
    });

    it('lists the current blocks as removed and blocks Apply when the proposal has no blocks', async () => {
      const mounted = await mountCard(scriptDraft({ blocks: [] }));
      const rows = allById(mounted.root, 'assistant-script-draft-row');
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.dataset['kind'] === 'removed')).toBe(true);
      expect(isDisabled(mounted, 'assistant-script-draft-apply')).toBe(true);
      expect(isDisabled(mounted, 'assistant-script-draft-reject')).toBe(false);
    });

    it('emits an applied resolution when Apply is pressed', async () => {
      const mounted = await mountCard(scriptDraft());
      const resolutions: ProposalResolution[] = [];
      mounted.instance.resolved.subscribe((resolution) => resolutions.push(resolution));
      click(mounted.root, 'assistant-script-draft-apply');
      expect(resolutions).toEqual([{ messageId: 'm2', itemIds: ['sd1'], status: 'applied' }]);
    });

    it('emits a rejection when Reject is pressed', async () => {
      const mounted = await mountCard(scriptDraft());
      const resolutions: ProposalResolution[] = [];
      mounted.instance.resolved.subscribe((resolution) => resolutions.push(resolution));
      click(mounted.root, 'assistant-script-draft-reject');
      expect(resolutions).toEqual([{ messageId: 'm2', itemIds: ['sd1'], status: 'rejected' }]);
    });

    it('disables both actions while busy', async () => {
      const mounted = await mountCard(scriptDraft(), true);
      const emitted: ProposalResolution[] = [];
      mounted.instance.resolved.subscribe((resolution) => emitted.push(resolution));
      expect(isDisabled(mounted, 'assistant-script-draft-apply')).toBe(true);
      expect(isDisabled(mounted, 'assistant-script-draft-reject')).toBe(true);
      mounted.instance.apply();
      mounted.instance.reject();
      expect(emitted).toEqual([]);
    });
  });

  describe('resolved', () => {
    it('shows an applied card without actions', async () => {
      const mounted = await mountCard(scriptDraft({ status: 'applied' }));
      expect(textOf(mounted, 'assistant-script-draft-status')).toBe(
        translate('assistant.proposal.applied'),
      );
      expect(byId(mounted.root, 'assistant-script-draft-apply')).toBeNull();
      expect(byId(mounted.root, 'assistant-script-draft-reject')).toBeNull();
    });

    it('shows a dismissed card and ignores late actions', async () => {
      const mounted = await mountCard(scriptDraft({ status: 'rejected' }));
      const emitted: ProposalResolution[] = [];
      mounted.instance.resolved.subscribe((resolution) => emitted.push(resolution));
      expect(textOf(mounted, 'assistant-script-draft-status')).toBe(
        translate('assistant.proposal.rejected'),
      );
      mounted.instance.apply();
      mounted.instance.reject();
      expect(emitted).toEqual([]);
    });
  });

  describe('in the chat', () => {
    function messageWith(draft: ScriptDraft): AssistantMessage {
      return {
        id: 'm2',
        role: 'assistant',
        text: 'Here is the rewrite.',
        createdAt: '2026-01-02T03:05:00Z',
        activities: [],
        citations: [],
        attachments: [draft],
      };
    }

    let ipc: FakeIpc;

    async function mountChat(draft: ScriptDraft): Promise<Mounted<AssistantChat>> {
      return mount(AssistantChat, {}, async () => {
        ipc = setupWorld();
        ipc.on('assistant_session_get', worldSession('s1', { messages: [messageWith(draft)] }));
        await warmWorld();
        await TestBed.inject(AssistantService).open('s1');
      });
    }

    it('flushes pending editor writes before applying and reloads the script after', async () => {
      const mounted = await mountChat(scriptDraft());
      const scripting = TestBed.inject(ScriptingService);
      const pending = deferred();
      const flush = vi.spyOn(scripting, 'flush').mockReturnValue(pending.promise);
      vi.spyOn(scripting, 'isLoaded').mockReturnValue(true);
      const load = vi.spyOn(scripting, 'load').mockResolvedValue();
      ipc.on(
        'assistant_proposal_resolve',
        worldSession('s1', { messages: [messageWith(scriptDraft({ status: 'applied' }))] }),
      );
      click(mounted.root, 'assistant-script-draft-apply');
      await settle(mounted.fixture);
      expect(flush).toHaveBeenCalledWith(1);
      expect(ipc.called('assistant_proposal_resolve')).toBe(0);
      pending.release();
      await vi.waitFor(() => expect(ipc.called('assistant_proposal_resolve')).toBe(1));
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({
        sessionId: 's1',
        messageId: 'm2',
        itemIds: ['sd1'],
        status: 'applied',
      });
      await vi.waitFor(() => expect(load).toHaveBeenCalledWith(1));
    });

    it('keeps a conflicting draft pending and tells the user to ask again', async () => {
      const mounted = await mountChat(scriptDraft());
      const scripting = TestBed.inject(ScriptingService);
      const load = vi.spyOn(scripting, 'load').mockResolvedValue();
      ipc.fail('assistant_proposal_resolve', { code: 'conflict', detail: 'unit changed' });
      click(mounted.root, 'assistant-script-draft-apply');
      await vi.waitFor(() => expect(ipc.called('assistant_proposal_resolve')).toBe(1));
      await settle(mounted.fixture);
      const toast = TestBed.inject(ToastService).items().at(-1);
      expect(toast?.tone).toBe('danger');
      expect(toast?.message).toBe(
        translate('assistant.error.draftConflict', { detail: 'unit changed' }),
      );
      expect(byId(mounted.root, 'assistant-script-draft-apply')).not.toBeNull();
      expect(byId(mounted.root, 'assistant-script-draft-status')).toBeNull();
      expect(load).not.toHaveBeenCalled();
    });

    it('rejects without flushing or reloading the script', async () => {
      const mounted = await mountChat(scriptDraft());
      const scripting = TestBed.inject(ScriptingService);
      const flush = vi.spyOn(scripting, 'flush');
      const load = vi.spyOn(scripting, 'load').mockResolvedValue();
      click(mounted.root, 'assistant-script-draft-reject');
      await vi.waitFor(() => expect(ipc.called('assistant_proposal_resolve')).toBe(1));
      expect(flush).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();
      expect(ipc.lastArgs('assistant_proposal_resolve')).toMatchObject({
        messageId: 'm2',
        itemIds: ['sd1'],
        status: 'rejected',
      });
    });
  });
});
