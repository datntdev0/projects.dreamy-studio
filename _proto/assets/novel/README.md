# Novel prototype packages

Mock novels for the `_proto/` Novel management screens and for the `verify` fixture. Each folder is the unpacked form of a
`.dsnovel` package: `manifest.json`, `chapters/NNN.txt` and an optional `cover.png`.

| Folder | Novel | Lang | Chapters |
|---|---|---|---|
| the-lantern-keeper-of-harrowmere | The Lantern Keeper of Harrowmere | EN | 12 |
| ash-under-the-glass-sea | Ash Under the Glass Sea | EN | 6 |
| gio-muon-tren-doi-thong | Gió Muộn Trên Đồi Thông | VI | 5 |
| nhung-con-song-khong-ten | Những Con Sóng Không Tên | VI | 0 (cover only, the novel is created in the app, not imported) |

The text is original fiction written for the prototype. Chapters 1–3 of Harrowmere are the sample the translation and
knowledgebase prototypes refer to by paragraph id, so keep their paragraphs in step with `novel-data.js` (`VI` and the knowledge items).
`../../js/novel-corpus.js` (chapter titles, word counts and paragraphs the prototype reads from these packages) is regenerated
by `pnpm fixture` and `pnpm baseline` (in `verify/`). Do not edit it by hand.
