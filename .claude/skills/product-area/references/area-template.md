# Product Area Template

This is the reference template for product-area documents in `docs/areas/`. Adapt sections as needed per area — the Overview is required, all others are optional.

## File Structure

Each product area consists of two files in `docs/areas/`:

```
docs/areas/
├── <area-name>.md    # Product area document
└── <area-name>.svg   # SVG banner (Catppuccin Mocha terminal style)
```

The `<area-name>` is the kebab-case version of the area title (e.g., "Workspaces" becomes `workspaces`).

## Markdown Template

```markdown
<div align="center">

<img src="./<area-name>.svg" alt="<Area Title> Banner" width="100%" />

# <Area Title>

![<Product Area Label>](https://img.shields.io/badge/<Encoded Label>-<hex color>?style=flat-square)

</div>

## Overview

<1-2 paragraphs describing the product area: what it is, why it exists, and who it serves.>

## Features

### <Category Name>

- **<Feature name>** - <one-line description of the feature>
- **<Feature name>** - <one-line description of the feature>

### <Category Name>

- **<Feature name>** - <one-line description of the feature>

---

## FAQ

### <Question?>

<Answer — 1-3 paragraphs.>

### <Question?>

<Answer — 1-3 paragraphs.>
```

## Product Area Badge

Each area doc includes a shields.io badge below the H1 title. The badge color and label come from `scripts/conf/project.json` (Product Area field options) and `scripts/lib/product-area-colors.ts`.

Badge format: `![<Label>](https://img.shields.io/badge/<URL-encoded Label>-<hex color>?style=flat-square)` — hex color without the `#` prefix

Available colors from `PRODUCT_AREA_COLORS`:

| Color Name | Hex | Example Usage |
| --- | --- | --- |
| BLUE | 0969da | agent-setup |
| CYAN | 1f6feb | agent-sandbox |
| PURPLE | 8250df | coding-standards |
| GREEN | 1a7f37 | gg-workflow |
| ORANGE | d4660b | developer-tools |
| PINK | d15593 | context-integration |
| GRAY | 6e7781 | documentation |
| YELLOW | bf8700 | skills-agents |
| RED | cf222e | platform |

Use `encodeURIComponent` logic for the label in the URL (spaces become `%20`, `&` becomes `%26`, etc.).

## Section Guidelines

| Section | Required | Notes |
| --- | --- | --- |
| Banner + Title | Yes | SVG banner centered above the H1 title |
| Product Area Badge | Yes | shields.io badge matching project.json color |
| Overview | Yes | 1-2 paragraphs, no bullet lists |
| Features | Recommended | Group by category with H3 headings, or use a flat list |
| FAQ | Optional | Question-and-answer pairs addressing common concerns |
| Additional sections | Optional | Add as needed (e.g., Architecture, API, Integrations) |

## Writing Style

- Write for a technical audience familiar with developer tools
- Lead with the value proposition in the Overview
- Feature descriptions should be concise — one line per feature, bold name + dash + description
- FAQ answers should be direct and substantive, not marketing fluff
- Use present tense throughout
