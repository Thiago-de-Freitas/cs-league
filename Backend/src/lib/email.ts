import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export type EmailProvider = 'console' | 'resend' | 'smtp';

export type EmailSendResult = { ok: true } | { ok: false; error: string };

export function parseEmailProvider(value: string | undefined): EmailProvider {
  const provider = value?.trim().toLowerCase();
  if (provider === 'resend') return 'resend';
  if (provider === 'smtp' || provider === 'nodemailer') return 'smtp';
  return 'console';
}

function getEmailProvider(): EmailProvider {
  return parseEmailProvider(process.env.EMAIL_PROVIDER);
}

function buildVerificationEmailBody(displayName: string, code: string): { subject: string; text: string; html: string } {
  const subject = 'Seu código de verificação — Gamers League';
  const text = [
    `Olá, ${displayName}!`,
    '',
    `Use o código abaixo para confirmar seu e-mail na Gamers League:`,
    '',
    code,
    '',
    'O código expira em 10 minutos.',
    'Se você não criou esta conta, ignore esta mensagem.',
  ].join('\n');

  const html = `
    <p>Olá, <strong>${escapeHtml(displayName)}</strong>!</p>
    <p>Use o código abaixo para confirmar seu e-mail na <strong>Gamers League</strong>:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;margin:24px 0;">${escapeHtml(code)}</p>
    <p style="color:#666;">O código expira em 10 minutos.</p>
    <p style="color:#666;">Se você não criou esta conta, ignore esta mensagem.</p>
  `.trim();

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getEmailFrom(): string | null {
  const from = process.env.EMAIL_FROM?.trim();
  return from || null;
}

async function sendViaResend(to: string, subject: string, text: string, html: string): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = getEmailFrom();
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurada.' };
  }
  if (!from) {
    return { ok: false, error: 'EMAIL_FROM não configurado.' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return { ok: false, error: body || `Resend retornou HTTP ${response.status}` };
  }

  return { ok: true };
}

function parseSmtpPort(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 587;
  return Math.floor(parsed);
}

function parseSmtpSecure(value: string | undefined, port: number): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return port === 465;
}

type SmtpTransportConfig = {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
};

export function buildSmtpTransportOptions(): { ok: true; options: SmtpTransportConfig } | { ok: false; error: string } {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const from = getEmailFrom();

  if (!host) {
    return { ok: false, error: 'SMTP_HOST não configurado.' };
  }
  if (!from) {
    return { ok: false, error: 'EMAIL_FROM não configurado.' };
  }

  const port = parseSmtpPort(process.env.SMTP_PORT);
  const secure = parseSmtpSecure(process.env.SMTP_SECURE, port);

  const auth = user && pass ? { user, pass } : undefined;

  return {
    ok: true,
    options: {
      host,
      port,
      secure,
      auth,
    },
  };
}

let smtpTransporter: Transporter | null = null;

function getSmtpTransporter(): { ok: true; transporter: Transporter } | { ok: false; error: string } {
  const built = buildSmtpTransportOptions();
  if (!built.ok) return built;

  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport(built.options);
  }

  return { ok: true, transporter: smtpTransporter };
}

async function sendViaSmtp(to: string, subject: string, text: string, html: string): Promise<EmailSendResult> {
  const from = getEmailFrom();
  if (!from) {
    return { ok: false, error: 'EMAIL_FROM não configurado.' };
  }

  const transporterResult = getSmtpTransporter();
  if (!transporterResult.ok) {
    return transporterResult;
  }

  try {
    await transporterResult.transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao enviar e-mail via SMTP.';
    return { ok: false, error: message };
  }
}

export async function sendVerificationEmail(
  to: string,
  code: string,
  displayName: string
): Promise<EmailSendResult> {
  const { subject, text, html } = buildVerificationEmailBody(displayName, code);
  const provider = getEmailProvider();

  if (provider === 'console') {
    console.log(`[email] Verificação para ${to}: código ${code}`);
    return { ok: true };
  }

  if (provider === 'smtp') {
    return sendViaSmtp(to, subject, text, html);
  }

  return sendViaResend(to, subject, text, html);
}
