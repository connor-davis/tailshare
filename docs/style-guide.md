# Code style

Short rules for Go and TypeScript in Tailshare. Write for a junior developer who
opens the file for the first time. `task check` tests the rules a tool can
see; review checks the rest.

## Spacing

- Put a blank line between steps: read, check, change, save, answer.
- In a function over 10 lines, no run of more than 6 lines goes without a
  blank line or a comment.

## Calls and line length

- Go: put a call on one line if it fits in 100 characters. If it doesn't,
  put one argument per line. Don't reformat old code just for this.
- TypeScript: Prettier decides line breaks (80 characters), using the workspace
  `web/prettier.config.js`. Run it on every file you touch. One statement per
  line, one JSX element per line once it wraps.
- Never squeeze code onto one line to stay under the 900-line limit. Split
  the file by job instead.

```go
// Good: fits on one line.
if err := json.Unmarshal(body, &in); err != nil {
	return err
}
```

## Comments

- Say why, in plain words. The code already says what.
- Every exported top-level Go name (type, func, method, const, var) gets a doc
  comment that starts with its name. A struct field gets one only when its name
  and type don't say it all: units, an empty or zero meaning, a limit, or a wire
  quirk. `tests/style_test.go` checks top-level names only, on purpose.
- Every exported TypeScript name gets a TSDoc comment (`/** ... */`).
  An unexported helper whose name explains itself needs none.
- A decision id (`D-003`) may follow the why as a pointer. It never stands
  in for it: `// Sellers can't buy their own stock (D-003).` is fine;
  `// D-003` is not.
- A deliberate corner cut gets a `ponytail:` comment that names the limit
  and the way up.

## Names

- Whole words that say what a thing holds or does: `reserveStock`, not `rs`.
- One-letter names only for `i`, `t`, `c`, plus `ctx`, `err` and `db`.

## Files

- No file over 900 lines, Go or TypeScript. Generated files don't count.
- Split by job (`transfer_resume.go`, `transfer_queue.go`), not by letter
  or size.

## Errors

- Anything a user can cause returns an error whose message is a sentence
  fit for the screen. Plain `errors.New` is for bugs.
- Never show a raw Go error string on screen; map it to a plain sentence.

## Web app

- Reuse the shared components and the owners listed in
  [code-map.md](code-map.md) before making a new piece.
- Pages are TanStack Router file routes in `src/routes/` (the router plugin
  builds `routeTree.gen.ts`). No `pages/` folder. A page's own pieces sit
  next to it in a `-components/` folder, which the router skips.
- Plain words on screen. If a non-coder wouldn't know the word, use another.
- Every page has a loading, empty and error state, and works in light and
  dark.

## Say no to

- An abstraction with one caller.
- A dependency for something a few lines can do.
- A helper file for one helper.

## What `task check` tests

| Rule                      | Tool                                     |
| ------------------------- | ---------------------------------------- |
| Go format                 | `gofmt` in `task vet`                    |
| Go mistakes and dead code | `go vet` and `staticcheck` in `task vet` |
| Doc comments, file size   | `tests/style_test.go`                    |
| TypeScript types          | `tsc -b` in `task lint:web`              |
| TypeScript lint           | ESLint in `task lint:web`                |

## Adding a string

Add renderer text to `web/apps/desktop/src/renderer/src/i18n/en.ts` with a semantic
key for its surface and purpose. In a React component, get `t` from `useT()`
(`i18n/provider.tsx`) so settings changes rerender the text. Outside React, import
`t` from `i18n/index.ts`. Pass named parameters for complete sentences; do not
join translated grammar or build singular/plural suffixes. A plural entry supplies
every category returned by `Intl.PluralRules(locale)` and receives a numeric
`count`; Intl selects the category. Arabic needs `zero`, `one`, `two`, `few`,
`many` and `other`; French and Spanish also have a `many` form.
The English source infers required parameter names and types.

Main uses its separate `src/main/i18n/en.ts` catalog and `t` from `main/i18n`; it
never imports renderer code. Keep paths, protocol identifiers, user names and
other data outside catalogs. Format numbers, sizes, dates and relative time
through `renderer/src/lib/format.ts`. Go remains English: map stable API error
codes in `lib/api/error-message.ts`, preserving the safe English message for
unknown or coarse codes. Update each locale's separate file on both sides when
adding keys. The es/fr/de/ar catalogs were machine-drafted and need a native
speaker check before we claim reviewed translations.

The development/test locale `en-XA` wraps and expands text by about 35%, preserving
named parameters. It is excluded from saved language preferences and the picker.
Catalog tests check exact keys, parameters and plural forms; the renderer guard
rejects literal JSX text and user-facing attributes. Pseudo-render tests cover
the home board, join form, room dialog and App settings. These catch extraction
regressions; a native speaker still needs to check grammar and tone.
