/**
 * Microsoft 365 SMTP mailer for invigilation duty emails.
 */
const nodemailer = require("nodemailer");

function smtpConfig() {
  const host = process.env.SMTP_HOST || process.env.MAIL_SERVER || "smtp.office365.com";
  const port = Number(process.env.SMTP_PORT || process.env.MAIL_PORT || 587);
  const secure =
    String(process.env.SMTP_SECURE || "false").toLowerCase() === "true" || port === 465;
  const user = process.env.SMTP_USER || process.env.MAIL_USERNAME || "support.iexam@kct.ac.in";
  const pass = process.env.SMTP_PASS || process.env.MAIL_PASSWORD || "";
  const from =
    process.env.MAIL_FROM ||
    process.env.MAIL_DEFAULT_SENDER ||
    `"Hallora Examination Cell" <${user}>`;

  return { host, port, secure, user, pass, from };
}

function isSmtpConfigured() {
  const { user, pass } = smtpConfig();
  return Boolean(user && pass);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const { host, port, secure, user, pass } = smtpConfig();
  if (!user || !pass) {
    const err = new Error(
      "SMTP is not configured. Set SMTP_USER and SMTP_PASS (Microsoft 365 app password)."
    );
    err.code = "SMTP_NOT_CONFIGURED";
    throw err;
  }
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    tls: { ciphers: "TLSv1.2" },
  });
  return transporter;
}

async function sendMail({ to, subject, text, html }) {
  const { from } = smtpConfig();
  const tx = getTransporter();
  const info = await tx.sendMail({
    from,
    to,
    subject,
    text,
    html: html || undefined,
  });
  return info;
}

function getMailFrom() {
  return smtpConfig().from;
}

module.exports = {
  smtpConfig,
  isSmtpConfigured,
  getTransporter,
  sendMail,
  getMailFrom,
};
