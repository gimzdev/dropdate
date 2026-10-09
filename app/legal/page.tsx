import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { A, Doc, DocSection, REPO } from '@/components/site'
import { ACCOUNTS } from '@/lib/core'
import { neonRegion } from '@/lib/pgconfig.mjs'

export const metadata: Metadata = { title: 'Terms and privacy', alternates: { canonical: '/legal' } }

const UPDATED = 'October 2026'
const PLACES: Record<string, string> = {
  'eu-central-1': 'Frankfurt, Germany', 'eu-west-2': 'London, United Kingdom', 'us-east-1': 'Virginia, United States', 'us-east-2': 'Ohio, United States',
  'us-west-2': 'Oregon, United States', 'ap-southeast-1': 'Singapore', 'ap-southeast-2': 'Sydney, Australia', 'sa-east-1': 'São Paulo, Brazil',
}
const li = 'pl-1'

/** Turns the addresses and links inside a line of text into links, and leaves the rest as it is. */
function linked(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s,;<>]+|[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+)/g).map((part, i) =>
    i % 2 === 0 ? part : part.includes('@') && !part.startsWith('http') ? <a key={i} href={`mailto:${part}`}>{part}</a> : <A key={i} to={part}>{part}</A>)
}

/** Who runs the site and how to reach them about personal data: whatever the owner wrote in PRIVACY_CONTACT (a name and an email address or link). */
function Contact() {
  const c = (process.env.PRIVACY_CONTACT || '').trim()
  if (!c) return <A to={REPO}>the owner of this site (see the project page on GitHub)</A>
  return <>{linked(c)}</>
}

