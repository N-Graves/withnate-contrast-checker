import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_LENGTH,
  compositeOver,
  formatHex,
  formatRgb,
  hslToRgb,
  parseColour,
  rgbToHsl,
} from "../src/colour.js";

describe("hex", () => {
  it("reads the three lengths a person actually types", () => {
    expect(parseColour("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour("#ffffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColour("#832305")).toEqual({ r: 131, g: 35, b: 5, a: 1 });
  });

  it("expands a short hex by doubling each digit, not by padding with zeroes", () => {
    expect(parseColour("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
  });

  it("reads the alpha forms", () => {
    expect(parseColour("#00000080")?.a).toBeCloseTo(128 / 255, 5);
    expect(parseColour("#0008")?.a).toBeCloseTo(136 / 255, 5);
  });

  it("is case insensitive", () => {
    expect(parseColour("#AbCdEf")).toEqual(parseColour("#abcdef"));
  });

  it("refuses a length that is not a real hex colour", () => {
    expect(parseColour("#ff")).toBeNull();
    expect(parseColour("#fffff")).toBeNull();
    expect(parseColour("#fffffff")).toBeNull();
    expect(parseColour("#")).toBeNull();
  });

  it("refuses a hex containing something that is not a hex digit", () => {
    expect(parseColour("#gggggg")).toBeNull();
    expect(parseColour("#12345z")).toBeNull();
  });
});

describe("rgb()", () => {
  it("reads both the comma syntax and the space syntax", () => {
    expect(parseColour("rgb(18, 52, 86)")).toEqual({ r: 18, g: 52, b: 86, a: 1 });
    expect(parseColour("rgb(18 52 86)")).toEqual({ r: 18, g: 52, b: 86, a: 1 });
  });

  it("reads alpha from either the fourth comma argument or after a slash", () => {
    expect(parseColour("rgba(0, 0, 0, 0.5)")?.a).toBe(0.5);
    expect(parseColour("rgb(0 0 0 / 0.5)")?.a).toBe(0.5);
    expect(parseColour("rgb(0 0 0 / 50%)")?.a).toBe(0.5);
  });

  it("reads percentage channels against 255", () => {
    expect(parseColour("rgb(100%, 0%, 50%)")).toEqual({ r: 255, g: 0, b: 128, a: 1 });
  });

  it("clamps out-of-range channels the way a browser does rather than refusing", () => {
    expect(parseColour("rgb(300, -20, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });

  it("refuses a mix of comma and slash syntax, which no browser accepts", () => {
    expect(parseColour("rgb(0, 0, 0 / 0.5)")).toBeNull();
  });

  it("refuses the wrong number of channels", () => {
    expect(parseColour("rgb(0, 0)")).toBeNull();
    expect(parseColour("rgb(0 0 0 0)")).toBeNull();
  });
});

describe("hsl()", () => {
  it("agrees with the primaries", () => {
    expect(hslToRgb({ h: 0, s: 100, l: 50, a: 1 })).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(hslToRgb({ h: 120, s: 100, l: 50, a: 1 })).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(hslToRgb({ h: 240, s: 100, l: 50, a: 1 })).toEqual({ r: 0, g: 0, b: 255, a: 1 });
  });

  it("treats zero saturation as a neutral grey at any hue", () => {
    expect(hslToRgb({ h: 200, s: 0, l: 50, a: 1 })).toEqual({ r: 128, g: 128, b: 128, a: 1 });
  });

  it("accepts a deg suffix and wraps the angle", () => {
    expect(parseColour("hsl(360, 100%, 50%)")).toEqual(parseColour("hsl(0, 100%, 50%)"));
    expect(parseColour("hsl(120deg 100% 50%)")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(parseColour("hsl(-120, 100%, 50%)")).toEqual(parseColour("hsl(240, 100%, 50%)"));
  });

  it("requires percentages for saturation and lightness, as CSS does", () => {
    expect(parseColour("hsl(120, 100, 50)")).toBeNull();
  });

  it("round-trips through hsl and back", () => {
    for (const colour of ["#832305", "#33170b", "#f6ead8", "#4f43ae", "#2f6b52"]) {
      const rgb = parseColour(colour);
      expect(rgb).not.toBeNull();
      expect(hslToRgb(rgbToHsl(rgb!))).toEqual(rgb);
    }
  });
});

describe("refusals", () => {
  it("refuses empty and whitespace", () => {
    expect(parseColour("")).toBeNull();
    expect(parseColour("   ")).toBeNull();
  });

  it("refuses an over-long string before doing any work on it", () => {
    expect(parseColour(`#${"a".repeat(MAX_INPUT_LENGTH)}`)).toBeNull();
  });

  it("refuses something that is not a colour at all", () => {
    expect(parseColour("hello")).toBeNull();
    expect(parseColour("rgb(")).toBeNull();
    expect(parseColour("javascript:alert(1)")).toBeNull();
  });

  it("refuses a CSS colour it does not implement rather than guessing at it", () => {
    expect(parseColour("oklch(0.7 0.1 200)")).toBeNull();
    expect(parseColour("color(display-p3 1 0 0)")).toBeNull();
  });

  it("tolerates surrounding whitespace, which is what a paste brings with it", () => {
    expect(parseColour("  #fff  ")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
});

describe("formatting", () => {
  it("emits a plain rgb() when opaque and rgba() when not", () => {
    expect(formatRgb({ r: 1, g: 2, b: 3, a: 1 })).toBe("rgb(1, 2, 3)");
    expect(formatRgb({ r: 1, g: 2, b: 3, a: 0.5 })).toBe("rgba(1, 2, 3, 0.5)");
  });

  it("emits lower-case two-digit hex, padded", () => {
    expect(formatHex({ r: 0, g: 10, b: 255, a: 1 })).toBe("#000aff");
  });

  it("round-trips hex through the parser", () => {
    for (const colour of ["#000000", "#ffffff", "#832305", "#0a0b0c"]) {
      expect(formatHex(parseColour(colour)!)).toBe(colour);
    }
  });
});

describe("alpha compositing", () => {
  it("blends in sRGB, which is what the browser paints", () => {
    const half = { r: 0, g: 0, b: 0, a: 0.5 };
    expect(compositeOver(half, { r: 255, g: 255, b: 255, a: 1 })).toEqual({
      r: 128,
      g: 128,
      b: 128,
      a: 1,
    });
  });

  it("leaves an opaque colour alone", () => {
    const solid = { r: 12, g: 34, b: 56, a: 1 };
    expect(compositeOver(solid, { r: 255, g: 255, b: 255, a: 1 })).toEqual(solid);
  });

  it("resolves to the backdrop when fully transparent", () => {
    const bg = { r: 200, g: 100, b: 50, a: 1 };
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0 }, bg)).toEqual(bg);
  });
});
