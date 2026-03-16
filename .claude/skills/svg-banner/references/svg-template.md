# SVG Banner Templates

Complete boilerplate for each layout type. All templates use inline attributes (no CSS `<style>` block) to ensure reliable PNG conversion via `rsvg-convert`, `sharp`, Inkscape, Puppeteer, etc.

## Inline Style Constants

Instead of CSS classes, apply these inline attributes directly on each element:

### Font Attributes

Shorthand references used in templates below:

| Ref | Inline attributes |
| --- | --- |
| `FONT` | `font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace"` |
| `CODE` | `FONT font-size="12"` |
| `TAB_FONT` | `FONT font-size="11" fill="#cdd6f4"` |
| `TITLE_FONT` | `FONT font-size="14"` |
| `SUBTITLE_FONT` | `FONT font-size="12"` |

### Fill Colors

Apply via `fill="..."` on `<text>` or `<tspan>` elements:

| Name | Hex | Usage |
| --- | --- | --- |
| brand | `#a78bfa` | Brand/accent text, command flags |
| dim | `#6c7086` | Muted labels, comments, `$ ` prompts |
| st (green) | `#a6e3a1` | Success checkmarks, "running" |
| tx (text) | `#cdd6f4` | Primary body text |
| op | `#9399b2` | Failure marks, operators |
| prompt | `#89b4fa` | Shell prompt `~`, links |
| warn | `#f9e2af` | Warnings, activity dots |
| fn | `#89b4fa` | Function names, paths, URLs |
| peach | `#fab387` | Status dots |

## Shared Title Bar

Every SVG uses this title bar. Replace `<HEIGHT>` with the outer rect height:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="<HEIGHT>" viewBox="0 0 1120 <HEIGHT>">

  <!-- Background -->
  <rect width="1120" height="<HEIGHT>" rx="10" ry="10" fill="#1e1e2e" />
  <rect width="1120" height="36" rx="10" ry="10" fill="#181825" />
  <rect y="26" width="1120" height="10" fill="#181825" />
  <circle cx="20" cy="18" r="6" fill="#f38ba8" />
  <circle cx="40" cy="18" r="6" fill="#f9e2af" />
  <circle cx="60" cy="18" r="6" fill="#a6e3a1" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" fill="#6c7086" x="560" y="22" text-anchor="middle"><TITLE_BAR_LABEL></text>
```

Notes:
- The `<svg>` tag must have all three: `width`, `height`, and `viewBox`
- The second `<rect>` (height 36) is the title bar background
- The third `<rect>` (y=26, height 10) fills the gap between the rounded title bar and the content area
- Traffic light circles are always at y=18, spaced 20px apart starting at x=20

## Shared Title & Subtitle

Placed below the title bar, centered:

```xml
  <!-- Title -->
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="14" fill="#a78bfa" x="560" y="62" text-anchor="middle"><TITLE></text>
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" fill="#6c7086" x="560" y="80" text-anchor="middle"><SUBTITLE></text>
```

If using ASCII art instead, use a `<g transform="translate(560, 58)">` group with multiple `<text>` lines at `text-anchor="middle"`. Each `<text>` line still needs inline `font-family`, `font-size`, and `fill`.

## Layout: Single Pane

Full-width content area below the title block. No vertical divider.

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="<HEIGHT>" viewBox="0 0 1120 <HEIGHT>">
  <!-- [shared title bar] -->
  <!-- [shared title & subtitle] -->

  <!-- Horizontal divider -->
  <line x1="16" y1="96" x2="1104" y2="96" stroke="#313244" stroke-width="1" />

  <!-- Tab label -->
  <rect x="4" y="104" width="80" height="24" rx="4" ry="4" fill="#181825" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="11" fill="#cdd6f4" x="18" y="120"><TAB_LABEL></text>

  <!-- Content lines starting at y ~148 -->
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="148">
    <tspan fill="#89b4fa">~</tspan>
    <tspan fill="#6c7086"> $ </tspan>
    <tspan fill="#cdd6f4"><COMMAND></tspan>
  </text>
  <!-- ... more content lines, incrementing y by 16-22 ... -->

  <!-- Cursor line (last line) -->
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<LAST_Y>">
    <tspan fill="#89b4fa">~</tspan>
    <tspan fill="#6c7086"> $ </tspan>
    <tspan fill="#cdd6f4">&#x2588;</tspan>
  </text>
</svg>
```

