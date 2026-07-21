"use client";

import { useEffect, useMemo, useState } from "react";
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
type ProblemKind = "proof" | "calculation";

type LeanHealth = {
  configured: boolean;
  reachable: boolean;
  version?: string;
  error?: string;
};

type LeanVerifyResult = {
  verdict: string;
  backend: string;
  confidence: number;
  details: Record<string, unknown>;
};

type LeanExplanationResult = {
  title: string;
  naturalLanguageStatement: string;
  latexStatement: string;
  proofOutline: string[];
  keyIdeas: string[];
  leanDependencies: string[];
  cautionNotes: string[];
};

type LeanLibraryItem = {
  id: string;
  title: string;
  problemKind: ProblemKind;
  naturalLanguageStatement: string;
  leanCode: string;
  verifier: LeanVerifyResult | null;
  explanation: LeanExplanationResult | null;
  createdAt: string;
};

const LIBRARY_STORAGE_KEY = "arcmath.research.theorem-library.v1";

const DEFAULT_PROOF_STATEMENT =
  "Prove that for every natural number n, n + 0 = n.";

const DEFAULT_PROOF_LEAN = `theorem arcmath_nat_add_zero (n : Nat) : n + 0 = n := by
  simp`;

const DEFAULT_CALCULATION_STATEMENT =
  "Compute and verify that 12^2 + 5^2 = 13^2.";

