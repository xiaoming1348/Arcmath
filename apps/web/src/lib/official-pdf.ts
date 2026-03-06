const VALIDATION_TTL_MS = 1000 * 60 * 15;
const REQUEST_TIMEOUT_MS = 5000;

type CacheEntry = {
  valid: boolean;
  expiresAt: number;
};

const validationCache = new Map<string, CacheEntry>();

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function getCachedValidation(url: string): boolean | null {
  const cached = validationCache.get(url);
  if (!cached) {
    return null;
  }
  if (Date.now() > cached.expiresAt) {
    validationCache.delete(url);
    return null;
  }
  return cached.valid;
}

function setCachedValidation(url: string, valid: boolean): void {
  validationCache.set(url, {
    valid,
    expiresAt: Date.now() + VALIDATION_TTL_MS
  });
}

function looksLikePdf(headers: Headers): boolean {
  const contentType = headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/pdf")) {
    return true;
  }
  const disposition = headers.get("content-disposition")?.toLowerCase() ?? "";
  if (disposition.includes(".pdf")) {
    return true;
  }
  return false;
}

async function fetchWithTimeout(url: string, method: "HEAD" | "GET"): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateOfficialPdfUrl(url: string): Promise<boolean> {
  if (!isHttpUrl(url)) {
    return false;
  }

  const cached = getCachedValidation(url);
  if (cached !== null) {
    return cached;
  }

  const head = await fetchWithTimeout(url, "HEAD");
  if (head?.ok && looksLikePdf(head.headers)) {
    setCachedValidation(url, true);
    return true;
  }

  const get = await fetchWithTimeout(url, "GET");
  const valid = Boolean(get?.ok && looksLikePdf(get.headers));
  setCachedValidation(url, valid);
  return valid;
}
