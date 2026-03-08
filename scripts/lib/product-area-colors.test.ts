import { describe, it, expect } from "vitest";

import { buildProductAreaBadge, getProductAreaConfig } from "./product-area-colors.js";

describe("getProductAreaConfig", () => {
  it("should return config for a known product area", () => {
    const result = getProductAreaConfig("\uD83C\uDFD7\uFE0F platform");

    expect(result).not.toBeUndefined();
    expect(result!.label).toBe("Platform");
    expect(result!.color).toBe("cf222e");
  });

  it("should return undefined for an unknown product area", () => {
    const result = getProductAreaConfig("nonexistent-area");

    expect(result).toBeUndefined();
  });
});

describe("buildProductAreaBadge", () => {
  it("should return badge markdown for a valid product area", () => {
    const result = buildProductAreaBadge("\uD83D\uDCDA documentation");

    expect(result).toContain("![Documentation]");
    expect(result).toContain("img.shields.io/badge/Documentation-6e7781");
  });

  it("should return empty string for an unknown product area", () => {
    const result = buildProductAreaBadge("unknown-area");

    expect(result).toBe("");
  });
});
