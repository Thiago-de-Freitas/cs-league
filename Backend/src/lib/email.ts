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

function formatVerificationCode(code: string): string {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3)}`;
}

function getVerifyEmailPageUrl(): string | null {
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (!corsOrigin || corsOrigin.includes('${{')) return null;

  const origin = corsOrigin.split(',')[0]?.trim().replace(/\/+$/, '');
  if (!origin) return null;

  try {
    return new URL('/verify-email', origin).href;
  } catch {
    return null;
  }
}

export function buildVerificationEmailBody(displayName: string, code: string): { subject: string; text: string; html: string } {
  const safeName = escapeHtml(displayName);
  const formattedCode = formatVerificationCode(code);
  const safeCode = escapeHtml(formattedCode);
  const verifyUrl = getVerifyEmailPageUrl();

  const subject = `${formattedCode} — confirme seu e-mail na Gamers League`;

  const textLines = [
    `Olá, ${displayName}!`,
    '',
    'Bem-vindo à Gamers League — quase lá.',
    'Digite o código abaixo na tela de verificação para ativar sua conta:',
    '',
    formattedCode,
    '',
    '• O código expira em 10 minutos.',
    '• Você tem até 5 tentativas antes de precisar solicitar um novo código.',
    '• Não compartilhe este código com ninguém.',
  ];

  if (verifyUrl) {
    textLines.push('', `Acesse: ${verifyUrl}`);
  }

  textLines.push('', 'Se você não criou esta conta, ignore este e-mail.', '', '— Equipe Gamers League');
  const text = textLines.join('\n');

  const verifyButton = verifyUrl
    ? `
      <tr>
        <td style="padding:0 32px 28px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-radius:6px;background-color:#ff5500;">
                <a href="${escapeHtml(verifyUrl)}" target="_blank" rel="noopener noreferrer"
                  style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;text-decoration:none;">
                  Confirmar e-mail
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
  : '';

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verificação de e-mail — Gamers League</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;color:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#1a1a1a;border:1px solid #2d2d2d;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 12px;border-bottom:1px solid #2d2d2d;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#ff5500;">
                Gamers League
              </p>
              <h1 style="margin:10px 0 0;font-size:22px;line-height:1.3;font-weight:700;color:#f0f0f0;text-transform:uppercase;letter-spacing:0.04em;">
                Confirme seu e-mail
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#f0f0f0;">
                Olá, <strong style="color:#ffffff;">${safeName}</strong>!
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#a0a0a0;">
                Bem-vindo à plataforma. Use o código abaixo para ativar sua conta e entrar nas ligas.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border:1px solid #2d2d2d;border-radius:10px;">
                <tr>
                  <td align="center" style="padding:24px 16px;">
                    <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#a0a0a0;">
                      Seu código
                    </p>
                    <p style="margin:0;font-size:36px;line-height:1;font-weight:700;letter-spacing:0.28em;color:#ff5500;font-family:'Courier New',Courier,monospace;">
                      ${safeCode}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${verifyButton}
          <tr>
            <td style="padding:0 32px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#111111;border-radius:8px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#a0a0a0;">
                      • Expira em <strong style="color:#f0f0f0;">10 minutos</strong>
                    </p>
                    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#a0a0a0;">
                      • Até <strong style="color:#f0f0f0;">5 tentativas</strong> antes de solicitar um novo código
                    </p>
                    <p style="margin:0;font-size:13px;line-height:1.5;color:#a0a0a0;">
                      • Não compartilhe este código com ninguém
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#666666;">
                Se você não criou esta conta, pode ignorar este e-mail com segurança.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background-color:#111111;border-top:1px solid #2d2d2d;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#666666;text-align:center;">
                © Gamers League — ligas, partidas e rankings de CS
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

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

function normalizeApiKey(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return '';
  // Aspas ao colar no Railway / .env são erro comum
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

async function sendViaResend(to: string, subject: string, text: string, html: string): Promise<EmailSendResult> {
  const apiKey = normalizeApiKey(process.env.RESEND_API_KEY);
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
