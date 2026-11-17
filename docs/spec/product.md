# Product

[Specification index](../spec.md)

## 0. Product

- Taktblatt shows a plan as a timeline, stages, milestones and a work table.
- The timeline can show the plan as a Gantt, a Route map or a Kanban board.
- Taktblatt is a static web app. It has no server and no authentication.
- The app keeps all data in the browser `localStorage`. It sends no data on the network.
- The app does not collect analytics or telemetry.
- The app works offline. You can install it as a PWA. A service worker caches the app files and answers from the cache first. A new build waits until you close all tabs of the old build. The new service worker does not call `skipWaiting`. When it takes control, it deletes the old cache. A page navigation without network gets the cached app shell. The app does not request any other file at run time.
- You can import a **plan** from a JSON file. You can export a plan to a JSON file.
- The printed output (print or "Save as PDF") follows the artifact design. The workspace has controls to edit the plan.
- The design artifact contains real example data. The app must not use these values.
