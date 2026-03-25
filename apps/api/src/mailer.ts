import nodemailer from 'nodemailer'

export type PasswordResetPayload = {
  email: string
  resetToken: string
  resetUrl?: string
  expiresAt?: Date
}

export type InvitePayload = {
  email: string
  inviteToken: string
  inviteUrl?: string
  workspaceName?: string | null
  role?: string | null
  expiresAt?: Date
}

export type EmailChangePayload = {
  email: string
  confirmationToken: string
  confirmationUrl?: string
  expiresAt?: Date
}

export type NotificationEmailPayload = {
  email: string
  subject: string
  title: string
  body: string
  actionUrl?: string
  actionLabel?: string
  intro?: string
  eyebrow?: string
  brandUrl?: string
  meta?: string[]
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function htmlParagraphs(value: string) {
  return value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.6;">${escapeHtml(part).replace(/\n/g, '<br />')}</p>`)
    .join('')
}

function formatExpiry(value?: Date) {
  return value ? value.toISOString() : null
}

function renderEmailTemplate(input: { preheader?: string; eyebrow?: string; title: string; intro?: string; body: string; actionLabel?: string; actionUrl?: string; brandUrl?: string; meta?: string[] }) {
  const preheader = input.preheader?.trim() || input.title
  const eyebrow = input.eyebrow?.trim() || 'sally_'
  const intro = input.intro?.trim()
  const meta = (input.meta || []).map((item) => item.trim()).filter(Boolean)
  const actionUrl = input.actionUrl?.trim()
  const actionLabel = input.actionLabel?.trim()
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/+$/, '')
  const logoUrl = baseUrl ? `${baseUrl}/sally_logo.png` : null
  const brandUrl = input.brandUrl?.trim() || baseUrl || 'https://usesally.com'

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
            <tr>
              <td style="padding:28px 32px 12px;">
                <div style="margin:0 0 18px;">
                  <a href="${escapeHtml(brandUrl)}" style="text-decoration:none;display:inline-block;">
                    ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="Sally" width="180" style="display:block;width:180px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />` : `<div style="font-size:28px;line-height:1;font-weight:800;color:#0f172a;">Sally</div>`}
                  </a>
                </div>
                <div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;margin-bottom:14px;">${escapeHtml(eyebrow)}</div>
                <h1 style="margin:0 0 14px;font-size:28px;line-height:1.15;color:#0f172a;">${escapeHtml(input.title)}</h1>
                ${intro ? `<p style="margin:0 0 16px;color:#334155;font-size:16px;line-height:1.6;">${escapeHtml(intro)}</p>` : ''}
                ${htmlParagraphs(input.body)}
                ${meta.length ? `<div style="margin:20px 0 0;padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">${meta.map((item) => `<div style="color:#475569;font-size:13px;line-height:1.5;margin:0 0 6px;">${escapeHtml(item)}</div>`).join('')}</div>` : ''}
                ${actionUrl && actionLabel ? `<div style="margin:24px 0 8px;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:12px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">${escapeHtml(actionLabel)}</a></div>` : ''}
                ${actionUrl ? `<p style="margin:14px 0 0;color:#64748b;font-size:12px;line-height:1.6;word-break:break-word;">If the button does not work, use this link:<br /><a href="${escapeHtml(actionUrl)}" style="color:#2563eb;">${escapeHtml(actionUrl)}</a></p>` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 28px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
                <div>This message was generated automatically by <a href="https://usesally.com" style="color:#0f172a;font-weight:700;text-decoration:none;">sally_</a></div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  const textLines = [
    input.title,
    intro || undefined,
    '',
    input.body,
    meta.length ? '' : undefined,
    ...meta.flatMap((item) => [item]),
    actionUrl && actionLabel ? '' : undefined,
    actionUrl && actionLabel ? `${actionLabel}: ${actionUrl}` : undefined,
    !actionLabel && actionUrl ? `Link: ${actionUrl}` : undefined,
  ].filter(Boolean)

  return { html, text: textLines.join('\n') }
}

export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_URL && process.env.MAIL_FROM && process.env.APP_BASE_URL)
}

async function sendMail(input: { to: string; subject: string; text: string; html: string }) {
  const transporter = nodemailer.createTransport(process.env.SMTP_URL!)
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
}

