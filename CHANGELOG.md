# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

