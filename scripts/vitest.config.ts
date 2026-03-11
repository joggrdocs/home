import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    root: path.resolve(import.meta.dirname, ".."),
  },
});
