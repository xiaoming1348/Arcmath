import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@arcmath/db";
import { authOptions } from "@/lib/auth";
import { canTeach, getActiveOrganizationMembership } from "@/lib/organizations";
import { resolveLocale } from "@/i18n/server";
import { translatorImpl as translator } from "@/i18n/dictionary";

/**
 * /api/org/students/export — Phase C-4 CSV export.
 *
 * Mirrors the query in /org/students/page.tsx (roster + aggregates +
 * optional class filter) and emits a CSV. Auth: TEACHER role and above
 * within the same organization. Cross-tenant classIds are silently
 * dropped — exactly like the page.
 *
 * UTF-8 BOM is prepended so Excel-zh defaults to UTF-8 instead of
 * GBK, which would otherwise garble Chinese student names.
 *
 * Headers are localized to the user's UI locale because teachers are
 * the ones opening these in Excel — a Chinese teacher reading Chinese
 * column names matches the rest of the app.
 */

export const runtime = "nodejs";

// ---------------------------------------------------------------------
// CSV cell escape — RFC 4180: wrap in "" if cell contains , " or
// newline; double up internal ".
// ---------------------------------------------------------------------
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(cells: Array<string | number | null | undefined>): string {
  return cells.map(csvCell).join(",");
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const membership = await getActiveOrganizationMembership(prisma, session.user.id);
  if (!membership || !canTeach(membership.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawClassId = request.nextUrl.searchParams.get("classId");
  const orgClasses = await prisma.class.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true }
  });
  const selectedClassId = rawClassId && orgClasses.some((c) => c.id === rawClassId)
    ? rawClassId
    : null;
  const selectedClassName = selectedClassId
    ? orgClasses.find((c) => c.id === selectedClassId)?.name
    : null;

  const studentMemberships = await prisma.organizationMembership.findMany({
    where: {
      organizationId: membership.organizationId,
      role: "STUDENT",
      status: "ACTIVE",
      ...(selectedClassId
        ? { user: { enrollments: { some: { classId: selectedClassId } } } }
        : {})
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          enrollments: {
            select: {
              class: { select: { name: true, organizationId: true } }
            }
          }
        }
      }
    }
  });

  const studentIds = studentMemberships.map((m) => m.user.id);

  const [aggregates, correctAggregates] =
    studentIds.length > 0
      ? await Promise.all([
          prisma.problemAttempt.groupBy({
            by: ["userId"],
            where: { userId: { in: studentIds }, status: "SUBMITTED" },
            _count: { _all: true },
            _max: { submittedAt: true }
          }),
          prisma.problemAttempt.groupBy({
            by: ["userId"],
            where: {
              userId: { in: studentIds },
              status: "SUBMITTED",
              isCorrect: true
            },
            _count: { _all: true }
          })
        ])
      : [[], []];

  const statsByUserId = new Map<
    string,
    { attempts: number; correct: number; lastActivity: Date | null }
  >();
  for (const a of aggregates) {
    statsByUserId.set(a.userId, {
      attempts: a._count._all,
      correct: 0,
      lastActivity: a._max.submittedAt ?? null
    });
  }
  for (const c of correctAggregates) {
    const cur = statsByUserId.get(c.userId);
    if (cur) cur.correct = c._count._all;
  }

  const uiLocale = await resolveLocale();
  const t = translator(uiLocale);

  // Header row — localized.
  const headers = [
    t("org.students.col_name"),
    "Email",
    t("org.students.col_attempts"),
    t("org.students.csv_col_correct"),
    t("org.students.col_accuracy"),
    t("org.students.col_last_active"),
    t("org.students.csv_col_joined"),
    t("org.students.csv_col_classes")
  ];

  const lines = [csvLine(headers)];

  // Sort: most recently active first, matching the on-screen order.
  const rows = studentMemberships
    .map((m) => {
      const s = statsByUserId.get(m.user.id) ?? {
        attempts: 0,
        correct: 0,
        lastActivity: null
      };
      const classNames = m.user.enrollments
        // Defence in depth: only classes that actually belong to this org.
        .filter((e) => e.class?.organizationId === membership.organizationId)
        .map((e) => e.class?.name ?? "")
        .filter(Boolean)
        .join("; "); // semicolon — CSV-friendly (won't trigger quoting)
      return {
        name: m.user.name ?? "",
        email: m.user.email ?? "",
        attempts: s.attempts,
        correct: s.correct,
        accuracy: s.attempts > 0 ? Math.round((s.correct / s.attempts) * 100) : null,
        lastActivity: s.lastActivity,
        joinedAt: m.createdAt,
        classes: classNames
      };
    })
    .sort((a, b) => {
      const ta = a.lastActivity ? a.lastActivity.getTime() : -Infinity;
      const tb = b.lastActivity ? b.lastActivity.getTime() : -Infinity;
      return tb - ta;
    });

  for (const r of rows) {
    lines.push(
      csvLine([
        r.name,
        r.email,
        r.attempts,
        r.correct,
        r.accuracy === null ? "" : `${r.accuracy}%`,
        r.lastActivity ? r.lastActivity.toISOString().slice(0, 10) : "",
        r.joinedAt.toISOString().slice(0, 10),
        r.classes
      ])
    );
  }

  // ﻿ = UTF-8 BOM. Without it, Excel-zh interprets the file as
  // GBK and mangles Chinese student names.
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  // Stable filename: arcmath-students-YYYY-MM-DD[-<classslug>].csv
  const today = new Date().toISOString().slice(0, 10);
  const classSlug = selectedClassName
    ? "-" +
      selectedClassName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32)
    : "";
  const filename = `arcmath-students-${today}${classSlug}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store"
    }
  });
}
