---
name: Academic Logic Workbench
colors:
  surface: '#f8f9ff'
  surface-dim: '#d5dae5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eef4ff'
  surface-container: '#e9eef9'
  surface-container-high: '#e3e8f3'
  surface-container-highest: '#dde3ed'
  on-surface: '#161c24'
  on-surface-variant: '#3c4a42'
  inverse-surface: '#2b3139'
  inverse-on-surface: '#ecf1fc'
  outline: '#6c7a71'
  outline-variant: '#bbcabf'
  surface-tint: '#006c49'
  primary: '#006c49'
  on-primary: '#ffffff'
  primary-container: '#10b981'
  on-primary-container: '#00422b'
  inverse-primary: '#4edea3'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#b91a24'
  on-tertiary: '#ffffff'
  tertiary-container: '#ff7a73'
  on-tertiary-container: '#79000e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#6ffbbe'
  primary-fixed-dim: '#4edea3'
  on-primary-fixed: '#002113'
  on-primary-fixed-variant: '#005236'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#f8f9ff'
  on-background: '#161c24'
  surface-variant: '#dde3ed'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '600'
    lineHeight: 2.25rem
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
  headline-md:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
  headline-sm:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '600'
    lineHeight: 1.5rem
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.375rem
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
  label-md:
    fontFamily: Inter
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 0.875rem
    letterSpacing: 0.04em
  code-value:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1rem
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-sm: 0.5rem
  margin: 1rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system models an academic digital circuit simulation environment. Built for precision engineering, institutional coursework, and clear digital logic demonstration, the style marries utilitarian minimalism with engineering-grade instrument UI.

The interface prioritizes extreme legible state differentiation:
- **Simulation Clarity:** The canvas remains pristine and neutral so circuit wiring, bus paths, and gate labels read without visual pollution.
- **Academic Rigor:** Crisp tabular typography, disciplined monospaced readouts, and strict Cartesian alignments ensure students and engineers can debug propagation delays and truth tables immediately.
- **Instrument Framing:** Dense, dark slate tool docks frame an ultra-clean graph-paper work area, evoking physical laboratory oscilloscopes and breadboard CAD software.

## Colors

The color palette centers on electrical state distinction and academic productivity.

### Core Signals & Logic States
- **Primary (`#10b981` / Emerald High):** Represents active logic HIGH (1), powered wire traces, active clock toggles, and primary execution controls.
- **Secondary (`#1e293b` / Slate Low):** Represents grounded or inactive logic LOW (0), wire traces in ground states, and structural system headers.
- **Tertiary (`#ef4444` / Coral Alert):** Denotes contention, short-circuits, floating/high-impedance errors, simulation clock halts, and syntax exceptions in HDL consoles.
- **Neutral (`#2a3038` / Slate Instrument):** Provides the frame for dock sidebars, component palettes, property inspectors, and top application toolbars.

### Canvas & Surface Matrix
- **Canvas Base:** Pure white (`#ffffff`) for maximum contrast against colored traces, with a secondary canvas tone of `#f8fafc`.
- **Canvas Grid Dots / Rules:** Subtle `#e2e8f0` grid markers placed at exact 16px increments.
- **Inspector & Dock Surfaces:** Surface dark slate `#23272e` and docked panels `#2a3038`, with deep nav header `#1e2328`.
- **Text & Readout Tokens:** Primary text in dark surfaces is `#f1f5f9`; on light canvas panels it is `#0f172a`.

## Typography

Typography establishes an intentional division between structural platform controls and live electronic data:
- **Inter** handles high-level navigational chrome, modal dialog headers, workspace tabs, and structural hierarchy.
- **JetBrains Mono** governs all technical and operational contexts: pin identifiers, truth table matrices, clock frequencies (e.g., `100 kHz`), bus bit widths (e.g., `[7:0]`), circuit telemetry, and simulation logs.

Numbers in JetBrains Mono are strictly tabular, guaranteeing that multi-bit bus indicators and truth tables line up without micro-shifts during tick cycles.

## Layout & Spacing

The layout is built around a CAD/IDE viewport framework:

### Workbench Architecture
- **Top Bar (`#1e2328`):** Fixed 48px height with immediate project, clock speed, execution state (Run/Step/Pause), and export actions.
- **Left Dock (`#23272e`):** 240px wide collapsible gate & component tree (Plexers, Arithmetic, Memory, Sequential, I/O).
- **Center Canvas (`#ffffff`):** Infinite virtual coordinate plane displaying a 16px orthogonal dotted grid pattern.
- **Right Inspector (`#2a3038`):** 280px wide contextual panel for selected component attributes (Bit Width, Label, Delay, State).
- **Bottom Timeline / Console:** Collapsible 160px panel for digital timing diagrams and waveform analysis.

