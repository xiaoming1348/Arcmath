# 试点学校接入手册 — 运营负责人版

这是一份从接触学校到 90 天试点结束的完整 runbook。默认配置：一位
ArcMath 运营（你）对接一位学校联系人（通常是教研组长或数学学科主任）。
节奏：一场 45 分钟的 kickoff 电话 + 前三周三次跟进。

试点席位上限：每校 3 位老师 + 50 位学生。超出限额务必先和创始人确认，
不要在电话里当场答应。

## 0. Kickoff 电话之前

提前通过邮件收集：

- 学校正式名称（写入 `Organization.name`）。
- 短标识 slug（写入 `Organization.slug`，用于审计日志和未来的 URL 路径）。
  默认规则：小写英文/拼音短横线连接，如 `qibao-dwight`。
- 学生端默认语言：`en` 或 `zh`。新邀请账号沿用该值，单个用户可在后台改。
- 学校管理员联系人：姓名、邮箱，可选电话/微信。
- 首批老师：姓名 + 邮箱，至多 3 位。
- 预期启动日期。学生通常第一天还没准备好，多数试点走
  「管理员周 + 老师周」→「老师建班」→「学生加入」的节奏，跨度 5–10 天。

**不要** 这一步就问学生邮箱。学生信息等老师开始建班时再收集。

## 1. 创建租户（ArcMath 运营侧）

平台管理员面板（`/admin`）入口，需要以 `User.role = ADMIN` 的账号登录。

1. 打开 `/admin/analytics`，确认目标学校 **尚未** 出现在列表里。如果
   已经存在，请复用现有行，绝对不要重复创建。
2. 跑 `create-pilot-school` 脚本（TODO：后续补成正式的 admin UI。
   试点期用一次性脚本即可）。和其它 ops 脚本一样，走 env 加载
   wrapper，让 `DATABASE_URL` 与 `PASSWORD_PEPPER` 能被注入：
   ```bash
   bash scripts/with-env-local.sh \
     pnpm -C apps/web exec tsx src/scripts/create-pilot-school.ts \
       --name "Example International School" \
       --slug "example-intl" \
       --locale zh \
       --admin-email "admin@example.edu" \
       --admin-name "张三"
   ```
   可选参数：`--trial-days <n>`（默认 90）、`--max-teacher-seats <n>`
   （默认 3）、`--max-student-seats <n>`（默认 50）、`--dry-run`
   （只做校验，不写入数据库）。
   脚本会：
   - 建 `Organization`，planType=`TRIAL`，trialEndsAt=90 天后，
     maxTeacherSeats=3，maxStudentSeats=50，defaultLocale=`en`|`zh`。
   - 建 `User`，`role=TEACHER`，随机生成的 16 位临时密码（已带
     pepper + bcrypt 哈希），`locale` 同学校默认。
   - 建 `OrganizationMembership`，`role=OWNER`，`status=ACTIVE`。
   - 写一条 `admin.organization.create_pilot_school` 审计行。

   四条写入在同一个 `$transaction` 里，中途失败会整体回滚 —— 不会
   留下半成品租户。

3. 脚本会在 stdout 里打印一次临时密码。请务必通过安全的带外渠道
   （1Password / Signal / 面对面）交给学校管理员 —— 不要与登录 URL
   走同一封邮件。等他们第一次登录成功后，在 Prisma Studio 里把
   passwordHash 换掉，并补一条 `admin.support_session.close` 审计行
   （自助「改密码」UI 是 Phase 7 的遗留项）。刷新
   `/admin/analytics`，学校会以红色健康点出现（尚无 runs，尚无除
   owner 外的老师）。

## 2. Kickoff 电话 — 带学校管理员走一遍自己的面板

45 分钟，Zoom / 腾讯会议共享屏幕。自己这边保留一个 `/admin/` 标签页
用来实时看审计日志。

**第 0–5 分钟 — 试点说明**
- 重申试点范围：3 老师、50 学生、90 天试用，试点期间免费，作为交换
  要求结束时填一份问卷 + 一次案例访谈。
