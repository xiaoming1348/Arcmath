import {
  buildAoPSWikiCandidateUrlsFromSource,
  extractAoPSOfficialPdfUrlFromHtml
} from "@arcmath/shared";

type ResolveAoPSPdfUrlResult = {
  pdfUrl: string | null;
  discoveredFrom: string | null;
};

export async function resolveAoPSPdfUrlFromSource(sourceUrl: string): Promise<ResolveAoPSPdfUrlResult> {
  const candidates = buildAoPSWikiCandidateUrlsFromSource(sourceUrl);

  for (const url of candidates) {
    let response: Response;
    try {
      response = await fetch(url, {
        cache: "no-store",
        headers: {
          "User-Agent": "ArcMath/0.1 (+http://localhost)"
        }
      });
    } catch {
      continue;
    }

    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const extracted = extractAoPSOfficialPdfUrlFromHtml(html);
    if (extracted) {
      return { pdfUrl: extracted, discoveredFrom: url };
    }
  }

  return { pdfUrl: null, discoveredFrom: null };
}
