import { Component, inject } from "@angular/core";
import { Icon } from "../../../../components/icon";
import { I18nPipe } from "../../../core/i18n/i18n.pipe";
import { LibraryService } from "../library.service";
import { LIBRARY_KINDS, LibraryKind } from "../library.models";
import { sumCounts } from "../library.rules";

@Component({ selector: "app-library-taxonomy-panel", standalone: true, imports: [Icon, I18nPipe], templateUrl: "./taxonomy.panel.html", host: { "data-testid": "library-taxonomy-panel" } })
export class LibraryTaxonomyPanel {
  readonly library = inject(LibraryService);
  readonly kinds = LIBRARY_KINDS;
  total(): number { return sumCounts(this.library.summary().assets); }
  unfiled(): number { return sumCounts(this.library.summary().unfiled); }
  count(kind: LibraryKind): number { return this.library.summary().unfiled[kind]; }
}
