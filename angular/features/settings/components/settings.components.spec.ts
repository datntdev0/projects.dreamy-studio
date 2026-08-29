import { TestBed } from "@angular/core/testing";
import { ComponentCase, describeComponents } from "@testing/exercise";
import { setupWorld, warmWorld } from "@testing/world";
import { SettingsService } from "../settings.service";
import { SettingsGeneralComponent } from "./general.component";
import { SettingsLlmComponent } from "./llm.component";
import { SettingsDialog } from "./settings.dialog";

async function warm(): Promise<void> {
  await warmWorld();
}

const cases: ComponentCase[] = [
  { name: "SettingsGeneralComponent", type: SettingsGeneralComponent, before: warm },
  { name: "SettingsLlmComponent", type: SettingsLlmComponent, before: warm },
  { name: "SettingsDialog (general)", type: SettingsDialog, before: async () => { await warm(); TestBed.inject(SettingsService).openDialog("general"); } },
  { name: "SettingsDialog (llm)", type: SettingsDialog, before: async () => { await warm(); TestBed.inject(SettingsService).openDialog("llm"); } },
  { name: "SettingsDialog (backend)", type: SettingsDialog, before: async () => { await warm(); TestBed.inject(SettingsService).openDialog("backend"); } },
  { name: "SettingsDialog (tts)", type: SettingsDialog, before: async () => { await warm(); TestBed.inject(SettingsService).openDialog("tts"); } },
];

describeComponents("settings components", cases, () => {
  setupWorld();
});
