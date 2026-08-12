import { Component, input } from "@angular/core";
import { LibrarySound } from "../library.sounds.models";
import { LibrarySoundEq } from "./sound-eq.component";
import { LibrarySoundPlay } from "./sound-play.component";
import { LibrarySoundTime } from "./sound-time.component";

@Component({ selector: "app-library-sound-media", standalone: true, imports: [LibrarySoundEq, LibrarySoundPlay, LibrarySoundTime], templateUrl: "./sound-media.component.html", host: { "data-testid": "library-sound-media" } })
export class LibrarySoundMedia { readonly sound = input.required<LibrarySound>(); }
