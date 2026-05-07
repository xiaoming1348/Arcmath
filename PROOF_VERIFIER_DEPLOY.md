# proof-verifier 部署决策（pilot 上线前）

`services/proof-verifier` 是一个 Python (FastAPI) 微服务，负责把学生
写的单步证明分类（CALCULATION / ALGEBRAIC_MANIPULATION / GEOMETRIC /
…）然后路由到对应的验证后端：

- **SymPy** — 代数等价、方程恒等、简单不等式（MVP 主力）
- **Lean** — 暂时 stub，第二阶段补
- **LLM judge** — 由 Next.js 端在本服务返回 UNKNOWN 时兜底，不在本
  服务里调

Smoke test 记录显示：
```
[proof-verifier] request failed { path: '/classify', error: 'fetch failed' }
[proof-verifier] request failed { path: '/verify', error: 'fetch failed' }
```
意思是它**目前没有公网部署**。本地 dev 默认指向 `127.0.0.1:8765`，
但 prod Vercel 上 `PROOF_VERIFIER_URL` 没设，所有 step verification
都退化到 LLM-only（`generateProofReview` 之类）。

## 影响面（按 pilot 实际题型推算）

| 题型 | 占用率 | 不部署的影响 |
|---|---|---|
| AMC8 / AMC10 / AMC12 / AIME | ~85% | **零影响**。这些都是 ANSWER_ONLY 自动判分，不走 step verification |
| EUCLID 短题（INTEGER） | ~5% | 零影响，同上 |
| EUCLID 长题（多步） | ~3% | step verification 走 LLM-only，比 SymPy 嘈杂 |
| MAT / STEP（长题） | ~5% | 同上，LLM-only |
| USAMO / Putnam（证明） | ~2% | 同上，LLM-only |

**结论：pilot 阶段（多数学生做 AMC/AIME）不部署也能跑，但 STEP/MAT/
USAMO/Putnam 学生写完整步骤时反馈质量会明显变差。**

---

## 三个选项

### A. Fly.io（推荐）

**为什么推荐：**
- 免费 tier 覆盖这个负载（pilot 50 学生不会榨干一个 256 MB VM）
- 原生支持 Dockerfile（我们已经有了）
- 自动 HTTPS + 全球 anycast
- 部署一次后基本零维护

**步骤（约 30 分钟，含注册）：**

```bash
# 一次性：装 flyctl
brew install flyctl   # 或 curl -L https://fly.io/install.sh | sh

# 一次性：登录
flyctl auth signup    # 或 flyctl auth login

# 在 services/proof-verifier 目录下初始化
cd services/proof-verifier
flyctl launch --no-deploy --name arcmath-proof-verifier --region sjc
# 编辑生成的 fly.toml，确认：
#   - internal_port = 8000  （Dockerfile 里 EXPOSE 8000）
#   - http_service.force_https = true
#   - http_service.auto_stop_machines = true（省钱：闲了关机）
#   - http_service.min_machines_running = 0

# 部署
flyctl deploy

# 拿到 URL（形如 https://arcmath-proof-verifier.fly.dev）
flyctl status
```

**核验：**
```bash
curl https://arcmath-proof-verifier.fly.dev/health
# → {"status":"ok"}
```

**回到 Vercel：** 在项目环境变量加
```
PROOF_VERIFIER_URL = https://arcmath-proof-verifier.fly.dev
```
重部署一次 Vercel app，让新 env 生效。

**成本估算：** auto-stop 开着的话，月活成本 $0–3。学生量起来再升 paid。

---

### B. Railway

类似 Fly.io，UI 更友好，但**没有 always-free** —— 试用额度用完就要交
$5/月起。如果你已经在用 Railway 跑别的服务，附带这个最省事；否则
Fly 更省钱。

```bash
# 在 services/proof-verifier
railway login
railway init
railway up
railway domain     # 拿公网 URL
```

---

### C. Render

也支持 Dockerfile，免费 tier 存在但**冷启动慢**（首次请求 30 秒+），
学生体验不好，不推荐。

---

### D. 不部署（pilot 阶段就走 LLM-only）

**唯一改动：** 在 ENV_SETUP.md「Pre-Launch Checklist」里把
`PROOF_VERIFIER_URL` 标成 optional 而不是 strongly-recommended（已
经是 strongly-recommended）。

**取舍：**
- ✅ 上线时间提早 30 分钟
- ✅ 完全不引入新基础设施
- ❌ STEP/MAT/USAMO/Putnam 的 step verification 在 LLM-only 模式下
  误差更大（特别是代数恒等的"看起来对但 LLM 没识别出来"）
- ❌ 第一批写步骤的学生可能体验差，反馈给老师抱怨"系统没看懂我的式子"

---

## 我的建议

**选 A（Fly.io）。** 理由：

1. pilot 配置题量分布是未知的——如果一个学校的老师就喜欢用 STEP/Euclid
   长题，没 SymPy 兜底体验明显落差
2. 30 分钟的部署成本远小于"学生抱怨 → 我们排查 → 部署"的流转成本
3. 部署后基本零维护，下次要扩容也是同一套

**操作时机：** 部署 Fly.io → 在 Vercel 加 env → `pnpm smoke:student`
观察 `[proof-verifier]` 警告是否消失 → 就可以放学生进来了。

如果你手头紧（试点开始日期已经定了），D 方案也能跑，**但要在
SCHOOL_ONBOARDING.zh.md 里告诉老师"先用选择题/填空题作业，长题
慎用"**。

---

## 后续

- Lean 后端：stub 状态，第二阶段（pilot 后）补
- 监控：Fly.io 自带基本 metrics；如果要细看 verdict 分布，回头加一个
  Datadog / Honeycomb instrumentation
- 升级路径：负载真上来了（≥1k 学生），换成 Cloud Run / EKS，Dockerfile
  是同一份不需要改
