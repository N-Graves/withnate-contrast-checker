import { describe, expect, it } from "vitest";
import {
  BLACK,
  REQUIREMENTS,
  WHITE,
  assess,
  compositeOver,
  contrastRatio,
  meets,
  nearestPassing,
  parseColour,
  relativeLuminance,
  roundRatio,
} from "../src/colour.js";

const at = (hex: string) => parseColour(hex)!;

describe("relative luminance", () => {
  it("puts white at 1 and black at 0", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
    expect(relativeLuminance(BLACK)).toBe(0);
  });

  it("uses coefficients that sum to exactly one", () => {
    expect(0.2126 + 0.7152 + 0.0722).toBe(1);
  });

  it("weights green far above blue, which is why a blue on black is so hard to read", () => {
    expect(relativeLuminance(at("#00ff00"))).toBeCloseTo(0.7152, 6);
    expect(relativeLuminance(at("#0000ff"))).toBeCloseTo(0.0722, 6);
    expect(relativeLuminance(at("#ff0000"))).toBeCloseTo(0.2126, 6);
  });

  it("has a continuous linearisation curve, so the two branches meet at the knee", () => {
    const knee = 0.04045;
    const linearBranch = knee / 12.92;
    const powerBranch = ((knee + 0.055) / 1.055) ** 2.4;
    expect(powerBranch).toBeCloseTo(linearBranch, 6);
  });

  it("rises monotonically with channel value", () => {
    let previous = -1;
    for (let v = 0; v <= 255; v += 1) {
      const l = relativeLuminance({ r: v, g: v, b: v, a: 1 });
      expect(l).toBeGreaterThan(previous);
      previous = l;
    }
  });
});

describe("contrast ratio", () => {
  it("is 21 for black on white, exactly", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
  });

  it("is 1 for a colour against itself", () => {
    expect(contrastRatio(at("#832305"), at("#832305"))).toBe(1);
  });

  it("does not care which way round the two colours are given", () => {
    const a = at("#832305");
    const b = at("#f6ead8");
    expect(contrastRatio(a, b)).toBe(contrastRatio(b, a));
  });

  it("agrees with the published value for the darkest grey that passes AA on white", () => {
    expect(contrastRatio(at("#767676"), WHITE)).toBeCloseTo(4.5422, 3);
    expect(contrastRatio(at("#777777"), WHITE)).toBeCloseTo(4.4781, 3);
  });

  it("never leaves the range the formula allows", () => {
    for (const hex of ["#000000", "#ffffff", "#832305", "#00ff00", "#123456"]) {
      const r = contrastRatio(at(hex), at("#7f7f7f"));
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(21);
    }
  });
});

describe("the rounding trap", () => {
  it("fails a real colour that displays as exactly 4.50", () => {
    const ratio = contrastRatio(at("#007eb7"), WHITE);

    expect(roundRatio(ratio)).toBe(4.5);
    expect(ratio).toBeLessThan(4.5);

    const aa = assess(ratio).find((a) => a.requirement.id === "aa-normal")!;
    expect(aa.passes).toBe(false);
    expect(aa.displaysAsPassing).toBe(true);
  });

  it("fails a real grey that displays as exactly 3.00", () => {
    const ratio = contrastRatio(at("#959595"), WHITE);

    expect(roundRatio(ratio)).toBe(3);
    expect(ratio).toBeLessThan(3);

    const nonText = assess(ratio).find((a) => a.requirement.id === "non-text")!;
    expect(nonText.passes).toBe(false);
    expect(nonText.displaysAsPassing).toBe(true);
  });

  it("does not cry wolf on a colour that genuinely passes", () => {
    const ratio = contrastRatio(at("#767676"), WHITE);
    for (const a of assess(ratio)) {
      expect(a.displaysAsPassing).toBe(false);
    }
  });

  it("tolerates float error without tolerating a real miss", () => {
    expect(meets(4.5 - 1e-15, 4.5)).toBe(true);
    expect(meets(4.4999999, 4.5)).toBe(false);
  });
});