### Responsive Behaviors
- **Desktop (1200px+):** Full multi-pane arrangement (Left palette + Canvas + Right inspector).
- **Tablet (768px - 1199px):** Left dock collapses into an icon-rail (48px); right inspector switches to an overlay drawer.
- **Mobile (<768px):** Viewer-only orientation. Tool palettes convert to bottom sheets; primary interaction shifts to circuit inspection and simulation controls.

## Elevation & Depth

This system intentionally relies on **crisp structural borders** and subtle flat tonality rather than diffuse skeuomorphic dropshadows, mirroring precision laboratory CAD software:

- **Surface Layering:** Docks sit flush against the canvas perimeter. Boundaries are delimited by a 1px solid border (`#374151` on dark frames, `#e2e8f0` on light elements).
- **Canvas Overlays (Minimap, Zoom Controls, Floating Toolbars):** Elevated using a minimal shadow: `0 1px 3px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08)`.
- **Modals & Scope Dialogs:** Centered overlays use `0 8px 24px rgba(0, 0, 0, 0.35)` with an interior 1px highlight stroke (`rgba(255, 255, 255, 0.08)`) to preserve hard mechanical delineation.
- **Active Node Dragging:** Logic gates in transient drag states render with a 2px emerald outline (`#10b981`) and a 0 4px 12px drop shadow (`rgba(16, 185, 129, 0.2)`).

## Shapes

The shape system implements roundedness level `1` (Soft: 0.25rem / 4px base radius).

- **Buttons, Inputs, and Badges:** Maintain a tight `rounded-sm` (0.25rem / 4px) contour. This preserves a dense, modular geometry reminiscent of modular laboratory equipment.
- **Floating Canvases & Inspector Tiles:** Use `rounded-lg` (0.5rem / 8px) for modular dialog boxes and popouts.
- **Logic Components on Canvas:** Gate symbols (AND, OR, NOT, Flip-Flops) adhere strictly to ANSI/IEEE Std 91-1984 specifications. Rectangular integrated circuits feature sharp inner boundaries and 4px external borders.
- **Pins & Wire Junctions:** Terminals use exact circles (6px diameter) that snap onto grid intersection coordinates.

## Components

### Buttons
- **Primary / Clock Run:** Emerald green background (`#10b981`), high-contrast dark slate text (`#064e3b` or `#ffffff` depending on weight), `4px` border radius, font `Inter` 13px weight 600.
- **Secondary / Step:** Charcoal slate background (`#333a42`), border `1px solid #4b5563`, text `#f1f5f9`. Hover shifts to `#3d4650`.
- **Danger / Reset / Clear Wire:** Coral red stroke (`#ef4444`), transparent base, text `#ef4444`. Hover fills `#ef4444` with white text.

### Component Palette Chips & Gate Tiles
- Gate selectors inside side docks render as compact tiles (36px height) with light SVG logic iconography, monospaced acronyms (`NAND`, `MUX`, `D-FF`), and `#94a3b8` labels.
- Active gate insertion creates an emerald indicator line on the tile's left edge.

### Form Inputs & Attribute Fields
- **Number / Text Boxes:** Dark dock inputs employ `#1a1e23` backgrounds with 1px `#3e4752` border, `JetBrains Mono` font for all numeric literals (Bit width, Propagation Delay). Focused states produce a crisp emerald outline (`#10b981`).
- **Binary & Hex Fields:** Display fixed character widths with subtle background zero-padding indicators.

### Checkboxes & Toggle Switches
- Checkboxes use 14px boxes with a 2px border radius.
- Tri-state support: Checked (HIGH / `#10b981`), Unchecked (LOW / `#1e293b`), Indeterminate/High-Z (Floating / `#f59e0b`).

### Wires & Vector Busses
- **Single-bit wire (HIGH):** 2px stroke `#10b981`.
- **Single-bit wire (LOW):** 2px stroke `#1e293b`.
- **Contention / Error Wire:** 2px stroke `#ef4444`.
- **Multi-bit Bus (e.g., 8-bit):** 4px thick stroke `#0284c7` (Sky Blue) with numeric bit-width slash tag (`/8`).

### Inspector Cards & Accordions
- Segmented accordions inside docks have flat `#23272e` header bars, border-bottom `1px solid #333a44`, with uppercase 10px tracking labels (`PIN CONFIGURATION`, `TIMING`).