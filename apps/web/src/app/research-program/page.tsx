import {
  DEFAULT_RESEARCH_PROFILE,
  buildResearchProgram
} from "@/lib/research-program";
import { Card, Eyebrow, Metric, Pill, Section, SectionHeader } from "@/components/ui";

export default function ResearchProgramPage() {
  const plan = buildResearchProgram(DEFAULT_RESEARCH_PROFILE);

  return (
    <main className="motion-rise">
      <Section tight className="pt-5 md:pt-7">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
          <div className="flex flex-col gap-4">
            <Eyebrow>MathScout research platform</Eyebrow>
            <h1
              className="display-headline"
              style={{ fontSize: "clamp(1.85rem, 3.8vw, 3rem)" }}
            >
              Student research program planner
            </h1>
            <p className="display-lede">
              A cohort-ready pathway that selects accessible research targets,
              maps weekly exploration work, and keeps proof verification status
              honest from the first experiment to the final presentation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Pill variant="verified">{plan.contractVersion}</Pill>
              <Pill>{plan.profile.studentLevel.replace("_", " ")}</Pill>
              <Pill>{plan.profile.weeks} weeks</Pill>
              <Pill>{plan.profile.teamSize} students per team</Pill>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <Metric
              label="Selected targets"
              value={plan.selectedProblems.length}
              trend="ranked by skill fit and verification path"
            />
            <Metric
              label="Formalization"
              value={plan.profile.requireFormalization ? "on" : "off"}
              trend="root proof status stays separate from experiments"
            />
            <Metric
              label="Program gate"
              value="Level 5"
              trend="claimed only for verified root theorem artifacts"
            />
          </div>
        </div>
      </Section>

      <Section tight>
        <SectionHeader
          eyebrow="Problem selection"
          title="Recommended research targets"
          lede="Each target includes exploration hooks, deliverables, MathScout assets, and verification gates."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {plan.selectedProblems.map((problem) => (
            <Card key={problem.problemId} className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Pill variant={problem.problemType === "known_theorem" ? "verified" : "default"}>
                  {problem.problemType.replace("_", " ")}
                </Pill>
                <Pill>fit {problem.fitScore}</Pill>
                <Pill>difficulty {problem.difficulty}</Pill>
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
                  First exploration moves
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

      <Section tight>
        <SectionHeader
          eyebrow="Instruction sequence"
          title="Cohort program spine"
          lede="Teachers can use these gates to pace teams without turning research into answer delivery."
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
                  Verification gate
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
          eyebrow="Platform handoff"
          title="MathScout artifacts for Arcmath"
          lede="The API returns the same contract shape for dashboards, assignments, and teacher-prep workflows."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold tracking-normal">API contract</h2>
            <code className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              GET /api/research-program
            </code>
            <code className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              POST /api/research-program
            </code>
            <p className="text-sm leading-6 text-slate-600">
              POST accepts student level, weeks, interests, skill levels,
              formalization preference, and problem count.
            </p>
          </Card>

          <div className="grid gap-3">
            {plan.platformNotes.map((note) => (
              <div
                key={note}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
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
