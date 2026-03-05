/**
 * Maps GitHub project color names to hex codes compatible with shields.io badges.
 *
 * These hex codes match GitHub's native color palette for consistency.
 */
export const PRODUCT_AREA_COLORS: Record<string, string> = {
  BLUE: "0969da",
  CYAN: "1f6feb",
  PURPLE: "8250df",
  GREEN: "1a7f37",
  ORANGE: "d4660b",
  PINK: "d15593",
  GRAY: "6e7781",
  YELLOW: "bf8700",
  RED: "cf222e",
};

/**
 * Product area metadata with emoji, label, and color.
 */
export interface ProductAreaConfig {
  readonly name: string;
  readonly emoji: string;
  readonly label: string;
  readonly color: string;
}

/**
 * Product area configuration map.
 *
 * Derived from scripts/conf/project.json Product Area field options.
 */
export const PRODUCT_AREAS: Record<string, ProductAreaConfig> = {
  "🔧 agent-setup": {
    name: "🔧 agent-setup",
    emoji: "🔧",
    label: "Agent Setup",
    color: PRODUCT_AREA_COLORS.BLUE,
  },
  "📦 agent-sandbox": {
    name: "📦 agent-sandbox",
    emoji: "📦",
    label: "Agent Sandbox",
    color: PRODUCT_AREA_COLORS.CYAN,
  },
  "📋 coding-standards": {
    name: "📋 coding-standards",
    emoji: "📋",
    label: "Coding Standards",
    color: PRODUCT_AREA_COLORS.PURPLE,
  },
  "📏 coding-standards": {
    name: "📏 coding-standards",
    emoji: "📏",
    label: "Coding Standards",
    color: PRODUCT_AREA_COLORS.PURPLE,
  },
  "🎮 gg-workflow": {
    name: "🎮 gg-workflow",
    emoji: "🎮",
    label: "GG Workflow",
    color: PRODUCT_AREA_COLORS.GREEN,
  },
  "🛠️ developer-tools": {
    name: "🛠️ developer-tools",
    emoji: "🛠️",
    label: "Developer Tools",
    color: PRODUCT_AREA_COLORS.ORANGE,
  },
  "🔌 context-integration": {
    name: "🔌 context-integration",
    emoji: "🔌",
    label: "Context Integration",
    color: PRODUCT_AREA_COLORS.PINK,
  },
  "📚 documentation": {
    name: "📚 documentation",
    emoji: "📚",
    label: "Documentation",
    color: PRODUCT_AREA_COLORS.GRAY,
  },
  "⚡ skills-agents": {
    name: "⚡ skills-agents",
    emoji: "⚡",
    label: "Skills & Agents",
    color: PRODUCT_AREA_COLORS.YELLOW,
  },
  "🏗️ platform": {
    name: "🏗️ platform",
    emoji: "🏗️",
    label: "Platform",
    color: PRODUCT_AREA_COLORS.RED,
  },
};

/**
 * Gets product area config by name.
 *
 * @param name - Product area name (e.g., "🏗️ platform")
 * @returns Product area config or undefined if not found
 */
export const getProductAreaConfig = (name: string): ProductAreaConfig | undefined =>
  PRODUCT_AREAS[name];

/**
 * Builds a shields.io badge URL for a product area.
 *
 * @param name - Product area name
 * @returns Badge markdown or empty string if not found
 */
export const buildProductAreaBadge = (name: string): string => {
  const config = getProductAreaConfig(name);
  if (!config) {
    return "";
  }

  const encodedLabel = encodeURIComponent(config.label);
  const badgeUrl = `https://img.shields.io/badge/${encodedLabel}-${config.color}?style=flat-square`;

  return `![${config.label}](${badgeUrl})`;
};