## Layout: Split Pane

Two side-by-side panels divided at x=560.

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="<HEIGHT>" viewBox="0 0 1120 <HEIGHT>">
  <!-- [shared title bar] -->
  <!-- [shared title & subtitle] -->

  <!-- Horizontal divider -->
  <line x1="16" y1="96" x2="1104" y2="96" stroke="#313244" stroke-width="1" />
  <!-- Vertical divider -->
  <line x1="560" y1="96" x2="560" y2="<BOTTOM>" stroke="#313244" stroke-width="1" />

  <!-- LEFT PANEL -->
  <rect x="4" y="104" width="<TAB_WIDTH>" height="24" rx="4" ry="4" fill="#181825" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="11" fill="#cdd6f4" x="14" y="120"><LEFT_TAB></text>

  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="152">
    <tspan fill="#89b4fa">~</tspan>
    <tspan fill="#6c7086"> $ </tspan>
    <tspan fill="#cdd6f4"><COMMAND></tspan>
  </text>
  <!-- ... left panel content ... -->

  <!-- RIGHT PANEL -->
  <rect x="564" y="104" width="<TAB_WIDTH>" height="24" rx="4" ry="4" fill="#181825" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="11" fill="#cdd6f4" x="578" y="120"><RIGHT_TAB></text>

  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="578" y="152">
    <tspan fill="#89b4fa">~</tspan>
    <tspan fill="#6c7086"> $ </tspan>
    <tspan fill="#cdd6f4"><COMMAND></tspan>
  </text>
  <!-- ... right panel content ... -->
</svg>
```

Key coordinates for split pane:
- Left panel: `x="18"` for content, `x="4"` for tab rect, `x="14"` for tab text
- Right panel: `x="578"` for content, `x="564"` for tab rect, `x="578"` for tab text
- Vertical divider: `x1="560"`, running from horizontal divider y to near bottom

## Layout: Split Pane + Bottom Pane

Two side-by-side panels with a shared bottom CLI bar.

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="<HEIGHT>" viewBox="0 0 1120 <HEIGHT>">
  <!-- [shared title bar] -->
  <!-- [shared title & subtitle] -->

  <!-- Horizontal divider (below title) -->
  <line x1="16" y1="96" x2="1104" y2="96" stroke="#313244" stroke-width="1" />
  <!-- Vertical divider (between left/right panels, stops at bottom pane) -->
  <line x1="560" y1="96" x2="560" y2="<BOTTOM_PANE_Y>" stroke="#313244" stroke-width="1" />

  <!-- LEFT PANEL -->
  <rect x="4" y="104" width="<TAB_WIDTH>" height="24" rx="4" ry="4" fill="#181825" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="11" fill="#cdd6f4" x="14" y="120"><LEFT_TAB></text>

  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="152">
    <!-- ... left panel content ... -->
  </text>

  <!-- RIGHT PANEL -->
  <rect x="564" y="104" width="<TAB_WIDTH>" height="24" rx="4" ry="4" fill="#181825" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="11" fill="#cdd6f4" x="578" y="120"><RIGHT_TAB></text>

  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="578" y="152">
    <!-- ... right panel content ... -->
  </text>

  <!-- BOTTOM PANE DIVIDER -->
  <line x1="16" y1="<BOTTOM_PANE_Y>" x2="1104" y2="<BOTTOM_PANE_Y>" stroke="#313244" stroke-width="1" />

  <!-- Bottom pane tab -->
  <rect x="4" y="<BOTTOM_PANE_Y + 8>" width="80" height="24" rx="4" ry="4" fill="#181825" />
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="11" fill="#cdd6f4" x="18" y="<BOTTOM_PANE_Y + 24>"><BOTTOM_TAB></text>

  <!-- Bottom pane content (full width) -->
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<BOTTOM_PANE_Y + 48>">
    <tspan fill="#89b4fa">~</tspan>
    <tspan fill="#6c7086"> $ </tspan>
    <tspan fill="#cdd6f4"><COMMAND></tspan>
  </text>
  <!-- ... more bottom pane lines ... -->

  <!-- Cursor line -->
  <text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<LAST_Y>">
    <tspan fill="#89b4fa">~</tspan>
    <tspan fill="#6c7086"> $ </tspan>
    <tspan fill="#cdd6f4">&#x2588;</tspan>
  </text>
</svg>
```

