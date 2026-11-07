# SenseLex Field (desktop)

SenseLex Field is a planned desktop build of the field client that would package
the elicitation and assessment workflow for sites with little or no connectivity.
The pattern is to run the Atlas service in-process, bound to the loopback
address, and to show its front end in a desktop window, so the researcher works
against a local instance and synchronises to the central Atlas when a connection
returns.

This directory holds `main.js`, a documented Electron main-process stub that
outlines that build. It is a stub because Electron is a large native dependency
that is not vendored into this zero-dependency prototype.

`startLocalAtlas()` in `main.js` runs the Atlas on 127.0.0.1:8799 against
`./data/field.db`. Writes need a token, taken from `SENSELEX_FIELD_TOKEN` when
that is set and otherwise generated on first run and saved to `./data/field-token`
(created with mode 0600). Both paths are relative to the working directory. Enter
that token in the 'Write token' field of the front end.

To turn the stub into a working application:

1. Add Electron as a development dependency in a separate desktop package, so the
   core service stays dependency-free.
2. Replace the in-memory store with a file-backed implementation of the
   three-method store interface in `src/offline/client.js`.
3. Bundle the broad-coverage Noto fonts with the application so every target
   script renders offline.
4. Add the hardware bridge for olfactory and gustatory stimulus delivery, which a
   desktop process can drive over a serial or USB connection without relying on
   the Web Serial and WebUSB interfaces that only some browsers provide, and
   validate stimulus timing against published testing standards.
5. Package per platform with electron-builder, and sign the installers.

Tauri is a lighter alternative to Electron for low-specification field hardware,
at the cost of less deterministic rendering across the operating-system web views.
The choice between them is a design decision to settle early, according to the
timing precision each task needs.
