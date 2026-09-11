/**
 * Creates NewsArticle metadata only for a page that explicitly represents
 * public news. BlogPost is also the layout for projects, policy pages, and
 * general website content, so those routes must not inherit NewsArticle SEO.
 *
 * @param {{ heroImage?: string, isNewsArticle?: boolean, pubDate?: Date, title?: string, updatedDate?: Date }} options - Page metadata.
 * @returns {Record<string, unknown> | undefined} JSON-LD value for a genuine news page only.
 */
export function createNewsArticleStructuredData(options) {
  if (
    options.isNewsArticle !== true
    || typeof options.title !== 'string'
    || !isValidDate(options.pubDate)
  ) {
    return undefined;
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    author: [{
      '@type': 'Person',
      name: 'BigfootDS',
      url: 'https://bigfootds.com/about/'
    }],
    datePublished: options.pubDate.toISOString(),
    ...(isValidDate(options.updatedDate) ? { dateModified: options.updatedDate.toISOString() } : {}),
    headline: options.title,
    ...(typeof options.heroImage === 'string' ? { image: [options.heroImage] } : {})
  };
}

function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}
