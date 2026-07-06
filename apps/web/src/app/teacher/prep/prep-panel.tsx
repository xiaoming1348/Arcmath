"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import type { Locale } from "@/i18n/dictionary";

type PrepMode = "DIFFICULT_PROBLEM" | "CHAPTER_PREVIEW" | "WORKSHEET_MATERIAL";
type PrepLanguage = "en" | "zh";

const modeOptions: Array<{
  value: PrepMode;
  label: Record<PrepLanguage, string>;
  hint: Record<PrepLanguage, string>;
}> = [
  {
    value: "DIFFICULT_PROBLEM",
    label: { en: "Difficult problem", zh: "难题分析" },
    hint: {
      en: "For one hard problem where you need strategy, pivots, and traps.",
      zh: "适合单道难题，重点分析思路入口、关键转化和易错点。"
    }
  },
  {
    value: "CHAPTER_PREVIEW",
    label: { en: "Chapter preview", zh: "章节预习" },
    hint: {
      en: "For a new unit, chapter heading, syllabus excerpt, or lesson arc.",
      zh: "适合新章节、课程提纲、单元目标或教学顺序设计。"
    }
  },
  {
    value: "WORKSHEET_MATERIAL",
    label: { en: "Worksheet/material", zh: "讲义材料" },
    hint: {
      en: "For pasted worksheet text, notes, or selected PDF excerpts.",
      zh: "适合讲义文本、练习单片段或 PDF 中复制出的内容。"
    }
  }
];

const copy = {
  en: {
    mode: "Mode",
    language: "Output language",
    source: "Problem, chapter, or material text",
    sourceHelp:
      "Paste the relevant text. For PDFs, copy a focused excerpt here; full PDF parsing is planned for the next phase.",
    courseLevel: "Course or level",
    coursePlaceholder: "Grade 8 geometry, AMC 10, A-Level algebra...",
    track: "Contest or track",
    trackPlaceholder: "Optional",
    notes: "Teacher notes",
    notesPlaceholder:
      "Optional: say what students struggled with or what kind of lesson you are preparing.",
    generate: "Generate prep brief",
    loading: "Generating...",
    minText: "Add at least 20 characters of source material.",
    emptyTitle: "Prep brief",
    emptyBody:
      "Generated output will appear here as a compact teaching plan, not a direct answer sheet.",
    fallback:
      "Local fallback was used because the AI service was unavailable.",
    ai: "Generated with ArcMath AI",
    generatedAt: "Generated",
    summary: "Summary",
    keyIdeas: "Key ideas",
    prerequisites: "Prerequisites",
    misconceptions: "Common misconceptions",
    sequence: "Teaching sequence",
    questions: "Discussion questions",
    practice: "Practice focus",
    policy: "Answer policy"
  },
  zh: {
    mode: "模式",
    language: "输出语言",
    source: "题目、章节或材料文本",
    sourceHelp:
      "粘贴相关文本。PDF 请先复制重点片段；完整 PDF 解析将在后续阶段实现。",
    courseLevel: "课程或年级",
    coursePlaceholder: "八年级几何、AMC 10、A-Level 代数……",
    track: "竞赛或课程方向",
    trackPlaceholder: "可选",
    notes: "教师备注",
    notesPlaceholder:
      "可选：说明学生卡在哪里，或你正在准备什么类型的课堂。",
    generate: "生成备课简报",
    loading: "生成中……",
    minText: "请至少输入 20 个字符的材料文本。",
    emptyTitle: "备课简报",
    emptyBody: "生成结果会显示为紧凑的教学计划，而不是直接答案。",
    fallback: "AI 服务不可用，当前显示本地备用简报。",
    ai: "由 ArcMath AI 生成",
    generatedAt: "生成时间",
    summary: "概要",
    keyIdeas: "关键思路",
    prerequisites: "前置知识",
    misconceptions: "常见误区",
    sequence: "教学顺序",
    questions: "课堂追问",
    practice: "练习重点",
    policy: "答案政策"
  }
} as const;

function localeLanguage(locale: Locale): PrepLanguage {
  return locale === "zh" ? "zh" : "en";
}

