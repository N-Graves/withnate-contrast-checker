# withnate-contrast-checker

Type two colours, get a pass or fail against WCAG 2.2 AA and AAA. It runs entirely in the browser —
no upload, no network requests, no storage of any kind. The whole tool is arithmetic over two
numbers, so there was never a reason for it to be anything else.

Built for [withnate.co.uk](https://withnate.co.uk) as a drop-in artefact: one IIFE, one stylesheet,
and a demo page you can drive locally.

## The one that makes it different: the rounding trap

Every contrast checker shows you a ratio rounded to two decimals. Most of them then compare that
**rounded** figure against the threshold. That quietly passes colours which genuinely fail.

Two real examples, found by walking the colour space rather than invented for the README:

| Colour on white | True ratio | Displays as | Verdict |
|---|---|---|---|
| `#007eb7` | 4.498598 | **4.50** | fails AA normal text |
| `#959595` | 2.995346 | **3.00** | fails the 3:1 rule for borders and icons |

Both look like they pass. Neither does. The rule says **at least** the threshold, not *rounds to* it.

So this tool compares the unrounded value, displays the rounded one, and when the two disagree it
says so in as many words rather than showing a green tick beside a number that is lying to you.

`#007eb7` is the tool's own default, because a checker whose landing state demonstrates the problem
it exists to solve is more persuasive than a paragraph about it.

## Alpha changes the answer, so it is composited first

A semi-transparent foreground is not the colour you typed. The browser blends it into whatever sits
behind it before painting a single pixel, so measuring the declared colour measures something no
visitor ever sees. Black at `0.35` alpha on white is **2.43:1**, not 21:1 — a comfortable pass
becomes a clear fail.

Compositing is done in **sRGB encoded space** (`out = fg × a + bg × (1 − a)` on 0–255 values),
because that is where CSS does it. Doing the blend in linear light would be more physically correct
and would disagree with the browser, which makes it the wrong answer here.

## What it checks

| Requirement | Threshold | What it covers |
|---|---|---|
| AA, normal text | 4.5:1 | Anything under 24px, or under 18.66px bold. The one most rules mean. |
| AA, large text | 3:1 | 24px and up, or 18.66px and up when bold. |
| AAA, normal text | 7:1 | The enhanced level. |
| AAA, large text | 4.5:1 | The enhanced level at large sizes. |
| Interface and graphics | 3:1 | Borders, icons, focus rings, chart strokes. SC 1.4.11. |

18.66px is not a typo. WCAG defines large text as 18pt, and 18pt at the CSS reference resolution is
18.66px — a real cliff that catches people who round it to 18.

## Nearest passing colour

When a foreground fails, it suggests one that does not: the same hue and saturation, with the
lightness binary-searched toward whichever end of the scale is nearer, so the suggestion is still
recognisably the brand colour. It lands **just past** the threshold rather than well past it — for
the default it moves `#007eb7` to `#007eb6`, one step of blue, from 4.4986 to 4.51.

It returns nothing rather than guessing when no lightness of that hue can reach the target. A
suggestion you cannot use is worse than none.

## What it refuses, and what it hands to the browser

Hex (3, 4, 6 and 8 digit), `rgb()`/`rgba()` and `hsl()`/`hsla()` are parsed directly, in both the
comma and the space syntax, with `/` alpha and percentage channels. Anything else — a named colour,
`color-mix()`, `oklch()` — is handed to a throwaway canvas and read back.

The canvas fallback uses **two sentinels**: the input is assigned over black, then over white, and
accepted only if both reads agree. A canvas silently keeps its previous value for an unparseable
string, so a single read cannot tell a rejected input from a colour that happens to equal the seed.

The direct parser refuses rather than guesses: mixed comma-and-slash syntax, the wrong channel
count, `hsl()` without percentages, and any input over 64 characters. Refusing a malformed colour
outright beats returning a plausible one derived from half of it.

## Integration

The bundle mounts on any element carrying `data-cc` and bails silently if there is none, so it is
safe to load site-wide. It reads and writes these attributes:

| Attribute | Element | Role |
|---|---|---|
| `data-cc` | any | Mount point |
| `data-cc-fg` / `data-cc-bg` | `input[type=text]` | The two colours |
| `data-cc-fg-swatch` / `data-cc-bg-swatch` | `input[type=color]` | Optional pickers, kept in sync |
| `data-cc-swap` | `button` | Optional swap |
| `data-cc-ratio` | any | The headline number |
| `data-cc-note` | any | The rounding-trap callout and parse refusals |
| `data-cc-results` | `ul` | The five verdicts |
| `data-cc-preview` | any | Live sample text in the two colours |
| `data-cc-suggest` | any | The nearest passing colour |
| `data-cc-extremes` | any | Best possible ratio on white and on black |

Every one except the two text inputs is optional — a missing element is skipped, not an error. All
content is real markup in the page, so it is visible before the script runs and to anyone with
JavaScript off.

## Structured data

`demo/index.html` carries a `WebApplication` JSON-LD block. The site's `check.mjs` fails a page with
a second inline `<script>` but explicitly exempts `type="application/ld+json"`, and `seo.mjs` fails
the build on a block that will not parse — so this is the one inline script the page is allowed and
it is validated at build time. It claims no rating and no review count; there is nothing to rate yet
and a fabricated one is a manual action.

## Security posture

The site's rules are enforced by `scripts/smoke.mjs` against the built bundle, not by intention:

- **No network.** No `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or `EventSource`, and no
  external URL anywhere outside the banner comment.
- **No storage.** No `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie`. The site's
  privacy policy says nothing is stored, and this keeps that true without a policy edit.
- **No module syntax, no `require`**, so it loads as a plain `<script src>` like everything else.
- **No inline event handler attributes**, which `check.mjs` fails the build on.
- **Silent bail** proven by running the real bundle in a bare `vm` sandbox with no root element.
- **Only `.cc-` classes** in the stylesheet, so it cannot reach outside its own component.
- Nothing untrusted reaches the DOM as markup. Colours are formatted from parsed numbers, and the
  only text set from input is via `textContent`.

⚠️ The sandbox stubs `TextDecoder`, because the core builds one at module scope to decode Exif
strings. That is a gap in the harness rather than the bundle — `TextDecoder` has been a global in
every browser the site supports since 2017, so no real page could hit it.

## Testing

**53 tests**, all passing, split by what they are actually about:

- `test/colour.test.ts` (28) — parsing and formatting. Hex lengths, short-hex expansion by
  **doubling** rather than zero-padding, both `rgb()` syntaxes, percentage channels, clamping,
  `hsl()` round-trips, and the refusals above.
- `test/wcag.test.ts` (25) — the standard itself. Black on white is **exactly** 21; the luminance
  coefficients sum to exactly 1; the linearisation curve is continuous at the 0.04045 knee and
  monotonic across all 256 channel values; and the published anchors hold — `#767676` on white is
  4.5422 and passes, `#777777` is 4.4781 and fails.

The rounding-trap tests use the two real colours from the table above rather than a synthesised
ratio, and assert both halves: that `passes` is false and that `displaysAsPassing` is true. A third
test pins that a genuinely passing colour raises no warning, because a checker that cries wolf is
the same failure from the other direction.

Float comparison uses a `1e-9` epsilon — generous against the ~1e-14 error real arithmetic produces
here, tight enough that 4.4999999 still fails. Both bounds are pinned by a test.

## Built on

[`@nasdigitaluk/withnate-tool-core`](https://github.com/N-Graves/withnate-tool-core) for the DOM
helper and design tokens. The core is bundled into the artefact rather than loaded beside it, so the
site has one file to place and no load order to manage.

## Licence

MIT. See [LICENSE](LICENSE).