const DEFAULT_CALCULATION_LEAN = `example : 12 ^ 2 + 5 ^ 2 = 13 ^ 2 := by
  norm_num`;

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
    brief: "Assignment brief",
    preview: "Preview mode. The Lean workbench can run when the verifier service is configured.",
    internal:
      "Internal mode. This workspace can connect plans to org classes, submissions, research artifacts, and Lean verification.",
    noTarget: "No target matched this profile. Increase weeks or lower target count constraints.",
    highSchool: "High school",
    undergrad: "Undergrad",
    workbench: "Lean research workbench",
    workbenchLede:
      "Use this as the internal proof lab: translate a problem, complete or edit the Lean proof, verify it through the kernel, explain it back into math writing, then save reusable theorem artifacts.",
    verifierOnline: "Lean verifier online",
    verifierOffline: "Lean verifier unavailable",
    verifierMissing: "PROOF_VERIFIER_URL missing",
    problemKind: "Problem type",
    proofProblem: "Proof",
    calculationProblem: "Calculation",
    domain: "Domain",
    statement: "Natural-language problem",
    assumptions: "Assumptions / theorem context",
    assumptionsHint: "One assumption per line. Saved theorems selected below are added automatically.",
    seedProof: "Load proof example",
    seedCalculation: "Load calculation example",
    useInContext: "Use as context",
    selectedContext: "selected theorem context",
    stageDraft: "Natural Language -> Lean Draft",
    stageFinal: "Lean Draft -> Lean Final",
    stageVerify: "Kernel verification",
    stageExplain: "Lean explanation",
    draft: "Lean draft",
    final: "Lean final",
    explanation: "Math writing explanation",
    theoremLibrary: "Theorem library",
    noLibrary: "No saved theorem artifacts yet.",
    saveArtifact: "Save theorem artifact",
    runDraft: "Generate draft",
    runFinal: "Complete proof",
    runVerify: "Verify Lean",
    runExplain: "Explain proof",
    runFull: "Run full prover",
    copyCode: "Copy code",
    copyExplanation: "Copy explanation",
    running: "Running...",
    idle: "Ready.",
    saved: "Saved to theorem library.",
    loadArtifact: "Load",
    removeArtifact: "Remove",
    verified: "verified",
    invalid: "invalid",
    unknown: "unknown",
    modelStatus: "Model / verifier status",
    pipelineLog: "Pipeline log",
    rootRule: "Only a Lean VERIFIED result should be treated as a solved theorem.",
    localLibraryNote:
      "This browser library is the MVP save layer. Production should persist artifacts per org/team and materialize them into a generated Lean package.",
    proofOutline: "Proof outline",
    keyIdeas: "Key ideas",
    leanDependencies: "Lean dependencies",
    cautionNotes: "Caution notes"
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
    brief: "作业说明",
    preview: "预览模式。配置验证服务后，Lean 工作台即可运行。",
    internal: "内部模式。该工作台可接入机构班级、提交记录、研究产出和 Lean 验证。",
    noTarget: "当前配置没有匹配题目。请增加周数或放宽题目数量限制。",
    highSchool: "高中",
    undergrad: "本科",
    workbench: "Lean 研究工作台",
    workbenchLede:
      "这是内部证明实验室：把自然语言题目转成 Lean Draft，补全或编辑证明，通过内核运行验证，再转写成自然语言数学说明，并保存可复用定理。",
    verifierOnline: "Lean 验证服务在线",
    verifierOffline: "Lean 验证服务不可用",
    verifierMissing: "缺少 PROOF_VERIFIER_URL",
    problemKind: "题目类型",
    proofProblem: "证明题",
    calculationProblem: "计算题",
    domain: "领域",
    statement: "自然语言题目",
    assumptions: "假设 / 定理上下文",
    assumptionsHint: "每行一个假设。下方选中的已保存定理会自动加入上下文。",
    seedProof: "载入证明示例",
    seedCalculation: "载入计算示例",
    useInContext: "加入上下文",
    selectedContext: "已选定理上下文",
    stageDraft: "自然语言 -> Lean Draft",
    stageFinal: "Lean Draft -> Lean Final",
    stageVerify: "内核验证",
    stageExplain: "Lean 解释",
    draft: "Lean Draft",
    final: "Lean Final",
    explanation: "数学写作说明",
    theoremLibrary: "定理库",
    noLibrary: "还没有保存的定理产物。",
    saveArtifact: "保存定理产物",
    runDraft: "生成 Draft",
    runFinal: "补全证明",
    runVerify: "验证 Lean",
    runExplain: "解释证明",
    runFull: "运行完整 Prover",
    copyCode: "复制代码",
    copyExplanation: "复制说明",
    running: "运行中...",
    idle: "就绪。",
    saved: "已保存到定理库。",
    loadArtifact: "载入",
    removeArtifact: "删除",
    verified: "已验证",
    invalid: "无效",
    unknown: "未知",
    modelStatus: "模型 / 验证状态",
    pipelineLog: "Pipeline 日志",
    rootRule: "只有 Lean 返回 VERIFIED 时，才能认为根定理已解决。",
    localLibraryNote:
      "浏览器定理库是 MVP 保存层。正式版本应按机构/小组持久化，并生成可导入的 Lean 包。",
    proofOutline: "证明纲要",
    keyIdeas: "关键思想",
    leanDependencies: "Lean 依赖",
    cautionNotes: "注意事项"
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
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState("");

  const [problemKind, setProblemKind] = useState<ProblemKind>("proof");
  const [domain, setDomain] = useState("math");
  const [naturalLanguageStatement, setNaturalLanguageStatement] = useState(
    DEFAULT_PROOF_STATEMENT
  );
  const [manualAssumptions, setManualAssumptions] = useState("");
  const [leanDraft, setLeanDraft] = useState(DEFAULT_PROOF_LEAN);
  const [leanFinal, setLeanFinal] = useState(DEFAULT_PROOF_LEAN);
  const [verifierResult, setVerifierResult] = useState<LeanVerifyResult | null>(null);
  const [explanation, setExplanation] = useState<LeanExplanationResult | null>(null);
  const [health, setHealth] = useState<LeanHealth | null>(null);
  const [activeOperation, setActiveOperation] = useState<string>("");
  const [pipelineLog, setPipelineLog] = useState<string>(copy.idle);
  const [library, setLibrary] = useState<LeanLibraryItem[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);

  const activeTarget = plan.selectedProblems[activeIndex] ?? plan.selectedProblems[0] ?? null;
  const brief = useMemo(
    () => buildAssignmentBrief(activeTarget, plan, organizationName, locale),
    [activeTarget, locale, organizationName, plan]
  );
  const contextAssumptions = useMemo(
    () =>
      selectedLibraryIds
        .map((id) => library.find((item) => item.id === id))
        .filter((item): item is LeanLibraryItem => Boolean(item))
        .map((item) => `${item.title}: ${firstDeclaration(item.leanCode)}`),
    [library, selectedLibraryIds]
  );
  const plannerAssumptions = useMemo(
    () => [
      ...manualAssumptions
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      ...contextAssumptions
    ],
    [contextAssumptions, manualAssumptions]
  );
  const workflowStages = useMemo(
    () => buildWorkflowStages(copy, leanDraft, leanFinal, verifierResult, explanation, activeOperation),
    [activeOperation, copy, explanation, leanDraft, leanFinal, verifierResult]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/research-program/lean")
      .then((response) => response.json())
      .then((value: LeanHealth) => {
        if (!cancelled) setHealth(value);
      })
      .catch((error) => {
        if (!cancelled) {
          setHealth({
            configured: false,
            reachable: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as LeanLibraryItem[];
      if (Array.isArray(parsed)) setLibrary(parsed);
    } catch {
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(library));
  }, [library]);

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

  function loadPreset(nextKind: ProblemKind) {
    setProblemKind(nextKind);
    setVerifierResult(null);
    setExplanation(null);
    if (nextKind === "proof") {
      setNaturalLanguageStatement(DEFAULT_PROOF_STATEMENT);
      setLeanDraft(DEFAULT_PROOF_LEAN);
      setLeanFinal(DEFAULT_PROOF_LEAN);
    } else {
      setNaturalLanguageStatement(DEFAULT_CALCULATION_STATEMENT);
      setLeanDraft(DEFAULT_CALCULATION_LEAN);
      setLeanFinal(DEFAULT_CALCULATION_LEAN);
    }
    setPipelineLog(copy.idle);
  }

  async function runLeanAction<T>(
    operation: string,
    body: Record<string, unknown>
  ): Promise<T | null> {
    setActiveOperation(operation);
    setPipelineLog(copy.running);
    try {
      const response = await fetch("/api/research-program/lean", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = (await response.json()) as unknown;
      if (!response.ok) {
        const error =
          payload && typeof payload === "object" && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "Research Mode Lean action failed.";
        throw new Error(error);
      }
      setPipelineLog(JSON.stringify(payload, null, 2));
      return payload as T;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      setPipelineLog(text);
      return null;
    } finally {
      setActiveOperation("");
    }
  }

  async function generateDraft() {
    const result = await runLeanAction<{
      status: string;
      lean_code: string;
      raw_reason?: string;
      model?: string;
    }>(copy.stageDraft, {
      action: "nl_to_lean_draft",
      domain,
      naturalLanguageStatement,
      plannerAssumptions
    });
    if (!result) return;
    if (result.lean_code) {
      setLeanDraft(result.lean_code);
      setLeanFinal(result.lean_code);
      setVerifierResult(null);
      setExplanation(null);
    }
  }

  async function completeDraft() {
    // A completion response is not a kernel verdict. Clear any previous
    // verification so an LLM failure cannot appear beside a stale VERIFIED
    // badge from an earlier run.
    setVerifierResult(null);
    setExplanation(null);
    const result = await runLeanAction<{
      status: string;
      lean_code: string;
      still_has_sorry?: boolean;
      raw_reason?: string;
    }>(copy.stageFinal, {
      action: "lean_draft_to_final",
      leanDraft
    });
    if (!result) return;
    if (result.lean_code) {
      setLeanFinal(result.lean_code);
    }
  }

  async function verifyCurrentLean() {
    const code = (leanFinal || leanDraft).trim();
    if (!code) return;
    const result = await runLeanAction<LeanVerifyResult>(copy.stageVerify, {
      action: "verify_lean",
      leanCode: code
    });
    if (!result) return;
    setVerifierResult(result);
  }

  async function explainCurrentLean() {
    const code = (leanFinal || leanDraft).trim();
    if (!code) return;
    const result = await runLeanAction<LeanExplanationResult>(copy.stageExplain, {
      action: "explain",
      leanCode: code,
      naturalLanguageStatement,
      language: locale
    });
    if (!result) return;
    setExplanation(result);
  }

  async function runFullProver() {
    const result = await runLeanAction<{
      status: string;
      autoformalized: string;
      completed: string;
      verifier_verdict: string | null;
      verifier_details: Record<string, unknown>;
      retries_used: number;
      model: string;
      notes: string;
    }>(copy.runFull, {
      action: "prove",
      domain,
      naturalLanguageStatement,
      plannerAssumptions,
      maxCompletionRetries: 1
    });
    if (!result) return;
    if (result.autoformalized) setLeanDraft(result.autoformalized);
    if (result.completed) setLeanFinal(result.completed);
    setVerifierResult({
      verdict: result.verifier_verdict ?? result.status,
      backend: "LEAN",
      confidence: result.status === "VERIFIED" ? 0.99 : 0,
      details: {
        ...result.verifier_details,
        retries_used: result.retries_used,
        model: result.model,
        notes: result.notes
      }
    });
  }

  function saveArtifact() {
    const code = (leanFinal || leanDraft).trim();
    if (!code) return;
    const artifact: LeanLibraryItem = {
      id: createId(),
      title: explanation?.title || theoremTitleFromCode(code) || "Research theorem",
      problemKind,
      naturalLanguageStatement,
      leanCode: code,
      verifier: verifierResult,
      explanation,
      createdAt: new Date().toISOString()
    };
    setLibrary((current) => [artifact, ...current].slice(0, 24));
    setMessage(copy.saved);
  }

  function loadArtifact(item: LeanLibraryItem) {
    setProblemKind(item.problemKind);
    setNaturalLanguageStatement(item.naturalLanguageStatement);
    setLeanDraft(item.leanCode);
    setLeanFinal(item.leanCode);
    setVerifierResult(item.verifier);
    setExplanation(item.explanation);
  }

  function toggleLibraryContext(id: string) {
    setSelectedLibraryIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  const statusCopy = health?.reachable
    ? `${copy.verifierOnline}${health.version ? ` v${health.version}` : ""}`
    : health?.configured === false
      ? copy.verifierMissing
      : copy.verifierOffline;

  return (
    <div className="research-workspace-shell">
      <div className="research-lab-status">
        <span className="badge">{accessLabel}</span>
        <span className="info-pill">
          {canOperate ? copy.internal : copy.preview}
        </span>
        <span className="info-pill">{statusCopy}</span>
        {message ? <span className="info-pill">{message}</span> : null}
      </div>

      <section className="research-lab-card research-proof-workbench">
        <div className="research-card-head">
          <div>
            <span className="display-eyebrow">{copy.workbench}</span>
            <h2>{copy.workbench}</h2>
            <p>{copy.workbenchLede}</p>
          </div>
          <div className="research-segmented" aria-label={copy.problemKind}>
            <button
              aria-pressed={problemKind === "proof"}
              onClick={() => loadPreset("proof")}
              type="button"
            >
              {copy.proofProblem}
            </button>
            <button
              aria-pressed={problemKind === "calculation"}
              onClick={() => loadPreset("calculation")}
              type="button"
            >
              {copy.calculationProblem}
            </button>
          </div>
        </div>
        <div className="research-stage-grid">
          {workflowStages.map((stage) => (
            <div className="research-stage" data-state={stage.state} key={stage.label}>
              <span>{stage.label}</span>
              <strong>{stage.status}</strong>
            </div>
          ))}
        </div>
      </section>

      <div className="research-workspace-grid research-workspace-grid-wide">
        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.statement}</span>
            <div className="flex flex-wrap gap-2">
              <button className="btn-secondary" onClick={() => loadPreset("proof")} type="button">
                {copy.seedProof}
              </button>
              <button className="btn-secondary" onClick={() => loadPreset("calculation")} type="button">
                {copy.seedCalculation}
              </button>
            </div>
          </div>
          <div className="research-control-grid">
            <label className="research-control">
              <span>{copy.domain}</span>
              <input
                onChange={(event) => setDomain(event.target.value)}
                value={domain}
              />
            </label>
            <label className="research-control">
              <span>{copy.problemKind}</span>
              <select
                onChange={(event) => setProblemKind(event.target.value as ProblemKind)}
                value={problemKind}
              >
                <option value="proof">{copy.proofProblem}</option>
                <option value="calculation">{copy.calculationProblem}</option>
              </select>
            </label>
          </div>
          <label className="research-control research-control-stack">
            <span>{copy.statement}</span>
            <textarea
              onChange={(event) => setNaturalLanguageStatement(event.target.value)}
              rows={7}
              value={naturalLanguageStatement}
            />
          </label>
          <label className="research-control research-control-stack">
            <span>{copy.assumptions}</span>
            <textarea
              onChange={(event) => setManualAssumptions(event.target.value)}
              placeholder={copy.assumptionsHint}
              rows={4}
              value={manualAssumptions}
            />
          </label>
          <div className="research-action-row">
            <button className="btn-primary" onClick={() => void generateDraft()} type="button">
              {copy.runDraft}
            </button>
            <button className="btn-secondary" onClick={() => void runFullProver()} type="button">
              {copy.runFull}
            </button>
          </div>
        </section>

        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.modelStatus}</span>
            <span className="info-pill">{statusCopy}</span>
          </div>
          <p className="research-note">{copy.rootRule}</p>
          {health?.error ? <p className="research-note">{health.error}</p> : null}
          <div className="research-status-grid">
            <StatusTile
              label={copy.stageVerify}
              value={verifierResult?.verdict ?? copy.unknown}
              variant={verifierResult?.verdict}
            />
            <StatusTile
              label="Backend"
              value={verifierResult?.backend ?? "LEAN"}
            />
            <StatusTile
              label="Confidence"
              value={verifierResult ? `${Math.round(verifierResult.confidence * 100)}%` : "0%"}
            />
          </div>
          <div className="research-context-block">
            <span className="display-eyebrow">{copy.selectedContext}</span>
            {contextAssumptions.length > 0 ? (
              <ul>
                {contextAssumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            ) : (
              <p>{copy.noLibrary}</p>
            )}
          </div>
          <pre className="research-console">{pipelineLog}</pre>
        </section>
      </div>

      <div className="research-workspace-grid research-workspace-grid-wide">
        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.draft}</span>
            <button
              className="btn-secondary"
              onClick={() => void copyText(leanDraft)}
              type="button"
            >
              {copy.copyCode}
            </button>
          </div>
          <textarea
            className="research-code-editor"
            onChange={(event) => setLeanDraft(event.target.value)}
            rows={15}
            spellCheck={false}
            value={leanDraft}
          />
          <div className="research-action-row">
            <button className="btn-primary" onClick={() => void completeDraft()} type="button">
              {copy.runFinal}
            </button>
          </div>
        </section>

        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.final}</span>
            <button
              className="btn-secondary"
              onClick={() => void copyText(leanFinal)}
              type="button"
            >
              {copy.copyCode}
            </button>
          </div>
          <textarea
            className="research-code-editor"
            onChange={(event) => {
              setLeanFinal(event.target.value);
              setVerifierResult(null);
              setExplanation(null);
            }}
            rows={15}
            spellCheck={false}
            value={leanFinal}
          />
          <div className="research-action-row">
            <button className="btn-primary" onClick={() => void verifyCurrentLean()} type="button">
              {copy.runVerify}
            </button>
            <button className="btn-secondary" onClick={() => void explainCurrentLean()} type="button">
              {copy.runExplain}
            </button>
            <button className="btn-secondary" onClick={saveArtifact} type="button">
              {copy.saveArtifact}
            </button>
          </div>
        </section>
      </div>

      <div className="research-workspace-grid research-workspace-grid-wide">
        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.explanation}</span>
            <button
              className="btn-secondary"
              disabled={!explanation}
              onClick={() => void copyText(formatExplanation(explanation, copy))}
              type="button"
            >
              {copy.copyExplanation}
            </button>
          </div>
          {explanation ? (
            <div className="research-explanation">
              <h3>{explanation.title}</h3>
              <p>{explanation.naturalLanguageStatement}</p>
              <pre className="research-latex">{explanation.latexStatement}</pre>
              <DetailList title={copy.proofOutline} items={explanation.proofOutline} />
              <DetailList title={copy.keyIdeas} items={explanation.keyIdeas} />
              <DetailList title={copy.leanDependencies} items={explanation.leanDependencies} />
              <DetailList title={copy.cautionNotes} items={explanation.cautionNotes} />
            </div>
          ) : (
            <p className="research-note">{copy.stageExplain}</p>
          )}
        </section>

        <section className="research-lab-card">
          <div className="research-card-head">
            <span className="display-eyebrow">{copy.theoremLibrary}</span>
            <span className="info-pill">{library.length}</span>
          </div>
          <p className="research-note">{copy.localLibraryNote}</p>
          <div className="research-library-list">
            {library.length === 0 ? <p>{copy.noLibrary}</p> : null}
            {library.map((item) => (
              <article className="research-library-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.problemKind} · {item.verifier?.verdict ?? copy.unknown}
                  </small>
                </div>
                <label className="research-check">
                  <input
                    checked={selectedLibraryIds.includes(item.id)}
                    onChange={() => toggleLibraryContext(item.id)}
                    type="checkbox"
                  />
                  <span>{copy.useInContext}</span>
                </label>
                <div className="research-action-row">
                  <button className="btn-secondary" onClick={() => loadArtifact(item)} type="button">
                    {copy.loadArtifact}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setLibrary((current) => current.filter((entry) => entry.id !== item.id));
                      setSelectedLibraryIds((current) => current.filter((id) => id !== item.id));
                    }}
                    type="button"
                  >
                    {copy.removeArtifact}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
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

function StatusTile({
  label,
  value,
  variant
}: {
  label: string;
  value: string;
  variant?: string;
}) {
  return (
    <div className="research-status-tile" data-verdict={variant ?? value}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
  if (items.length === 0) return null;
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

function buildWorkflowStages(
  copy: typeof COPY.en | typeof COPY.zh,
  leanDraft: string,
  leanFinal: string,
  verifierResult: LeanVerifyResult | null,
  explanation: LeanExplanationResult | null,
  activeOperation: string
): Array<{ label: string; state: StageState; status: string }> {
  return [
    {
      label: copy.stageDraft,
      state: activeOperation === copy.stageDraft ? "running" : leanDraft.trim() ? "verified" : "ready",
      status: leanDraft.trim() ? "ready" : "waiting"
    },
    {
      label: copy.stageFinal,
      state: activeOperation === copy.stageFinal ? "running" : leanFinal.trim() ? "verified" : "ready",
      status: leanFinal.includes("sorry") ? "has sorry" : leanFinal.trim() ? "complete" : "waiting"
    },
    {
      label: copy.stageVerify,
      state:
        activeOperation === copy.stageVerify
          ? "running"
          : verifierResult?.verdict === "VERIFIED"
            ? "verified"
            : verifierResult
              ? "blocked"
              : "ready",
      status: verifierResult?.verdict ?? "not checked"
    },
    {
      label: copy.stageExplain,
      state: activeOperation === copy.stageExplain ? "running" : explanation ? "verified" : "ready",
      status: explanation ? "generated" : "waiting"
    }
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

function formatExplanation(
  explanation: LeanExplanationResult | null,
  copy: typeof COPY.en | typeof COPY.zh
): string {
  if (!explanation) return "";
  return [
    explanation.title,
    "",
    explanation.naturalLanguageStatement,
    "",
    explanation.latexStatement,
    "",
    copy.proofOutline,
    ...explanation.proofOutline.map((item) => `- ${item}`),
    "",
    copy.keyIdeas,
    ...explanation.keyIdeas.map((item) => `- ${item}`),
    "",
    copy.cautionNotes,
    ...explanation.cautionNotes.map((item) => `- ${item}`)
  ].join("\n");
}

function theoremTitleFromCode(code: string): string | null {
  const match = code.match(/^\s*(theorem|lemma|example)\s+([A-Za-z0-9_'.]+)/m);
  if (!match) return null;
  if (match[1] === "example") return "Lean example";
  return match[2] ?? null;
}

function firstDeclaration(code: string): string {
  const line = code
    .split("\n")
    .map((item) => item.trim())
    .find((item) => /^(theorem|lemma|example|def)\b/.test(item));
  return line?.slice(0, 220) ?? "Lean artifact";
}

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}
