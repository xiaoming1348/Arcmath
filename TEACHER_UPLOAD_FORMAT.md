# Teacher Upload Format (arcmath-problem-set-v1)

This is the JSON format teachers use to upload a homework / practice set to
Arcmath. Upload it at `/admin/import`; the system will validate, store the
problems, and auto-generate per-problem milestone checklists for PROOF items.

一个 JSON 文件 → 一份作业。系统接收后会自动做如下处理：
- 校验格式
- 建立题集 (`ProblemSet`) 和题目 (`Problem`) 记录
- 对证明题自动生成"得分点 checklist"（milestone recipe），供学生答题时评分用

---

## 最小可用示例 / Minimal example

```json
{
  "schemaVersion": "arcmath-problem-set-v1",
  "set": {
    "title": "Homework Week 5 — Inequalities"
  },
  "problems": [
    {
      "number": 1,
      "statement": "If $a+b+c=6$ and $a,b,c\\ge 0$, what is the max of $abc$?",
      "answerFormat": "INTEGER",
      "answer": "8",
      "solutionSketch": "By AM-GM, $abc \\le ((a+b+c)/3)^3 = 8$, with equality at $a=b=c=2$."
    }
  ]
}
```

`set.title` 和至少一道题就够了，其他字段系统会自动补默认值。

完整示例见 `apps/web/src/scripts/fixtures/teacher-homework-example.json`
（包含 5 道不同格式的题）。

---

## 顶层结构 / Top-level shape

| 字段 | 必填 | 说明 |
|------|------|------|
| `schemaVersion` | ✅ | 必须是字符串 `"arcmath-problem-set-v1"`。以后升级格式会递增版本号。 |
| `set` | ✅ | 题集元信息（见下） |
| `problems` | ✅ | 题目数组，至少 1 题，`number` 从 1 连续编号 |

---

## `set` — 题集元信息

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `title` | ✅ | — | 给老师和学生看的标题，如 `"第5周作业 - 不等式"` |
| `description` |  | — | 可选的简短说明 |
| `contest` |  | `"PRACTICE"` | 一般留空；只有当你是在录入真实竞赛原题时才填 `"AMC10"` / `"AIME"` / `"USAMO"` 等 |
| `year` |  | 当前年份 | 同上，一般留空 |
| `exam` |  | 从 title 自动生成 slug | 一年内多份作业的区分码。系统会从 title 自动生成，重复上传同一文件 = 幂等覆盖 |
| `topicKey` |  | — | 主题标签，如 `"algebra/inequalities"` |
| `category` |  | `"TOPIC_PRACTICE"` | `"DIAGNOSTIC"` / `"REAL_EXAM"` / `"TOPIC_PRACTICE"` |
| `submissionMode` |  | `"PER_PROBLEM"` | `"PER_PROBLEM"`（逐题提交、逐题批改）或 `"WHOLE_SET_SUBMIT"`（整卷提交） |
| `tutorEnabled` |  | `true` | 是否允许 AI 助教给提示 |

⚠️ 关于 `contest + year + exam` 三元组：

这三项组合必须在数据库里唯一。如果你两次上传同样的 `set.title`，系统会把第二次当成第一次的更新（幂等）。如果你想上传两份不同的作业但标题不小心一样，改一下 title 就行；或者显式指定 `"exam": "week-5-round-2"`。

---

## `problems[]` — 每道题

通用字段（适用所有答题格式）：

| 字段 | 必填 | 说明 |
|------|------|------|
| `number` | ✅ | 从 1 开始的整数，连续编号 |
| `statement` | ✅ | 题目正文，支持 LaTeX（`$...$` 行内、`$$...$$` 居中） |
| `statementFormat` |  | `"MARKDOWN_LATEX"`（默认）/ `"HTML"` / `"PLAIN"` |
| `answerFormat` | ✅ | `"MULTIPLE_CHOICE"` / `"INTEGER"` / `"EXPRESSION"` / `"PROOF"` |
| `topicKey` |  | 题目主题标签 |
| `difficultyBand` |  | `"EASY"` / `"MEDIUM"` / `"HARD"` |
| `techniqueTags` |  | 技巧标签数组，如 `["am-gm", "cauchy-schwarz"]` |
| `sourceLabel` |  | 题目来源说明（展示给学生看） |
| `sourceUrl` |  | 题目来源链接 |
| `solutionSketch` |  | 参考答案思路。对 `PROOF` 题**必填**，用来生成 checklist |
| `curatedHintLevel1` / `Level2` / `Level3` |  | 三档渐进提示（可选） |

