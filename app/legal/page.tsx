import type { Metadata } from 'next'
import { A, Box, Doc, REPO } from '@/components/site'

export const metadata: Metadata = { title: 'Terms & privacy' }

export default function Legal() {
  const a = 'text-accent underline'
  return (
    <Doc eyebrow="Legal" title="Terms & privacy" intro="Simple, plain policies for using Dropdate.">
      <Box title="Terms of use">
        <div className="prose-dd">
          <p>Dropdate is provided &quot;as is&quot;, without warranty. Dates and details come from third-party sources and can change. Always confirm with the official source before planning around a date.</p>
          <p><strong>What you can do:</strong> use the API, copy the code, fork the project, build commercial applications and contribute.</p>
          <p><strong>What we ask:</strong> don&apos;t abuse the API with excessive requests, and don&apos;t use it for spam or anything illegal.</p>
        </div>
      </Box>
      <Box title="Privacy">
        <div className="prose-dd">
          <p><strong>No accounts.</strong> Dropdate does not ask for or store personal information.</p>
          <p><strong>On your device.</strong> Your theme and your saved list live in your browser&apos;s local storage and never leave it. Your search text is kept in the page URL so you can share it.</p>
          <p><strong>Server logs.</strong> The hosting provider may keep standard request logs (such as IP address) for security and operations.</p>
          <p><strong>Third parties.</strong> Game data and artwork come from <A to="https://rawg.io" className={a}>RAWG</A> and <A to="https://store.steampowered.com" className={a}>Steam</A>, esports data from <A to="https://pandascore.co" className={a}>PandaScore</A>. Your browser loads images directly from their servers. Game names, logos and images belong to their respective owners.</p>
        </div>
      </Box>
      <Box title="Open source">
        <p className="prose-dd">Dropdate is open source under the CC0 license: <A to={REPO} className={a}>{REPO.replace('https://', '')}</A></p>
      </Box>
    </Doc>
  )
}
