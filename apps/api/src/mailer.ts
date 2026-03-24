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

export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_URL && process.env.MAIL_FROM && process.env.APP_BASE_URL)
}

export async function sendPasswordResetEmail(payload: PasswordResetPayload): Promise<{ ok: boolean; reason?: string }> {
  if (!isMailerConfigured()) {
    return { ok: false, reason: 'SMTP_URL, MAIL_FROM, and APP_BASE_URL are required to send reset emails.' }
  }

  const baseUrl = process.env.APP_BASE_URL!.replace(/\/+$/, '')
  const resetUrl = payload.resetUrl ?? `${baseUrl}/reset-password?token=${encodeURIComponent(payload.resetToken)}`
  const expiresAtText = payload.expiresAt ? `This link expires at ${payload.expiresAt.toISOString()}.` : ''

  try {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL)
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: payload.email,
      subject: 'Reset your AutomateThis password',
      text: `Use the link below to reset your password. ${expiresAtText}\n\n${resetUrl}\n`,
      html: `<p>Use the link below to reset your password.</p>${expiresAtText ? `<p>${expiresAtText}</p>` : ''}<p><a href="${resetUrl}">${resetUrl}</a></p>`,
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
  const expiresAtText = payload.expiresAt ? `This invite expires at ${payload.expiresAt.toISOString()}.` : ''
  const workspaceText = payload.workspaceName ? `to join ${payload.workspaceName}` : 'to join your workspace'
  const roleText = payload.role ? `Role: ${payload.role}.` : ''

  try {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL)
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: payload.email,
      subject: 'You have been invited to AutomateThis',
      text: `You have been invited ${workspaceText}. ${roleText} ${expiresAtText}\n\nAccept the invite: ${inviteUrl}\n`,
      html: `<p>You have been invited ${workspaceText}.</p>${roleText ? `<p>${roleText}</p>` : ''}${expiresAtText ? `<p>${expiresAtText}</p>` : ''}<p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
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
  const expiresAtText = payload.expiresAt ? `This link expires at ${payload.expiresAt.toISOString()}.` : ''

  try {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL)
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: payload.email,
      subject: 'Confirm your AutomateThis email change',
      text: `You requested to change the email on your AutomateThis account. ${expiresAtText}\n\nConfirm the change: ${confirmationUrl}\n`,
      html: `<p>You requested to change the email on your AutomateThis account.</p>${expiresAtText ? `<p>${expiresAtText}</p>` : ''}<p><a href="${confirmationUrl}">${confirmationUrl}</a></p>`,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Failed to send email change confirmation.' }
  }
}
