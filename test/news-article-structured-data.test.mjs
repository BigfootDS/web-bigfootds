import assert from 'node:assert/strict';
import test from 'node:test';

import { createNewsArticleStructuredData } from '../src/lib/news-article-structured-data.mjs';

const publicNews = {
	heroImage: 'https://bigfootds.com/news/public-image.png',
	pubDate: new Date('2026-09-12T00:00:00.000Z'),
	title: 'Published news',
	updatedDate: new Date('2026-09-12T01:00:00.000Z')
};

test('emits NewsArticle structured data only for explicitly marked news pages', () => {
	assert.equal(createNewsArticleStructuredData(publicNews), undefined);
	assert.equal(createNewsArticleStructuredData({ ...publicNews, isNewsArticle: false }), undefined);
	assert.equal(createNewsArticleStructuredData({
		...publicNews,
		isNewsArticle: true,
		pubDate: new Date('not a date')
	}), undefined);
	assert.equal(createNewsArticleStructuredData({
		...publicNews,
		isNewsArticle: true,
		title: undefined
	}), undefined);
	assert.deepEqual(createNewsArticleStructuredData({ ...publicNews, isNewsArticle: true }), {
		'@context': 'https://schema.org',
		'@type': 'NewsArticle',
		author: [{
			'@type': 'Person',
			name: 'BigfootDS',
			url: 'https://bigfootds.com/about/'
		}],
		dateModified: '2026-09-12T01:00:00.000Z',
		datePublished: '2026-09-12T00:00:00.000Z',
		headline: 'Published news',
		image: ['https://bigfootds.com/news/public-image.png']
	});
});
