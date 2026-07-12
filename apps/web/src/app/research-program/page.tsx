import Link from "next/link";
import {
  DEFAULT_RESEARCH_PROFILE,
  buildResearchProgram
} from "@/lib/research-program";
import { Card, Eyebrow, Metric, Pill, Section, SectionHeader } from "@/components/ui";
import { resolveLocale } from "@/i18n/server";

const COPY = {
  en: {
    eyebrow: "MathScout research platform",
    title: "Student research program planner",
    lede:
      "A cohort-ready pathway that selects accessible research targets, maps weekly exploration work, and keeps proof verification status honest from the first experiment to the final presentation.",
    selectedTargets: "Selected targets",
    selectedTrend: "ranked by skill fit and verification path",
    formalization: "Formalization",
    formalizationTrend: "root proof status stays separate from experiments",
    programGate: "Program gate",
    programGateValue: "Level 5",
    programGateTrend: "claimed only for verified root theorem artifacts",
    problemEyebrow: "Problem selection",
    problemTitle: "Recommended research targets",
    problemLede:
      "Each target includes exploration hooks, deliverables, MathScout assets, and verification gates.",
    fit: "fit",
    difficulty: "difficulty",
    firstMoves: "First exploration moves",
    sequenceEyebrow: "Instruction sequence",
    sequenceTitle: "Cohort program spine",
    sequenceLede:
      "Teachers can use these gates to pace teams without turning research into answer delivery.",
    verificationGate: "Verification gate",
    handoffEyebrow: "Platform handoff",
    handoffTitle: "MathScout artifacts for Arcmath",
    handoffLede:
      "The API returns the same contract shape for dashboards, assignments, and teacher-prep workflows.",
    labEyebrow: "Internal workspace",
    labTitle: "Open the Research Lab",
    labLede:
      "Use the internal lab to configure a cohort, select targets, generate assignment briefs, and track Lean/Python validation gates.",
    labCta: "Open Research Lab",
    guideCta: "Keep reading guide",
    apiContract: "API contract",
    apiBody:
      "POST accepts student level, weeks, interests, skill levels, formalization preference, and problem count.",
    weeks: "weeks",
    studentsPerTeam: "students per team"
  },
  zh: {
    eyebrow: "MathScout 研究平台",
    title: "学生研究项目规划器",
    lede:
      "为班级或小组提供可执行的研究路径：选择适合学生的研究目标，安排每周探索任务，并从第一次实验到最终展示都清楚标注证明验证状态。",
    selectedTargets: "已选择目标",
    selectedTrend: "按能力匹配度和验证路径排序",
    formalization: "形式化",
    formalizationTrend: "根证明状态与实验探索分开记录",
    programGate: "项目关卡",
    programGateValue: "Level 5",
    programGateTrend: "仅对已验证的根定理产出使用",
    problemEyebrow: "题目选择",
    problemTitle: "推荐研究目标",
    problemLede:
      "每个目标都包含探索入口、交付物、MathScout 资产和验证关卡。",
    fit: "匹配度",
    difficulty: "难度",
    firstMoves: "第一步探索",
    sequenceEyebrow: "教学节奏",
    sequenceTitle: "班级项目主线",
    sequenceLede:
      "老师可以用这些关卡推进小组节奏，同时避免研究模式变成直接给答案。",
    verificationGate: "验证关卡",
    handoffEyebrow: "平台交接",
    handoffTitle: "面向 Arcmath 的 MathScout 产出",
    handoffLede:
      "API 为仪表盘、作业和教师备课流程返回同一套结构化合约。",
    labEyebrow: "内部工作台",
    labTitle: "打开 Research Lab",
    labLede:
      "在内部工作台配置班级项目、选择研究题目、生成作业说明，并追踪 Lean/Python 验证关卡。",
    labCta: "打开 Research Lab",
    guideCta: "继续阅读指南",
    apiContract: "API 合约",
    apiBody:
      "POST 支持学生水平、周数、兴趣方向、技能水平、形式化偏好和题目数量。",
    weeks: "周",
    studentsPerTeam: "名学生/组"
  }
} as const;

