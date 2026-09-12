import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createRichNewsDocumentFromTiptap,
  createTiptapNewsDocument
} from '../src/lib/news-editor-document.mjs';

const document = {
  content: [
    { attrs: { level: 2 }, content: [{ text: 'Heading', type: 'text' }], type: 'heading' },
    {
      attrs: { layout: 'carousel' },
      content: [
        { attrs: { alt: 'First image', assetId: 'nma_0123456789abcdef0123456789abcdef' }, type: 'image' },
        { attrs: { alt: 'Second image', assetId: 'nma_abcdef0123456789abcdef0123456789' }, type: 'image' }
      ],
      type: 'imageGallery'
    },
    { attrs: { startAt: 5, videoId: 'dQw4w9WgXcQ' }, type: 'youtube' }
  ],
  format: 'tiptap-json-v1',
  type: 'doc'
};

test('round-trips the reviewed document subset while keeping the service format outside Tiptap', () => {
  assert.deepEqual(createTiptapNewsDocument(document), { type: 'doc', content: document.content });
  assert.deepEqual(createRichNewsDocumentFromTiptap({
    ...createTiptapNewsDocument(document),
    content: [{
      content: [{
        marks: [{ attrs: { class: null, href: 'https://bigfootds.com', rel: 'noopener', target: '_blank' }, type: 'link' }],
        text: 'A link',
        type: 'text'
      }],
      type: 'paragraph'
    }]
  }), {
    content: [{
      content: [{ marks: [{ attrs: { href: 'https://bigfootds.com' }, type: 'link' }], text: 'A link', type: 'text' }],
      type: 'paragraph'
    }],
    format: 'tiptap-json-v1',
    type: 'doc'
  });
});

test('rejects unsupported Tiptap nodes instead of serialising a partial article', () => {
  assert.throws(() => createRichNewsDocumentFromTiptap({
    content: [{ attrs: { src: 'https://untrusted.example/image.png' }, type: 'image' }],
    type: 'doc'
  }));
  assert.throws(() => createRichNewsDocumentFromTiptap({
    content: [{ type: 'codeBlock' }],
    type: 'doc'
  }));
});
