const localDemoPrefix = 'DO NOT PUBLISH';

const localDemoAssets = [
  {
    alt: 'BigfootDS website overhaul shown on a desktop screen',
    assetId: 'nma_00000000000000000000000000000001',
    caption: 'A local preview image. Replace this reference with verified local media before publishing any real post.',
    previewUrl: '/news/2024-12-29-website-overhaul.png'
  },
  {
    alt: 'A tiled Trickplay game scene',
    assetId: 'nma_00000000000000000000000000000002',
    caption: 'First gallery item.',
    previewUrl: '/news/2025yir/trickplay-tilesheet.png'
  },
  {
    alt: 'BigfootDS work completed in 2024',
    assetId: 'nma_00000000000000000000000000000003',
    caption: 'Second gallery item.',
    previewUrl: '/news/2024-12-31-2024-year-in-review.png'
  }
];

/**
 * Builds a local-only draft that demonstrates every supported News document
 * node and mark. Its opaque image IDs are intentionally fixtures, so this
 * draft can only be used to inspect the editor and preview in development.
 * Replace them through the verified-media flow before any real publication.
 *
 * @param {string} locale - Locale selected in the local editor.
 * @returns {object} Editable draft shape used by the staff composer.
 */
export function createLocalNewsEditorDemo(locale) {
  return {
    category: 'announcement',
    content: [{
      document: {
        content: [
          heading(2, 'Everything the News editor can display'),
          paragraph([
            text('This '),
            text('local-only demo', ['bold']),
            text(' includes '),
            text('italic', ['italic']),
            text(', '),
            text('struck-through', ['strike']),
            text(', and '),
            text('inline code', ['code']),
            text(', plus a '),
            text('clickable BigfootDS repository link', [{ attrs: { href: 'https://github.com/BigfootDS' }, type: 'link' }]),
            text('.')
          ]),
          heading(3, 'Structured text'),
          bulletList(['A familiar bullet list.', 'A nested document format that stays safe to publish.']),
          orderedList(['A numbered step.', 'A second numbered step.']),
          {
            content: [paragraph([text('Quotes remain visually distinct while using the same safe text model.')])],
            type: 'blockquote'
          },
          { type: 'horizontalRule' },
          heading(3, 'Images and galleries'),
          image(localDemoAssets[0]),
          {
            attrs: { layout: 'carousel' },
            content: [image(localDemoAssets[1]), image(localDemoAssets[2])],
            type: 'imageGallery'
          },
          heading(3, 'Video'),
          {
            attrs: { videoId: 'M7lc1UVf-VE' },
            type: 'youtube'
          }
        ],
        type: 'doc'
      },
      locale,
      summary: 'A local development draft that demonstrates supported News formatting. Do not publish.',
      title: `${localDemoPrefix}: News editor content demo`
    }],
    projectId: 'website',
    status: 'draft',
    tags: 'demo local do-not-publish'
  };
}

/**
 * Supplies development-only visual sources for the local demo without adding
 * URLs to its persisted document. The real editor continues to retain only
 * opaque media IDs after an upload has been verified.
 *
 * @returns {readonly object[]} In-memory media entries for the editor preview.
 */
export function createLocalNewsEditorDemoAssets() {
  return localDemoAssets.map((asset) => ({ ...asset }));
}

/**
 * Identifies the deliberately local demonstration content so the composer can
 * keep its publication controls unavailable while the fixture is loaded.
 *
 * @param {{ content?: readonly { title?: unknown }[] } | undefined} draft - Current editable draft.
 * @returns {boolean} Whether the draft is the protected local demo.
 */
export function isLocalNewsEditorDemo(draft) {
  return draft?.content?.some((entry) => typeof entry.title === 'string' && entry.title.startsWith(localDemoPrefix)) ?? false;
}

function heading(level, value) {
  return { attrs: { level }, content: [text(value)], type: 'heading' };
}

function paragraph(content) {
  return { content, type: 'paragraph' };
}

function bulletList(values) {
  return { content: values.map((value) => listItem(value)), type: 'bulletList' };
}

function orderedList(values) {
  return { content: values.map((value) => listItem(value)), type: 'orderedList' };
}

function listItem(value) {
  return { content: [paragraph([text(value)])], type: 'listItem' };
}

function image(asset) {
  return {
    attrs: {
      ...(asset.caption === undefined ? {} : { caption: asset.caption }),
      alt: asset.alt,
      assetId: asset.assetId
    },
    type: 'image'
  };
}

function text(value, marks = undefined) {
  return { ...(marks === undefined ? {} : { marks: marks.map((mark) => typeof mark === 'string' ? { type: mark } : mark) }), text: value, type: 'text' };
}
