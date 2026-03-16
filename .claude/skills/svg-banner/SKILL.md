---
name: SVG Banner
description: This skill should be used when the user asks to "create an SVG banner", "make a terminal SVG", "generate a banner image", "create a workspace SVG", "make a split pane SVG", "design a CLI screenshot SVG", or mentions creating SVG assets for README files or documentation. Provides templates and guidance for creating Catppuccin Mocha-themed terminal-style SVG banners.
---

# SVG Banner Creation

Create terminal-style SVG banners using the Catppuccin Mocha color palette. These banners simulate a macOS terminal window and are used as visual assets in README files and documentation.

## Layout Options

Three layout types are available:

| Layout | Description | Example |
| --- | --- | --- |
| **Single pane** | One full-width content panel | Product overview, ASCII art hero |
| **Split pane** | Two side-by-side vertical panels | Comparing features, before/after |
| **Split pane + bottom** | Two vertical panels with a bottom CLI bar | Split content with shared terminal |

## PNG Compatibility

All SVGs must be convertible to PNG via tools like `rsvg-convert`, `sharp`, Inkscape, or Puppeteer. To ensure this:

- **Always set explicit `width` and `height`** on the `<svg>` element (not just `viewBox`)
- **Use inline attributes instead of CSS classes** — apply `fill`, `font-family`, and `font-size` directly on each `<text>` and `<tspan>` element. Do NOT use a `<style>` block or CSS classes, as many PNG converters ignore them
- **Use system-available monospace fonts** — the font stack `'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace` works well as a fallback chain
- **Avoid external resources** — no `<image>`, `<use>`, `xlink:href`, or external font imports

## Core Structure

Every SVG banner follows this skeleton:

1. **Outer frame** — rounded `<rect>` with `fill="#1e1e2e"` (Mocha base)
2. **Title bar** — `<rect>` with `fill="#181825"` (Mocha mantle) + three traffic-light circles
3. **Title text** — centered dim text in the title bar
4. **Content area** — title/subtitle block, then layout-specific panels
5. **Dividers** — `<line>` elements with `stroke="#313244"` (Mocha surface0)

## Color Palette (Catppuccin Mocha)

| Class | Hex | Usage |
| --- | --- | --- |
| `.brand` | `#a78bfa` | Brand/accent text, command flags |
| `.dim` | `#6c7086` | Muted labels, comments, prompts |
| `.st` | `#a6e3a1` | Success checkmarks, "running" |
| `.tx` | `#cdd6f4` | Primary body text |
| `.op` | `#9399b2` | Failure marks, operators |
| `.prompt` | `#89b4fa` | Shell prompt `~`, links |
| `.warn` | `#f9e2af` | Warnings, activity dots |
| `.fn` | `#89b4fa` | Function names, paths, URLs |
| `.peach` | `#fab387` | Status dots |

Background colors:

| Element | Hex | Catppuccin name |
| --- | --- | --- |
| Main background | `#1e1e2e` | Base |
| Title bar / tabs | `#181825` | Mantle |
| Dividers | `#313244` | Surface0 |
| Input borders | `#45475a` | Surface1 |
| Traffic light red | `#f38ba8` | Red |
| Traffic light yellow | `#f9e2af` | Yellow |
| Traffic light green | `#a6e3a1` | Green |

## Dimensions & Spacing

| Property | Value |
| --- | --- |
| Width | `1120` |
| Default height (single/split) | `510`-`520` |
| Height with bottom pane | `620`-`680` (adjust to content) |
| Corner radius | `rx="10" ry="10"` |
| Title bar height | `36` |
| Content x-padding | `18` (left panel), `578` (right panel) |
| Line spacing | `16`-`22` between text lines |
| Divider inset | `x1="16"` to `x2="1104"` |
| Vertical divider x | `560` (center) |
| Horizontal bottom divider y | Varies — placed above bottom pane |

## Building a Banner

### Step 1: Determine Layout

Ask the user which layout to use (single, split, or split + bottom) and what content belongs in each panel. Gather:

- Title bar label (centered in macOS-style bar)
- Title and subtitle (shown below title bar, above panels)
- Content for each panel (typically CLI output, code, or tool UI)
- Tab labels for each panel (e.g., "terminal", "claude code", "remote")

### Step 2: Assemble the SVG

Start from the shared boilerplate in `references/svg-template.md`. Select the appropriate layout section and populate with content.

Key rules:

- Use `xml:space="preserve"` on any `<text>` element that has leading whitespace
- Use `&#x2713;` for checkmarks, `&#x2588;` for cursor block, `&#x25CF;` for status dot, `&#x2192;` for arrow
- Apply `fill` and `font-family`/`font-size` as inline attributes on every `<text>` and `<tspan>` — never use CSS classes
- Tab labels use `<rect>` with `fill="#181825"` + `<text>` with inline font styling
- Indent continuation lines by increasing the `x` attribute (usually +8 per indent level)
- The shared monospace font stack is: `font-family="'SF Mono', 'Fira Code', 'JetBrains Mono', Consolas, monospace"`

### Step 3: Size the SVG

Calculate height based on content:

- Title bar: 36px
- Title + subtitle area: ~60px
- Horizontal divider: ~16px gap
- Each text line: ~16-22px
- Bottom pane (if used): ~80-100px
- Bottom padding: ~10px

Set `viewBox="0 0 1120 <height>"` and match the outer `<rect>` height.

### Step 4: Validate

- Confirm `<svg>` has both `width`, `height`, and `viewBox` attributes
- Confirm no `<style>` block or `class` attributes exist — all styling is inline
- Confirm all `<tspan>` tags are closed
- Confirm `xml:space="preserve"` is on lines with leading spaces
- Confirm no raw `<`, `>`, or `&` in text content (use entities)
- Confirm traffic lights are at `cx="20"`, `cx="40"`, `cx="60"`, `cy="18"`
- Confirm viewBox height matches outer rect height and the `height` attribute

## Additional Resources

### Reference Files

- **`references/svg-template.md`** — Complete SVG boilerplate for all three layouts with inline comments

### Examples

Working SVGs in the repository:

- **`.github/assets/banner.svg`** — Split pane layout (terminal + Claude Code UI)
- **`.github/assets/workspace.svg`** — Split pane layout (containerized + remote)
