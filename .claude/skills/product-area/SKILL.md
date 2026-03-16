---
name: Product Area
description: This skill should be used when the user asks to "add a product area", "create a product area", "new product area", "add area to docs", "create area page", or mentions adding a new area to docs/areas/. Creates the area markdown document with SVG banner and registers the area in project configuration if it does not already exist.
---

# Product Area Creation

Create new product-area documents in `docs/areas/` with an SVG banner, shields.io badge, and project configuration registration. Each product area represents a top-level category of product functionality (e.g., Workspaces, Coding Standards, Developer Tools).

## Workflow

### Step 1: Load Existing Product Areas

Read `scripts/conf/project.json` and extract the `Product Area` field options to get the current list of registered areas. Also read `scripts/lib/product-area-colors.ts` to get the `PRODUCT_AREA_COLORS` map and `PRODUCT_AREAS` record.

### Step 2: Gather Information

Collect the following from the user:

| Field | Required | Notes |
| --- | --- | --- |
| Area Title | Yes | Human-readable name (e.g., "Workspaces") |
| Emoji | Yes | Single emoji for the area identifier |
| Description | Yes | One-sentence description of the area |
| Color | Yes | One of the `PRODUCT_AREA_COLORS` keys (BLUE, CYAN, PURPLE, GREEN, ORANGE, PINK, GRAY, YELLOW, RED) |
| Overview | Yes | 1-2 paragraphs for the Overview section |
| Features | Recommended | Feature list, optionally grouped by category |
| FAQ | Optional | Question-and-answer pairs |

Ask the user for any missing fields. Present the available colors from `PRODUCT_AREA_COLORS` as options.

### Step 3: Check if Area Exists in Project Config

Derive the area identifier as `<emoji> <kebab-case-label>` (e.g., `🔧 agent-setup`). Search the `Product Area` options in `scripts/conf/project.json` for a match.

- If the area already exists, skip to Step 5
- If the area does not exist, proceed to Step 4

### Step 4: Register the Product Area

When the area is new, update three files:

**4a. Update `scripts/conf/project.json`**

Add a new entry to the `fields[].options` array for the `Product Area` field:

```json
{
  "name": "<emoji> <kebab-case-label>",
  "description": "<description>",
  "color": "<COLOR_NAME>"
}
```

**4b. Update `scripts/lib/product-area-colors.ts`**

Add a new entry to the `PRODUCT_AREAS` record:

```typescript
"<emoji> <kebab-case-label>": {
  name: "<emoji> <kebab-case-label>",
  emoji: "<emoji>",
  label: "<Human Label>",
  color: PRODUCT_AREA_COLORS.<COLOR_NAME>,
},
```

**4c. Run lint and format**

After editing TypeScript files, run `pnpm lint:fix` and `pnpm format` to ensure consistency.

### Step 5: Create the SVG Banner

Use the **SVG Banner** skill to create the banner SVG at `docs/areas/<area-name>.svg`. The banner should:

- Use a single-pane or split-pane layout appropriate to the area content
- Include the area title and a short subtitle in the title bar
- Show representative CLI output or feature highlights as panel content
- Follow the Catppuccin Mocha theme and inline-attribute conventions from the SVG Banner skill

Reference `docs/areas/workspaces.svg` as an example of a completed area banner.

### Step 6: Create the Area Document

Write the markdown file to `docs/areas/<area-name>.md` using the template in `references/area-template.md`. Include:

- Centered `<div align="center">` block containing the SVG banner, H1 title, and shields.io product-area badge (color and label from Step 2/4) — all grouped together under the banner
- Overview section (required)
- Features section with content from Step 2
- FAQ section if provided
- Any additional sections the user requests

### Step 7: Confirm

Display a summary of all changes:

- Area document path (`docs/areas/<area-name>.md`)
- SVG banner path (`docs/areas/<area-name>.svg`)
- Whether project config was updated (new area) or already existed
- Product area badge preview

## File Locations

| File | Purpose |
| --- | --- |
| `docs/areas/<name>.md` | Product area document |
| `docs/areas/<name>.svg` | SVG banner asset |
| `scripts/conf/project.json` | Product area registration |
| `scripts/lib/product-area-colors.ts` | Product area color/label mapping |

## Additional Resources

### Reference Files

- **`references/area-template.md`** — Complete markdown template with badge format and section guidelines

### Examples

Working product areas in the repository:

- **`docs/areas/workspaces.md`** — Full product area document with all sections
- **`docs/areas/workspaces.svg`** — Split pane SVG banner example
