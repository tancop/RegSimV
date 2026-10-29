# AGENTS.md

SvelteKit 3 + Svelte 5 app: CPU/register simulator with assembler, microcode (uops), JIT, and a demo UI. Fully static site (`adapter-static`, `prerender = true` in `src/routes/+layout.ts`) for GitHub Pages; output in `build/`.

## Commands (pnpm only, `engine-strict=true`, Node 24)

- `pnpm dev` / `pnpm build` / `pnpm preview`
- `pnpm test` — `vitest run` (all). Single file: `pnpm vitest run src/lib/encoding.spec.ts`. `pnpm test:unit` is watch mode.
- `pnpm check` — `svelte-kit sync && svelte-check`. Currently **fails** (see gotchas).
- `pnpm lint` / `pnpm lint:fix` — `oxlint`. Formatter is `oxfmt` (`.oxfmtrc.json` has `svelte: true`); no format script, use `pnpm exec oxfmt`.
- PowerShell here: pipe to `Select-Object -First N`, not `head`.

## Structure

- `src/routes/+page.svelte` — demo UI (assemble/load/step/run). `+layout.ts` (`prerender`), `+layout.svelte`, `layout.css` (`@import "tailwindcss"` — Tailwind v4 via `@tailwindcss/vite`).
- `src/lib/`: `encoding.ts` (32-bit word: low 6b opcode, next 2b `AddressMode`, high 24b operand), `assemble.ts` (text → words), `opcodes.ts` (ordered `BUILTIN_OPCODES` definitions + `createOpcodeTable` → `OpcodeTable` with name↔index maps and index→uops array; table order = opcode number), `uops.ts` (micro-ops + `decode` dispatch on `compiledOps[opcode]`), `jit.ts` (string-codegen via `new Function` into generator functions; `compile(Operation[])` returns a fresh `CompiledOperation[]`), `simulator.ts` (`Simulator`: `Uint32Array(2048)` memory, program at 0, `dataMemoryStart = 1024`).
- Import alias: `#lib/...` → `src/lib/...` (defined in `package.json` `imports` and `tsconfig.json` `paths`). Use it in routes.
- `vite.config.ts` forces Svelte runes mode for all non-`node_modules` files; `svelte-check`/`oxlint` flag legacy patterns.
- `src/lib/data/instructions.toml` is **unused legacy docs** — source of truth is `opcodes.ts` (names already drifted: TOML `SLV`/`SRV` vs code `SLO`/`SRO`).
- `comptime.ts` plugin is wired in `vite.config.ts` but currently unused (stale import in `opcodes.ts`).

## Testing quirks

- `vite.config.ts` defines two Vitest projects: `client` (browser/Chromium via Playwright, only `src/**/*.svelte.{test,spec}`) and `server` (`node`, everything else). Single-file runs select the project automatically; Svelte component tests need Playwright browsers installed.
- `expect.requireAssertions: true` — every `it` must call `expect.assertions(n)` (see existing specs).

## Known-broken (verify before trusting)

- Operand syntax in `assemble.ts`: bare number = immediate, `[x]` = direct, `[mem x]` = indirect (bracket whitespace flexible, MEM case-insensitive). The assembler throws if the instruction has no uops for the chosen address mode; `assemble.spec.ts` covers the syntax.
- `jit.ts` `compileVariant` double-yields `BRANCHY_UOPS` (`testAcc`/`testNotAcc`/`testCf`/`testNotCf`): emits the guarded `yield` **and** an unconditional `yield` for the same op.
