# 试点技术支持剧本

列出试点期真实会遇到的工单及处理方式。每个场景包含症状、排查路径、
修复动作、以及回复话术。回复务必精简 — 用户要的是问题解决，不是
产品讲解。

核心准则：**任何修复都必须能在审计日志里追溯。** 如果你不得不执行
Prisma 裸查询，务必同步写一条审计日志说明做了什么、为什么。

## 排障工具箱

- `/admin/analytics` → Schools 页：每租户的计数和健康状态。
- `/admin/analytics` → Audit 页：按学校 + 动作命名空间过滤审计日志。
- `/admin` → 审核队列：内容侧（题目导入、证明形式化状态）。
- Prisma Studio（`pnpm -C packages/db db:studio`）：直连数据库的
  最后手段。默认只读；若要改数据，先准备好同步写的审计行。
- 用你自己的 `ADMIN` 账号登录，访问 `/teacher`。只要你在对应租户下
  有 membership，平台管理员可以以老师身份操作（见第 8 节）。

## 1. 「学生无法登录 / 没收到邀请邮件」

**症状：** 老师或学生邮件反馈「登录不了」、「没收到邀请」。

**排查：**
1. Prisma Studio → `User` 表，按邮箱（大小写不敏感）搜索。
   - 没有对应行 → 老师根本没邀请过。确认预期班级后请老师重发。
   - 有行，`passwordHash = "invite:unclaimed"` → 邀请发出了但
     没有被激活。要么邮件丢了要么进了垃圾箱。
   - 有行，正常 bcrypt 哈希 → 已有账号，只是忘了密码。
2. 对照 `/admin/analytics` → Audit tab，过滤该学校，动作
   `teacher.class.invite_students`，在 `payload.emails` 里找这个
   学生的邮箱。

**修复：**
- 未激活的邀请：在 `/admin` 触发一封重置密码邮件（定位到他们的邮箱
  → 发重置链接），提醒检查垃圾邮件。
- 忘密码：同上，发重置链接。
- User 行根本不存在：让老师在 `/teacher/classes/[id]` →「邀请学生」
  里把他们加上。

**回复模板：**「我已重新给 <邮箱> 发送了邀请。一般 2 分钟内到达，
若仍未收到请查看垃圾邮件。设置完密码后告诉我一声，我帮你确认已经
进入正确的班级。」

## 2. 「这所学校的学生席位已满」

**症状：** 学生用加入码自助加入时收到 FORBIDDEN，或老师批量邀请时
结果表里出现 `SEAT_FULL`。

**排查：** `/admin/analytics` → Schools，找到该校，`Students`
列对比 `50` 席位上限。

**修复：** 未经创始人批准 **不要** 擅自提高席位。先问学校管理员
是否愿意先移除不活跃学生：
- 可以主动提议你来做，但要先以老师身份接入（见第 8 节）。不要
  删除 `User` 行，只需把 `OrganizationMembership.status` 改成
  `INACTIVE` 并删除对应 `Enrollment`。这样释放席位的同时保留所有
  练习历史。
- 如果坚持要扩容，升级到创始人。

**回复模板：**「你们目前使用了 <used>/<max> 个学生席位。我们可以
移除一位不活跃的学生来腾位置，或者走扩容流程（需要创始人审批）。
你倾向哪种方案？」

## 3. 「加入码无效」

**症状：** 学生照老师给的码加入时收到 `NOT_FOUND`。

**排查：**
1. 和老师确认他们实际分享的是哪串码（最好截图确认）。
2. Prisma Studio → `Class` 表搜 `joinCode`。命中另一个租户 = 学生
   拿到了别校的码；完全没命中 = 码已重新生成。

**修复：**
- 已重新生成：让老师在 `/teacher/classes/[id]` 里把最新的码发过去。
- 学生拿到了别校的码：`joinClass` 的跨租户保护按预期工作，让学生
  再确认自己应该加入哪所学校。

## 4. 「学生加入了错误的班」

**症状：** 学生加入了 A 班，本应加入同校 B 班。

**排查：** `/admin/analytics` → Audit tab → 过滤该学校，搜索这个
用户的 `student.class.join` 事件。

**修复：** A 班老师在班级页面 `removeStudent` 把他移除，B 班老师
再邀请；或者学生自己用 B 班的码加入，A 班的选课关系需要 A 班老师
去清理。没有「转班」UI，试点期也不做。

**回复模板：**「请 A 班的 <老师姓名> 把你从班级页移除，然后你用
B 班的加入码自己加一次。」

## 5. 「班级面板里一个学生都没有」

**症状：** 老师反馈面板空的。

**排查：**
1. 和老师确认具体是哪个班（URL 或班级名）。
2. `/admin/analytics` → Audit tab → 过滤该学校，动作
   `student.class.join`，看 `targetId` 列里有没有这个班的 id。
