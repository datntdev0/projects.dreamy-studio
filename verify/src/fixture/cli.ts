import { buildFixture } from "./build.ts";
import { fixtureWorkspace } from "../paths.ts";

await buildFixture();
console.log(`fixture ready: ${fixtureWorkspace}`);