- 主动告诉他们所有关键操作都留有审计日志（`/admin/analytics` →
  审计日志 tab）。这是为了支持排障，不是监控。

**第 5–20 分钟 — 邀请老师**
- 让学校管理员打开 `/teacher`（老师端首页）。走一遍「邀请老师」
  表单，填入 2 位真实老师的真实邮箱。表单会写入
  `OrganizationMembership`（role=TEACHER，status=INVITED）并发送重置
  密码邮件。
- 指给他们看席位计数（`2/3 teachers`）的实时更新。

**第 20–35 分钟 — 创建第一个班**
- 在 `/teacher/classes`，点「创建班级」→「十年级数学集训队」之类的名字。
- 展示生成的 6 位加入码。复制到聊天框，由他们会后发给学生。
- 讲清楚加入码的规则：每班一个，泄露后可在 `/teacher/classes/[id]`
  重新生成，新码立即生效，旧码作废。已有的学生选课不受影响。

**第 35–45 分钟 — 创建第一个作业**
- 进入 `/teacher/classes/[id]`，点「创建作业」，挑一份他们熟悉的
  AMC10 卷子。标题定「第一周热身」。
- `openAt` 留空（立刻开放），`dueAt` 设一周后。
- 预览班级面板：当学生开始答题后他们会看到每人的进度、每题的正确率。

**收尾**
- 发出后续跟进邮件（见 `PILOT_EMAIL_TEMPLATES.zh.md`「Kickoff 回顾」一节）。
- 日历上加一个第一周跟进的提醒。

## 3. 第一周 — 运营侧日常监控

前一周每天打开 `/admin/analytics`。关注信号：

| 信号 | 行动 |
|------|------|
| 连续 3 天红色（老师邀请未被激活） | 邮件问管理员「要不要帮你重发邀请」 |
| 黄色（老师入席但 0 runs） | 班可能还是空的。看 `/admin/analytics` 的 Classes 列：0 = 还没建班，≥1 = 没学生。按情况发邮件 |
| 绿色（有 runs） | 不要主动打扰。他们在用就别多问 |
| 审计日志出现 `targetType=Organization` 且不是你发起的事件 | 马上进 Audit tab 查出处 |

**不要** 擅自帮学校改数据。即便是「他们点错了」这种情况，五分钟的
走一遍也比悄无声息地回滚强。

## 4. 第一周跟进（30 分钟）

- 以开放式问题开头：「有什么出乎你意料？」试点期最大的价值是在产品
  定型之前听到未经修饰的反馈。
- 陪他们看班级进度面板，问他们课堂上对学生的直觉判断和这份数据是否
  吻合。不吻合的地方就是产品需求。
- 如果他们还没邀请学生，当场帮他们起一批。老师端邀请表单一次支持
  粘贴 100 个邮箱。

## 5. 第三周跟进（30 分钟）

- 电话前两天发出试点中期问卷（见邮件模板）。电话前读完回复。
- 和他们一起定：50 个学生席位留原班底还是替换？替换 = 移除选课（不删
  用户行，attempts 数据保留供我们分析）；加席 = 运营侧手工改
  `maxStudentSeats`，未经创始人许可不要当场答应。

## 6. 试点结束（第 90 天）

- 触发试点结束问卷。
- 做 1 小时案例访谈，经同意录音。
- 决策：转正（试用到期 → SCHOOL 正式方案），延长（`trialEndsAt`
  +30 天），或退出（租户内所有 membership 置 INACTIVE，数据保留 90
  天再清理）。

## 7. 升级路径

- 隐私咨询（例如「家长能看到孩子的答题吗？」）：转创始人，不要当场回答。
- 商务咨询：转创始人。
- 阻断学生使用的 bug：建 GitHub issue 打上 `pilot-blocker` 标签，
  4 个工作小时内回复学校 ETA。
- 安全事件（例如「我们怀疑别家学校看到了我们的数据」）：拉该租户的
  审计日志，24 小时内给创始人写一份 1 页的事件说明。
