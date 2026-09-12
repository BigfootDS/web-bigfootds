import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createNewsMediaDeliveryUrl,
  extractRichNewsDocumentText,
  normaliseRichNewsDocument
} from '../src/lib/news-rich-document.mjs';

const imageAssetId = 'nma_0123456789abcdef0123456789abcdef';

test('normalises the approved rich news node set without creating executable markup', () => {
  const document = normaliseRichNewsDocument({
    content: [
      {
        content: [{
          marks: [{ type: 'bold' }, { attrs: { href: 'https://bigfootds.com/news' }, type: 'link' }],
          text: 'Announcement',
          type: 'text'
        }],
        type: 'paragraph'
      },
      {
        attrs: { alt: 'BigfootDS game artwork', assetId: imageAssetId, caption: 'A verified image.' },
        type: 'image'
      },
      {
        attrs: { layout: 'carousel' },
        content: [
          { attrs: { alt: 'First gallery image', assetId: imageAssetId }, type: 'image' },
          {
            attrs: { alt: 'Second gallery image', assetId: 'nma_fedcba9876543210fedcba9876543210' },
            type: 'image'
          }
        ],
        type: 'imageGallery'
      },
      { attrs: { startAt: 20, videoId: 'dQw4w9WgXcQ' }, type: 'youtube' }
    ],
    format: 'tiptap-json-v1',
    type: 'doc'
  });

  assert.equal(
    extractRichNewsDocumentText(document),
    'Announcement BigfootDS game artwork A verified image. First gallery image Second gallery image'
  );
  assert.equal(
    createNewsMediaDeliveryUrl('https://news.example.test/api/v1/news/media/', imageAssetId),
    'https://news.example.test/api/v1/news/media/' + imageAssetId
  );
});

test('rejects executable or unknown content before an Astro renderer can see it', () => {
  assert.throws(
    () => normaliseRichNewsDocument({
      content: [{ attrs: { src: 'javascript:alert(1)' }, type: 'iframe' }],
      format: 'tiptap-json-v1',
      type: 'doc'
    }),
    /unsupported rich node/
  );
  assert.throws(
    () => normaliseRichNewsDocument({
      content: [{
        attrs: {
          alt: 'Untrusted binary',
          assetId: imageAssetId,
          src: 'data:image/png;base64,abc'
        },
        type: 'image'
      }],
      format: 'tiptap-json-v1',
      type: 'doc'
    }),
    /unexpected rich content field/
  );
});