export default function Legal() {
  const region = neonRegion(process.env.DATABASE_URL || ''), place = PLACES[region] ?? (region ? `the ${region} region` : 'the region chosen when the database was created')
  return (
    <Doc title="Terms and privacy" intro="Plain policies for using Dropdate and its API." toc={ACCOUNTS ? [['terms', 'Terms of use'], ['privacy', 'Privacy in short'], ['keep', 'What is stored'], ['who', 'Who handles it'], ['rights', 'Your rights'], ['source', 'Open source']] : undefined}>
      <DocSection id="terms" title="Terms of use">
        <div className="prose-dd">
          <p>Dropdate is provided as is, without warranty. Dates, scores and details come from third-party sources and can change, so confirm with the official source before planning around them.</p>
          <p><strong>You can</strong> use the API, copy the code, fork the project, build commercial applications on it and contribute back.</p>
          <p><strong>Please don’t</strong> flood the API with requests, or use it for spam or anything illegal.</p>
          {ACCOUNTS && (
            <>
              <p><strong>Accounts</strong> are free and for people aged 16 or older. One account is one email address. Your lists are yours: Dropdate does not show them to anyone else. You can delete the account whenever you like, and we may close one that is used to abuse the service.</p>
              <p><strong>Metacritic scores</strong> are shown as reported by RAWG and Steam. Metacritic is a trademark of its owner, and Dropdate is not affiliated with it.</p>
            </>
          )}
        </div>
      </DocSection>

      {ACCOUNTS ? (
        <>
          <DocSection id="privacy" title="Privacy in short">
            <div className="prose-dd">
              <p>Last updated {UPDATED}. You can use Dropdate without an account, and then nothing about you is collected by the site: your list stays in your browser and never leaves it.</p>
              <p>An account is <strong>your email address</strong> and <strong>the lists you build</strong> (the games you wishlist, and the games you mark as played, with the ones you also mark as completed), plus the few technical records listed below that keep you signed in and the service safe. There is no password, no name, no photo, no advertising, no analytics and no automated decision about you.</p>
              <p>At the bottom of your profile you can download a copy of your data or delete the account for good, in one click each.</p>
            </div>
          </DocSection>

          <DocSection id="keep" title="What is stored, why and for how long">
            <ul className="prose-dd list-disc space-y-3 pl-5">
              <li className={li}><strong>Email address.</strong> To sign you in and tell your lists apart from everyone else’s. Without it we cannot offer an account. Kept until you delete the account. An account nobody has signed in to or used for 24 months is deleted automatically.</li>
              <li className={li}><strong>Your wishlist and the games you have played.</strong> The games you chose, the date and time you added each one and, for a played game, when you marked it as completed, so the lists can be sorted and shown to you. Deleted with the account. Each game’s public details (title, date, artwork, Metacritic score) are a shared copy, not personal data.</li>
              <li className={li}><strong>Sign-in codes.</strong> The six-digit code we email you is stored scrambled (hashed). It works once, for 10 minutes or five wrong tries, and is erased when used or by the daily clean-up.</li>
              <li className={li}><strong>Your sign-in.</strong> One cookie, set only when you sign in, keeps you signed in (and, only while you sign in with Google or Discord, a short-lived one that protects that sign-in). A matching record in our database holds only a secret that matches the cookie, and its dates. A sign-in lasts 30 days and is renewed each time you come back after a day, so you stay signed in as long as you keep using Dropdate. It ends when you sign out, delete the account or stop coming for 30 days. These cookies are strictly necessary for the account to work, so they need no consent banner. Your browser also stores a small marker (<span className="code-inline">dropdate:session</span>) so the header shows the right button, and, signed out, your saved list (<span className="code-inline">dropdate:saved</span>). Neither is sent to anyone.</li>
              <li className={li}><strong>Abuse protection.</strong> To stop someone flooding sign-in emails or the data sources, we count requests per network address, per email address and per account. The counters are stored only as scrambled values and are deleted within two days.</li>
              <li className={li}><strong>Sign-in with Google or Discord</strong> (when offered). We receive your email address, and the identifier the provider uses for you (a code or number, not your name). Both are stored: the identifier is how we recognise you next time. Nothing else is kept: no name, photo or access tokens, and with Google we only ask for your email address.</li>
              <li className={li}><strong>Calendar link</strong> (only if you use it). The link you copy from your wishlist contains the list of games on it, not your email address. Whoever you give it to, and the calendar service that fetches it (Google, Apple, Microsoft), can see that list, so share it only with services you trust.</li>
              <li className={li}><strong>What is not stored:</strong> passwords, names, photos, IP addresses or device details in our database. The hosting provider may keep standard request logs, such as IP addresses, for security and operations.</li>
            </ul>
            <p className="prose-dd mt-5">We use this data to run your account and keep the service secure, which is what the law calls performing the service you asked for and our legitimate interest in security. We never sell it, share it for advertising or use it to profile you.</p>
          </DocSection>

          <DocSection id="who" title="Who handles your data">
            <div className="prose-dd">
              <p>The person who decides what is done with your data (the “controller” in the law’s words) is the owner of this site: <Contact />. That is also who to write to about anything on this page.</p>
              <p>Dropdate uses a few companies to run, and they handle data only on our instructions:</p>
              <ul className="list-disc space-y-3 pl-5">
                <li className={li}><strong><A to="https://vercel.com/legal/privacy-policy">Vercel</A></strong> hosts the site and the sign-in service, and may keep standard request logs.</li>
                <li className={li}><strong><A to="https://neon.com/privacy-policy">Neon</A></strong> stores the database, in {place}. It is encrypted at rest.</li>
                <li className={li}><strong><A to="https://resend.com/legal/privacy-policy">Resend</A></strong> delivers the sign-in email, so it sees your email address and the code, and keeps its own delivery logs for a short time.</li>
                <li className={li}><strong>Google or Discord</strong>, only if you choose to sign in with them.</li>
                <li className={li}><strong>Your calendar app</strong>, only if you subscribe it to your wishlist link.</li>
                <li className={li}><strong><A to="https://rawg.io">RAWG</A>, <A to="https://store.steampowered.com">Steam</A> and <A to="https://pandascore.co">PandaScore</A></strong> supply game and esports data. Your browser loads artwork straight from their servers, which can see your IP address, like any website you visit. Nothing about your account goes to them. When you search for a game by name, the words you typed go from our server to RAWG, without your address.</li>
              </ul>
              <p>Some of these companies work in the United States and elsewhere, and rely on the safeguards the law allows, such as standard contractual clauses, when data travels.</p>
            </div>
          </DocSection>

          <DocSection id="rights" title="Your rights">
            <div className="prose-dd">
              <p>Whoever you are and wherever you live, you can:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li className={li}><strong>See and take your data</strong>: <em>Download my data</em>, at the bottom of your profile, gives you a file with everything stored about you.</li>
                <li className={li}><strong>Erase it</strong>: <em>Delete my account</em>, at the bottom of your profile, removes the account, the sessions and all your lists immediately and for good. The database provider keeps a short automatic recovery history, which expires on its own.</li>
                <li className={li}><strong>Correct it or object</strong>: write to <Contact />. To change your email address, make a new account and delete the old one.</li>
              </ul>
              <p>These match the rights in the European GDPR, the UK GDPR and Quebec’s Law 25. If you think we handled your data badly, you can complain to your data protection authority: in France the CNIL, in Quebec the Commission d’accès à l’information, elsewhere the authority in your country.</p>
              <p>Dropdate is not meant for children under 16. If you are under 16, please do not create an account.</p>
              <p>Contact about personal data: <Contact />.</p>
            </div>
          </DocSection>
        </>
      ) : (
        <DocSection id="privacy" title="Privacy">
          <div className="prose-dd">
            <p><strong>No accounts.</strong> Dropdate never asks for or stores personal information.</p>
            <p><strong>On your device.</strong> Your saved list lives in your browser’s local storage and never leaves it. Your search is kept in the page address so you can share it.</p>
            <p><strong>Server logs.</strong> The hosting provider may keep standard request logs, such as IP addresses, for security and operations.</p>
            <p><strong>Third parties.</strong> Game data and artwork come from <A to="https://rawg.io">RAWG</A> and <A to="https://store.steampowered.com">Steam</A>, esports data from <A to="https://pandascore.co">PandaScore</A>. Your browser loads images straight from their servers. When you search for a game by name, the words you typed go from our server to RAWG, without your address. Game names, logos and images belong to their owners.</p>
          </div>
        </DocSection>
      )}

      <DocSection id="source" title="Open source">
        <p className="prose-dd">Dropdate is open source under the CC0 license: <A to={REPO}>{REPO.replace('https://', '')}</A></p>
      </DocSection>
    </Doc>
  )
}