export default async function ResearchProgramPage() {
  const locale = await resolveLocale();
  const copy = COPY[locale];
  const plan = buildResearchProgram(DEFAULT_RESEARCH_PROFILE);

  return (
    <main className="motion-rise public-tech-page research-mode-page">
      <Section tight className="pt-5 md:pt-7">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <Eyebrow>{copy.eyebrow}</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(1.85rem, 3.8vw, 3rem)" }}
            >
              {copy.title}
            </h1>
            <p className="display-lede">
              {copy.lede}
            </p>
            <div className="flex flex-wrap gap-2">
              <Pill variant="verified">{plan.contractVersion}</Pill>
              <Pill>{plan.profile.studentLevel.replace("_", " ")}</Pill>
              <Pill>{plan.profile.weeks} {copy.weeks}</Pill>
              <Pill>{plan.profile.teamSize} {copy.studentsPerTeam}</Pill>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Metric
              label={copy.selectedTargets}
              value={plan.selectedProblems.length}
              trend={copy.selectedTrend}
            />
            <Metric
              label={copy.formalization}
              value={plan.profile.requireFormalization ? "on" : "off"}
              trend={copy.formalizationTrend}
            />
            <Metric
              label={copy.programGate}
              value={copy.programGateValue}
              trend={copy.programGateTrend}
            />
          </div>
        </div>
      </Section>

      <Section tight>
        <div className="research-lab-callout">
          <div className="flex flex-col gap-3">
            <span className="display-eyebrow">{copy.labEyebrow}</span>
            <h2
              className="display-headline"
              style={{ fontSize: "clamp(1.65rem, 3vw, 2.35rem)" }}
            >
              {copy.labTitle}
            </h2>
            <p className="display-lede">{copy.labLede}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/research-program/workspace" className="btn-primary public-research-cta">
              {copy.labCta}
            </Link>
            <a href="#research-guide" className="btn-secondary">
              {copy.guideCta}
            </a>
          </div>
        </div>
      </Section>

      <Section tight>
        <SectionHeader
          eyebrow={copy.problemEyebrow}
          title={copy.problemTitle}
          lede={copy.problemLede}
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plan.selectedProblems.map((problem) => (
            <Card key={problem.problemId} className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Pill variant={problem.problemType === "known_theorem" ? "verified" : "default"}>
                  {problem.problemType.replace("_", " ")}
                </Pill>
                <Pill>{copy.fit} {problem.fitScore}</Pill>
                <Pill>{copy.difficulty} {problem.difficulty}</Pill>
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-normal">
                  {problem.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {problem.statement}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {problem.domains.map((domain) => (
                  <span key={domain} className="tag">
                    {domain.replace("_", " ")}
                  </span>
                ))}
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                  {copy.firstMoves}
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {problem.explorationHooks.slice(0, 3).map((hook) => (
                    <li key={hook}>{hook}</li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section tight id="research-guide">
        <SectionHeader
          eyebrow={copy.sequenceEyebrow}
          title={copy.sequenceTitle}
          lede={copy.sequenceLede}
        />
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {plan.programSequence.map((phase) => (
            <Card key={phase.phaseId} className="flex flex-col gap-3">
              <Pill>{phase.weekRange}</Pill>
              <h2 className="text-lg font-semibold tracking-normal">
                {phase.title}
              </h2>
              <p className="text-sm leading-6 text-slate-600">{phase.objective}</p>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-normal text-slate-500">
                  {copy.verificationGate}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  {phase.verificationGate}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section tight>
        <SectionHeader
          eyebrow={copy.handoffEyebrow}
          title={copy.handoffTitle}
          lede={copy.handoffLede}
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-normal">{copy.apiContract}</h2>
            <code className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              GET /api/research-program
            </code>
            <code className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              POST /api/research-program
            </code>
            <p className="text-sm leading-6 text-slate-600">
              {copy.apiBody}
            </p>
          </Card>

          <div className="grid gap-3">
            {plan.platformNotes.map((note) => (
              <div
                key={note}
                className="research-note border"
              >
                {note}
              </div>
            ))}
          </div>
        </div>
      </Section>
    </main>
  );
}
