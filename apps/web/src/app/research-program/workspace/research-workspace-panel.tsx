"use client";

import { useMemo, useState } from "react";
import type {
  ResearchProgramPlan,
  ResearchProgramProfile,
  ResearchStudentLevel,
  SelectedResearchProblem
} from "@/lib/research-program";
import type { Locale } from "@/i18n/dictionary";

type ResearchWorkspacePanelProps = {
  accessLabel: string;
  canOperate: boolean;
  initialPlan: ResearchProgramPlan;
  locale: Locale;
  organizationName: string | null;
};

type StageState = "ready" | "running" | "blocked" | "verified";

const INTEREST_OPTIONS = [
  "number_theory",
  "counting",
  "formalization",
  "graph_theory",
  "invariants",
  "sequences",
  "algebra",
  "generating_functions",
  "experimentation",
  "commutative_algebra"
];

const SKILL_KEYS = [
  "number_theory",
  "counting",
  "proof",
  "programming",
  "formalization",
  "algebra"
];

const COPY = {
  en: {
    runPlanner: "Run planner",
    exportPlan: "Copy plan JSON",
    copyBrief: "Copy assignment brief",
    copied: "Copied.",
    copyFailed: "Copy failed.",
    profile: "Cohort profile",
    level: "Student level",
    weeks: "Weeks",
    teamSize: "Team size",
    targetCount: "Target count",
    preferOpen: "Open-stress projects",
    formalization: "Require formalization",
    interests: "Research interests",
    skills: "Skill profile",
    targets: "Target dashboard",
    fit: "fit",
    difficulty: "difficulty",
    selected: "Selected target",
    hooks: "Exploration moves",
    verificationPath: "Verification path",
    deliverables: "Deliverables",
    assets: "MathScout assets",
    reasons: "Fit reasons",
    sequence: "Cohort sequence",
    validation: "Validation workspace",
    taskType: "Task type",
    apiBase: "Cloud API base",
    agentFlow: "Agent flow",
    intake: "Intake",
    experiment: "Experiment",
    formalize: "Formalize",
    review: "Review",
    publish: "Publish",
    brief: "Assignment brief",
    preview: "Preview mode. Save and class assignment will be connected after plan persistence.",
    internal:
      "Internal mode. This workspace is ready to connect plans to org classes, submissions, and research artifacts.",
    noTarget: "No target matched this profile. Increase weeks or lower target count constraints.",
    highSchool: "High school",
    undergrad: "Undergrad"
  },
  zh: {
    runPlanner: "运行规划器",
    exportPlan: "复制计划 JSON",
    copyBrief: "复制作业说明",
    copied: "已复制。",
    copyFailed: "复制失败。",
    profile: "班级配置",
    level: "学生水平",
    weeks: "周数",
    teamSize: "小组人数",
    targetCount: "题目数量",
    preferOpen: "开放压力项目",
    formalization: "要求形式化",
    interests: "研究兴趣",
    skills: "能力画像",
    targets: "题目看板",
    fit: "匹配",
    difficulty: "难度",
    selected: "已选题目",
    hooks: "探索入口",
    verificationPath: "验证路径",
    deliverables: "交付物",
    assets: "MathScout 资产",
    reasons: "匹配原因",
    sequence: "班级节奏",
    validation: "验证工作台",
    taskType: "任务类型",
    apiBase: "云端 API",
    agentFlow: "Agent 流程",
    intake: "收题",
    experiment: "实验",
    formalize: "形式化",
    review: "审核",
    publish: "发布",
    brief: "作业说明",
    preview: "预览模式。保存计划和班级作业将在持久化计划后接入。",
    internal: "内部模式。该工作台可继续接入机构班级、提交记录和研究产出。",
    noTarget: "当前配置没有匹配题目。请增加周数或放宽题目数量限制。",
    highSchool: "高中",
    undergrad: "本科"
  }
} as const;

