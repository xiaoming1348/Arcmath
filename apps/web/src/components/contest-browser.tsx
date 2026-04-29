"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import type { Messages } from "@/i18n/dictionary";

export type ContestBrowserSet = {
  id: string;
  title: string;
  contest: string;
  year: number;
  exam: string | null;
  category: string;
  submissionMode: string;
  problemCount: number;
  unlocked: boolean;
};

type ContestBrowserProps = {
  sets: ContestBrowserSet[];
};

const CONTEST_ORDER = [
  "AMC8",
  "AMC10",
  "AMC12",
  "AIME",
  "USAMO",
  "USAJMO",
  "IMO",
  "CMO",
  "PUTNAM",
  "EUCLID",
  "MAT",
  "STEP",
  "PRACTICE"
] as const;

// Per-contest visual accent (shared across locales). Display strings
// (full/short labels) come from the i18n dictionary.
const CONTEST_ACCENTS: Record<string, string> = {
  AMC8: "from-sky-50 to-sky-100 border-sky-200",
  AMC10: "from-sky-50 to-sky-100 border-sky-200",
  AMC12: "from-indigo-50 to-indigo-100 border-indigo-200",
  AIME: "from-violet-50 to-violet-100 border-violet-200",
  USAMO: "from-amber-50 to-amber-100 border-amber-200",
  USAJMO: "from-amber-50 to-amber-100 border-amber-200",
  IMO: "from-rose-50 to-rose-100 border-rose-200",
  CMO: "from-red-50 to-red-100 border-red-200",
  PUTNAM: "from-emerald-50 to-emerald-100 border-emerald-200",
  EUCLID: "from-teal-50 to-teal-100 border-teal-200",
  MAT: "from-orange-50 to-orange-100 border-orange-200",
  STEP: "from-fuchsia-50 to-fuchsia-100 border-fuchsia-200",
  PRACTICE: "from-slate-50 to-slate-100 border-slate-200"
};

function sortSets(sets: ContestBrowserSet[]): ContestBrowserSet[] {
  return [...sets].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year; // newest first
    return (a.exam ?? "").localeCompare(b.exam ?? "");
  });
}

function groupByContest(sets: ContestBrowserSet[]): Map<string, ContestBrowserSet[]> {
  const map = new Map<string, ContestBrowserSet[]>();
  for (const s of sets) {
    const arr = map.get(s.contest) ?? [];
    arr.push(s);
    map.set(s.contest, arr);
  }
  const ordered = new Map<string, ContestBrowserSet[]>();
  for (const contest of CONTEST_ORDER) {
    if (map.has(contest)) {
      ordered.set(contest, sortSets(map.get(contest)!));
      map.delete(contest);
    }
  }
  // Any unknown contests appended last (alphabetical).
  for (const [contest, arr] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    ordered.set(contest, sortSets(arr));
  }
  return ordered;
}

export function ContestBrowser({ sets }: ContestBrowserProps) {
  const { t } = useT();
  const [selectedContest, setSelectedContest] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const grouped = useMemo(() => groupByContest(sets), [sets]);
  const contestKeys = useMemo(() => Array.from(grouped.keys()), [grouped]);

  const selectedSets = useMemo(() => {
    if (!selectedContest) return [];
    const all = grouped.get(selectedContest) ?? [];
    const q = search.trim().toLowerCase();
    if (q.length === 0) return all;
    return all.filter((s) => {
      const haystack = `${s.title} ${s.year} ${s.exam ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedContest, search, grouped]);

  // Helper: lookup translated contest meta (full + short). Falls back to
  // the raw contest key when an unrecognised contest slips through.
  function contestMeta(contest: string): { full: string; short: string; accent: string } {
    const fullKey = `problems.browser.contest.${contest}.full` as keyof Messages;
    const shortKey = `problems.browser.contest.${contest}.short` as keyof Messages;
    const accent = CONTEST_ACCENTS[contest] ?? "from-slate-50 to-slate-100 border-slate-200";
    // The translator returns the key string if missing — that's fine as a
    // last-resort fallback for unknown contests (admin sees the raw key).
    return {
      full: t(fullKey),
      short: t(shortKey),
      accent
    };
  }

  if (selectedContest === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contestKeys.map((contest) => {
          const meta = contestMeta(contest);
          const total = (grouped.get(contest) ?? []).length;
          const problemTotal = (grouped.get(contest) ?? []).reduce((n, s) => n + s.problemCount, 0);
          return (
            <button
              key={contest}
              type="button"
              onClick={() => {
                setSelectedContest(contest);
                setSearch("");
              }}
              className={`group flex flex-col gap-2 rounded-3xl border-2 bg-gradient-to-br ${meta.accent} p-5 text-left transition hover:shadow-lg`}
            >
              <span className="text-lg font-semibold text-slate-900">{meta.full}</span>
              <span className="text-xs text-slate-600">{meta.short}</span>
              <span className="mt-auto text-xs font-semibold uppercase tracking-wide text-slate-700">
                {t("problems.browser.set_count", { count: total, plural: total === 1 ? "" : "s" })} ·{" "}
                {t("problems.browser.problem_total", { count: problemTotal, plural: problemTotal === 1 ? "" : "s" })}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const meta = contestMeta(selectedContest);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <button
            type="button"
            className="text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
            onClick={() => {
              setSelectedContest(null);
              setSearch("");
            }}
          >
            {t("problems.browser.back_all")}
          </button>
          <h3 className="text-xl font-semibold text-slate-900">{meta.full}</h3>
          <p className="text-sm text-slate-600">{meta.short}</p>
        </div>
        <input
          className="input-field w-60"
          type="search"
          placeholder={t("problems.browser.search_placeholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {selectedSets.length === 0 ? (
        <p className="text-sm text-slate-500">{t("problems.browser.no_results")}</p>
      ) : (
        <ul className="space-y-2">
          {selectedSets.map((set) => (
            <li
              key={set.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"
            >
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-900">{set.title}</p>
                <div className="flex flex-wrap gap-2 text-xs uppercase tracking-wide text-slate-500">
                  <span>
                    {set.contest} {set.year}
                    {set.exam ? ` ${set.exam}` : ""}
                  </span>
                  <span>{t("problems.browser.problem_count", { count: set.problemCount })}</span>
                  <span className="badge">
                    {set.category === "REAL_EXAM"
                      ? t("problems.browser.real_exam_tag")
                      : set.category === "TOPIC_PRACTICE"
                        ? t("problems.browser.topic_practice_tag")
                        : set.category}
                  </span>
                </div>
              </div>
              {set.unlocked ? (
                <Link className="btn-primary" href={`/problems/set/${encodeURIComponent(set.id)}`}>
                  {t("problems.browser.open")}
                </Link>
              ) : (
                <Link
                  className="btn-secondary"
                  href={`/membership?callbackUrl=${encodeURIComponent(`/problems/set/${set.id}`)}`}
                >
                  {t("problems.browser.unlock")}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
