'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { AuthError, confirmCode, requestCode, setSession, startProvider } from '@/lib/account'

// Sign in with a six-digit code by email, or Google or Discord when the site has them. The first code creates the account.

export interface Methods { email: boolean; google: boolean; discord: boolean }
type Provider = 'google' | 'discord'

/** Seconds before a new code can be asked for: the server holds the same line (CODE_GAP in lib/auth.ts). */
const WAIT = 45

/** Already signed in (a bookmark, Back, a forgotten marker): note it and carry on. */
export function Resume({ next }: { next: string }) {
  const router = useRouter()
  useEffect(() => { setSession(true); router.replace(next) }, [next, router])
  return (
    <div className="mx-auto w-full max-w-md rounded-panel bg-panel p-6 md:p-8">
      <p className="text-lg font-semibold">You are signed in.</p>
      <Link href={next} className="btn btn-mark mt-5">Continue</Link>
    </div>
  )
}

const field = 'h-12 w-full rounded-xl bg-black px-4 text-[17px] ring-1 ring-line/15 ring-inset transition placeholder:text-dim'
const link = 'underline decoration-line/30 underline-offset-4 transition hover:text-fg hover:decoration-mark'
const ERRORS: Record<string, string> = {
  NETWORK: 'No connection. Check your internet and try again.', INVALID_OTP: 'That code is not right. Check it and try again.',
  OTP_EXPIRED: 'That code has expired. Ask for a new one.', TOO_MANY_ATTEMPTS: 'Too many wrong tries. Ask for a new code.', INVALID_EMAIL: 'That email address does not look right.',
}

/** What went wrong, in words for a person. */
function describe(e: unknown, sending: boolean) {
  if (!(e instanceof AuthError)) return 'Something went wrong. Try again.'
  if (ERRORS[e.code]) return ERRORS[e.code]
  if (e.status === 429) return sending && e.message ? e.message : 'Too many tries. Wait a minute and try again.'
  if (e.status >= 500 && e.message) return e.message
  return 'Something went wrong. Try again.'
}

