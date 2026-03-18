type Args = {
  url: string;
  all: boolean;
};

type DiagramCandidate = {
  src: string;
  alt: string;
};

function printUsage(): void {
  console.log("Extract likely problem-diagram images from an AoPS problem page.");
  console.log("");
  console.log("Usage:");
  console.log("  node --import tsx scripts/extract-aops-problem-diagram.ts --url <url> [--all]");
}

function parseArgs(argv: string[]): Args {
  let url: string | undefined;
  let all = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--url") {
      if (!next) {
        throw new Error("Missing value for --url");
      }
      url = next.trim();
      index += 1;
      continue;
    }

    if (arg === "--all") {
      all = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!url) {
    throw new Error("--url is required");
  }

  return { url, all };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractCandidates(html: string): DiagramCandidate[] {
  const beforeSolution = html.split(/<span class="mw-headline"[^>]*>Solution/iu)[0] ?? html;
  const matches = beforeSolution.matchAll(/<img\b[^>]*>/giu);
  const candidates: DiagramCandidate[] = [];

  for (const match of matches) {
    const tag = match[0] ?? "";
    const className = /class="([^"]*)"/iu.exec(tag)?.[1] ?? "";
    const rawSrc = /src="([^"]+)"/iu.exec(tag)?.[1] ?? "";
    const rawAlt = decodeHtml(/alt="([^"]*)"/iu.exec(tag)?.[1] ?? "");

    if (!className.includes("latexcenter")) {
      continue;
    }

    if (/\\textbf\{\(A\)/u.test(rawAlt)) {
      continue;
    }

    if (!rawSrc.includes("latex.artofproblemsolving.com")) {
      continue;
    }

    const src = rawSrc.startsWith("//") ? `https:${rawSrc}` : rawSrc;
    candidates.push({ src, alt: rawAlt });
  }

  return candidates;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const response = await fetch(args.url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${args.url}: ${response.status}`);
  }

  const html = await response.text();
  const candidates = extractCandidates(html);

  if (args.all) {
    console.log(JSON.stringify(candidates, null, 2));
    return;
  }

  console.log(JSON.stringify(candidates[0] ?? null, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  printUsage();
  process.exitCode = 1;
});
