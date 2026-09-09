/*! withnate-contrast-checker v0.1.0 - MIT
 * https://github.com/N-Graves/withnate-contrast-checker#readme
 * Runs entirely in the browser. No network requests, no storage.
 */
"use strict";
(() => {
  // node_modules/@nasdigitaluk/withnate-tool-core/dist/sniff.js
  var HEADER_BYTES = 64 * 1024;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/units.js
  var MM_PER_INCH = 25.4;
  var CM_PER_INCH = MM_PER_INCH / 10;

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/exif.js
  var MAX_BLOCK_BYTES = 4 * 1024 * 1024;
  var TEXT = new TextDecoder("utf-8", { fatal: false });

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/mount.js
  var getWn = () => globalThis.WN ?? null;
  var mount = (selector, init) => {
    const run = () => {
      const root = document.querySelector(selector);
      if (!root)
        return;
      const wn = getWn();
      const reduced = wn?.reduced ?? (typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : true);
      init({ root, wn, reduced });
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  };

  // node_modules/@nasdigitaluk/withnate-tool-core/dist/dom.js
  var h = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === void 0)
        continue;
      if (k === "class")
        node.className = String(v);
      else if (v === true)
        node.setAttribute(k, "");
      else
        node.setAttribute(k, String(v));
    }
    for (const c of children) {
      if (c === null || c === void 0)
        continue;
      node.append(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  };

  // src/colour.ts
  var WHITE = { r: 255, g: 255, b: 255, a: 1 };
  var BLACK = { r: 0, g: 0, b: 0, a: 1 };
  var MAX_INPUT_LENGTH = 64;
  var EPSILON = 1e-9;
  var clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  var HEX = /^#([0-9a-f]+)$/i;
  var FUNCTIONAL = /^(rgba?|hsla?)\(([^)]*)\)$/i;
  var NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;
  var PERCENT = /^[+-]?(?:\d+\.?\d*|\.\d+)%$/;
  var ANGLE = /^([+-]?(?:\d+\.?\d*|\.\d+))(deg)?$/i;
  var num = (token) => NUMBER.test(token) ? Number(token) : null;
  var percent = (token) => PERCENT.test(token) ? Number(token.slice(0, -1)) : null;
  var channel = (token) => {
    const p = percent(token);
    if (p !== null) return clamp(p / 100 * 255, 0, 255);
    const n = num(token);
    return n === null ? null : clamp(n, 0, 255);
  };
  var alpha = (token) => {
    if (token === void 0) return 1;
    const p = percent(token);
    if (p !== null) return clamp(p / 100, 0, 1);
    const n = num(token);
    return n === null ? null : clamp(n, 0, 1);
  };
  var angle = (token) => {
    const m = ANGLE.exec(token);
    if (!m) return null;
    const deg = Number(m[1]);
    return (deg % 360 + 360) % 360;
  };
  var splitArguments = (body) => {
    const slashes = body.split("/");
    if (slashes.length > 2) return null;
    const head = slashes[0] ?? "";
    const tail = slashes[1];
    const commaSeparated = head.includes(",");
    const parts = (commaSeparated ? head.split(",") : head.trim().split(/\s+/)).map((s) => s.trim()).filter((s) => s.length > 0);
    if (tail !== void 0) {
      if (commaSeparated) return null;
      return { parts, alphaToken: tail.trim() };
    }
    if (commaSeparated && parts.length === 4) {
      return { parts: parts.slice(0, 3), alphaToken: parts[3] };
    }
    return { parts, alphaToken: void 0 };
  };
  var fromHex = (digits) => {
    const expand = (s) => s.split("").map((c) => c + c).join("");
    let full;
    if (digits.length === 3 || digits.length === 4) full = expand(digits);
    else if (digits.length === 6 || digits.length === 8) full = digits;
    else return null;
    const byte = (i) => Number.parseInt(full.slice(i * 2, i * 2 + 2), 16);
    return {
      r: byte(0),
      g: byte(1),
      b: byte(2),
      a: full.length === 8 ? byte(3) / 255 : 1
    };
  };
  var hslToRgb = (hsl) => {
    const h2 = (hsl.h % 360 + 360) % 360;
    const s = clamp(hsl.s, 0, 100) / 100;
    const l = clamp(hsl.l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(h2 / 60 % 2 - 1));
    const m = l - c / 2;
    const sector = Math.floor(h2 / 60) % 6;
    const table = [
      [c, x, 0],
      [x, c, 0],
      [0, c, x],
      [0, x, c],
      [x, 0, c],
      [c, 0, x]
    ];
    const [r, g, b] = table[sector] ?? [0, 0, 0];
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255),
      a: hsl.a
    };
  };
  var rgbToHsl = (rgb) => {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    let h2 = 0;
    if (d !== 0) {
      if (max === r) h2 = (g - b) / d % 6;
      else if (max === g) h2 = (b - r) / d + 2;
      else h2 = (r - g) / d + 4;
      h2 *= 60;
      if (h2 < 0) h2 += 360;
    }
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    return { h: h2, s: s * 100, l: l * 100, a: rgb.a };
  };
  var parseColour = (input) => {
    const text = input.trim();
    if (text.length === 0 || text.length > MAX_INPUT_LENGTH) return null;
    const hex = HEX.exec(text);
    if (hex) return fromHex(hex[1]);
    const fn = FUNCTIONAL.exec(text);
    if (!fn) return null;
    const name = fn[1].toLowerCase();
    const split = splitArguments(fn[2]);
    if (!split || split.parts.length !== 3) return null;
    const a = alpha(split.alphaToken);
    if (a === null) return null;
    if (name === "rgb" || name === "rgba") {
      const parts = split.parts.map(channel);
      if (parts.some((p) => p === null)) return null;
      const [r, g, b] = parts;
      return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a };
    }
    const h2 = angle(split.parts[0]);
    const s = percent(split.parts[1]);
    const l = percent(split.parts[2]);
    if (h2 === null || s === null || l === null) return null;
    return hslToRgb({ h: h2, s, l, a });
  };
  var formatRgb = (rgb) => rgb.a >= 1 ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})` : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.round(rgb.a * 1e3) / 1e3})`;
  var formatHex = (rgb) => {
    const pair = (n) => Math.round(n).toString(16).padStart(2, "0");
    const base = `#${pair(rgb.r)}${pair(rgb.g)}${pair(rgb.b)}`;
    return rgb.a >= 1 ? base : `${base}${pair(rgb.a * 255)}`;
  };
  var compositeOver = (fg, bg) => {
    if (fg.a >= 1) return { ...fg, a: 1 };
    const blend = (f, b) => Math.round(f * fg.a + b * (1 - fg.a));
    return {
      r: blend(fg.r, bg.r),
      g: blend(fg.g, bg.g),
      b: blend(fg.b, bg.b),
      a: 1
    };
  };
  var relativeLuminance = (rgb) => {
    const linear = (v) => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * linear(rgb.r) + 0.7152 * linear(rgb.g) + 0.0722 * linear(rgb.b);
  };
  var contrastRatio = (a, b) => {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  var LARGE_TEXT_PX = 24;
  var LARGE_TEXT_BOLD_PX = 18.66;
  var REQUIREMENTS = [
    {
      id: "aa-normal",
      label: "AA, normal text",
      detail: "Anything below 24px, or below 18.66px bold. The one most rules actually mean.",
      threshold: 4.5
    },
    {
      id: "aa-large",
      label: "AA, large text",
      detail: "24px and up, or 18.66px and up when bold.",
      threshold: 3
    },
    {
      id: "aaa-normal",
      label: "AAA, normal text",
      detail: "The enhanced level. Rarely required, sometimes asked for.",
      threshold: 7
    },
    {
      id: "aaa-large",
      label: "AAA, large text",
      detail: "The enhanced level at 24px, or 18.66px bold.",
      threshold: 4.5
    },
    {
      id: "non-text",
      label: "Interface and graphics",
      detail: "Borders, icons, focus rings, chart strokes. WCAG 2.2 SC 1.4.11.",
      threshold: 3
    }
  ];
  var roundRatio = (ratio) => Math.round(ratio * 100) / 100;
  var meets = (ratio, threshold) => ratio >= threshold - EPSILON;
  var assess = (ratio) => REQUIREMENTS.map((requirement) => {
    const passes = meets(ratio, requirement.threshold);
    return {
      requirement,
      passes,
      displaysAsPassing: !passes && roundRatio(ratio) >= requirement.threshold
    };
  });
  var lightnessSearch = (source, background, threshold, towards) => {
    const at = (l) => hslToRgb({ ...source, l });
    if (!meets(contrastRatio(at(towards), background), threshold)) return null;
    let fails = source.l;
    let passes = towards;
    for (let i = 0; i < 24; i += 1) {
      const mid = (fails + passes) / 2;
      if (meets(contrastRatio(at(mid), background), threshold)) passes = mid;
      else fails = mid;
    }
    return at(passes);
  };
  var nearestPassing = (fg, bg, threshold) => {
    const opaque = compositeOver(fg, bg);
    if (meets(contrastRatio(opaque, bg), threshold)) return null;
    const source = rgbToHsl(opaque);
    const options = [0, 100].map((towards) => lightnessSearch(source, bg, threshold, towards)).filter((c) => c !== null);
    if (options.length === 0) return null;
    return options.reduce(
      (best, candidate) => Math.abs(rgbToHsl(candidate).l - source.l) < Math.abs(rgbToHsl(best).l - source.l) ? candidate : best
    );
  };

  // src/index.ts
  var el = (root, sel) => root.querySelector(sel);
  var normaliseViaCanvas = (input) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    const seen = ["#000000", "#ffffff"].map((seed) => {
      ctx.fillStyle = seed;
      ctx.fillStyle = input;
      return String(ctx.fillStyle);
    });
    return seen[0] === seen[1] ? seen[0] : null;
  };
  var resolveColour = (input) => {
    const direct = parseColour(input);
    if (direct) return direct;
    const trimmed = input.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_INPUT_LENGTH) return null;
    const normalised = normaliseViaCanvas(trimmed);
    return normalised ? parseColour(normalised) : null;
  };
  mount("[data-cc]", ({ root }) => {
    const fgInput = el(root, "[data-cc-fg]");
    const bgInput = el(root, "[data-cc-bg]");
    if (!fgInput || !bgInput) return;
    const fgSwatch = el(root, "[data-cc-fg-swatch]");
    const bgSwatch = el(root, "[data-cc-bg-swatch]");
    const ratioOut = el(root, "[data-cc-ratio]");
    const noteOut = el(root, "[data-cc-note]");
    const resultsOut = el(root, "[data-cc-results]");
    const previewOut = el(root, "[data-cc-preview]");
    const suggestOut = el(root, "[data-cc-suggest]");
    const extremesOut = el(root, "[data-cc-extremes]");
    const swap = el(root, "[data-cc-swap]");
    const state = { fg: fgInput.value || "#007eb7", bg: bgInput.value || "#ffffff" };
    fgInput.maxLength = MAX_INPUT_LENGTH;
    bgInput.maxLength = MAX_INPUT_LENGTH;
    const setInvalid = (input, invalid) => {
      input.classList.toggle("is-invalid", invalid);
      input.setAttribute("aria-invalid", String(invalid));
    };
    const renderPreview = (fg, bg) => {
      if (!previewOut) return;
      const samples = [
        [`${LARGE_TEXT_PX}px`, "Large text passes at 3:1"],
        [`${LARGE_TEXT_BOLD_PX}px bold`, "Large bold counts as large"],
        ["16px", "Normal body text needs 4.5:1"]
      ];
      previewOut.replaceChildren(
        ...samples.map(([size, text]) => {
          const line = h("p", { class: "cc-sample" }, text);
          line.style.fontSize = size.startsWith(String(LARGE_TEXT_BOLD_PX)) ? `${LARGE_TEXT_BOLD_PX}px` : size;
          if (size.includes("bold")) line.style.fontWeight = "700";
          return line;
        }),
        h("p", { class: "cc-sample-note" }, "Rendered in the two colours as given.")
      );
      previewOut.style.backgroundColor = formatRgb(bg);
      previewOut.style.color = formatRgb(fg);
    };
    const renderResults = (ratio) => {
      if (!resultsOut) return;
      resultsOut.replaceChildren(
        ...assess(ratio).map(
          (a) => h(
            "li",
            { class: `cc-result ${a.passes ? "is-pass" : "is-fail"}` },
            h("span", { class: "cc-result-mark" }, a.passes ? "Pass" : "Fail"),
            h(
              "span",
              { class: "cc-result-body" },
              h("span", { class: "cc-result-label" }, a.requirement.label),
              h("span", { class: "cc-result-detail" }, a.requirement.detail)
            ),
            h("span", { class: "cc-result-threshold" }, `${a.requirement.threshold}:1`)
          )
        )
      );
    };
    const renderNote = (ratio) => {
      if (!noteOut) return;
      const misleading = assess(ratio).filter((a) => a.displaysAsPassing);
      if (misleading.length === 0) {
        noteOut.textContent = "";
        noteOut.hidden = true;
        return;
      }
      const names = misleading.map((a) => a.requirement.label).join(" and ");
      noteOut.textContent = `This displays as ${roundRatio(ratio).toFixed(2)}, which looks like it meets ${names}. It does not. The true ratio is ${ratio.toFixed(4)}, and the rule is at least the threshold, not rounds to it.`;
      noteOut.hidden = false;
    };
    const renderSuggestion = (fg, bg) => {
      if (!suggestOut) return;
      const fixed = nearestPassing(fg, bg, 4.5);
      if (!fixed) {
        suggestOut.replaceChildren();
        suggestOut.hidden = true;
        return;
      }
      const hex = formatHex(fixed);
      const chip = h("button", { type: "button", class: "cc-chip", "data-cc-apply": hex }, hex);
      chip.style.backgroundColor = formatRgb(fixed);
      chip.style.color = formatRgb(contrastRatio(fixed, WHITE) > contrastRatio(fixed, BLACK) ? WHITE : BLACK);
      chip.addEventListener("click", () => {
        state.fg = hex;
        fgInput.value = hex;
        render();
      });
      suggestOut.replaceChildren(
        h(
          "span",
          { class: "cc-suggest-text" },
          `Nearest colour of the same hue that reaches 4.5:1 \u2014 ${contrastRatio(fixed, bg).toFixed(2)}:1`
        ),
        chip
      );
      suggestOut.hidden = false;
    };
    const renderExtremes = (fg) => {
      if (!extremesOut) return;
      const onWhite = contrastRatio(fg, WHITE);
      const onBlack = contrastRatio(fg, BLACK);
      extremesOut.textContent = `That foreground reaches ${onWhite.toFixed(2)}:1 on white and ${onBlack.toFixed(2)}:1 on black, so its best possible is ${Math.max(onWhite, onBlack).toFixed(2)}:1.`;
    };
    const render = () => {
      const rawFg = resolveColour(state.fg);
      const rawBg = resolveColour(state.bg);
      setInvalid(fgInput, rawFg === null);
      setInvalid(bgInput, rawBg === null);
      if (!rawFg || !rawBg) {
        if (ratioOut) ratioOut.textContent = "\u2014";
        if (resultsOut) resultsOut.replaceChildren();
        if (noteOut) {
          noteOut.textContent = "That is not a colour this understands. Hex, rgb() and hsl() are read directly; anything else is handed to the browser.";
          noteOut.hidden = false;
        }
        if (suggestOut) suggestOut.hidden = true;
        return;
      }
      const bg = compositeOver(rawBg, WHITE);
      const fg = compositeOver(rawFg, bg);
      const ratio = contrastRatio(fg, bg);
      if (ratioOut) ratioOut.textContent = `${roundRatio(ratio).toFixed(2)}:1`;
      renderResults(ratio);
      renderNote(ratio);
      renderPreview(fg, bg);
      renderSuggestion(fg, bg);
      renderExtremes(fg);
      if (fgSwatch) fgSwatch.value = formatHex({ ...fg, a: 1 });
      if (bgSwatch) bgSwatch.value = formatHex({ ...bg, a: 1 });
    };
    const bindField = (input, swatch, key) => {
      input.addEventListener("input", () => {
        state[key] = input.value;
        render();
      });
      swatch?.addEventListener("input", () => {
        state[key] = swatch.value;
        input.value = swatch.value;
        render();
      });
    };
    bindField(fgInput, fgSwatch, "fg");
    bindField(bgInput, bgSwatch, "bg");
    swap?.addEventListener("click", () => {
      const { fg, bg } = state;
      state.fg = bg;
      state.bg = fg;
      fgInput.value = state.fg;
      bgInput.value = state.bg;
      render();
    });
    render();
  });
})();
