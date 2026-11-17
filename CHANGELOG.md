# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.22.21] - 2026-11-17

### Changed
- Every settings section now behaves like **All**: a tweak with sub-items shows its expand arrow and starts folded, and the open or closed state is shared across **All**, **Tweaks**, **New**, **On** and **Off**. **Tweaks** keeps each tweak's sub-items attached so they can be opened from there too.

## [1.22.20] - 2026-11-17

### Fixed
- The expand arrow is back in the New, On and Off views. Those views still open every group so the matching rows show, but each group can now be folded away and opened again, and typing a search reopens whatever was folded. Folding in a filtered view does not change what the All list shows.

## [1.22.19] - 2026-11-17

### Changed
- Only the switch toggles a tweak now. Clicking a row's title or description does nothing, and rows no longer highlight on hover, so a stray click cannot flip a setting. The switch itself carries a slightly larger click area and its own keyboard focus.

## [1.22.18] - 2026-11-17

### Fixed
- The settings panel has no minimum height any more, so an empty search result closes up to its message instead of leaving a block of space below it.

## [1.22.17] - 2026-11-17

### Changed
- The settings panel now sizes to whatever the current filter shows instead of always opening at full height, and only the list scrolls when there are more tweaks than fit. A two-row filter no longer leaves half the panel empty.
- In light theme the tweak cards are near-white instead of mid grey, so they read as cards on the dialog rather than as blocks of grey.

## [1.22.16] - 2026-11-17

### Fixed
- The new-item star settles halfway between its last two heights.

## [1.22.15] - 2026-11-17

### Fixed
- The new-item star sits a couple of pixels higher, so it reads level with the title beside it.

## [1.22.14] - 2026-11-17

### Fixed
- The expand arrow sits a couple of pixels higher, so it reads level with the row title instead of slightly under it.

## [1.22.13] - 2026-11-17

### Fixed
- Settings cards no longer carry an outline: the card surface alone separates them, and a tweak's sub-items are split off by a soft inset line instead of a full-width border.
- The expand arrow now sits dead centre with its row title instead of a couple of pixels low.

## [1.22.12] - 2026-11-17

### Changed
- Settings rows are grouped into one card per tweak. The switch sits at the card's top right, the expand arrow sits beside the title, and a tweak's sub-items stay inside its own card. Every switch still lands on the same column, and long descriptions no longer change how tall a row's neighbours are.

## [1.22.11] - 2026-11-17

### Changed
- Settings rows now share one fixed layout: every row is the same height and its switch sits on the title line, so the switches form a single column whether a description runs one line or two. The expand arrow moved into a reserved right-hand gutter, so it no longer nudges the switch sideways, and titles are a touch heavier than their descriptions.

## [1.22.10] - 2026-11-17

### Fixed
- The new-item star settles halfway between its last two positions.

## [1.22.9] - 2026-11-17

### Fixed
- The new-item star drops a few pixels closer to the row's icon centre.

## [1.22.8] - 2026-11-17

### Fixed
- The new-item star is anchored to the row's vertical centre instead of a fixed offset from the top, so it lines up beside the icon on every row, whether the description wraps to one line or two.

## [1.22.7] - 2026-11-17

### Fixed
- The new-item star drops closer to the row's icon center.

## [1.22.6] - 2026-11-17

### Fixed
- The new-item star sits lower again, between the title and the row icon, so it reads level with the row instead of floating above it.

## [1.22.5] - 2026-11-17

### Fixed
- The new-item star now sits level with the row title instead of hanging down toward the description.

## [1.22.4] - 2026-11-17

### Added
- Three more settings filters next to **All** and **Tweaks**: **New** lists only the rows added in the last two releases, **On** lists what is currently active, and **Off** lists what is switched off. Groups in those views open automatically and hide their expand arrow, so every match is visible at once.

## [1.22.3] - 2026-11-17

### Fixed
- The new-item star sits in the row's left padding instead of the title line, so starred rows keep the same title column as every other row.

## [1.22.2] - 2026-11-17

### Added
- A yellow star marks settings rows added in the current or previous release. It sits left of the title and covers the **Arrow keys in search and popup** row and the **Card names: use the name you set** row. Items are marked with the version they shipped in, so the star clears itself as versions move on.

### Changed
- The settings list keeps its earlier layout. The grouped-row redesign from 1.22.1 is dropped.

## [1.22.0] - 2026-11-17

