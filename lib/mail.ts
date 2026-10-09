// The sign-in email, sent through Resend's HTTP API (no SDK, no tracking pixels, no links: only the code).
import 'server-only'
import { SITE } from './core'

const RESEND = (process.env.RESEND_BASE || 'https://api.resend.com').replace(/\/$/, '')

/** Codes printed in the terminal instead of emailed: only on your own machine. */
export const devCodes = () => process.env.DD_DEV_CODES === '1' && !process.env.VERCEL

/** Whether a code can be delivered: a Resend key, or on a local run the terminal. */
export const canEmail = () => !!process.env.RESEND_API_KEY || devCodes()

export async function sendCode(to: string, code: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    if (!devCodes()) throw new Error('Email is not configured: set RESEND_API_KEY')
    console.info(`\n  [dropdate] sign-in code for ${to}: ${code}\n`)
    return
  }
  const note = 'It works once and expires in 10 minutes. If you did not ask for it, you can ignore this email.'
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f4f3ef;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fff;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:700">Dropdate</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">Your sign-in code:</p>
<p style="margin:0 0 20px;font-size:36px;font-weight:800;letter-spacing:8px;background:#ffd23f;border-radius:12px;padding:14px 0;text-align:center">${code}</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#555">${note}</p>
</td></tr></table></td></tr></table></body></html>`
  const res = await fetch(`${RESEND}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM || `Dropdate <login@${new URL(SITE).hostname}>`, to: [to], subject: `${code} is your Dropdate sign-in code`, text: `Your Dropdate sign-in code is ${code}\n\n${note}`, html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`)
}
