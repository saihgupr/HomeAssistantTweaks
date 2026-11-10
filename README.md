# Home Assistant Tweaks

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=saihgupr&repository=HomeAssistantTweaks&category=plugin)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=flat&logo=ko-fi&logoColor=white)](https://ko-fi.com/saihgupr)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Small tweaks for the Home Assistant frontend. Each one changes one thing: it adds a menu where you expect it, tidies the editor, or removes a wait.

Turn them on and off by pressing `T` (or running `HATweaks.openSettings()` in the browser console). Every change applies right away.

- Automation and script context menu (right-click or long-press for Edit and Delete)
- Dashboard empty-space menu (right-click blank canvas to start something new)
- Editor row menu (right-click a trigger, condition, or action row)
- Editors open collapsed, with a Collapse All / Expand All button
- Click an editor title to rename it in place
- Version history in editors (needs the Home Assistant Version Control addon)
- Right-click a card, badge, or tile to fire its hold action right away
- Mushroom chips that wait until a state has lasted a `for:` time
- Drag sidebar items into any order
- Optional Marketplace entry in the sidebar (admins only)
- Settings sync per HA user across desktop and the Companion App

Version history steps back through earlier saves and restores on Save. It only appears when the Version Control addon is installed.

Chips with a `for:` time stay hidden until the state has actually lasted that long, with no template math.

Sidebar order saves to Home Assistant's own sidebar order, so it stays in step with Edit sidebar and syncs per user.

The Marketplace entry needs no `panel_custom` config and no restart. It can be dragged into place or toggled off at any time.

Tested on 2026.11.x. Works in the Companion App, where right-click becomes long-press. Fresh installs start with everything off, so you opt in to only what you want.

![Home Assistant Tweaks tour](assets/hero-tour.gif)

[Watch the full tour](assets/ha-tweaks-tour-v1.18.19.mp4). Full guides live in the [Wiki](https://github.com/saihgupr/HomeAssistantTweaks/wiki/Home).

## Install

1. Click the badge above, or open **Settings → Marketplace → Add from link** and paste `https://github.com/saihgupr/HomeAssistantTweaks`. On older versions, use **HACS → Custom repositories** with category **Plugin**. Then install **Home Assistant Tweaks**.
2. Add the loader to `configuration.yaml` (a dashboard resource alone does not run on `/config` pages, so this line is required):
   ```yaml
   frontend:
     extra_module_url:
       - /hacsfiles/HomeAssistantTweaks/ha-tweaks-loader.js
   ```
3. Restart Home Assistant once, then reload the page and press `T`.

The loader tracks the current file by ETag, so updates need only a page reload.

<details>
<summary><b>Manual installation (click to expand)</b></summary>

1. Copy [`ha-tweaks.js`](ha-tweaks.js) and [`ha-tweaks-loader.js`](ha-tweaks-loader.js) to `<config>/www/`.
2. Add to `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /local/ha-tweaks-loader.js
   ```
3. Restart Home Assistant once, then reload. Keep both files in the same directory.

Upgrading from v1.8.2 or earlier (shipped as HA Mods): the file was renamed to `ha-tweaks.js`. Update `extra_module_url` to the loader path above. Saved toggles carry over automatically.

</details>

## Update

Update the plugin in HACS, then reload the page. No Home Assistant restart is needed after the first setup.

If a tab still shows the old version, close other Home Assistant tabs and reload once more.

## How it works

- One small file with no dependencies and no network calls.
- It only changes pages in your browser. It does not edit automations, entities, or files.
- Toggles are stored in Home Assistant user data with a local cache, so they follow your HA user across devices.
- Each tweak is isolated. If one stops matching the page after a Home Assistant update, it steps aside and the rest keep working.
- Turning everything off returns the interface to stock.

## Disable / Uninstall

To disable, press `T` and switch everything off.

To uninstall, remove the plugin in HACS and remove the `extra_module_url` line from `configuration.yaml`, then restart once.

## Troubleshooting

If a tweak does not appear:

1. Check the repository was added under the **Plugin** category, not another type.
2. Check `extra_module_url` is under `frontend:` in `configuration.yaml`, not just a dashboard resource.
3. Reload and look for `[HA Tweaks vX] Initialized` in the developer console. `HATweaks.version` in the console shows the running version.

## FAQ

**Is it safe? What does it touch?**

It touches the frontend pages in your browser and stores toggles in Home Assistant user data. It does not edit automations, entities, or configuration files.

**Will it break when Home Assistant updates?**

Each tweak is isolated. If one stops matching the page, it steps aside and the rest keep working. Turning everything off returns the interface to stock.

**Does it work in the Companion App without a keyboard?**

Yes. Toggles sync per user, and touch gestures work: long-press for menus, hold to lift sidebar items. Without a keyboard, run `HATweaks.openSettings()` from a debug console to open settings.

**Does it slow down the frontend?**

There is no polling loop. Menus and drags respond to events, and editor folding runs once when the editor opens.

**Why does it say No UI ID?**

That entry is defined in YAML without a UI id, so Home Assistant itself cannot open it in the visual editor. Give it an `id:` in YAML to enable editing.

## Contributing

1. Fork the repository.
2. Make your changes in `ha-tweaks.js`.
3. Run syntax verification:
   ```bash
   node --check ha-tweaks.js
   ```
4. Submit a Pull Request targeting `main`.

## Related Projects

- [Home Assistant Time Machine](https://github.com/saihgupr/HomeAssistantTimeMachine): browse backups and restore individual automations, scripts, views, and packages.
- [Home Assistant Version Control](https://github.com/saihgupr/HomeAssistantVersionControl): automated backup, history tracking, and restore engine. Required for the version history tweak.

## Support

- Star this repository on GitHub.
- Open an issue on [GitHub Issues](https://github.com/saihgupr/HomeAssistantTweaks/issues) for bugs or suggestions.
- Support maintenance on [Ko-fi](https://ko-fi.com/saihgupr).

## License

This project is licensed under the [MIT License](LICENSE).
