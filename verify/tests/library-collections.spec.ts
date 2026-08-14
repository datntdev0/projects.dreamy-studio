import { defineScreenTests } from "../src/screen-tests.ts";
import { LIBRARY_SUITE } from "../src/screens.ts";

defineScreenTests(LIBRARY_SUITE, "library screens", ["collections"]);
