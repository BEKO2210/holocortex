# holocortex

Copyright 2026 Belkis Aslani

## What it is

A static site for a local 3D network of thoughts, tasks, links, and snippets. Notes are Markdown. The page is `index.html`, with styles in `css/app.css` and behavior in `js/app.js`. There is no bundler and no build step. The scene is drawn with [3d-force-graph](https://github.com/vasturiano/3d-force-graph) 1.77.0. Three.js r174 is the 3D library that 3d-force-graph depends on; it is not a separate interface toolkit. There is no account and no server.

## Requirements

- A current browser with WebGL. Phones, tablets, and desktop are all in scope.
- Network access the first time the page loads, so it can fetch the pinned runtime files and fonts. A later visit can work from the browser cache. There is no service worker and no offline guarantee.

## Run locally

Persistence on `file://` is not guaranteed. Serve this directory over HTTP:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`.

## Mobile

Layout is mobile-first. Under about 900px the top bar keeps the wordmark, a search field, New, and More. Touch targets are at least 44px. One finger rotates the graph, and two fingers pinch or pan. Those touches do not zoom the page. From about 900px up, the editor is the 432px panel on the right.

- The view fits the whole network into the free space below the top bar when the page loads, and again after an import or reset, unless you have already rotated or zoomed. The square button in the lower right fits it again at any time.
- The node type legend in the lower left collapses to a single row with four color dots. Tap it to open or close it. The choice is kept in `localStorage` under `holocortex.v1.legend`. The legend and the fit button are hidden while a sheet is open.
- The first tap on a node opens a short peek with the title, status, URL, tags, and the first lines of the note. Peek has Edit, and also Mark done or Reopen for a task and Open link for a link.
- The sheet has a grab handle. Drag it up to go from peek to edit, and from edit to full height. Drag it down to shrink a full sheet or to close it. A tap on the handle does the same as one step up, or toggles full height in edit mode.
- The Android back button, or a back swipe, closes the open sheet instead of leaving the page.
- While you type in the sheet on a touch device, it fills the visible area above the on-screen keyboard. Text fields use a 16px font so iOS Safari does not zoom the page on focus.
- Picking a search result closes the result list and the keyboard. Focus the search field to see the list again.
- A new node is placed next to the existing network and held in place while its sheet is open.

Safe areas use `viewport-fit=cover` and `env(safe-area-inset-*)`. The viewport sets `interactive-widget=resizes-content`, and the sheet also follows `visualViewport`, so it stays above the keyboard.

`manifest.webmanifest` and the files in `icons/` let a browser add the site to the home screen as a standalone app. There is no service worker, so this does not make the app work offline.

## GitHub Pages

`.github/workflows/pages.yml` publishes this directory with GitHub Actions when `main` is updated. In the repository settings, set Pages to deploy from GitHub Actions. There is no build command. After a successful deploy the site is [https://beko2210.github.io/holocortex/](https://beko2210.github.io/holocortex/). Asset paths are relative, so the same files work under that `/holocortex/` path and from a local static server.

## Data

Each browser origin keeps one document in `localStorage` under the key `holocortex.v1`. The document is JSON:

```json
{"version":1,"initialized":true,"nodes":[]}
```

A node has `id`, `type` (`thought`, `task`, `link`, or `snippet`), `title` (at most 200 characters), `body` (Markdown), `tags` (normalized strings), `createdAt`, and `updatedAt`. Tasks also store `status` as `open` or `done`. Links may store `url`. The app does not store positions, search text, or Three.js objects.

For a document you create in the app, `connectBy` is omitted and there is no `edges` field. A link is drawn when two different nodes share a normalized tag. Tags are trimmed, compared in lower case, and de-duplicated. One shared tag is enough. Each unordered pair is drawn once. A node is never linked to itself.

A Graphify `graph.json` file is a separate import. It is recognized when `graph.graphify_version` is set, or when `links` or `edges` is an array and a node has `label` or `source_file`, and the file is not a holocortex document (`version` is not `1`). The edge list is taken from `links`, or from `edges` when `links` is missing or is not an array. Boolean and numeric fields are also accepted as strings such as `"True"` and `"0"`. More than 800 nodes are collapsed to one thought per community. Otherwise each symbol becomes a snippet when `file_type` is `code` or `_callable` is true, and a thought otherwise. A symbol may be tagged with the file name only (the last path segment of `source_file`). The tags `graphify`, `code`, and `community` are not added. The saved document sets `connectBy` to `"edges"` and stores `edges` as pairs of holocortex ids. The graph draws only those edges. Shared tags do not add further links. Export writes `connectBy` and `edges` when the document has them. Importing that export again keeps the same ids and pairs.

Data stays in `localStorage` on this device. There is no cloud sync. Use Export for a backup named `holocortex-YYYY-MM-DD.json`. Import replaces the whole network after confirmation. Native holocortex JSON is limited to 2 MB. Graphify JSON is limited to 8 MB.

Reset writes an empty document to the same key. The ten demo nodes are created only when that key is missing, so they do not return after a reset or a reload. Other `localStorage` keys, such as the legend state, are left untouched.

## Privacy

Notes stay in this browser. The app does not upload notes or files and it does not send telemetry. The first load requests pinned files from `cdn.jsdelivr.net` (3d-force-graph 1.77.0, Marked 15.0.12, Lucide 0.468.0, and Three.js 0.174.0) and from `cdn.tailwindcss.com` (Tailwind CSS 3.4.17), plus font files from Google Fonts (Inter, JetBrains Mono, and Space Grotesk). Those hosts see the request. After that, the only navigation the app starts is Open link, and only for an `http://` or `https://` URL you choose. The CDN files are pinned by version, not by a content hash.

## Keyboard

- Ctrl or Cmd+K, and `/` when focus is not in a text field, focus search.
- Ctrl or Cmd+N creates a node.
- Ctrl or Cmd+S saves the open node and cancels the browser save dialog.
- Escape closes a confirmation, then the editor, then clears search.
- With search results open, the arrow keys move and Enter opens the highlighted result.

## Import

Import reads a JSON file from this computer. It does not merge. You confirm replacement before anything is written. Cancel leaves the current network as it is. These inputs are rejected and also leave the stored document unchanged: invalid JSON, an unsupported document version, invalid node data, a native file over 2 MB, and a Graphify file over 8 MB.

## Limitations

Marked does not sanitize Markdown. The preview is a sandboxed frame, replaced by a new frame on each update so the back button does not step through old previews. It has no scripts, no same-origin access, and the content security policy `default-src 'none'; style-src 'unsafe-inline'; img-src data:`. Raw HTML is shown as text. Remote images are not requested; the alt text is shown instead. Preview links do not navigate. This is not a complete sanitizer, and snippet text is never executed. Open link is a separate action and accepts only `http://` and `https://` URLs.

`localStorage` is per origin and can run out of space or be unavailable in private browsing. A failed write is reported. Export a backup if a write fails. A stored document that cannot be read is not replaced with the demo; import a backup or reset.

## License

Apache License, Version 2.0. The full text is in `LICENSE`.

Copyright 2026 Belkis Aslani
