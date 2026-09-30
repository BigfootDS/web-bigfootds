import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocalNewsEditorDemo,
  createLocalNewsEditorDemoAssets,
  isLocalNewsEditorDemo
} from '../src/lib/news-editor-local-demo.mjs';
import { createRichNewsDocumentFromTiptap } from '../src/lib/news-editor-document.mjs';

test('builds a clearly protected local demo with every supported rich-content kind', () => {
  const demo = createLocalNewsEditorDemo('en-AU');
  const document = createRichNewsDocumentFromTiptap(demo.content[0].document);

  assert.match(demo.content[0].title, /^DO NOT PUBLISH:/);
  assert.equal(isLocalNewsEditorDemo(demo), true);
  assert.deepEqual(document.content.map((node) => node.type), [
    'heading',
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'blockquote',
    'horizontalRule',
    'heading',
    'image',
    'imageGallery',
    'heading',
    'youtube'
  ]);
  assert.equal(document.content[1].content.some((entry) => entry.marks?.some((mark) => mark.type === 'link')), true);
  assert.equal(document.content[9].content.length, 2);
  assert.equal(document.content[11].attrs.videoId, 'M7lc1UVf-VE');
});

test('keeps demo visual sources in browser state instead of the persisted document', () => {
  const demo = createLocalNewsEditorDemo('en-AU');
  const assets = createLocalNewsEditorDemoAssets();
  const persisted = JSON.stringify(demo.content[0].document);

  assert.equal(assets.length, 3);
  assert.equal(assets.every((asset) => asset.previewUrl.startsWith('/news/')), true);
  assert.equal(persisted.includes('/news/'), false);
});