### 按答题格式区分的规则

**`MULTIPLE_CHOICE`（选择题）**
- `choices`: 必填，正好 5 个字符串（分别对应 A~E）
- `answer`: 必填，必须是 `"A"` / `"B"` / `"C"` / `"D"` / `"E"` 之一

**`INTEGER`（整数题 / AIME 风格）**
- `answer`: 必填，必须是规范化整数字符串，例如 `"42"`、`"-3"`、`"0"`
- `choices`: 不能出现

**`EXPRESSION`（表达式题）**
- `answer`: 必填，字符串形式的目标表达式（例如 `"\\frac{1}{2}"`）
- `choices`: 不能出现

**`PROOF`（证明题）** ⭐ 最适合发挥 Arcmath 的核心能力
- `answer`: **不填**（证明题没有唯一数值答案）
- `solutionSketch`: **必填**！用自然语言写一份参考证明（可以是几步的摘要，不必是严格证明）。系统会用它生成 milestone checklist — 这是老师的主要工作量所在
- `choices`: 不能出现

💡 写 `solutionSketch` 的建议：
- 按 "Step 1 / Step 2 / ..." 分步叙述关键过渡
- 点出每步用的技巧（AM-GM、反证、归纳等）
- 指出等号成立的条件
- 不需要是严格的 LaTeX 证明，自然语言即可

例子：

```
Step 1: 由 AM-GM，a^2 + b^2 + c^2 ≥ 3·(abc)^(2/3) = 3。
Step 2: 由 AM-GM，a + b + c ≥ 3·(abc)^(1/3) = 3。
Step 3: 由 QM-AM 或 Cauchy-Schwarz，a^2+b^2+c^2 ≥ (a+b+c)^2/3。
        设 s = a+b+c ≥ 3，则 s^2/3 ≥ s 即 s ≥ 3，得证。
```

系统会基于这段文字自动生成一份结构化 checklist，形如：

```
[M1] Establish a^2+b^2+c^2 ≥ 3   — technique: AM-GM
[M2] Establish a+b+c ≥ 3          — technique: AM-GM
[M3] Chain with QM-AM to close    — technique: power-mean
```

每次学生提交证明，系统会逐条判断学生是否证到了这些 milestone（ESTABLISHED / REPLACED / PARTIAL / MISSING / INVALID），并给出总评。

---

## 上传后发生什么

1. 系统校验 JSON
2. 插入 / 更新 `ProblemSet` 和 `Problem` 行
3. 对每道 `PROOF` 题异步触发 preprocess pipeline：
   - `formalizedStatus` 初始为 `PENDING`
   - 生成 milestone-checks recipe（~15–20 秒/题）
   - （可选）尝试 Lean 形式化（~10 秒/题）
   - 完成后 `formalizedStatus` 变为 `VERIFIED` / `FAILED` / `MANUAL_REVIEW`
4. 管理页会实时显示每道题的处理状态
5. 处理完成后，学生即可在题目页做题，系统逐步批改

20 题的证明题作业大约 3~5 分钟内完成自动处理。

---

## 上传入口

- Web UI: `/admin/import`（支持直接粘贴 JSON 或上传 `.json` 文件）
- CLI: `pnpm --filter web preprocess:problems --problem-set-id <id>` 可手动重跑

---

## 常见错误

| 错误信息 | 原因 |
|----------|------|
| `schemaVersion must be exactly "arcmath-problem-set-v1"` | 忘了顶层 `schemaVersion` 字段 |
| `For PROOF, solutionSketch is required` | 证明题没写参考思路 |
| `For MULTIPLE_CHOICE, choices must contain exactly 5 non-empty strings` | 选择题少于/多于 5 个选项 |
| `Problems must be numbered contiguously from 1 to N` | `number` 没从 1 开始或者有跳号 |
| `Duplicate problem number: X` | 两道题用了同一个 `number` |