3. 有 join 事件：学生确实加入了。很可能老师看错了班（如果他建了
   两个班，容易搞混）。
4. 没 join 事件：学生还没加入。让老师重发加入码。

**修复：** 我们这边不需要动数据。回复就是二选一：「你看的班是 X，
他们加入的是 Y」或者「他们还没加入，请在 /teacher/classes/[id]
里重新分享加入码」。

## 6. 「老师建了作业但学生看不到」

**症状：** 老师坚持已经建好了作业，学生首页却空空。

**排查：**
1. `/admin/analytics` → Audit tab → 过滤该学校，动作
   `teacher.assignment.create`。确认事件存在，记下 `targetId`
  （作业 id）和 `payload.openAt`。
2. 如果 `payload.openAt` 在未来，学生端的 assignments 查询会正确
   地过滤掉（见 `student.ts` 第 ~137 行的 `OR: [{ openAt: null },
   { openAt: { lte: now } }]`）。
3. 如果 `openAt` 为 null 或已过去，进一步检查学生有没有加入对应班级。

**修复：**
- 未到 `openAt`：向老师解释这是设计行为；如果他们想提前，可以在
  作业编辑页自己改。
- 学生没加入班级：让学生用加入码加入。

## 7. 「老师上传的题库卡住了，没法留作业」

**症状：** 老师上传了自己的题集，却不能分配给班级。

**排查：** `/admin/review`，筛选 `pending` 或 `missing_solution`。
按标题找到这份集，看 `formalizedStatus`：
- `PENDING`：预处理还在跑。小集给它 10 分钟。
- `FAILED`：形式化器报错。查最近一条
  `admin.review.set_formalized_status` 审计事件的 payload，或打开
  集详情页。
- `MANUAL_REVIEW`：预处理过了，但分类器判断需要人工复核。

**修复：** 真正读完之后再把状态推到 `READY`。PENDING/FAILED
可以先在 `/admin/review` 里「重新预处理」，再决定是否升级。

## 8. 「我需要以老师身份操作来排查」

平台管理员默认挂在「ArcMath Ops」这个哨兵租户下。若需要在某租户里
以老师身份操作：

1. Prisma Studio 给自己在目标租户里插一行
   `OrganizationMembership`，`role=TEACHER`，`status=ACTIVE`。
2. 退出登录再重新登录（context 只在登录时读 membership）。
3. 执行你需要做的事。每个动作都会以你的 `actorUserId` 写入
   `AuditLogEvent`。
4. 完成后用下面的脚本关闭会话。脚本会在同一个事务里把临时
   membership 改成 `DISABLED`（`OrganizationMembershipStatus` 枚举
   只有 `INVITED | ACTIVE | DISABLED` 三个值）并写一条
   `admin.support_session.close` 审计行：
   ```bash
   bash scripts/with-env-local.sh \
     pnpm -C apps/web exec tsx src/scripts/close-support-session.ts \
       --actor-email "you@arcmath.local" \
       --tenant-slug "example-intl" \
       --reason "帮老师 X 重新生成了加入码（原码泄露）"
   ```
   脚本在以下情况会拒绝执行：actor 不是 `role=ADMIN`、membership
   已经是 `DISABLED`、或者你传的是自己的 ArcMath Ops 哨兵租户。
   可以先加 `--dry-run` 预览。这一步很重要 —— 滞留的 ACTIVE 会让
   你出现在学校的老师席位计数和审计日志里，像一个「活跃」老师。

## 9. 「我们怀疑别校看到了我们的数据」

**停下来，升级。** 隔离合约见 `MULTI_TENANT_ISOLATION.md`。流程：

1. 收到反馈 1 小时内，先回执：「已收到，正在调查，24 小时内给你
   更新」。
2. 拉涉及两个租户最近 30 天的全部审计事件。查找 `actorUserId` 的
   活跃 membership 和他们操作对象的 `organizationId` 对不上的事件。
3. 给创始人写一页纸：时间线、受影响行的范围、根因（如已知）、
   补救措施。审计事件原始行附在 appendix。
4. 创始人确认对外口径后，再回复学校。

**不要** 在没有审计证据的前提下说是「用户操作错误」。**不要** 擅自
群发其他学校 — 跨租户通告必须由创始人出面。

## 10. 审计日志本身可疑时

如果 `AuditLogEvent` 的某行和你的预期不符，把审计日志当证据而非
真相，交叉对比：
- Prisma Studio 里审计事件声称改动的那行实际数据。
- Vercel 的 server log：每次 tRPC 调用都带着输入和调用者。
- `PracticeRun.startedAt` / `.completedAt`：这两个字段由 DB default
  设置，最适合做交叉校验。

如果差异看起来真实，立刻停止任何写入，直接打电话给创始人。审计
完整性是 p0 事件。
