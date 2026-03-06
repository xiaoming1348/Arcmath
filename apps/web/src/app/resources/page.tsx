"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { buildResourcePdfDownloadUrl } from "@/lib/resources/build-resource-pdf-download-url";

const allowedContests = new Set(["AMC8", "AMC10", "AMC12", "AIME"]);

function parseContest(value: string | null): "AMC8" | "AMC10" | "AMC12" | "AIME" | undefined {
  if (!value || !allowedContests.has(value)) {
    return undefined;
  }
  return value as "AMC8" | "AMC10" | "AMC12" | "AIME";
}

function parseYear(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1950) {
    return undefined;
  }
  return parsed;
}

function normalizeExam(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 ? normalized : undefined;
}

function isExamRequired(contest: "AMC8" | "AMC10" | "AMC12" | "AIME" | undefined): boolean {
  return contest === "AMC10" || contest === "AMC12" || contest === "AIME";
}

function getExamPlaceholder(contest: "AMC8" | "AMC10" | "AMC12" | "AIME" | undefined): string {
  if (!contest) {
    return "Select Contest first";
  }
  if (contest === "AMC8") {
    return "N/A";
  }
  return "Select Exam";
}

export default function ResourcesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const contest = parseContest(searchParams.get("contest"));
  const year = parseYear(searchParams.get("year"));
  const exam = normalizeExam(searchParams.get("exam"));

  const filtersQuery = trpc.resourceSets.listDistinctFilters.useQuery();
  const examOptions =
    contest && filtersQuery.data?.examOptionsByContest
      ? filtersQuery.data.examOptionsByContest[contest]
      : [];
  const yearOptions =
    contest && filtersQuery.data?.yearsByContest
      ? filtersQuery.data.yearsByContest[contest]
      : (filtersQuery.data?.years ?? []);

  const searchReady = useMemo(() => {
    if (!contest || !year) {
      return false;
    }
    if (contest === "AMC8") {
      return true;
    }
    return Boolean(exam);
  }, [contest, year, exam]);

  const resourceQuery = trpc.resources.byKey.useQuery(
    {
      contest: contest ?? "AMC8",
      year: year ?? 2000,
      exam: contest === "AMC8" ? null : (exam ?? null)
    },
    {
      enabled: searchReady
    }
  );

  const updateSearch = (next: { contest?: string; year?: string; exam?: string }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (next.contest !== undefined) {
      if (next.contest) {
        params.set("contest", next.contest);
      } else {
        params.delete("contest");
      }
    }

    if (next.year !== undefined) {
      if (next.year) {
        params.set("year", next.year);
      } else {
        params.delete("year");
      }
    }

    if (next.exam !== undefined) {
      if (next.exam) {
        params.set("exam", next.exam);
      } else {
        params.delete("exam");
      }
    }

    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <main className="motion-rise space-y-4">
      <section className="surface-card space-y-3">
        <h1 className="text-2xl font-semibold text-slate-900">Resources</h1>
        <p className="text-sm text-slate-600">
          First 3 file downloads are free. Any additional file download requires membership.
        </p>
        {filtersQuery.data?.yearWindow ? (
          <p className="text-xs text-slate-500">
            Showing downloadable papers for {filtersQuery.data.yearWindow.yearFrom}-{filtersQuery.data.yearWindow.yearTo}.
          </p>
        ) : null}

        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            Free tier: search any file, but only the first 3 downloads are free. After 3, new downloads are locked until membership is unlocked.
          </p>
          <Link href="/membership" className="mt-2 inline-flex text-sm font-semibold underline">
            Membership (placeholder)
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-sm text-slate-700">
            Contest
            <select
              className="input-field"
              value={contest ?? ""}
              onChange={(event) => {
                const nextContest = event.target.value;
                updateSearch({ contest: nextContest, exam: "" });
              }}
            >
              <option value="">Select Contest</option>
              {(filtersQuery.data?.contests ?? []).map((contestValue) => (
                <option key={contestValue} value={contestValue}>
                  {contestValue}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Year
            <select
              className="input-field"
              value={year ? String(year) : ""}
              onChange={(event) => updateSearch({ year: event.target.value })}
            >
              <option value="">Select Year</option>
              {yearOptions.map((yearValue) => (
                <option key={yearValue} value={yearValue}>
                  {yearValue}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-slate-700">
            Exam
            <select
              className="input-field"
              value={exam ?? ""}
              onChange={(event) => updateSearch({ exam: event.target.value })}
              disabled={!contest || contest === "AMC8"}
            >
              <option value="">{getExamPlaceholder(contest)}</option>
              {examOptions.map((examValue) => (
                <option key={examValue} value={examValue}>
                  {examValue}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                router.push(pathname);
              }}
            >
              Reset
            </button>
          </div>
        </div>

        {!searchReady ? (
          <p className="text-sm text-slate-600">
            Select Contest and Year{isExamRequired(contest) ? ", then Exam, " : " "}
            to load the file.
          </p>
        ) : null}
      </section>

      {searchReady && resourceQuery.isLoading ? (
        <section className="surface-card">
          <p className="text-sm text-slate-600">Loading file...</p>
        </section>
      ) : null}

      {searchReady && resourceQuery.error ? (
        <section className="surface-card">
          <p className="text-sm text-red-600">{resourceQuery.error.message}</p>
        </section>
      ) : null}

      {resourceQuery.data?.status === "locked" ? (
        <section className="surface-card space-y-3">
          <h2 className="text-xl font-semibold text-slate-900">File Locked</h2>
          <p className="text-sm text-slate-600">{resourceQuery.data.message}</p>
          <p className="text-sm text-slate-600">
            Free usage: {resourceQuery.data.access.used}/{resourceQuery.data.access.freeLimit}
          </p>
          <Link href="/membership" className="btn-primary inline-flex">
            Unlock Membership
          </Link>
        </section>
      ) : null}

      {resourceQuery.data?.status === "ok" ? (
        <>
          <section className="surface-card space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">{resourceQuery.data.file.title}</h2>
            <p className="text-sm text-slate-600">
              {resourceQuery.data.file.contest} {resourceQuery.data.file.year}
              {resourceQuery.data.file.exam ? ` ${resourceQuery.data.file.exam}` : ""}
            </p>
            <p className="text-sm text-slate-600">
              Free usage: {resourceQuery.data.access.isMember ? "Membership" : `${resourceQuery.data.access.used}/${resourceQuery.data.access.freeLimit}`}
            </p>
            {!resourceQuery.data.access.trackingAvailable ? (
              <p className="text-xs text-amber-700">
                Access tracking table not found yet. Run DB migration to enforce 3-file limit.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <a
                href={buildResourcePdfDownloadUrl(resourceQuery.data.file.id, "problems")}
                className="btn-primary inline-flex w-fit"
              >
                Download Problems PDF
              </a>
              <a
                href={buildResourcePdfDownloadUrl(resourceQuery.data.file.id, "answers")}
                className="btn-secondary inline-flex w-fit"
              >
                Download Answers PDF
              </a>
            </div>
            <p className="text-sm text-slate-600">
              Downloads are generated from stored problem text and cached locally.
            </p>
          </section>
        </>
      ) : null}
    </main>
  );
}
