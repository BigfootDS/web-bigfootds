import rss from '@astrojs/rss';
import { getGeneratedPublicNews } from '../lib/public-news.mjs';
import { createPublicNewsFeedItems } from '../lib/news-legacy-redirects.mjs';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';

export async function GET(context) {
	const posts = await getGeneratedPublicNews();
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: createPublicNewsFeedItems(posts),
	});
}