export async function sendPasswordResetEmail(payload: PasswordResetPayload): Promise<{ ok: boolean; reason?: string }> {
  if (!isMailerConfigured()) {
    return { ok: false, reason: 'SMTP_URL, MAIL_FROM, and APP_BASE_URL are required to send reset emails.' }
  }

  const baseUrl = process.env.APP_BASE_URL!.replace(/\/+$/, '')
  const resetUrl = payload.resetUrl ?? `${baseUrl}/reset-password?token=${encodeURIComponent(payload.resetToken)}`
  const expiresAtText = formatExpiry(payload.expiresAt)
  const rendered = renderEmailTemplate({
    preheader: 'Reset your sally_ password',
    eyebrow: 'Password reset',
    title: 'Reset your password',
    intro: 'A password reset was requested for your sally_ account.',
    body: 'Use the button below to choose a new password. If you did not request this, you can ignore this email.',
    actionLabel: 'Reset password',
    actionUrl: resetUrl,
    meta: expiresAtText ? [`This link expires at ${expiresAtText}.`] : [],
  })

  try {
    await sendMail({
      to: payload.email,
      subject: 'Reset your sally_ password',
      text: rendered.text,
      html: rendered.html,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Failed to send reset email.' }
  }
}

export async function sendInviteEmail(payload: InvitePayload): Promise<{ ok: boolean; reason?: string }> {
  if (!isMailerConfigured()) {
    return { ok: false, reason: 'SMTP_URL, MAIL_FROM, and APP_BASE_URL are required to send invite emails.' }
  }

  const baseUrl = process.env.APP_BASE_URL!.replace(/\/+$/, '')
  const inviteUrl = payload.inviteUrl ?? `${baseUrl}/accept-invite?token=${encodeURIComponent(payload.inviteToken)}`
  const expiresAtText = formatExpiry(payload.expiresAt)
  const workspaceText = payload.workspaceName ? `You were invited to join ${payload.workspaceName}.` : 'You were invited to join a workspace in sally_.'
  const rendered = renderEmailTemplate({
    preheader: 'You have been invited to sally_',
    eyebrow: 'Workspace invite',
    title: 'You are invited',
    intro: workspaceText,
    body: 'Open the invitation link below to accept access and finish setting up your account.',
    actionLabel: 'Accept invite',
    actionUrl: inviteUrl,
    meta: [payload.role ? `Role: ${payload.role}` : '', expiresAtText ? `This invite expires at ${expiresAtText}.` : ''],
  })

  try {
    await sendMail({
      to: payload.email,
      subject: 'You have been invited to sally_',
      text: rendered.text,
      html: rendered.html,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Failed to send invite email.' }
  }
}

export async function sendEmailChangeConfirmationEmail(payload: EmailChangePayload): Promise<{ ok: boolean; reason?: string }> {
  if (!isMailerConfigured()) {
    return { ok: false, reason: 'SMTP_URL, MAIL_FROM, and APP_BASE_URL are required to send email confirmation emails.' }
  }

  const baseUrl = process.env.APP_BASE_URL!.replace(/\/+$/, '')
  const confirmationUrl = payload.confirmationUrl ?? `${baseUrl}/confirm-email-change?token=${encodeURIComponent(payload.confirmationToken)}`
  const expiresAtText = formatExpiry(payload.expiresAt)
  const rendered = renderEmailTemplate({
    preheader: 'Confirm your sally_ email change',
    eyebrow: 'Email change',
    title: 'Confirm your new email address',
    intro: 'You requested to change the email address on your sally_ account.',
    body: 'Confirm the new email address with the button below. If this was not you, ignore this email and your current address will remain unchanged.',
    actionLabel: 'Confirm email change',
    actionUrl: confirmationUrl,
    meta: expiresAtText ? [`This link expires at ${expiresAtText}.`] : [],
  })

  try {
    await sendMail({
      to: payload.email,
      subject: 'Confirm your sally_ email change',
      text: rendered.text,
      html: rendered.html,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Failed to send email change confirmation.' }
  }
}

export async function sendNotificationEmail(payload: NotificationEmailPayload): Promise<{ ok: boolean; reason?: string }> {
  if (!isMailerConfigured()) {
    return { ok: false, reason: 'SMTP_URL, MAIL_FROM, and APP_BASE_URL are required to send notification emails.' }
  }

  const rendered = renderEmailTemplate({
    preheader: payload.subject,
    eyebrow: payload.eyebrow || 'Notification',
    title: payload.title,
    intro: payload.intro || 'You have a new sally_ notification.',
    body: payload.body,
    actionLabel: payload.actionLabel || (payload.actionUrl ? 'Open in sally_' : undefined),
    actionUrl: payload.actionUrl,
    brandUrl: payload.brandUrl,
    meta: payload.meta || [],
  })

  try {
    await sendMail({
      to: payload.email,
      subject: payload.subject,
      text: rendered.text,
      html: rendered.html,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Failed to send notification email.' }
  }
}
