# SenseLex Field (desktop)

The field client packages the elicitation and assessment workflow as a desktop
application for sites with little or no connectivity. The pattern is to run the
Atlas service in-process, bound to the loopback address, and to show its front
end in a desktop window, so the researcher works against a local instance and
synchronises to the central Atlas when a connection returns.

This directory holds a documented Electron main-process stub, `main.js`, that
shows the shape of that build. It is a stub because Electron is a large native
dependency that is deliberately not vendored into this zero-dependency prototype.
To turn it into a real application:

1. Add Electron as a development dependency in a separate desktop package, so the
   core service stays dependency-free.
2. Point the offline store at a file-backed implementation of the three-method
   store interface in `src/offline/client.js`, rather than the in-memory store.
3. Bundle the broad-coverage Noto fonts with the application so every target
   script renders offline.
4. Add the hardware bridge for olfactory and gustatory stimulus delivery, which a
   desktop process can drive over a serial or USB connection in a way a browser
   cannot, and validate stimulus timing against published testing standards.
5. Package per platform with electron-builder, and sign the installers.

Tauri is a lighter alternative to Electron for low-specification field hardware,
at the cost of less deterministic rendering across the operating-system web views.
The choice between them is noted in the research proposal as a design decision to
be settled early, against the timing precision each task needs.
