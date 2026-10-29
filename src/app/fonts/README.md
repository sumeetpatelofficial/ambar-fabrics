# Fonts

Self-hosted so builds never depend on a third-party download and visitors' browsers make no request to
Google. All are licensed under the SIL Open Font License 1.1 (full texts alongside).

| File                                                          | Family                           | Use                                                         | Source                                |
| ------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------- | ------------------------------------- |
| `gilda-display-latin-400-normal.woff2`                        | Gilda Display (regular)          | Headings in the staff area only                             | `@fontsource/gilda-display` 5.3.0     |
| `hanken-grotesk-latin-wght-normal.woff2`                      | Hanken Grotesk (variable weight) | Interface and body                                          | `@fontsource-variable/hanken-grotesk` |
| `instrument-serif-latin-400-normal.woff2` and `-italic.woff2` | Instrument Serif                 | Headings in the shop (the italic carries the second phrase) | `@fontsource/instrument-serif`        |

Only the Latin subset is included. To add Devanagari for Hindi content, add the matching subset file
and list it in `src/app/layout.tsx`.
