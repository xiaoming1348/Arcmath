export type ResourcePdfVariant = "problems" | "answers";

export function buildResourcePdfDownloadUrl(problemSetId: string, variant: ResourcePdfVariant): string {
  const params = new URLSearchParams({
    id: problemSetId,
    variant
  });
  return `/api/resources/pdf?${params.toString()}`;
}
