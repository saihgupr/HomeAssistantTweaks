# Contributing a tweak

Every tweak in this project lives in one file: `ha-tweaks.js`. A tweak is a plain object with an `id`, a `name`, a `description`, and an `init()` function. The settings menu (press `T`) picks up the name and description automatically, and toggling a tweak calls `destroy()` then `init()` again, so changes apply right away with no reload.

## What makes a good tweak

- It does one thing.
- It only touches the frontend. No server restart, no YAML edits for the user.
- It cleans up after itself. Everything `init()` adds, `destroy()` removes.
- It works inside shadow DOM. Home Assistant nests most of its UI, so listen with `capture: true` and use the shared `querySelectorDeep` helpers instead of plain `querySelector`.

## Adding a tweak

1. Fork the repo and create a branch for your tweak.
2. Open `ha-tweaks.js` and copy the shape of an existing tweak, for example `AutomationContextMenuTweak` (search for `Tweak 1`):
   ```js
   const MyTweak = {
     id: 'my-tweak',              // lowercase, dashes, unique
     name: 'My tweak',            // shown in settings
     description: 'What it does, in one sentence.', // shown in settings
     defaultEnabled: true,        // false only if it needs something not everyone has (admin rights, another app)

     init: function () {
       // add listeners, buttons, menu items
     },
     destroy: function () {
       // remove everything init() added
     },
     // onNavigate: function (path) { }, // only if the tweak cares about page changes
   };
   ```
3. Register it in the list at the bottom of the file next to the other `TweakRegistry.register(...)` calls.
4. Check your syntax with `node --check ha-tweaks.js`.
5. Load it in Home Assistant and test with the tweak both on and off. Toggling must never need a reload, and turning it off must leave no trace.
6. Add a row to the Highlights section in `README.md` so people can find it, with a short GIF or screenshot if you can.
7. Add a `CHANGELOG.md` entry under a new `Unreleased` section at the top.

## Sending the pull request

- One tweak per pull request.
- Describe what it does and where you tested it (browser, Companion App, screen size if it matters).
- If your tweak only makes sense alongside another app or admin rights, say so in the PR and default it to off.

Short on ideas? `TODO.md` has a backlog of tweak requests waiting for someone to build them.
