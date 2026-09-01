import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Icon } from '@components/icon';
import { CoreModule } from '@shared/core.module';
import { fieldValue } from '@shared/utils/dom';

// prettier-ignore
import { BlockPatch, BlockType, BlockTypeDef, MoveDirection, ScriptBlock, ScriptContext } from '../scripting.models';
import { BLOCK_TYPES, isStale, paragraphNumber, SCENE_TIMES } from '../scripting.rules';
import { ScriptingService } from '../scripting.service';
import { ScriptingInspectorLabels } from './inspector.labels';
import { evidenceOf, EvidenceRef } from './inspector.rules';

interface WhoOption {
  id: string;
  name: string;
}

type TextField = 'who' | 'paren' | 'loc' | 'time' | 'beat';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-scripting-inspector-block',
  host: { 'data-testid': 'scripting-inspector-block' },
  imports: [Icon, CoreModule],
  templateUrl: './inspector-block.component.html',
})
export class ScriptingInspectorBlock {
  private readonly scripting = inject(ScriptingService);
  private readonly labels = inject(ScriptingInspectorLabels);

  readonly ctx = input.required<ScriptContext>();
  readonly block = input.required<ScriptBlock>();
  readonly times = SCENE_TIMES;
  readonly def = computed(this.buildDef.bind(this));
  readonly typeOptions = computed(this.buildTypeOptions.bind(this));
  readonly whoOptions = computed(this.buildWhoOptions.bind(this));
  readonly seconds = computed(this.buildSeconds.bind(this));
  readonly evidence = computed(this.buildEvidence.bind(this));
  readonly stale = computed(this.buildStale.bind(this));
  readonly paragraph = computed(this.buildParagraph.bind(this));

  changeType(event: Event): void {
    this.scripting.setBlockType(
      this.ctx().projectId,
      this.block().id,
      fieldValue(event) as BlockType,
    );
  }

  change(field: TextField, event: Event): void {
    const patch: Pick<BlockPatch, TextField> = { [field]: fieldValue(event) };
    this.scripting.patchBlock(this.ctx().projectId, this.block().id, patch);
  }

  changeSeconds(event: Event): void {
    this.scripting.patchBlock(this.ctx().projectId, this.block().id, {
      seconds: Number(fieldValue(event)),
    });
  }

  move(direction: MoveDirection): void {
    this.scripting.moveBlock(this.ctx().projectId, this.block().id, direction);
  }

  duplicate(): void {
    this.scripting.duplicateBlock(this.ctx().projectId, this.block().id);
  }

  remove(): void {
    this.scripting.removeBlock(this.ctx().projectId, this.block().id);
  }

  private buildDef(): BlockTypeDef {
    return BLOCK_TYPES[this.block().type];
  }

  private buildTypeOptions(): BlockTypeDef[] {
    return this.ctx().config.types.map((type) => BLOCK_TYPES[type]);
  }

  private buildWhoOptions(): WhoOption[] {
    return this.ctx().cast.map((member) => ({
      id: member.id,
      name: this.labels.speakerName(member),
    }));
  }

  private buildSeconds(): string {
    return (this.block().ms / 1000).toFixed(1);
  }

  private buildEvidence(): EvidenceRef[] {
    return evidenceOf(this.block().refs);
  }

  private buildStale(): boolean {
    return isStale(this.ctx().source, this.block());
  }

  private buildParagraph(): number {
    const ref = this.block().ref;
    return ref ? paragraphNumber(ref) : 0;
  }
}