export function ResearchWorkspacePanel({
  accessLabel,
  canOperate,
  initialPlan,
  locale,
  organizationName
}: ResearchWorkspacePanelProps) {
  const copy = COPY[locale];
  const [plan, setPlan] = useState(initialPlan);
  const [studentLevel, setStudentLevel] = useState<ResearchStudentLevel>(
    initialPlan.profile.studentLevel
  );
  const [weeks, setWeeks] = useState(initialPlan.profile.weeks);
  const [teamSize, setTeamSize] = useState(initialPlan.profile.teamSize);
  const [maxProblems, setMaxProblems] = useState(initialPlan.profile.maxProblems);
  const [preferOpen, setPreferOpen] = useState(initialPlan.profile.preferOpen);
  const [requireFormalization, setRequireFormalization] = useState(
    initialPlan.profile.requireFormalization
  );
  const [interests, setInterests] = useState(initialPlan.profile.interests);
  const [skills, setSkills] = useState<Record<string, number>>(
    initialPlan.profile.skills
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [taskType, setTaskType] = useState("Lean validation");
  const [agentFlow, setAgentFlow] = useState("Simple");
  const [apiBase, setApiBase] = useState("http://1.14.131.33:8765");
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  const activeTarget = plan.selectedProblems[activeIndex] ?? plan.selectedProblems[0] ?? null;
  const brief = useMemo(
    () => buildAssignmentBrief(activeTarget, plan, organizationName, locale),
    [activeTarget, locale, organizationName, plan]
  );
  const stages = useMemo(
    () => buildStages(activeTarget, requireFormalization),
    [activeTarget, requireFormalization]
  );

  async function runPlanner() {
    setIsRunning(true);
    setMessage("");
    const profile: Partial<ResearchProgramProfile> = {
      studentLevel,
      weeks,
      teamSize,
      interests,
      skills,
      preferOpen,
      requireFormalization,
      maxProblems
    };

    try {
      const response = await fetch("/api/research-program", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile)
      });
      if (!response.ok) throw new Error("Planner failed");
      const nextPlan = (await response.json()) as ResearchProgramPlan;
      setPlan(nextPlan);
      setActiveIndex(0);
    } finally {
      setIsRunning(false);
    }
  }

  function toggleInterest(interest: string) {
    setInterests((current) =>
      current.includes(interest)
        ? current.filter((item) => item !== interest)
        : [...current, interest]
    );
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(copy.copied);
    } catch {
      setMessage(copy.copyFailed);
    }
  }

  return (
    <div className="research-workspace-shell">
      <div className="research-lab-status">
        <span className="badge">{accessLabel}</span>
        <span className="info-pill">
          {canOperate ? copy.internal : copy.preview}
        </span>
        {message ? <span className="info-pill">{message}</span> : null}
      </div>

      <div className="research-workspace-grid">
        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.profile}</span>
            <button
              className="btn-primary"
              disabled={isRunning}
              onClick={() => void runPlanner()}
              type="button"
            >
              {isRunning ? "..." : copy.runPlanner}
            </button>
          </div>
          <div className="research-control-grid">
            <label className="research-control">
              <span>{copy.level}</span>
              <select
                value={studentLevel}
                onChange={(event) =>
                  setStudentLevel(event.target.value as ResearchStudentLevel)
                }
              >
                <option value="HIGH_SCHOOL">{copy.highSchool}</option>
                <option value="UNDERGRAD">{copy.undergrad}</option>
              </select>
            </label>
            <NumberControl
              label={copy.weeks}
              max={32}
              min={4}
              onChange={setWeeks}
              value={weeks}
            />
            <NumberControl
              label={copy.teamSize}
              max={8}
              min={1}
              onChange={setTeamSize}
              value={teamSize}
            />
            <NumberControl
              label={copy.targetCount}
              max={5}
              min={1}
              onChange={setMaxProblems}
              value={maxProblems}
            />
          </div>
          <div className="research-switch-row">
            <label className="research-check">
              <input
                checked={preferOpen}
                onChange={(event) => setPreferOpen(event.target.checked)}
                type="checkbox"
              />
              <span>{copy.preferOpen}</span>
            </label>
            <label className="research-check">
              <input
                checked={requireFormalization}
                onChange={(event) => setRequireFormalization(event.target.checked)}
                type="checkbox"
              />
              <span>{copy.formalization}</span>
            </label>
          </div>
        </section>

        <section className="research-lab-card">
          <span className="display-eyebrow">{copy.skills}</span>
          <div className="research-slider-list">
            {SKILL_KEYS.map((skill) => (
              <label key={skill} className="research-slider">
                <span>{formatLabel(skill)}</span>
                <input
                  max={5}
                  min={1}
                  onChange={(event) =>
                    setSkills((current) => ({
                      ...current,
                      [skill]: Number(event.target.value)
                    }))
                  }
                  type="range"
                  value={skills[skill] ?? 2}
                />
                <strong>{skills[skill] ?? 2}</strong>
              </label>
            ))}
          </div>
        </section>

        <section className="research-lab-card">
          <span className="display-eyebrow">{copy.interests}</span>
          <div className="research-option-grid">
            {INTEREST_OPTIONS.map((interest) => (
              <label key={interest} className="research-check">
                <input
                  checked={interests.includes(interest)}
                  onChange={() => toggleInterest(interest)}
                  type="checkbox"
                />
                <span>{formatLabel(interest)}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      <div className="research-workspace-grid research-workspace-grid-wide">
        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.targets}</span>
            <span className="info-pill">{plan.selectedProblems.length}</span>
          </div>
          <div className="research-target-list">
            {plan.selectedProblems.map((problem, index) => (
              <button
                aria-current={problem.problemId === activeTarget?.problemId}
                className="research-target-row"
                key={problem.problemId}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <span>
                  <strong>{problem.title}</strong>
                  <small>{problem.problemType.replace("_", " ")}</small>
                </span>
                <span>{copy.fit} {problem.fitScore}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="research-lab-card research-selected-card">
          {activeTarget ? (
            <SelectedTarget
              copy={copy}
              problem={activeTarget}
            />
          ) : (
            <p>{copy.noTarget}</p>
          )}
        </section>
      </div>

      <section className="research-lab-card">
        <div className="research-card-head">
          <span className="display-eyebrow">{copy.sequence}</span>
          <button
            className="btn-secondary"
            onClick={() => void copyText(JSON.stringify(plan, null, 2))}
            type="button"
          >
            {copy.exportPlan}
          </button>
        </div>
        <div className="research-phase-grid">
          {plan.programSequence.map((phase) => (
            <article className="research-phase" key={phase.phaseId}>
              <span className="info-pill">{phase.weekRange}</span>
              <h3>{phase.title}</h3>
              <p>{phase.objective}</p>
              <div className="research-mini-list">
                {phase.mentorChecks.map((check) => (
                  <span key={check}>{check}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="research-workspace-grid research-workspace-grid-wide">
        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.validation}</span>
            <span className="info-pill">{accessLabel}</span>
          </div>
          <div className="research-control-grid">
            <label className="research-control">
              <span>{copy.taskType}</span>
              <select
                onChange={(event) => setTaskType(event.target.value)}
                value={taskType}
              >
                <option>Lean validation</option>
                <option>Python experiment</option>
                <option>Literature review</option>
              </select>
            </label>
            <label className="research-control">
              <span>{copy.agentFlow}</span>
              <select
                onChange={(event) => setAgentFlow(event.target.value)}
                value={agentFlow}
              >
                <option>Simple</option>
                <option>MCTS</option>
                <option>Auto Think</option>
              </select>
            </label>
            <label className="research-control research-control-wide">
              <span>{copy.apiBase}</span>
              <input
                onChange={(event) => setApiBase(event.target.value)}
                value={apiBase}
              />
            </label>
          </div>
          <div className="research-stage-grid">
            {stages.map((stage) => (
              <div className="research-stage" data-state={stage.state} key={stage.label}>
                <span>{stage.label}</span>
                <strong>{stage.status}</strong>
              </div>
            ))}
          </div>
          <pre className="research-console">
{`task=${taskType}
target=${activeTarget?.problemId ?? "none"}
flow=${agentFlow}
api=${apiBase}
root_status=${requireFormalization ? "formalization_required" : "teacher_review"}`}
          </pre>
        </section>

        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.brief}</span>
            <button
              className="btn-secondary"
              onClick={() => void copyText(brief)}
              type="button"
            >
              {copy.copyBrief}
            </button>
          </div>
          <pre className="research-brief">{brief}</pre>
        </section>
      </div>
    </div>
  );
}

function NumberControl({
  label,
  max,
  min,
  onChange,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="research-control">
      <span>{label}</span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="number"
        value={value}
      />
    </label>
  );
}

function SelectedTarget({
  copy,
  problem
}: {
  copy: typeof COPY.en | typeof COPY.zh;
  problem: SelectedResearchProblem;
}) {
  return (
    <div className="research-selected">
      <div className="flex flex-wrap gap-2">
        <span className="badge">{problem.problemType.replace("_", " ")}</span>
        <span className="info-pill">{copy.difficulty} {problem.difficulty}</span>
        <span className="info-pill">{copy.fit} {problem.fitScore}</span>
      </div>
      <h2>{problem.title}</h2>
      <p>{problem.statement}</p>
      <div className="research-detail-grid">
        <DetailList title={copy.hooks} items={problem.explorationHooks} />
        <DetailList title={copy.verificationPath} items={problem.verificationPath} />
        <DetailList title={copy.deliverables} items={problem.deliverables} />
        <DetailList title={copy.assets} items={problem.mathscoutAssets} />
        <DetailList title={copy.reasons} items={problem.fitReasons} />
      </div>
    </div>
  );
}

function DetailList({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="research-detail-list">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function buildStages(
  problem: SelectedResearchProblem | null,
  requireFormalization: boolean
): Array<{ label: string; state: StageState; status: string }> {
  if (!problem) {
    return [
      { label: "Intake", state: "blocked", status: "no target" },
      { label: "Experiment", state: "blocked", status: "waiting" },
      { label: "Formalization", state: "blocked", status: "waiting" },
      { label: "Review", state: "blocked", status: "waiting" }
    ];
  }

  return [
    { label: "Intake", state: "verified", status: "ready" },
    { label: "Experiment", state: "ready", status: problem.explorationHooks.length + " hooks" },
    {
      label: "Formalization",
      state: requireFormalization ? "running" : "ready",
      status: requireFormalization ? "required" : "optional"
    },
    { label: "Review", state: "ready", status: "mentor gate" },
    { label: "Publish", state: "blocked", status: "manual approval" }
  ];
}

function buildAssignmentBrief(
  problem: SelectedResearchProblem | null,
  plan: ResearchProgramPlan,
  organizationName: string | null,
  locale: Locale
): string {
  if (!problem) return "";
  if (locale === "zh") {
    return [
      `机构: ${organizationName ?? "Preview"}`,
      `研究题目: ${problem.title}`,
      `周期: ${plan.profile.weeks} 周 · 小组人数: ${plan.profile.teamSize}`,
      `目标: ${problem.statement}`,
      "",
      "第一步:",
      ...problem.explorationHooks.slice(0, 3).map((item) => `- ${item}`),
      "",
      "验证要求:",
      ...problem.verificationPath.map((item) => `- ${item}`),
      "",
      "交付物:",
      ...problem.deliverables.map((item) => `- ${item}`)
    ].join("\n");
  }

  return [
    `Organization: ${organizationName ?? "Preview"}`,
    `Research target: ${problem.title}`,
    `Timeline: ${plan.profile.weeks} weeks · team size: ${plan.profile.teamSize}`,
    `Objective: ${problem.statement}`,
    "",
    "First moves:",
    ...problem.explorationHooks.slice(0, 3).map((item) => `- ${item}`),
    "",
    "Verification requirements:",
    ...problem.verificationPath.map((item) => `- ${item}`),
    "",
    "Deliverables:",
    ...problem.deliverables.map((item) => `- ${item}`)
  ].join("\n");
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}