### Added
- A new **Card names: use the name you set** row in settings (`T`). Home Assistant 2026.11 builds card titles from parts, so an entity you renamed shows as the device name followed by your name, such as "Extra Speaker Desk Speaker" for an entity called "Desk Speaker". With this on, cards show just the name you typed. Cards with a name of their own keep it, and the switch applies immediately without a reload.

## [1.21.0] - 2026-11-17

### Added
- Quick search and the automation or script entity popup answer to the arrow keys. Left arrow deletes, right arrow opens it in the editor, and deleting still asks for confirmation. In quick search a small hint under the results shows both keys while an automation or script row is highlighted.
- A new **Arrow keys in search and popup** row in settings (`T`) turns the arrow shortcuts off on their own, and they also follow the existing Edit and Delete switches. It sits at the top level of the panel rather than inside the context menu group.
- Settings rows that have child toggles start collapsed, open when you switch their tweak on, and have a chevron to open or close them by hand. Searching still shows every matching row.

## [1.19.1] - 2026-11-16

### Added
- Right-click (or long-press) inside an automation or script's entity popup now opens the same Edit and Delete menu. It works on dashboards and configuration pages, including while the popup's overflow menu is open.

## [1.19.0] - 2026-11-10

First public release.

### Added
- Quick search (`E` / `Ctrl+K`) now has the same right-click menu as dashboards and configuration tables. Right-click (or long-press) an automation or script result to edit or delete it without leaving the results. Dismissing the menu keeps the search open. It shares the Automation + script context menu toggle in settings (`T`).

## [1.18.28] - 2026-11-10

### Fixed
- Previewing an older script version and saving it no longer fails with `Message malformed: not a valid option at 'id'`. A script's ID is its key in `scripts.yaml`, not a config field, so the preview no longer injects one.

## [1.18.27] - 2026-11-10

### Fixed
- The version history popup no longer scrolls to the bottom while the background scan is still adding rows. It stays at the top unless you were already reading the bottom of a scrollable list.

## [1.18.26] - 2026-11-10

### Changed
- The version history popup now lists only commits that changed the automation or script you are editing, matching the Version Control panel. It reuses the editor's background version scan instead of showing every commit that touched the shared YAML file.

## [1.18.25] - 2026-11-10

### Fixed
- The version history popup keeps loading older commits as you scroll. It stopped after one extra page (75 rows), so a long history looked like it only went back a few days even though the addon had months of commits.

## [1.18.24] - 2026-11-10

### Changed
- Version lists are cached in memory for 30 minutes per file state, so reopening an automation in the same page session does not re-run the full history scan. A page reload starts clean and scans again.

## [1.18.22] - 2026-11-10

### Fixed
- The editor version bar now finds the same number of versions as the Version Control panel. It compared normalized configs (ignoring key order and `id`s) and stopped as soon as the newest version was found, while the addon diffs the raw YAML and walks the whole history. Both now match, for example 54 versions for Devices Automations instead of 3.

## [1.18.21] - 2026-11-10