describe("assess", () => {
  it("returns a verdict for every published requirement", () => {
    expect(assess(5).map((a) => a.requirement.id)).toEqual(REQUIREMENTS.map((r) => r.id));
  });

  it("splits at each threshold in the right direction", () => {
    const byId = (ratio: number) =>
      Object.fromEntries(assess(ratio).map((a) => [a.requirement.id, a.passes]));

    expect(byId(21)).toEqual({
      "aa-normal": true,
      "aa-large": true,
      "aaa-normal": true,
      "aaa-large": true,
      "non-text": true,
    });

    expect(byId(4.5)).toMatchObject({
      "aa-normal": true,
      "aa-large": true,
      "aaa-normal": false,
      "aaa-large": true,
    });

    expect(byId(3)).toMatchObject({
      "aa-normal": false,
      "aa-large": true,
      "non-text": true,
    });

    expect(byId(1)).toMatchObject({
      "aa-normal": false,
      "aa-large": false,
      "non-text": false,
    });
  });

  it("passes exactly at the threshold, since the rule says at least", () => {
    expect(assess(4.5).find((a) => a.requirement.id === "aa-normal")!.passes).toBe(true);
    expect(assess(3).find((a) => a.requirement.id === "non-text")!.passes).toBe(true);
  });
});

describe("alpha changes the answer", () => {
  it("measures the composited colour, not the declared one", () => {
    const declared = { r: 0, g: 0, b: 0, a: 0.4 };
    const onWhite = compositeOver(declared, WHITE);

    expect(contrastRatio(onWhite, WHITE)).toBeLessThan(contrastRatio(BLACK, WHITE));
    expect(contrastRatio(onWhite, WHITE)).toBeCloseTo(
      contrastRatio({ r: 153, g: 153, b: 153, a: 1 }, WHITE),
      6,
    );
  });

  it("turns a pass into a fail once the alpha is honoured", () => {
    const solid = at("#000000");
    const faded = { ...solid, a: 0.35 };
    expect(meets(contrastRatio(solid, WHITE), 4.5)).toBe(true);
    expect(meets(contrastRatio(compositeOver(faded, WHITE), WHITE), 4.5)).toBe(false);
  });
});

describe("nearestPassing", () => {
  it("returns nothing when the colour already passes", () => {
    expect(nearestPassing(BLACK, WHITE, 4.5)).toBeNull();
  });

  it("finds a colour that genuinely meets the threshold", () => {
    const fixed = nearestPassing(at("#007eb7"), WHITE, 4.5);
    expect(fixed).not.toBeNull();
    expect(meets(contrastRatio(fixed!, WHITE), 4.5)).toBe(true);
  });

  it("holds the hue, so the suggestion is still recognisably the brand colour", () => {
    const source = at("#007eb7");
    const fixed = nearestPassing(source, WHITE, 4.5)!;

    const hue = (c: { r: number; g: number; b: number }) =>
      Math.atan2(Math.sqrt(3) * (c.g - c.b), 2 * c.r - c.g - c.b);
    expect(hue(fixed)).toBeCloseTo(hue(source), 1);
  });

  it("moves as little as it can, landing just past the threshold rather than well past", () => {
    const fixed = nearestPassing(at("#007eb7"), WHITE, 4.5)!;
    const ratio = contrastRatio(fixed, WHITE);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.7);
  });

  it("gives up rather than lying when no lightness can reach the target", () => {

    expect(nearestPassing(at("#808080"), at("#7f7f7f"), 21)).toBeNull();
  });

  it("can darken as well as lighten, depending on which way is nearer", () => {
    const onWhite = nearestPassing(at("#cccccc"), WHITE, 4.5)!;
    const onBlack = nearestPassing(at("#333333"), BLACK, 4.5)!;
    expect(relativeLuminance(onWhite)).toBeLessThan(relativeLuminance(at("#cccccc")));
    expect(relativeLuminance(onBlack)).toBeGreaterThan(relativeLuminance(at("#333333")));
  });
});
