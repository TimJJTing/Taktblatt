# Motion

[Specification index](../spec.md)

## 8. Motion

- Elements that come in or go out use Svelte transitions.
- The app uses `animate:flip` when the task order changes.
- Numbers and geometry use `Tween` or `Spring`: progress counts, task-line positions, the range rescale. When the range changes, the Gantt task lines, points, milestones, bands, month ticks and today line move with the same tween as the rows.
- Row and range changes move all six connector points together. A second change continues from the current position. Dots, rings and task lines stay attached. A width-only chart change applies the new routes at once, without an intermediate connector tween. This also applies during a running range or row animation. Task marks and rings use the same new geometry at once, so the ports stay attached. An unrelated recompute with the same target geometry does not restart the animation. This includes a status change.
- Durations are 150 – 300 ms, ease-out. There are two exceptions: the row flash after a jump from the Gantt is 1200 ms, and the pulse of the ready light is 900 ms.
- `src/lib/motion.ts` names two shared durations. `GEOMETRY_MOTION_MS` (240 ms) is for geometry changes in a diagram, such as rows that move on expand or collapse. `VIEW_MOTION_MS` (300 ms) is for a switch between diagrams. Durations stay within 150 – 300 ms, except the two exceptions above. Refer to ADR 19.
- All durations go through `motionDuration(ms)`. This includes CSS transitions and animations. A CSS transition that uses the default duration of 150 ms also sets its duration through `motionDuration(150)`.
- The overlay scrollbar thumbs fade and change thickness through `motionDuration(150)`. Refer to [section 5.12](workspace.md#512-scrollbars).
- When the viewer selects `prefers-reduced-motion`, the app disables motion. The row flash stays visible as a static highlight for 1200 ms. It has no animation or fade. The app then removes it in one step. The hold time is not a motion duration.
- A switch between diagrams uses the flight layer and fades of [section 5.13](diagram-views.md#513-diagram-views).
- Preview and print have no motion.
