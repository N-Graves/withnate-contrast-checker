# withnate-contrast-checker

Type two colours, get a pass or fail against WCAG 2.2 AA and AAA. Runs entirely in the browser — no
upload, no network requests, no storage. The whole tool is arithmetic over two numbers, so there was
never a reason for it to be anything else.

Built for [withnate.co.uk](https://withnate.co.uk) as a drop-in artefact: one IIFE, one stylesheet,
and a demo page.

## What it is for

Contrast is the accessibility rule most often got wrong by people who did check it, because every
checker shows a ratio rounded to two decimals and most then compare that rounded figure against the
threshold. The rule says **at least** the threshold, not *rounds to* it, and the gap between those
two readings is exactly wide enough to pass a colour that fails.

## What it is not

Not an audit. It answers one question about two colours; it has no idea what your page actually
renders, whether the text is really 18.66px, or whether a gradient sits behind it.

It also implements WCAG 2.x, not APCA. APCA is the perceptual model likely to land in WCAG 3, it is
better maths, and it is not what anyone is currently obliged to meet. Reporting an APCA figure as if
it were a compliance verdict would be the more sophisticated way to give someone the wrong answer.

## Licence

MIT. See [LICENSE](LICENSE).