### Changed
- The editor version bar keeps showing `Current` (or the selected version's date) while history loads instead of flashing `Loading…`. The arrows still disable until the fetch finishes, so double clicks can't race.

## [1.18.20] - 2026-11-10

### Fixed
- Editor version navigation no longer gets stuck on Current with both arrows disabled. The scanner only looked at the newest 25 commits of `automations.yaml` / `scripts.yaml`, but every automation and script shares that file, so most of them had no change in that window. The scanner now walks the commit list in windows until it finds the newest version, loading older versions on demand when you reach the oldest one it knows about.

## [1.18.19] - 2026-11-10

### Added
- Marketplace in sidebar is now a tweak toggle. It adds a Marketplace row to the main sidebar and opens `/marketplace`, with no `panel_custom` config and no restart.

### Changed
- Context menus now use Home Assistant's exact dropdown metrics: 4px menu padding, 8px menu radius, 14px item text, 7px/14px item padding, 4px item radius, native neutral hover fill, and 24px icons with native spacing.

### Removed
- The native `panel_custom` Marketplace entry and the `marketplace-redirect.js` redirect module. Use the new toggle instead.

### Fixed
- Loading the plugin twice on HACS installs (the automatically registered Lovelace resource plus the global `extra_module_url` loader) no longer registers every listener twice. The first instance wins and the duplicate exits.
- Dragging a sidebar item no longer starts Chrome's native link drag, which fired `pointerup` and cancelled the reorder on desktop.
- The dragged sidebar item is now opaque and outlined, so the rows underneath no longer show through the lifted clone.
- Mushroom chips with a `for:` duration now appear within a second of the threshold instead of waiting for the 10-second backstop scan.

## [1.18.18] - 2026-11-07

### Changed
- Context menus now match Home Assistant's native menu styling: 8px container padding and 12px corners, full-width 40px item rows with rounded hover highlights, 24px icons, full-width separators, and no duplicate title tooltips on menu items.

## [1.18.17] - 2026-11-07

### Changed
- Version previews now collapse newly rendered rows in a microtask before paint using a mutation observer, so stepping through versions no longer shows an expand-then-collapse flash.

## [1.18.16] - 2026-11-07

### Fixed
- Previewing versions in the UI editor now preserves each row's collapsed or expanded state instead of re-rendering every row expanded.

## [1.18.15] - 2026-11-07

### Fixed
- Previewing versions in the YAML editor now calls `ha-yaml-editor.setValue()`, so the visible YAML code changes as you step through versions instead of only updating the editor's internal config.

## [1.18.14] - 2026-11-07

### Added
- Version history navigation is now available in the YAML editor view as well as the UI editor, including previewing versions and restoring on save.

## [1.18.13] - 2026-11-07

### Changed
- The Collapse all / Expand all button now shows only the larger Home Assistant tooltip instead of a native title tooltip plus the custom one.
- The version history arrows and date badge now use the same larger Home Assistant tooltips.

## [1.18.12] - 2026-11-07

### Changed
- Opening Settings no longer places the cursor in the search field automatically. Click the field when you want to search.

## [1.18.11] - 2026-11-07

### Changed
- The Version Control requirement note now sits below the tweak description, at the bottom of the toggle row.

## [1.18.10] - 2026-11-07

### Changed
- The Version Control requirement note now sits on its own line under the tweak title, above the description, instead of sharing the title line.

## [1.18.9] - 2026-11-07

### Fixed
- Settings rows now use border-box sizing, so their padding no longer makes them wider than the menu and clips the toggle switches at the right edge. The same fix covers rows inside the version history dialog.

## [1.18.8] - 2026-11-07

### Fixed
- The GitHub and Donate links now sit inside the Settings list at the end of its content instead of rendering as a fixed footer over the toggle rows.

## [1.18.7] - 2026-11-07

### Added
- Added GitHub and Donate links with icons at the bottom right of the Settings menu, in that order, matching the Time Machine footer style.

## [1.18.6] - 2026-11-07

### Changed
- The Version history tweak remains visible in Settings when the Version Control addon is not installed, and now shows an inline note next to its title: "Requires Home Assistant Version Control to work." The addon name links to its repository.

## [1.18.5] - 2026-11-07

### Fixed
- Saving a previewed version no longer leaves the old version list in place while rescanning, which caused duplicate entries and made the arrows step through the same version twice.

## [1.18.4] - 2026-11-07

### Changed
- The editor version navigation now keeps one width in every state, using the historical preview width for the current state as well, so stepping through versions no longer resizes the bar.

## [1.18.3] - 2026-11-07

### Fixed
- The editor version navigation was rendering with browser default button styling because its stylesheet was mounted in `document.head` while the bar lives inside the editor's shadow root. The styles now mount in the same shadow root as the bar, so the pill layout, arrow hit areas, and historical preview colors actually apply.

## [1.18.2] - 2026-11-07

### Changed
- Bumped the build so the loader fetches the updated version navigation styling after a page reload.

## [1.18.1] - 2026-11-07

### Changed
- Editor version navigation now matches the Home Assistant Editor addon's version bar: a wider rounded pill with full-height arrow targets at each edge, a fixed-width centered date label, and the addon's amber historical-preview treatment.

## [1.18.0] - 2026-11-07

### Added
- Native inline version navigation in automation and script editors: matches the Version Control navigation experience with arrow controls and a date/time badge. Stepping through versions updates the editor immediately in live preview mode (with Radiant Amber styling). Saving via Home Assistant's native Save action persists and restores the selected version. Clicking the date badge opens the full commit history modal with search and preview options.

## [1.17.1] - 2026-11-07

### Fixed
- Fixed Version history ingress communication and button visibility: discover the Version Control addon's `ingress_url` via `supervisor/ingress/info`, mint ingress session tokens via `supervisor/ingress/session`, and establish the `ingress_session` cookie required by Supervisor. Render the toolbar button using the native `mdi:history` SVG path and replace sticky failure cache with a self-healing 15-second retry cooldown. Also exposed `window.HATweaks.vcClient` and `window.HATweaks.editorVersionHistory` for console diagnosis.

## [1.17.0] - 2026-11-07

### Added
- Added opt-in `Version history in editors` tweak (off by default, admins only). When the Version Control addon is installed, the native automation/script editor gains a history toolbar button showing the version list (message, date, author, short hash) with search, progressive loading, and one-click restore guarded by an unsaved-changes confirm step.

## [1.16.3] - 2026-11-06

### Changed
- Inline editor title rename now updates the editor's dirty state as you type, so the Save button appears immediately instead of waiting for the field to lose focus.

## [1.16.2] - 2026-11-06

### Changed
- Inline editor title rename now places the caret at the clicked position in the name instead of at the end.

## [1.16.1] - 2026-11-06

### Changed
- Inline editor title rename now places the caret at the end of the name instead of selecting the whole name, so typing appends rather than replaces.

## [1.16.0] - 2026-11-06

### Added
- Added `Rename by clicking the title` tweak for the automation and script editors. Click the name in the editor header to edit it in place. Enter or blur commits the change, Escape cancels, and the normal Save action persists it.

## [1.15.3] - 2026-11-06

### Fixed
- Editor row context menu `Edit in YAML` now opens that row's options sidebar in YAML mode, matching the row's own overflow menu, instead of switching the whole automation/script editor to YAML.

## [1.15.2] - 2026-11-06

### Added
- Added a stable `ha-tweaks-loader.js` entry point. `frontend.extra_module_url` now points at the loader, which reads the current `ha-tweaks.js` ETag and imports that build. Deploying an update no longer requires editing `configuration.yaml` or restarting Home Assistant.

### Fixed
- Removed non-functional shortcut hints from the editor row context menu (`Copy`, `Paste`, `Cut`, and `Delete`).

## [1.15.1] - 2026-11-06

### Changed
- Settings row for `Chips: show after active for` now uses the MDI mushroom icon instead of a generic chip icon.

## [1.15.0] - 2026-11-06

### Changed
- Settings list now nests menu items under their parent tweak instead of mixing them into one flat list. Child rows appear only while their parent tweak is enabled; turning the parent off collapses/hides them, and turning it back on restores them.
- Filter chips are now `All` and `Tweaks`; the separate `Menu items` chip and separator were removed. Search still finds nested items and keeps matching parents visible.

## [1.14.3] - 2026-11-06

### Changed
- Settings popup now matches Home Assistant's quick-bar metrics: 40px top offset, content-driven height with a 620px minimum and 48px viewport reserve, 40px outlined search field, 32px filter chips, 16/12px row padding, HA scrim backdrop brightness, and clear button for non-empty searches.

## [1.14.2] - 2026-11-06

### Changed
- Settings search placeholder and accessible label now include the full running version, for example `Search Home Assistant Tweaks v1.14.2`.

## [1.14.1] - 2026-11-06

### Changed
- Settings hotkey is now plain `T` instead of `Cmd/Ctrl+Shift+M`. It matches Home Assistant's `c` / `e` shortcut guard: disabled when HA shortcuts are disabled, ignored for selected text, IME composition, auto-repeat, and editable targets such as inputs, textareas, selects, code editors and contenteditable regions.

### Added
- Settings search field is focused automatically when the popup opens, so typing starts immediately.

## [1.14.0] - 2026-11-06

### Changed
- Settings UI rewritten to match Home Assistant's quick-bar popup: rounded dark surface, outlined search field, filter chips (`All`, `Tweaks`, separator, `Menu items`), flat two-line rows with leading icons and supporting text, empty-state row, and no visible close button (Escape or tapping the backdrop closes).

### Added
- Settings search filters tweaks and menu items by name, description, context, or keyword.
- Settings filter chips limit the list to tweaks or menu items.

### Removed
- Old settings header, subtitle and floating close button were removed to match the HA popup layout.

## [1.13.5] - 2026-11-05

### Changed
- Settings header now shows the full version (`Home Assistant Tweaks v1.13.5`), matching `HATweaks.version`.

### Removed
- Context menus no longer expose menu item buttons to the keyboard tab order and no longer show the `:focus-visible` outline. They remain pointer/touch menus and are now labelled as plain button groups rather than menus.
- Settings modal controls are also out of the keyboard tab order and no longer show focus outlines. The modal is pointer/touch-driven; Escape and the X button still close it.

## [1.13.4] - 2026-11-05

### Fixed
- Context menu items (automation, editor-row, and dashboard-empty menus) now receive the same visible `:focus-visible` keyboard outline as the settings modal's close button and switches. The injected focus stylesheet is shared instead of duplicated.

## [1.13.3] - 2026-11-05

### Fixed
- Settings modal now follows dialog accessibility conventions: `aria-modal` + `aria-labelledby`, focus moves into the dialog on open (the close button), Tab/Shift+Tab cycle stays inside it, and focus returns to the element that opened it on close. Added a visible close (X) button, and a visible `:focus-visible` outline for the close button and all toggle switches. Toggling a switch no longer drops keyboard focus when the list re-renders.

## [1.13.2] - 2026-11-05

### Changed
- Settings subtitle shortened to "Applies immediately and syncs across devices."

## [1.13.1] - 2026-11-05

### Changed
- Settings header now reads `Home Assistant Tweaks vX.Y` (major.minor, no patch) instead of `HA Tweaks vX.Y.Z`.
- Settings subtitle now states that toggles sync with the Home Assistant user across devices, instead of the misleading "per browser".

## [1.13.0] - 2026-11-05

### Added
- Drag-to-reorder sidebar tweak (`sidebar-drag`): hold and drag panel items to rearrange them. Writes to Home Assistant's own sidebar user data (`panelOrder` / `hiddenPanels`), so the order syncs per user and stays in step with Edit sidebar. Mouse drags lift on movement; touch lifts after a short hold. Delegated pointer handlers only, no observers or idle timers.

## [1.12.0] - 2026-11-05

### Changed
- Fresh installs now default all tweaks and menu items to off (opt-in); existing saved toggles are untouched.

## [1.11.0] - 2026-11-05

### Added
- Native Marketplace sidebar entry via `panel_custom` + `marketplace-redirect.js` (visible in the sidebar and Edit sidebar, synced across devices, admins only).

### Removed
- Experimental `sidebar-marketplace` DOM-injection tweak from `ha-tweaks.js` (superseded by the native panel approach).

## [1.10.0] - 2026-11-05

### Added
- Marketplace entry in the sidebar (`sidebar-marketplace`, enabled by default, admins only) resolving the HACS/Marketplace panel URL with fallback to `/config/marketplace`, cloned native sidebar styling, in-place navigation, and active highlighting.

## [1.9.0] - 2026-11-05

### Added
- Seamless migration path for existing settings stored under legacy storage keys (`ha_mods_*`).
- Public `HATweaks` object on `window` providing status and programmatic controls.

### Changed
- Rebranded project from **HA Mods** to **Home Assistant Tweaks** (`ha-tweaks.js`, `HA_TWEAKS_VERSION`).
- Updated localStorage and user-data state keys to `ha_tweaks_*`.
- Updated data attribute prefixes on DOM elements to `data-ha-tweaks-*`.

### Deprecated
- `window.HAMods` is deprecated in favor of `window.HATweaks` (maintained as backward-compatible alias).

## [1.8.2] - 2026-10-30

### Added
- Native paste action support across editor row context menu, keyboard shortcuts, and native event handlers with collapse state inheritance.

### Fixed
- Fixed newly duplicated or pasted rows inadvertently appearing expanded in sidebar mode (`optionsInSidebar`).
- Removed conflicting `toggle-collapsed` event dispatch on inner `<ha-automation-row>` during row collapse.
- Improved collapse state detection to prioritize panel state in inline mode and row state in sidebar mode.

## [1.8.1] - 2026-10-25

### Fixed
- Fixed row duplication inadvertently expanding all sibling rows and stripping triggers or conditions.
- Added fallback custom event dispatching in `_tryNative` matching Home Assistant 2026.10 row event structures.
- Added `_rowSnapshotIndex` to accurately preserve collapse states across mixed triggers, conditions, and actions.

## [1.8.0] - 2026-10-18

### Added
- Mushroom chip `for:` duration tweak (`chip-active-for`) — hides chips with a `for:` configuration until the entity holds the target state for the specified duration.

## [1.7.6] - 2026-10-10

### Fixed
- Improved deep shadow DOM traversal for nested `<ha-expansion-panel>` elements to ensure reliable snapshot and collapse restoration.

## [1.7.0] - 2026-10-01

### Added
- Editor row context menu for trigger, condition, and action rows inside automation and script editors (Duplicate, Copy, Cut, Edit in YAML/Visual, Disable/Enable, Run Action, Delete).
- Automatic row collapse on opening automation and script editors with toolbar toggle buttons.

