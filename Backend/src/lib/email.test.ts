import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildSmtpTransportOptions, parseEmailProvider } from './email';

describe('parseEmailProvider', () => {
  it('aceita console, resend, smtp e nodemailer', () => {
    assert.equal(parseEmailProvider(undefined), 'console');
    assert.equal(parseEmailProvider('console'), 'console');
    assert.equal(parseEmailProvider('resend'), 'resend');
    assert.equal(parseEmailProvider('smtp'), 'smtp');
    assert.equal(parseEmailProvider('nodemailer'), 'smtp');
  });
});

describe('buildSmtpTransportOptions', () => {
  it('exige SMTP_HOST e EMAIL_FROM', () => {
    const originalHost = process.env.SMTP_HOST;
    const originalFrom = process.env.EMAIL_FROM;
    try {
      delete process.env.SMTP_HOST;
      delete process.env.EMAIL_FROM;
      const missingHost = buildSmtpTransportOptions();
      assert.equal(missingHost.ok, false);
      if (!missingHost.ok) {
        assert.match(missingHost.error, /SMTP_HOST/);
      }

      process.env.SMTP_HOST = 'smtp.example.com';
      const missingFrom = buildSmtpTransportOptions();
      assert.equal(missingFrom.ok, false);
    } finally {
      if (originalHost === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = originalHost;
      if (originalFrom === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = originalFrom;
    }
  });

  it('monta opções com porta e secure padrão', () => {
    const snapshot = {
      SMTP_HOST: process.env.SMTP_HOST,
      EMAIL_FROM: process.env.EMAIL_FROM,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASS: process.env.SMTP_PASS,
      SMTP_PORT: process.env.SMTP_PORT,
      SMTP_SECURE: process.env.SMTP_SECURE,
    };
    try {
      process.env.SMTP_HOST = 'smtp.gmail.com';
      process.env.EMAIL_FROM = 'Gamers League <noreply@test.com>';
      process.env.SMTP_USER = 'user@test.com';
      process.env.SMTP_PASS = 'secret';
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_SECURE;

      const built = buildSmtpTransportOptions();
      assert.equal(built.ok, true);
      if (built.ok) {
        assert.deepEqual(built.options, {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: 'user@test.com', pass: 'secret' },
        });
      }
    } finally {
      for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
