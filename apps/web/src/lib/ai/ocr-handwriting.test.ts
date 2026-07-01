import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stub the OPENAI_API_KEY so the module path that early-returns when
// the key is missing doesn't fire. The actual fetch is mocked.
const ORIGINAL_KEY = process.env.OPENAI_API_KEY;
const ORIGINAL_BASE_URL = process.env.OPENAI_BASE_URL;
const ORIGINAL_VISION_URL = process.env.OPENAI_VISION_URL;
const ORIGINAL_RESPONSES_URL = process.env.OPENAI_VISION_RESPONSES_URL;
const SAMPLE_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function restoreOpenAiEnv() {
  if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_BASE_URL === undefined) delete process.env.OPENAI_BASE_URL;
  else process.env.OPENAI_BASE_URL = ORIGINAL_BASE_URL;
  if (ORIGINAL_VISION_URL === undefined) delete process.env.OPENAI_VISION_URL;
  else process.env.OPENAI_VISION_URL = ORIGINAL_VISION_URL;
  if (ORIGINAL_RESPONSES_URL === undefined) delete process.env.OPENAI_VISION_RESPONSES_URL;
  else process.env.OPENAI_VISION_RESPONSES_URL = ORIGINAL_RESPONSES_URL;
}

describe("normalizeOcrImageDataUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("canonicalizes image/jpg and strips harmless base64 whitespace", async () => {
    const { normalizeOcrImageDataUrl } = await import("./ocr-handwriting");
    expect(
      normalizeOcrImageDataUrl(" data:image/jpg;base64,abcd EF12== \n")
    ).toBe("data:image/jpeg;base64,abcdEF12==");
  });

  it("rejects non-image data URLs", async () => {
    const { normalizeOcrImageDataUrl } = await import("./ocr-handwriting");
    expect(normalizeOcrImageDataUrl("data:text/plain;base64,abcd")).toBeNull();
    expect(normalizeOcrImageDataUrl("https://example.com/foo.png")).toBeNull();
  });
});

describe("ocrHandwritingToLatex", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
    delete process.env.OPENAI_BASE_URL;
    delete process.env.OPENAI_VISION_URL;
    delete process.env.OPENAI_VISION_RESPONSES_URL;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreOpenAiEnv();
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

  it("uses the Responses image input shape and normalized JPEG data URL", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body))
        });
        return new Response(
          JSON.stringify({
            output: [
              {
                type: "message",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({
                      latex: "x^2 + 1",
                      confidence: "high",
                      notes: null
                    })
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE.replace("image/png", "image/jpg"),
      uiLocale: "en"
    });

    expect(result).toEqual({ latex: "x^2 + 1", confidence: "high", notes: null });
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].body).toMatchObject({
      input: [
        {
          content: [
            { type: "input_text" },
            {
              type: "input_image",
              image_url: expect.stringMatching(/^data:image\/jpeg;base64,/)
            }
          ]
        }
      ]
    });
  });

  it("falls back to Chat Completions when Responses rejects the request shape", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        callCount += 1;
        if (callCount === 1) {
          return new Response("bad request", { status: 400 });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    latex: "x=3",
                    confidence: "medium",
                    notes: "check equals sign"
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    vi.resetModules();
    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });

    expect(result).toEqual({
      latex: "x=3",
      confidence: "medium",
      notes: "check equals sign"
    });
    expect(callCount).toBe(2);
  });

  it("uses a configured legacy vision URL as Chat Completions first", async () => {
    process.env.OPENAI_VISION_URL = "https://vision-proxy.example.test/chat";
    vi.resetModules();
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body))
        });
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    latex: "y=2",
                    confidence: "high",
                    notes: null
                  })
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });

    expect(result).toEqual({ latex: "y=2", confidence: "high", notes: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://vision-proxy.example.test/chat");
    expect(calls[0].body).toMatchObject({
      messages: [
        {
          content: [
            { type: "text" },
            {
              type: "image_url",
              image_url: { url: SAMPLE_IMAGE, detail: "high" }
            }
          ]
        }
      ]
    });
  });

  it("uses OPENAI_BASE_URL for Responses OCR when configured", async () => {
    process.env.OPENAI_BASE_URL = "https://openai-relay.example.test/v1/responses";
    vi.resetModules();
    const calls: Array<{ url: string; body: unknown }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body))
        });
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              latex: "z=5",
              confidence: "high",
              notes: null
            })
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      })
    );

    const { ocrHandwritingToLatex } = await import("./ocr-handwriting");
    const result = await ocrHandwritingToLatex({
      imageDataUrl: SAMPLE_IMAGE,
      uiLocale: "en"
    });

    expect(result).toEqual({ latex: "z=5", confidence: "high", notes: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://openai-relay.example.test/v1/responses");
    expect(calls[0].body).toMatchObject({
      input: [
        {
          content: [
            { type: "input_text" },
            { type: "input_image" }
          ]
        }
      ]
    });
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

  it("returns null on auth 4xx without retrying or fallback", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response("unauthorized", {
        status: 401,
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
    // Auth failures won't be fixed by retrying or falling back to another endpoint.
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
