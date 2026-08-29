import { TestBed } from "@angular/core/testing";
import { ComponentCase, describeComponents } from "@testing/exercise";
import { novel } from "@testing/fixtures";
import { entity } from "@testing/knowledge";
import { setupWorld, warmWorld } from "@testing/world";
import { NovelDialogsService } from "../novel.dialogs.service";
import { NovelKnowledgeService } from "../novel.knowledge.service";
import { NovelReaderService } from "../novel.reader.service";
import { NovelService } from "../novel.service";
import { NovelTranslationService } from "../novel.translation.service";
import { NovelChapterAddDialog } from "./chapter-add.dialog";
import { NovelChapters } from "./chapters.component";
import { NovelConfirmThumb } from "./confirm-thumb.component";
import { NovelCreateDialog } from "./create.dialog";
import { NovelDisplayPanel } from "./display.panel";
import { NovelExplorer } from "./explorer.component";
import { NovelImportDialog } from "./import.dialog";
import { NovelKnowledgeAnalyzeDialog } from "./knowledge-analyze.dialog";
import { NovelKnowledgeDetail } from "./knowledge-detail.component";
import { NovelKnowledgeEditDialog } from "./knowledge-edit.dialog";
import { NovelKnowledgeGraph } from "./knowledge-graph.component";
import { NovelKnowledgeList } from "./knowledge-list.component";
import { NovelOmniscient } from "./knowledge-omniscient.component";
import { NovelKnowledgeReview } from "./knowledge-review.component";
import { NovelKnowledgeType } from "./knowledge-type.component";
import { NovelKnowledge } from "./knowledge.component";
import { NovelLangSwitch } from "./lang-switch.component";
import { NovelList } from "./list.component";
import { NovelView } from "./novel-view.component";
import { NovelPanel } from "./novel.panel";
import { NovelProgressFrac } from "./progress-frac.component";
import { NovelReader } from "./reader.component";
import { NovelTranslationDictionary } from "./translation-dictionary.component";
import { NovelTranslationGuidelines } from "./translation-guidelines.component";
import { NovelTranslationPipeline } from "./translation-pipeline.component";
import { NovelTranslationResult } from "./translation-result.component";
import { NovelTranslationRunDialog } from "./translation-run.dialog";
import { NovelTranslationWarnings } from "./translation-warnings.component";
import { NovelTranslation } from "./translation.component";

async function warm(): Promise<void> {
  await warmWorld();
}

async function reading(): Promise<void> {
  await warmWorld();
  await TestBed.inject(NovelReaderService).openReader(1, 1);
}

const novelId = { novelId: 1 };

const cases: ComponentCase[] = [
  { name: "NovelList", type: NovelList, before: warm },
  { name: "NovelExplorer", type: NovelExplorer, before: warm },
  { name: "NovelView", type: NovelView, inputs: novelId, before: warm },
  { name: "NovelChapters", type: NovelChapters, inputs: novelId, before: warm },
  { name: "NovelPanel", type: NovelPanel, inputs: { novelId: 1, showOpen: true }, before: warm },
  { name: "NovelPanel (selection)", type: NovelPanel, before: async () => { await warm(); TestBed.inject(NovelService).select(1); } },
  { name: "NovelDisplayPanel", type: NovelDisplayPanel, before: reading },
  { name: "NovelReader", type: NovelReader, inputs: novelId, before: reading },
  { name: "NovelReader (translated, edit)", type: NovelReader, inputs: novelId, before: async () => { await reading(); TestBed.inject(NovelReaderService).setMode("edit"); TestBed.inject(NovelReaderService).setLang(1, "VI"); } },
  { name: "NovelReader (write)", type: NovelReader, inputs: novelId, before: async () => { await reading(); TestBed.inject(NovelReaderService).setMode("write"); } },
  { name: "NovelLangSwitch", type: NovelLangSwitch, inputs: novelId, before: warm },
  { name: "NovelProgressFrac", type: NovelProgressFrac, inputs: { done: 3, total: 5 }, before: warm },
  { name: "NovelTranslation", type: NovelTranslation, inputs: novelId, before: warm },
  { name: "NovelTranslationDictionary", type: NovelTranslationDictionary, inputs: novelId, before: warm },
  { name: "NovelTranslationGuidelines", type: NovelTranslationGuidelines, inputs: novelId, before: warm },
  { name: "NovelTranslationPipeline", type: NovelTranslationPipeline, inputs: novelId, before: warm },
  { name: "NovelTranslationResult", type: NovelTranslationResult, inputs: novelId, before: warm },
  { name: "NovelTranslationWarnings", type: NovelTranslationWarnings, inputs: novelId, before: warm },
  { name: "NovelKnowledge", type: NovelKnowledge, inputs: novelId, before: warm },
  { name: "NovelKnowledge (list tab)", type: NovelKnowledge, inputs: novelId, before: async () => { await warm(); TestBed.inject(NovelKnowledgeService).setTab(1, "list"); } },
  { name: "NovelKnowledge (review tab)", type: NovelKnowledge, inputs: novelId, before: async () => { await warm(); TestBed.inject(NovelKnowledgeService).setTab(1, "review"); } },
  { name: "NovelKnowledgeGraph", type: NovelKnowledgeGraph, inputs: novelId, before: warm },
  { name: "NovelKnowledgeList", type: NovelKnowledgeList, inputs: novelId, before: warm },
  { name: "NovelKnowledgeReview", type: NovelKnowledgeReview, inputs: novelId, before: warm },
  { name: "NovelKnowledgeDetail", type: NovelKnowledgeDetail, inputs: { novelId: 1, item: entity("e1", "character", "Hero") }, before: warm },
  { name: "NovelKnowledgeType", type: NovelKnowledgeType, inputs: { type: "character" }, before: warm },
  { name: "NovelOmniscient", type: NovelOmniscient, before: warm },
  { name: "NovelConfirmThumb", type: NovelConfirmThumb, inputs: { item: { name: "A", data: novel() } }, before: warm },
  { name: "NovelCreateDialog", type: NovelCreateDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openCreate(); } },
  { name: "NovelImportDialog", type: NovelImportDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openImport(); } },
  { name: "NovelChapterAddDialog", type: NovelChapterAddDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openAddChapter(1); } },
  { name: "NovelKnowledgeAnalyzeDialog", type: NovelKnowledgeAnalyzeDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openAnalyze(1); } },
  { name: "NovelKnowledgeEditDialog (edit)", type: NovelKnowledgeEditDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openEdit(1, ["e1", "f1"]); } },
  { name: "NovelKnowledgeEditDialog (add)", type: NovelKnowledgeEditDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openAdd(1, "entity"); } },
  { name: "NovelTranslationRunDialog", type: NovelTranslationRunDialog, before: async () => { await warm(); TestBed.inject(NovelDialogsService).openTranslate(1); } },
];

describeComponents("novel components", cases, () => {
  setupWorld();
  void NovelTranslationService;
});
