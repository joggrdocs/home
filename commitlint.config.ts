import conventions from "./commit-conventions.json" with { type: "json" };

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [2, "always", conventions.types],
    "scope-enum": [2, "always", conventions.scopes],
    "scope-case": [2, "always", "kebab-case"],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 72],
    "header-max-length": [2, "always", 100],
  },
};
