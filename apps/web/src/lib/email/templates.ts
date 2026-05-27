/**
 * Inline-styled HTML templates for transactional email.
 *
 * We hand-write the markup (no React Email or MJML for now) because
 * pilot volume is low and the templates we need are few. Styles are
 * inline to survive Gmail / Outlook / Apple Mail rendering.
 *
 * All templates are bilingual: we render the user's preferred locale
 * if known, otherwise we render both languages in the same email
 * (English first, then 中文 below the divider).
 */

export type Locale = "en" | "zh" | null | undefined;

type VerifyEmailContent = {
  recipientName: string | null;
  verifyUrl: string;
  expiryHours: number;
};

/**
 * Wrap a body fragment in our pilot-era email shell (header + footer).
 * Designed to render acceptably in Gmail, which strips most <style>
 * blocks — everything important is inline.
 */
function shell(opts: { previewText: string; bodyHtml: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arcmath</title>
</head>
<body style="margin:0;padding:0;background:#faf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#1a1a1a;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${opts.previewText}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf7f1;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #ebe5d8;border-radius:12px;">
          <tr>
            <td style="padding:32px 36px 8px 36px;">
              <div style="font-family:'Georgia',serif;font-style:italic;font-weight:600;font-size:24px;color:#2b6fff;letter-spacing:-0.01em;">Arcmath</div>
              <div style="margin-top:4px;font-size:11px;font-weight:600;letter-spacing:0.18em;color:#7a7568;text-transform:uppercase;">Competition math, verified.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 32px 36px;">
              ${opts.bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 28px 36px;border-top:1px solid #ebe5d8;font-size:12px;color:#7a7568;line-height:1.6;">
              You are receiving this email because someone signed up for an Arcmath
              account with this email address. If that wasn't you, you can safely
              ignore this email — no account will be activated.
              <br><br>
              收到此邮件是因为有人用此邮箱注册了 Arcmath。如果不是你本人操作，
              忽略此邮件即可，账号不会被激活。
            </td>
          </tr>
        </table>
        <div style="margin-top:18px;font-size:11px;color:#a59f8d;">© Arcmath · arcscience.forecaster-ai.com</div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:#0f0f17;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:999px;letter-spacing:0.01em;">${label}</a>`;
}

/**
 * Verification email. Renders both languages so admins distributing
 * to a mix of Chinese / English students don't have to know each
 * user's locale.
 */
export function renderVerifyEmail(
  locale: Locale,
  content: VerifyEmailContent
): { subject: string; html: string; text: string } {
  const safeName = content.recipientName ?? "";
  const safeNameEn = safeName ? `Hi ${escapeHtml(safeName)},` : "Welcome to Arcmath,";
  const safeNameZh = safeName ? `${escapeHtml(safeName)} 你好，` : "欢迎来到 Arcmath，";

  // Bilingual subject for now — we can swap to locale-only later.
  const subject = "Verify your email · 验证你的 Arcmath 邮箱";

  const bodyHtml = `
    <h1 style="margin:24px 0 12px 0;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em;">Verify your email</h1>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1a1a1a;">${safeNameEn}</p>
    <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
      Click the button below to confirm your email and finish setting up your
      Arcmath account. The link expires in ${content.expiryHours} hours.
    </p>
    <p style="margin:0 0 28px 0;">${btn(content.verifyUrl, "Verify email")}</p>
    <p style="margin:0 0 28px 0;font-size:13px;line-height:1.6;color:#7a7568;word-break:break-all;">
      Or paste this link into your browser:<br>
      <a href="${content.verifyUrl}" style="color:#2b6fff;">${escapeHtml(content.verifyUrl)}</a>
    </p>

    <div style="margin:32px 0;height:1px;background:#ebe5d8;"></div>

    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;color:#1a1a1a;">验证你的邮箱</h2>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1a1a1a;">${safeNameZh}</p>
    <p style="margin:0 0 22px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
      点击下面的按钮确认你的邮箱，完成 Arcmath 账号注册。链接 ${content.expiryHours} 小时内有效。
    </p>
    <p style="margin:0 0 8px 0;">${btn(content.verifyUrl, "验证邮箱")}</p>
  `;

  const text = [
    `Verify your Arcmath email / 验证你的 Arcmath 邮箱`,
    ``,
    `Click the link below to verify your email and finish setting up your account.`,
    `点击下面链接验证邮箱，完成账号注册：`,
    ``,
    content.verifyUrl,
    ``,
    `The link expires in ${content.expiryHours} hours. / 链接 ${content.expiryHours} 小时内有效。`
  ].join("\n");

  return {
    subject,
    html: shell({ previewText: "Verify your Arcmath email", bodyHtml }),
    text
  };
}

// Minimal HTML escape — sufficient for templating user-provided names
// into <p> contexts. NOT a general-purpose sanitizer.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Pure-locale variant — if we later want to send single-language
// emails per user locale, this is a sketch. Unused for now.
export function pickGreeting(locale: Locale): "en" | "zh" {
  return locale === "zh" ? "zh" : "en";
}

// ============================================================
// Parent invite (Phase C-4)
// ============================================================

type ParentInviteContent = {
  /** Display name for the student. Falls back to "your child" / "您的孩子". */
  studentName: string | null;
  /** Optional relationship the teacher specified ("Mom", "Dad", "Guardian"). */
  relationship: string | null;
  /** The school's display name, so the parent knows who invited them. */
  organizationName: string;
  /** /parent/<token> magic link. Treated as a credential. */
  viewUrl: string;
  /** When the link stops working. */
  expiresAt: Date;
};

/**
 * Parent invite email — bilingual, single shell (English first then
 * Chinese under a divider), tracks the verification email's design
 * language. Footer differs from the verification email because the
 * recipient never signed up for an account; here they're being granted
 * read-only access by a teacher.
 */
export function renderParentInviteEmail(
  _locale: Locale,
  content: ParentInviteContent
): { subject: string; html: string; text: string } {
  const studentSafe = content.studentName
    ? escapeHtml(content.studentName)
    : null;
  const orgSafe = escapeHtml(content.organizationName);
  const expiryDate = content.expiresAt.toISOString().slice(0, 10);
  const studentEn = studentSafe ?? "your child";
  const studentZh = studentSafe ?? "您的孩子";

  const subject = studentSafe
    ? `${content.organizationName} invited you to see ${studentSafe}'s progress · ${content.organizationName} 邀请您查看${studentSafe}的学习进度`
    : `${content.organizationName} invited you to see your child's Arcmath progress · ${content.organizationName} 邀请您查看孩子的学习进度`;

  const bodyHtml = `
    <h1 style="margin:24px 0 12px 0;font-size:22px;font-weight:700;color:#1a1a1a;letter-spacing:-0.01em;">See ${studentEn}'s progress</h1>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
      A teacher at <strong>${orgSafe}</strong> invited you to view ${studentEn}&rsquo;s
      progress on Arcmath, a competition math practice platform. Click the
      button below to see the latest report&mdash;no account or sign-in needed.
    </p>
    <p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:#7a7568;">
      The link is valid until <strong>${expiryDate}</strong>. Keep this email private; anyone with the link can view the report.
    </p>
    <p style="margin:0 0 28px 0;">${btn(content.viewUrl, "View progress")}</p>
    <p style="margin:0 0 28px 0;font-size:13px;line-height:1.6;color:#7a7568;word-break:break-all;">
      Or paste this link into your browser:<br>
      <a href="${content.viewUrl}" style="color:#2b6fff;">${escapeHtml(content.viewUrl)}</a>
    </p>

    <div style="margin:32px 0;height:1px;background:#ebe5d8;"></div>

    <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:700;color:#1a1a1a;">查看${studentZh}的学习进度</h2>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#3a3a3a;">
      <strong>${orgSafe}</strong> 的老师邀请您查看${studentZh}在 Arcmath（竞赛数学练习平台）上的学习进度。
      点击下面的按钮即可查看最新报告，<strong>无需注册账号</strong>。
    </p>
    <p style="margin:0 0 22px 0;font-size:14px;line-height:1.6;color:#7a7568;">
      链接 <strong>${expiryDate}</strong> 前有效。请妥善保存此邮件&mdash;任何持有此链接的人都可查看报告。
    </p>
    <p style="margin:0 0 8px 0;">${btn(content.viewUrl, "查看进度")}</p>
  `;

  const text = [
    studentSafe
      ? `${content.organizationName} invited you to see ${studentSafe}'s Arcmath progress.`
      : `${content.organizationName} invited you to see your child's Arcmath progress.`,
    `Open this link (valid until ${expiryDate}):`,
    ``,
    content.viewUrl,
    ``,
    studentSafe
      ? `${content.organizationName} 邀请您查看 ${studentSafe} 在 Arcmath 的学习进度。`
      : `${content.organizationName} 邀请您查看孩子在 Arcmath 的学习进度。`,
    `请在 ${expiryDate} 之前打开此链接：`,
    content.viewUrl
  ].join("\n");

  // Custom-footer shell — the verify-email footer says "if it wasn't
  // you, ignore this", which doesn't fit a teacher-initiated invite.
  const previewText = studentSafe
    ? `${content.organizationName} invited you to see ${studentSafe}'s progress`
    : `${content.organizationName} invited you to see your child's progress`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Arcmath</title>
</head>
<body style="margin:0;padding:0;background:#faf7f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;color:#1a1a1a;">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(previewText)}</span>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#faf7f1;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;background:#ffffff;border:1px solid #ebe5d8;border-radius:12px;">
          <tr>
            <td style="padding:32px 36px 8px 36px;">
              <div style="font-family:'Georgia',serif;font-style:italic;font-weight:600;font-size:24px;color:#2b6fff;letter-spacing:-0.01em;">Arcmath</div>
              <div style="margin-top:4px;font-size:11px;font-weight:600;letter-spacing:0.18em;color:#7a7568;text-transform:uppercase;">Competition math, verified.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 32px 36px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 28px 36px;border-top:1px solid #ebe5d8;font-size:12px;color:#7a7568;line-height:1.6;">
              You are receiving this email because a teacher at ${orgSafe} added
              your address to ${studentSafe ?? "their student"}&rsquo;s family contact list.
              If you weren&rsquo;t expecting this, you can safely ignore it&mdash;no
              account exists with your address.
              <br><br>
              收到此邮件是因为 ${orgSafe} 的老师将您的邮箱加入了 ${studentZh}的家庭联系人列表。
              如果您并不知情，忽略此邮件即可&mdash;系统不会用您的邮箱创建账号。
            </td>
          </tr>
        </table>
        <div style="margin-top:18px;font-size:11px;color:#a59f8d;">© Arcmath · arcscience.forecaster-ai.com</div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
