import { defineScreenTests } from "../src/screen-tests.ts";
import { NOVEL_SUITE } from "../src/screens.ts";

defineScreenTests(NOVEL_SUITE, "novel screens", ["reader"]);
