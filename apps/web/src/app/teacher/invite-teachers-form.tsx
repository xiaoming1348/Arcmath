"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { translator } from "@/i18n/client";
import type { Locale } from "@/i18n/dictionary";

type InviteRow = {
  email: string;
  status: "ADDED" | "ALREADY_TEACHER" | "SEAT_FULL" | "EMAIL_IN_OTHER_ORG";
};

/**
 * School-admin-only form to invite teachers to the org.
 *
 * The input is a single textarea of comma-or-newline-separated emails;
 * we parse client-side, dedupe, and pass everything to the
 * `teacher.inviteTeachers` procedure which enforces maxTeacherSeats.
 * Results come back row-by-row so the admin sees which emails succeeded
 * and which were rejected (seat limit, in another school, etc).
 */
export function InviteTeachersForm({
  locale,
  onInvited
}: {
  locale: Locale;
  onInvited?: () => void;
}) {
  const t = translator(locale);
  const [raw, setRaw] = useState("");
  const [results, setResults] = useState<InviteRow[] | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const mutation = trpc.teacher.inviteTeachers.useMutation({
    onSuccess: (data) => {
      setResults(data.results);
      setLocalError(null);
      if (onInvited) onInvited();
    },
    onError: (err) => {
      setLocalError(err.message);
    }
  });

  return (
    <section className="surface-card space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-slate-900">
          Invite teachers
        </h2>
        <p className="text-sm text-slate-600">
          Up to 10 at a time. Each teacher will receive a seat in this
          school.
        </p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const emails = parseEmails(raw);
          if (emails.length === 0) {
            setLocalError("No valid emails.");
            return;
          }
          if (emails.length > 10) {
            setLocalError("Maximum 10 at a time.");
            return;
          }
          mutation.mutate({
            teachers: emails.map((email) => ({ email }))
          });
        }}
        className="space-y-3"
      >
        <label className="space-y-2 text-sm text-slate-700">
          <span>Emails (comma or newline separated)</span>
          <textarea
            className="input-field min-h-24"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            placeholder={"teacher1@school.edu\nteacher2@school.edu"}
          />
        </label>
        <button
          type="submit"
          className="btn-primary w-fit"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? t("common.loading") : "Send teacher invites"}
        </button>
      </form>

      {localError ? (
        <p className="text-sm text-red-600">{localError}</p>
      ) : null}

      {results && results.length > 0 ? (
        <ul className="space-y-1 pt-2 text-sm">
          {results.map((row) => (
            <li
              key={row.email}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <span className="font-mono text-slate-700">{row.email}</span>
              <span
                className={
                  row.status === "ADDED"
                    ? "text-xs font-semibold text-emerald-700"
                    : "text-xs font-semibold text-slate-500"
                }
              >
                {translateTeacherResult(t, row.status)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Translate the server's invite-result enum into human-readable text.
 * We return a literal here because the teacher invite flow has one extra
 * status (ALREADY_TEACHER) that the student invite flow doesn't use, so
 * we don't want to collapse the two into the same dictionary bucket.
 */
function translateTeacherResult(
  t: (key: Parameters<ReturnType<typeof translator>>[0]) => string,
  status: InviteRow["status"]
): string {
  switch (status) {
    case "ADDED":
      return t("teacher.invite_result.added");
    case "ALREADY_TEACHER":
      return "Already a teacher here";
    case "SEAT_FULL":
      return t("teacher.invite_result.seat_full");
    case "EMAIL_IN_OTHER_ORG":
      return t("teacher.invite_result.email_in_other_org");
  }
}

/**
 * Parse a block of text into a deduped list of trimmed lowercase emails.
 * Accepts commas, semicolons, or newlines as separators — school admins
 * tend to paste from spreadsheets, so we're generous here.
 */
export function parseEmails(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const candidate = part.trim().toLowerCase();
    if (!candidate) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}