export function SignIn({ next, methods, dev, failed }: { next: string; methods: Methods; dev: boolean; failed: boolean }) {
  const router = useRouter()
  const [step, setStep] = useState<'email' | 'code'>('email'), [email, setEmail] = useState(''), [code, setCode] = useState('')
  const [busy, setBusy] = useState<'' | 'email' | 'code' | Provider>(''), [wait, setWait] = useState(0), [info, setInfo] = useState('')
  const [error, setError] = useState(failed ? 'That sign-in did not go through. Try again, or use an email code.' : '')
  const codeBox = useRef<HTMLInputElement>(null)
  const providers = (['google', 'discord'] as const).filter((p) => methods[p])
  const say = (err: string, note = '') => { setError(err); setInfo(note) }

  useEffect(() => { if (step === 'code') codeBox.current?.focus() }, [step])
  useEffect(() => { // the seconds until a new code may be asked for
    if (wait <= 0) return
    const t = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(t)
  }, [wait])
  useEffect(() => { // coming back from a provider with the Back button: the page is restored as it was left
    const back = (e: PageTransitionEvent) => { if (e.persisted) setBusy('') }
    addEventListener('pageshow', back)
    return () => removeEventListener('pageshow', back)
  }, [])

  async function send(again: boolean) {
    const to = email.trim().toLowerCase()
    if (!to || busy) return
    setBusy('email'); say('')
    const toCode = (note: string) => { setEmail(to); setStep('code'); setCode(''); setWait(WAIT); setInfo(note) }
    try {
      await requestCode(to)
      toCode(again ? 'A new code is on its way.' : '')
    } catch (e) {
      if (e instanceof AuthError && e.code === 'CODE_FRESH') toCode('A code was just sent to this address. Enter it, or wait a moment to ask for a new one.') // it went out a moment ago and still works
      else setError(describe(e, true))
    }
    setBusy('')
  }

  async function verify(value: string) {
    if (busy || value.length !== 6) return
    setBusy('code'); say('')
    try {
      await confirmCode(email, value)
      router.replace(next) // stays busy: the page changes
    } catch (e) {
      setError(describe(e, false)); setCode(''); setBusy('')
      codeBox.current?.focus()
    }
  }

  async function provider(name: Provider) {
    if (busy) return
    setBusy(name); say('')
    try { await startProvider(name, next) } catch (e) { setError(describe(e, false)); setBusy('') }
  }

  const submitEmail = (e: FormEvent) => { e.preventDefault(); void send(false) }
  const submitCode = (e: FormEvent) => { e.preventDefault(); void verify(code) }
  const feedback = (
    <div aria-live="polite">
      {error && <p role="alert" className="mt-4 rounded-xl bg-live/10 px-4 py-3 text-[15px] text-[#ffb7be] ring-1 ring-live/30 ring-inset">{error}</p>}
      {!error && info && <p className="mt-4 rounded-xl bg-go/10 px-4 py-3 text-[15px] text-go ring-1 ring-go/30 ring-inset">{info}</p>}
    </div>
  )

  if (!methods.email && !providers.length) {
    return <p className="rounded-panel bg-panel p-6 text-muted md:p-8">Signing in is not available right now. Please try again later.</p>
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-panel bg-panel p-6 md:p-8">
        {step === 'email' ? (
          <>
            {methods.email && (
              <form onSubmit={submitEmail} noValidate={false}>
                <label htmlFor="email" className="text-[15px] font-semibold">Email address</label>
                <input id="email" name="email" type="email" required autoFocus autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false}
                  placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-2 ${field}`} />
                <button type="submit" disabled={!!busy} className="btn btn-mark mt-4 h-12 w-full">{busy === 'email' ? 'Sending…' : 'Email me a code'}</button>
              </form>
            )}
            {methods.email && providers.length > 0 && (
              <div className="my-6 flex items-center gap-4 text-[13px] text-dim"><span className="h-px flex-1 bg-line/10" />or<span className="h-px flex-1 bg-line/10" /></div>
            )}
            {providers.length > 0 && (
              <div className="grid gap-3">
                {providers.map((p) => (
                  <button key={p} type="button" onClick={() => void provider(p)} disabled={!!busy} className="btn btn-line h-12 w-full">
                    {busy === p ? 'Opening…' : `Continue with ${p === 'google' ? 'Google' : 'Discord'}`}
                  </button>
                ))}
              </div>
            )}
            {feedback}
          </>
        ) : (
          <>
            <h2 className="display text-[2rem]">Check your email</h2>
            <p className="mt-3 text-muted">We sent a six-digit code to <strong className="font-semibold break-words text-fg">{email}</strong>. It works for 10 minutes.</p>
            <form onSubmit={submitCode} className="mt-6">
              <label htmlFor="code" className="sr-only">Six-digit code</label>
              <input ref={codeBox} id="code" name="code" required autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} placeholder="000000" value={code}
                onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) void verify(v) }}
                className={`${field} h-16 pl-[0.4em] text-center font-mono text-[30px] tracking-[0.4em]`} />
              <button type="submit" disabled={code.length !== 6 || !!busy} className="btn btn-mark mt-4 h-12 w-full">{busy === 'code' ? 'Checking…' : 'Sign in'}</button>
            </form>
            {feedback}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-[15px] text-muted">
              <button type="button" onClick={() => { setStep('email'); say('') }} className={link}>Use another email</button>
              <button type="button" onClick={() => void send(true)} disabled={wait > 0 || !!busy} className={`${link} disabled:pointer-events-none disabled:no-underline disabled:opacity-60`}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>
            </div>
            <p className="mt-5 text-[13px] text-dim">Nothing yet? Look in the spam folder too.</p>
          </>
        )}
        {dev && <p className="mt-5 rounded-xl bg-mark/10 px-4 py-3 text-[13px] text-[#ffe8a3] ring-1 ring-mark/25 ring-inset">Running on your computer without an email service: the code is printed in the terminal where Dropdate is running.</p>}
      </div>
      <p className="mt-6 text-center text-[13px] leading-relaxed text-dim">
        New here? Your first code creates your account. By continuing you confirm you are 16 or older and accept the <Link href="/legal" className={link}>terms and privacy policy</Link>.
      </p>
    </div>
  )
}
