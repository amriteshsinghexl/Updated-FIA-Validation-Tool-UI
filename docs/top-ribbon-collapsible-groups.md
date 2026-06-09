# Top Ribbon — Collapsible Groups

**Files changed:** `client/src/components/layout/TopRibbon.tsx`

## Purpose

The top ribbon had grown long enough to scroll horizontally. Several groups
that previously rendered all of their buttons inline now collapse into a single
trigger button. Clicking the trigger pops the buttons out in a `Popover`,
shortening the ribbon while keeping every action reachable.

## Behavior

Each collapsed group shows one trigger button (icon + label + ▾ chevron).
Clicking it opens a popover containing the original buttons; clicking outside
closes it. All routes, active-state highlighting, icons, and the VA-specific
Data View behavior are preserved inside the popover.

> Note: the popovers open on **click**, not hover (Radix `Popover` default).

## Collapsed groups

| Group label | Trigger | Buttons inside the popout |
|---|---|---|
| Run | **Run** (Play icon) | Run Setup, Reset, and the green Run button |
| Input Views | **Inputs** (Database icon) | Data View, Assumptions |
| Quality Assurance | **Quality** (CheckCircle icon) | Compare, Automatic Checks |
| Governance | **Governance** (Layers icon) | Module Explorer, Data Module, Assumption Module |

The **STAT** Model Type dropdown is unchanged (it was already a dropdown).

## Layout cleanup

Removed the unused `<div className="flex-1" />` spacer that previously sat
between the ULP Engine and Governance groups. It was pushing Governance and
Developer View to the far right; they now sit directly after ULP Engine.

## Implementation notes

- Uses the existing `Popover`, `PopoverTrigger`, and `PopoverContent` imports —
  no new dependencies.
- Each trigger is a plain `<button>` styled to match the existing `NavButton`
  appearance (icon above label) and wrapped by `PopoverTrigger asChild`.
- The original button JSX was moved verbatim into the corresponding
  `PopoverContent`, so no functionality changed.
