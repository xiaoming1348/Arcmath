import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the OPENAI_API_KEY so the module path that early-returns when
// the key is missing doesn't fire. The actual fetch is mocked.
const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
const SAMPLE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("ocrHandwritingToLatex", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("returns the parsed result when the vision API responds with valid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    latex: "x^2 + 1",
                    confidence: "high",
                    notes: null
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );

    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).toEqual({ latex: "x^2 + 1", confidence: "high", notes: null });
  });

  it("returns null when the API key is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    // Reset module cache so the warn-once Set doesn't suppress logging
    // from earlier test runs.
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).toBeNull();
  });

  it("refuses to call the API when the image is not a data URL", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: "https://example.com/foo.png",
      uiLocale: "en"
    });
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null when the API returns malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "{ this is not json" } }]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).toBeNull();
  });

  it("returns null when the schema rejects the output (e.g. bad confidence value)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    latex: "x^2",
                    confidence: "extremely-high", // not in enum
                    notes: null
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).toBeNull();
  });

  it("trims excessively long latex output defensively", async () => {
    const longLatex = "x".repeat(5000); // > MAX_LATEX_LENGTH (4000)
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    latex: longLatex,
                    confidence: "low",
                    notes: "very long"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).not.toBeNull();
    expect(result!.latex.length).toBeLessThanOrEqual(4000);
  });

  it("returns confidence='none' verbatim — caller decides not to refill the field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    latex: "",
                    confidence: "none",
                    notes: "image unreadable"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "zh"
    });
    expect(result).toEqual({
      latex: "",
      confidence: "none",
      notes: "image unreadable"
    });
  });

  it("propagates a 4xx hard error to null without retrying", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response("bad request", {
        status: 400,
        headers: { "Content-Type": "text/plain" }
      })
    );
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).toBeNull();
    // Hard 4xx → no retry, exactly one call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("ocrHandwritingMultiStep (Sprint 2)", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("returns parsed steps from a valid multi-step OCR response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    steps: [
                      {
                        stepNumber: 1,
                        latex: "x + 2 = 5",
                        confidence: "high",
                        notes: null
                      },
                      {
                        stepNumber: 2,
                        latex: "x = 3",
                        confidence: "medium",
                        notes: "verify the subtraction"
                      }
                    ],
                    imageNotes: null
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingMultiStep } = await import("./ocr-handwriting");
    const result = await ocrHandwritingMultiStep({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(2);
    expect(result!.steps[0]).toEqual({
      stepNumber: 1,
      latex: "x + 2 = 5",
      confidence: "high",
      notes: null
    });
  });

  it("returns an empty steps array when the model says image is unreadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    steps: [],
                    imageNotes: "page too blurry"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingMultiStep } = await import("./ocr-handwriting");
    const result = await ocrHandwritingMultiStep({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "zh"
    });
    expect(result).not.toBeNull();
    expect(result!.steps).toHaveLength(0);
    expect(result!.imageNotes).toBe("page too blurry");
  });

  it("caps the number of steps and trims latex defensively", async () => {
    const longLatex = "x".repeat(5000);
    const manySteps = Array.from({ length: 30 }, (_, i) => ({
      stepNumber: i + 1,
      latex: longLatex,
      confidence: "low" as const,
      notes: null
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    steps: manySteps,
                    imageNotes: null
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingMultiStep } = await import("./ocr-handwriting");
    const result = await ocrHandwritingMultiStep({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).not.toBeNull();
    // Capped to MAX_STEPS = 20
    expect(result!.steps.length).toBeLessThanOrEqual(20);
    // Each step's latex capped at 4000
    for (const s of result!.steps) {
      expect(s.latex.length).toBeLessThanOrEqual(4000);
    }
  });

  it("returns null when the multi-step JSON fails schema validation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    steps: "not an array", // schema requires array
                    imageNotes: null
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    );
    vi.resetModules();
    const { ocrHandwritingMultiStep } = await import("./ocr-handwriting");
    const result = await ocrHandwritingMultiStep({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });
    expect(result).toBeNull();
  });
});
