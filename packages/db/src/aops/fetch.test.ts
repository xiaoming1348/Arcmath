import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractAnswerMap,
  extractProblemBlocks,
  extractStatementFromProblemPage,
  extractWikiAnswerMap,
  fetchAoPSContestImports,
  fetchAoPSTopicImportFromUrl,
  parseAoPSCommunityTopicUrl,
  parseContestFromTitle,
  parseContestTopicsFromCategoryHtml,
  parseTopicBootstrap,
  resolveSingleTopicMetadata
} from "./fetch";

describe("AoPS fetch parser", () => {
  it("parses contest metadata from common AMC/AIME titles", () => {
    expect(parseContestFromTitle("2023 AMC 10A Problems and Answers")).toMatchObject({
      contest: "AMC10",
      year: 2023,
      exam: "A"
    });

    expect(parseContestFromTitle("Official 2021 AIME II Discussion Thread")).toMatchObject({
      contest: "AIME",
      year: 2021,
      exam: "II"
    });

    expect(parseContestFromTitle("2025 AMC 12AHSME Discussion")).toMatchObject({
      contest: "AMC12",
      year: 2025,
      exam: "A"
    });
  });

  it("parses contest topics from category bootstrap html", () => {
    const bootstrap = {
      preload_topics: [
        {
          topic_id: 12345,
          topic_title: "2022 AMC 12B Problem and Answer Thread",
          topic_url: "/community/h12345"
        },
        {
          topic_id: 99999,
          topic_title: "Random chat thread",
          topic_url: "/community/h99999"
        }
      ]
    };

    const html = `<html><script>AoPS.bootstrap_data = ${JSON.stringify(bootstrap)};\n\tAoPS.bd = AoPS.bootstrap_data;</script></html>`;
    const topics = parseContestTopicsFromCategoryHtml(html);

    expect(topics).toHaveLength(1);
    expect(topics[0]).toMatchObject({
      topicId: 12345,
      contest: "AMC12",
      year: 2022,
      exam: "B",
      url: "https://artofproblemsolving.com/community/h12345"
    });
  });

  it("extracts problem blocks and answers from plain text", () => {
    const text = `
Problem 1. If x + 1 = 2, what is x?
Answer: B

Problem 2. Compute 3 + 4.

Answer Key
1. B
2. 7
    `;

    const blocks = extractProblemBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.number).toBe(1);
    expect(blocks[1]?.number).toBe(2);

    const answers = extractAnswerMap(text);
    expect(answers.get(1)?.value).toBe("B");
    expect(answers.get(2)?.value).toBe("7");
    expect(answers.get(2)?.format).toBe("INTEGER");
  });

  it("extracts wiki answer key values from ordered list", () => {
    const html = `
<div id="mw-content-text">
  <p><a href="/wiki/index.php?title=2022_AIME_II_Problems/Problem_1">1</a> • <a href="/wiki/index.php?title=2022_AIME_II_Problems/Problem_2">2</a></p>
  <ol>
    <li>154</li>
    <li>125</li>
    <li>080 or 081 (both were accepted)</li>
    <li>112</li>
    <li>072</li>
    <li>841</li>
    <li>192</li>
    <li>244</li>
    <li>004</li>
    <li>180</li>
    <li>023</li>
    <li>220</li>
    <li>188</li>
    <li>140</li>
    <li>999</li>
  </ol>
  <div class="printfooter"></div>
</div>
`;

    const answers = extractWikiAnswerMap("AIME", html);
    expect(answers.get(1)?.value).toBe("154");
    expect(answers.get(1)?.format).toBe("INTEGER");
    expect(answers.get(2)?.value).toBe("125");
    expect(answers.get(2)?.format).toBe("INTEGER");
    expect(answers.get(3)?.value).toContain("080");
    expect(answers.get(3)?.format).toBe("EXPRESSION");
  });

  it("extracts statement text from problem section paragraphs", () => {
    const html = `
<div id="mw-content-text">
  <h2><span id="Problem">Problem</span></h2>
  <p>Problem 1. Let $x$ be real. What is x + 1?</p>
  <p>(A) 1 (B) 2 (C) 3 (D) 4 (E) 5</p>
  <h2><span id="Solution">Solution</span></h2>
  <p>...</p>
  <div class="printfooter"></div>
</div>
`;

    const statement = extractStatementFromProblemPage(html, 1);
    expect(statement).toContain("Let $x$ be real");
    expect(statement).toContain("(A) 1");
  });

  it("falls back to list/table text when paragraph tags are missing", () => {
    const html = `
<div id="mw-content-text">
  <h2><span id="Problem">Problem</span></h2>
  <table><tr><td>Problem 2. Compute 3+4.</td></tr></table>
  <ul><li>(A) 5</li><li>(B) 6</li><li>(C) 7</li></ul>
  <h2><span id="Solution">Solution</span></h2>
  <div class="printfooter"></div>
</div>
`;

    const statement = extractStatementFromProblemPage(html, 2);
    expect(statement).toContain("Compute 3+4");
    expect(statement).toContain("(C) 7");
  });

  it("parses a direct AoPS topic URL and rejects unsupported hosts", () => {
    expect(
      parseAoPSCommunityTopicUrl("https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme")
    ).toEqual({
      canonicalUrl: "https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme",
      topicId: 3198872
    });

    expect(() => parseAoPSCommunityTopicUrl("https://example.com/community/h3198872")).toThrow(
      "Topic URL must be on artofproblemsolving.com."
    );
  });

  it("normalizes AHSME-like pages only when a supported AMC12 variant is explicit", () => {
    expect(
      resolveSingleTopicMetadata({
        title: "2025 AMC 12 AHSME Discussion",
        contentText: "This page is specifically for the 2025 AMC 12A problem thread.",
        topicUrl: "https://artofproblemsolving.com/community/h3198872",
        topicId: 3198872
      })
    ).toMatchObject({
      contest: "AMC12",
      year: 2025,
      exam: "A"
    });

    expect(() =>
      resolveSingleTopicMetadata({
        title: "2025 AMC 12 AHSME Discussion",
        contentText: "General discussion only. No explicit variant marker is given.",
        topicUrl: "https://artofproblemsolving.com/community/h3198872",
        topicId: 3198872
      })
    ).toThrow('Unsupported/ambiguous topic: "AHSME" does not map cleanly to AMC12A or AMC12B.');

    expect(
      resolveSingleTopicMetadata({
        title: "2025 AMC 12AHSME Discussion",
        contentText: "",
        topicUrl: "https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme",
        topicId: 3198872
      })
    ).toMatchObject({
      contest: "AMC12",
      year: 2025,
      exam: "A"
    });
  });

  it("uses preload_posts post_data when available", () => {
    const bootstrap = {
      preload_posts: [{ post_data: "<p>Problem 1. Solve x+1=2.</p>" }],
      preload_topics: [
        {
          topic_title: "2025 AMC 12A Discussion",
          topic_url: "/community/h3198872"
        }
      ]
    };
    const html = `<html><script>AoPS.bootstrap_data = ${JSON.stringify(bootstrap)};\n\tAoPS.bd = AoPS.bootstrap_data;</script></html>`;

    const parsed = parseTopicBootstrap(html);
    expect(parsed.extraction.strategy).toBe("bootstrap.preload_posts");
    expect(parsed.extraction.attemptedStrategies).toEqual(["bootstrap.preload_posts"]);
    expect(parsed.postHtml).toContain("Problem 1");
  });

  it("falls back to alternate bootstrap fields when post_data is absent", () => {
    const bootstrap = {
      preload_posts: [],
      preload_topics: [
        {
          topic_title: "2025 AMC 12A Discussion",
          topic_url: "/community/h3198872"
        }
      ],
      topic_payload: {
        primary_post: {
          post_html: "<div><p>Problem 1. Alternate bootstrap field works.</p></div>"
        }
      }
    };
    const html = `<html><script>AoPS.bootstrap_data = ${JSON.stringify(bootstrap)};\n\tAoPS.bd = AoPS.bootstrap_data;</script></html>`;

    const parsed = parseTopicBootstrap(html);
    expect(parsed.extraction.strategy).toBe("bootstrap.other_field");
    expect(parsed.extraction.attemptedStrategies).toEqual([
      "bootstrap.preload_posts",
      "bootstrap.preload_topics",
      "bootstrap.other_field"
    ]);
    expect(parsed.postHtml).toContain("Alternate bootstrap field works");
  });

  it("falls back to rendered DOM content when bootstrap content is missing", () => {
    const bootstrap = {
      preload_posts: [],
      preload_topics: [
        {
          topic_title: "2025 AMC 12A Discussion",
          topic_url: "/community/h3198872"
        }
      ]
    };
    const html = `<html><script>AoPS.bootstrap_data = ${JSON.stringify(bootstrap)};\n\tAoPS.bd = AoPS.bootstrap_data;</script><body><div class="cmty-post-body"><p>Problem 1. DOM fallback works.</p></div></body></html>`;

    const parsed = parseTopicBootstrap(html);
    expect(parsed.extraction.strategy).toBe("dom.fallback");
    expect(parsed.extraction.attemptedStrategies).toEqual([
      "bootstrap.preload_posts",
      "bootstrap.preload_topics",
      "bootstrap.other_field",
      "dom.fallback"
    ]);
    expect(parsed.postHtml).toContain("DOM fallback works");
  });

  it("fails only after exhausting all content extraction strategies", () => {
    const bootstrap = {
      preload_posts: [],
      preload_topics: [
        {
          topic_title: "2025 AMC 12A Discussion",
          topic_url: "/community/h3198872"
        }
      ]
    };
    const html = `<html><script>AoPS.bootstrap_data = ${JSON.stringify(bootstrap)};\n\tAoPS.bd = AoPS.bootstrap_data;</script></html>`;

    expect(() => parseTopicBootstrap(html)).toThrow(
      "No post content found after attempting: bootstrap.preload_posts, bootstrap.preload_topics, bootstrap.other_field, dom.fallback"
    );
  });

  it("uses contest-specific AMC10 vs AMC12 exam inference", () => {
    expect(
      resolveSingleTopicMetadata({
        title: "2024 AMC 10 Discussion",
        contentText: "This is the AMC 10B thread. Shared references mention AMC 12A in passing.",
        topicUrl: "https://artofproblemsolving.com/community/h123",
        topicId: 123
      })
    ).toMatchObject({
      contest: "AMC10",
      year: 2024,
      exam: "B"
    });
  });

  it("lets title metadata win over noisy body references", () => {
    expect(
      resolveSingleTopicMetadata({
        title: "2024 AMC 12A Discussion",
        contentText: "Shared problem note: also appeared on AMC 10B.",
        topicUrl: "https://artofproblemsolving.com/community/h123",
        topicId: 123
      })
    ).toMatchObject({
      contest: "AMC12",
      year: 2024,
      exam: "A"
    });
  });

  it("falls back to wiki import when a shell page has no topic post content", async () => {
    const shellBootstrap = {
      preload_cmty_data: {
        category_id: 3198872,
        rewrite_url: false
      }
    };
    const shellHtml = `<html><head><title>Math Message Boards FAQ & Community Help | AoPS</title><link rel="canonical" href="https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme"></head><script>AoPS.bootstrap_data = ${JSON.stringify(shellBootstrap)};\n\tAoPS.bd = AoPS.bootstrap_data;</script></html>`;

    const examLinks = Array.from({ length: 25 }, (_, index) => {
      const number = index + 1;
      return `<a href="/wiki/index.php?title=2025_AMC_12A_Problems/Problem_${number}">Problem ${number}</a>`;
    }).join("");
    const examHtml = `<div id="mw-content-text">${examLinks}<a href="/wiki/index.php?title=2025_AMC_12A_Answer_Key">Answer Key</a><div class="printfooter"></div></div>`;
    const answerKeyHtml = `<div id="mw-content-text"><ol>${Array.from({ length: 25 }, () => "<li>A</li>").join("")}</ol><div class="printfooter"></div></div>`;

    const result = await fetchAoPSTopicImportFromUrl(
      {
        topicUrl: "https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme"
      },
      {
        fetchHtml: async (url) => {
          if (url === "https://artofproblemsolving.com/community/c3198872_2025_amc_12ahsme") {
            return shellHtml;
          }
          if (url === "https://artofproblemsolving.com/wiki/index.php?title=2025_AMC_12A") {
            return examHtml;
          }
          if (url === "https://artofproblemsolving.com/wiki/index.php?title=2025_AMC_12A_Answer_Key") {
            return answerKeyHtml;
          }
          const problemMatch = url.match(/Problem_(\d+)$/);
          if (problemMatch) {
            const number = Number(problemMatch[1]);
            return `<div id="mw-content-text"><h2><span id="Problem">Problem</span></h2><p>Problem ${number}. Statement for problem ${number} with enough text to clear validation.</p><p>(A) 1 (B) 2 (C) 3 (D) 4 (E) 5</p><h2><span id="Solution">Solution</span></h2><div class="printfooter"></div></div>`;
          }
          throw new Error(`unexpected url ${url}`);
        }
      }
    );

    expect(result.extraction).toEqual({
      strategy: "wiki.fallback",
      attemptedStrategies: [
        "bootstrap.preload_posts",
        "bootstrap.preload_topics",
        "bootstrap.other_field",
        "dom.fallback",
        "wiki.fallback"
      ]
    });
    expect(result.metadata).toMatchObject({
      contest: "AMC12",
      year: 2025,
      exam: "A"
    });
    expect(result.payload.problems).toHaveLength(25);
    expect(result.payload.problems[0]?.statement).toContain("Statement for problem 1");
  });

  it("fetchAoPSContestImports writes only in-window wiki sets", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "aops-fetch-window-"));
    const originalFetch = global.fetch;

    const indexHtml = `
<div id="mw-content-text">
  <a href="/wiki/index.php?title=2015_AMC_12A">2015 AMC 12A</a>
  <a href="/wiki/index.php?title=2024_AMC_12A">2024 AMC 12A</a>
  <a href="/wiki/index.php?title=2026_AMC_12A">2026 AMC 12A</a>
</div>`;
    const examHtml = `<div id="mw-content-text">
      ${Array.from({ length: 25 }, (_, idx) => `<a href="/wiki/index.php?title=2024_AMC_12A_Problems/Problem_${idx + 1}">P</a>`).join("")}
      <a href="/wiki/index.php?title=2024_AMC_12A_Answer_Key">Answer Key</a>
    </div>`;
    const answerKeyHtml = `<div id="mw-content-text"><ol>${Array.from({ length: 25 }, () => "<li>A</li>").join("")}</ol></div>`;

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("AMC_12_Problems_and_Solutions")) {
        return new Response(indexHtml, { status: 200 });
      }
      if (url.includes("title=2024_AMC_12A_Answer_Key")) {
        return new Response(answerKeyHtml, { status: 200 });
      }
      if (url.includes("title=2024_AMC_12A")) {
        return new Response(examHtml, { status: 200 });
      }
      return new Response("<html></html>", { status: 200 });
    }) as typeof fetch;

    try {
      const summary = await fetchAoPSContestImports({
        source: "wiki",
        includeContests: ["AMC12"],
        includeStatements: false,
        delayMs: 0,
        outputDir: tempDir,
        yearFrom: 2016,
        yearTo: 2025,
        limit: 10
      });

      expect(summary.discovered).toBe(1);
      expect(summary.attempted).toBe(1);
      expect(summary.written).toBe(1);

      const files = (await readdir(tempDir)).filter((name) => name.endsWith(".json"));
      expect(files).toEqual(["AMC12_2024_A.json"]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("fetchAoPSContestImports skipExisting avoids rewriting existing scoped file", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "aops-fetch-skip-"));
    await writeFile(path.join(tempDir, "AMC12_2024_A.json"), "{\"existing\":true}\n", "utf8");

    const originalFetch = global.fetch;
    const indexHtml = `<div id="mw-content-text"><a href="/wiki/index.php?title=2024_AMC_12A">2024 AMC 12A</a></div>`;
    const fetchCalls: string[] = [];

    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.includes("AMC_12_Problems_and_Solutions")) {
        return new Response(indexHtml, { status: 200 });
      }
      return new Response("<html></html>", { status: 200 });
    }) as typeof fetch;

    try {
      const summary = await fetchAoPSContestImports({
        source: "wiki",
        includeContests: ["AMC12"],
        includeStatements: false,
        delayMs: 0,
        outputDir: tempDir,
        yearFrom: 2016,
        yearTo: 2025,
        skipExisting: true
      });

      expect(summary.attempted).toBe(1);
      expect(summary.written).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.skipped).toBe(1);
      expect(fetchCalls.length).toBe(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
