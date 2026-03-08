---
paths:
  - "scripts/**/*.ts"
---

# TypeScript Rules

These rules are enforced by OXLint and must be followed in all TypeScript files. For full details on each rule, see the linked standard.

## Functional programming

> Full standard: [Coding Style](../../../docs/contributing/standards/typescript/coding-style.md) | [Design Patterns](../../../docs/contributing/standards/typescript/design-patterns.md)

- **No `let`** — use `const` only. No reassignment, no mutation.
- **No loops** (`for`, `while`, `do...while`, `for...in`, `for...of`) — use `map`, `filter`, `reduce`, `flatMap`, etc. Prefer `es-toolkit` utilities. See [Utilities](../../../docs/contributing/standards/typescript/utilities.md).
- **No classes** — use plain objects, closures, and factory functions. See [Design Patterns](../../../docs/contributing/standards/typescript/design-patterns.md).
- **No `this`** — never reference `this`.
- **No `throw`** — no throw statements or throw expressions. Return errors as values. See [Errors](../../../docs/contributing/standards/typescript/errors.md).
- **No IIFEs** — no immediately invoked function expressions. Extract into a named function and call it.
- **No expression statements** — every expression must be used (assigned, returned, or passed). Config files (`.config.ts`) are exempt.
- **Immutable data** — no mutating objects or arrays after creation. See [State](../../../docs/contributing/standards/typescript/state.md). Config files are exempt.
- **Prefer tacit (point-free)** — e.g. `arr.filter(isEven)` not `arr.filter((x) => isEven(x))`.
- **Functional parameters** — functions must declare explicit parameters (no `arguments`, no rest-only patterns). See [Functions](../../../docs/contributing/standards/typescript/functions.md).

## TypeScript strictness

> Full standard: [Types](../../../docs/contributing/standards/typescript/types.md) | [Conditionals](../../../docs/contributing/standards/typescript/conditionals.md)

- **No `any`** — use `unknown`, generics, or proper types. See [Types](../../../docs/contributing/standards/typescript/types.md).
- **No non-null assertions** (`!`) — use explicit null checks.
- **No optional chaining** (`?.`) — use explicit `if`/`else` or pattern matching. See [Conditionals](../../../docs/contributing/standards/typescript/conditionals.md).
- **No ternaries** — use `if`/`else` or `match` expressions. See [Conditionals](../../../docs/contributing/standards/typescript/conditionals.md).
- **ESM only** with `verbatimModuleSyntax` — use `import type` for type-only imports.

## General

- **No `eval`**, `new Function()`, or implied eval.
- **No `var`** — use `const`.
- **No param reassignment** — parameters are immutable.
- **No bitwise operators**, `++`/`--`, `void`, `with`, `continue`, or multi-assign.
- **No circular imports**, self-imports, or duplicate imports.
- **Prefer `node:` protocol** for Node.js builtins (e.g. `import fs from 'node:fs'`).
- **Use `es-toolkit`** over hand-rolling utility functions. See [Utilities](../../../docs/contributing/standards/typescript/utilities.md).

## File structure

> Full standard: [Coding Style](../../../docs/contributing/standards/typescript/coding-style.md) | [Naming](../../../docs/contributing/standards/typescript/naming.md)

Every source file follows this order:

1. **Imports** — node builtins, blank line, external packages, blank line, internal (farthest-to-closest, alphabetical). Top-level `import type`, no inline type specifiers.
2. **Module-level constants**
3. **Exported functions** — public API first, each with full JSDoc. See [Functions](../../../docs/contributing/standards/typescript/functions.md).
4. **Section separator** (`// ---------------------------------------------------------------------------`)
5. **Private helpers** — non-exported functions, each with JSDoc including `@private`

## Exports

- **Inline exports only** — use `export` directly on declarations (`export function`, `export interface`, `export const`). Never batch-export local declarations with `export { foo, bar }`.
- **Re-exports allowed** — barrel/index files may use `export { foo } from './bar.js'` and `export type { Baz } from './baz.js'`.

## JSDoc

> Full standard: [Functions](../../../docs/contributing/standards/typescript/functions.md)

- **All functions** require JSDoc — exported and non-exported.
- **Non-exported functions** must include the `@private` tag.
- **Test files** are exempt.

## Formatting (OXFmt)

- 100-char line width, 2-space indent, semicolons, single quotes, trailing commas
- Import sorting: builtin > external > internal > parent/sibling/index