Key coordinates for bottom pane:
- `<BOTTOM_PANE_Y>`: The y-coordinate where the bottom horizontal divider sits (typically after the tallest panel content ends, e.g. `420`-`460`)
- Bottom pane content uses full width: `x="18"` (same as left panel)
- The vertical divider between left/right panels stops at `<BOTTOM_PANE_Y>`, not at the SVG bottom

## Content Patterns

All patterns use inline attributes. The `font-family` and `font-size` are inherited from the parent `<text>` element, so `<tspan>` only needs `fill`.

### CLI Output Line (success)

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<Y>" xml:space="preserve"><tspan fill="#a6e3a1">  &#x2713;</tspan><tspan fill="#cdd6f4"> <message></tspan></text>
```

### CLI Output Line (warning)

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<Y>" xml:space="preserve"><tspan fill="#f9e2af">  &#x26A0;</tspan><tspan fill="#cdd6f4"> <message></tspan></text>
```

### CLI Output Line (failure)

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<Y>"><tspan fill="#9399b2">  &#x2717;</tspan><tspan fill="#cdd6f4"> <message></tspan></text>
```

### Status Line

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<Y>"><tspan fill="#fab387">  &#x25CF;</tspan><tspan fill="#cdd6f4"> <label> </tspan><tspan fill="#a6e3a1">running</tspan><tspan fill="#6c7086"> (<detail>)</tspan></text>
```

### Dim Commentary

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" fill="#6c7086" x="18" y="<Y>">  <message></text>
```

### Shell Prompt with Command

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<Y>"><tspan fill="#89b4fa">~</tspan><tspan fill="#6c7086"> $ </tspan><tspan fill="#cdd6f4"><command></tspan><tspan fill="#a78bfa"> <flag></tspan></text>
```

### Key-Value Metadata

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="18" y="<Y>" xml:space="preserve"><tspan fill="#6c7086">    <key>: </tspan><tspan fill="#cdd6f4"><value></tspan></text>
```

### Tool Activity Dot (Claude Code style)

```xml
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" x="578" y="<Y>"><tspan fill="#f9e2af">&#x25CF;</tspan><tspan fill="#cdd6f4"> <ToolName></tspan><tspan fill="#6c7086">(<argument>)</tspan></text>
```

### Input Box (bottom of a panel)

```xml
<line x1="<X1>" y1="<Y>" x2="<X2>" y2="<Y>" stroke="#45475a" stroke-width="1" />
<text font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace" font-size="12" fill="#cdd6f4" x="<X_TEXT>" y="<Y + 16>">&gt; &#x2588;</text>
<line x1="<X1>" y1="<Y + 24>" x2="<X2>" y2="<Y + 24>" stroke="#45475a" stroke-width="1" />
```

## XML Entity Reference

| Character | Entity | Usage |
| --- | --- | --- |
| Checkmark | `&#x2713;` | Success indicators |
| Block cursor | `&#x2588;` | Active cursor |
| Filled circle | `&#x25CF;` | Status/activity dots |
| Right arrow | `&#x2192;` | "Go to" indicators |
| Warning | `&#x26A0;` | Warning indicators |
| Ballot X | `&#x2717;` | Failure indicators |

## Tab Width Calculation

Tab widths are calculated based on the label length. Approximate at ~8px per character + 16px padding:

| Label | Characters | Width |
| --- | --- | --- |
| "terminal" | 8 | 80 |
| "remote" | 6 | 80 |
| "containerized" | 13 | 110 |
| "claude code" | 11 | 100 |
