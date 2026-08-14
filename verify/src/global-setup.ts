import { writeCorpus } from "./fixture/corpus.ts";

export default async function globalSetup(): Promise<void> {
  await writeCorpus();
}
