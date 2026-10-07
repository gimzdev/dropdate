import type { Metadata } from 'next'
import { A, Doc, DocSection, REPO } from '@/components/site'

export const metadata: Metadata = { title: 'Terms and privacy', alternates: { canonical: '/legal' } }

export default function Legal() {
  return (
    <Doc title="Terms and privacy" intro="Plain policies for using Dropdate and its API.">
      <DocSection id="terms" title="Terms of use">
        <div className="prose-dd">
          <p>Dropdate is provided as is, without warranty. Dates and details come from third-party sources and can change, so confirm with the official source before planning around a date.</p>
          <p><strong>You can</strong> use the API, copy the code, fork the project, build commercial applications on it and contribute back.</p>
          <p><strong>Please don’t</strong> flood the API with requests, or use it for spam or anything illegal.</p>
        </div>
      </DocSection>
      <DocSection id="privacy" title="Privacy">
        <div className="prose-dd">
          <p><strong>No accounts.</strong> Dropdate never asks for or stores personal information.</p>
          <p><strong>On your device.</strong> Your saved list lives in your browser’s local storage and never leaves it. Your search is kept in the page address so you can share it.</p>
          <p><strong>Server logs.</strong> The hosting provider may keep standard request logs, such as IP addresses, for security and operations.</p>
          <p><strong>Third parties.</strong> Game data and artwork come from <A to="https://rawg.io">RAWG</A> and <A to="https://store.steampowered.com">Steam</A>, esports data from <A to="https://pandascore.co">PandaScore</A>. Your browser loads images straight from their servers. Game names, logos and images belong to their owners.</p>
        </div>
      </DocSection>
      <DocSection id="source" title="Open source">
        <p className="prose-dd">Dropdate is open source under the CC0 license: <A to={REPO}>{REPO.replace('https://', '')}</A></p>
      </DocSection>
    </Doc>
  )
}
