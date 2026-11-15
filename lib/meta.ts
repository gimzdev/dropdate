import type { Metadata, ResolvingMetadata } from 'next'

/**
 * A page's own title and description for link previews (Open Graph and X cards), with the site's picture. Without this a page shares
 * the home page's title; and a page that sets `openGraph` itself would lose the picture (app/opengraph-image.jpg), so it is passed on here.
 */
export async function card(parent: ResolvingMetadata, title: string, description: string | undefined, path: string): Promise<Pick<Metadata, 'openGraph' | 'twitter'>> {
  const site = (await parent).openGraph
  return { openGraph: { type: 'website', siteName: 'Dropdate', url: path, title, description: description ?? site?.description, images: site?.images ?? [] }, twitter: { card: 'summary_large_image' } }
}