export function TeacherPrepPanel({ locale }: { locale: Locale }) {
  const defaultLanguage = localeLanguage(locale);
  const [mode, setMode] = useState<PrepMode>("DIFFICULT_PROBLEM");
  const [language, setLanguage] = useState<PrepLanguage>(defaultLanguage);
  const [sourceText, setSourceText] = useState("");
  const [courseLevel, setCourseLevel] = useState("");
  const [contestTrack, setContestTrack] = useState("");
  const [teacherNotes, setTeacherNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const c = copy[language];
  const sourceLength = sourceText.trim().length;
  const selectedMode = modeOptions.find((option) => option.value === mode);

  const generateMutation = trpc.teacher.prep.generate.useMutation({
    onError: (err) => setLocalError(err.message)
  });

  const canGenerate = useMemo(() => {
    return sourceLength >= 20 && !generateMutation.isPending;
  }, [generateMutation.isPending, sourceLength]);

  const brief = generateMutation.data ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <form
        className="surface-card space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setLocalError(null);
          if (sourceLength < 20) {
            setLocalError(c.minText);
            return;
          }
          generateMutation.reset();
          generateMutation.mutate({
            mode,
            language,
            sourceText: sourceText.trim(),
            courseLevel: courseLevel.trim() || undefined,
            contestTrack: contestTrack.trim() || undefined,
            teacherNotes: teacherNotes.trim() || undefined
          });
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-700">
            <span>{c.mode}</span>
            <select
              className="input-field"
              value={mode}
              onChange={(event) => setMode(event.target.value as PrepMode)}
            >
              {modeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label[language]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-slate-700">
            <span>{c.language}</span>
            <select
              className="input-field"
              value={language}
              onChange={(event) => setLanguage(event.target.value as PrepLanguage)}
            >
              <option value="en">English</option>
              <option value="zh">中文</option>
            </select>
          </label>
        </div>

        {selectedMode ? (
          <p className="text-xs text-slate-500">{selectedMode.hint[language]}</p>
        ) : null}

        <label className="space-y-2 text-sm text-slate-700">
          <span>{c.source}</span>
          <textarea
            className="input-field min-h-[300px] resize-y text-sm leading-6"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder={
              language === "zh"
                ? "粘贴题目、章节提纲、讲义片段或学生常错内容……"
                : "Paste a problem statement, chapter outline, worksheet excerpt, or recurring student error..."
            }
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <p>{c.sourceHelp}</p>
          <p>{sourceLength} / 12000</p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-700">
            <span>{c.courseLevel}</span>
            <input
              className="input-field"
              value={courseLevel}
              onChange={(event) => setCourseLevel(event.target.value)}
              placeholder={c.coursePlaceholder}
            />
          </label>

          <label className="space-y-2 text-sm text-slate-700">
            <span>{c.track}</span>
            <input
              className="input-field"
              value={contestTrack}
              onChange={(event) => setContestTrack(event.target.value)}
              placeholder={c.trackPlaceholder}
            />
          </label>
        </div>

        <label className="space-y-2 text-sm text-slate-700">
          <span>{c.notes}</span>
          <textarea
            className="input-field min-h-[96px] resize-y text-sm leading-6"
            value={teacherNotes}
            onChange={(event) => setTeacherNotes(event.target.value)}
            placeholder={c.notesPlaceholder}
          />
        </label>

        {localError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {localError}
          </p>
        ) : null}

        <button type="submit" className="btn-primary w-fit" disabled={!canGenerate}>
          {generateMutation.isPending ? c.loading : c.generate}
        </button>
      </form>

      <section className="surface-card min-h-[520px] space-y-5">
        {generateMutation.isPending ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">{c.loading}</p>
            <div className="h-3 w-2/3 rounded bg-slate-100" />
            <div className="h-3 w-5/6 rounded bg-slate-100" />
            <div className="h-3 w-1/2 rounded bg-slate-100" />
          </div>
        ) : brief ? (
          <>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    brief.source === "ai"
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                      : "rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                  }
                >
                  {brief.source === "ai" ? c.ai : c.fallback}
                </span>
                <span className="text-xs text-slate-500">
                  {c.generatedAt}:{" "}
                  {new Date(brief.generatedAt).toLocaleString(
                    language === "zh" ? "zh-CN" : "en-US"
                  )}
                </span>
              </div>
              <h2 className="text-2xl font-semibold text-slate-900 break-words">
                {brief.briefTitle}
              </h2>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                {c.summary}
              </h3>
              <p className="text-sm leading-6 text-slate-700 break-words">
                {brief.summary}
              </p>
            </div>

            <BriefList title={c.keyIdeas} items={brief.keyIdeas} />
            <BriefList title={c.prerequisites} items={brief.prerequisites} />
            <BriefList
              title={c.misconceptions}
              items={brief.commonMisconceptions}
            />
            <BriefList title={c.sequence} items={brief.teachingSequence} />
            <BriefList title={c.questions} items={brief.discussionQuestions} />
            <BriefList title={c.practice} items={brief.practiceFocus} />

            <div className="border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
                {c.policy}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-700 break-words">
                {brief.answerPolicyReminder}
              </p>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">
              {c.emptyTitle}
            </h2>
            <p className="text-sm leading-6 text-slate-600">{c.emptyBody}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </h3>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={`${title}-${index}`}
            className="flex gap-3 text-sm leading-6 text-slate-700"
          >
            <span className="mt-[0.55rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
            <span className="break-words">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
