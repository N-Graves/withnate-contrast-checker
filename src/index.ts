import { h, mount } from "@nasdigitaluk/withnate-tool-core";
import {
  BLACK,
  LARGE_TEXT_BOLD_PX,
  LARGE_TEXT_PX,
  MAX_INPUT_LENGTH,
  WHITE,
  assess,
  compositeOver,
  contrastRatio,
  formatHex,
  formatRgb,
  nearestPassing,
  parseColour,
  roundRatio,
  type Rgb,
} from "./colour.js";

interface State {
  fg: string;
  bg: string;
}

const el = <T extends HTMLElement>(root: HTMLElement, sel: string): T | null =>
  root.querySelector<T>(sel);

const normaliseViaCanvas = (input: string): string | null => {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  const seen = ["#000000", "#ffffff"].map((seed) => {
    ctx.fillStyle = seed;
    ctx.fillStyle = input;
    return String(ctx.fillStyle);
  });
  return seen[0] === seen[1] ? (seen[0] as string) : null;
};

const resolveColour = (input: string): Rgb | null => {
  const direct = parseColour(input);
  if (direct) return direct;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_INPUT_LENGTH) return null;
  const normalised = normaliseViaCanvas(trimmed);
  return normalised ? parseColour(normalised) : null;
};

mount("[data-cc]", ({ root }) => {
  const fgInput = el<HTMLInputElement>(root, "[data-cc-fg]");
  const bgInput = el<HTMLInputElement>(root, "[data-cc-bg]");
  if (!fgInput || !bgInput) return;

  const fgSwatch = el<HTMLInputElement>(root, "[data-cc-fg-swatch]");
  const bgSwatch = el<HTMLInputElement>(root, "[data-cc-bg-swatch]");
  const ratioOut = el<HTMLElement>(root, "[data-cc-ratio]");
  const noteOut = el<HTMLElement>(root, "[data-cc-note]");
  const resultsOut = el<HTMLElement>(root, "[data-cc-results]");
  const previewOut = el<HTMLElement>(root, "[data-cc-preview]");
  const suggestOut = el<HTMLElement>(root, "[data-cc-suggest]");
  const extremesOut = el<HTMLElement>(root, "[data-cc-extremes]");
  const swap = el<HTMLButtonElement>(root, "[data-cc-swap]");

  const state: State = { fg: fgInput.value || "#007eb7", bg: bgInput.value || "#ffffff" };

  fgInput.maxLength = MAX_INPUT_LENGTH;
  bgInput.maxLength = MAX_INPUT_LENGTH;

  const setInvalid = (input: HTMLInputElement, invalid: boolean): void => {
    input.classList.toggle("is-invalid", invalid);
    input.setAttribute("aria-invalid", String(invalid));
  };

  const renderPreview = (fg: Rgb, bg: Rgb): void => {
    if (!previewOut) return;
    const samples: Array<[string, string]> = [
      [`${LARGE_TEXT_PX}px`, "Large text passes at 3:1"],
      [`${LARGE_TEXT_BOLD_PX}px bold`, "Large bold counts as large"],
      ["16px", "Normal body text needs 4.5:1"],
    ];
    previewOut.replaceChildren(
      ...samples.map(([size, text]) => {
        const line = h("p", { class: "cc-sample" }, text);
        line.style.fontSize = size.startsWith(String(LARGE_TEXT_BOLD_PX))
          ? `${LARGE_TEXT_BOLD_PX}px`
          : size;
        if (size.includes("bold")) line.style.fontWeight = "700";
        return line;
      }),
      h("p", { class: "cc-sample-note" }, "Rendered in the two colours as given."),
    );
    previewOut.style.backgroundColor = formatRgb(bg);
    previewOut.style.color = formatRgb(fg);
  };

  const renderResults = (ratio: number): void => {
    if (!resultsOut) return;
    resultsOut.replaceChildren(
      ...assess(ratio).map((a) =>
        h(
          "li",
          { class: `cc-result ${a.passes ? "is-pass" : "is-fail"}` },
          h("span", { class: "cc-result-mark" }, a.passes ? "Pass" : "Fail"),
          h(
            "span",
            { class: "cc-result-body" },
            h("span", { class: "cc-result-label" }, a.requirement.label),
            h("span", { class: "cc-result-detail" }, a.requirement.detail),
          ),
          h("span", { class: "cc-result-threshold" }, `${a.requirement.threshold}:1`),
        ),
      ),
    );
  };

  const renderNote = (ratio: number): void => {
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

  const renderSuggestion = (fg: Rgb, bg: Rgb): void => {
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
        `Nearest colour of the same hue that reaches 4.5:1 — ${contrastRatio(fixed, bg).toFixed(2)}:1`,
      ),
      chip,
    );
    suggestOut.hidden = false;
  };

  const renderExtremes = (fg: Rgb): void => {
    if (!extremesOut) return;
    const onWhite = contrastRatio(fg, WHITE);
    const onBlack = contrastRatio(fg, BLACK);
    extremesOut.textContent = `That foreground reaches ${onWhite.toFixed(2)}:1 on white and ${onBlack.toFixed(2)}:1 on black, so its best possible is ${Math.max(onWhite, onBlack).toFixed(2)}:1.`;
  };

  const render = (): void => {
    const rawFg = resolveColour(state.fg);
    const rawBg = resolveColour(state.bg);
    setInvalid(fgInput, rawFg === null);
    setInvalid(bgInput, rawBg === null);

    if (!rawFg || !rawBg) {
      if (ratioOut) ratioOut.textContent = "—";
      if (resultsOut) resultsOut.replaceChildren();
      if (noteOut) {
        noteOut.textContent =
          "That is not a colour this understands. Hex, rgb() and hsl() are read directly; anything else is handed to the browser.";
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

  const bindField = (
    input: HTMLInputElement,
    swatch: HTMLInputElement | null,
    key: "fg" | "bg",
  ): void => {
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
