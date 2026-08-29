import { Component, input } from "@angular/core";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundTime } from "./sound-time.component";
import { LibrarySoundWave } from "./sound-wave.component";

@Component({ selector: "app-library-sound-media", standalone: true, imports: [LibrarySoundTime, LibrarySoundWave], templateUrl: "./sound-media.component.html", host: { "data-testid": "library-sound-media" } })
export class LibrarySoundMedia { readonly sound = input.required<LibrarySound>(); }
