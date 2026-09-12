import { mergeAttributes, Node } from '@tiptap/core';

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;

/**
 * Renders an MS-News image reference as an editor placeholder.
 *
 * The document deliberately stores no URL: the separately attested preview
 * flow resolves verified draft media into an in-memory browser object URL.
 */
export const NewsImage = Node.create({
  addAttributes() {
    return {
      alt: { default: '' },
      assetId: { default: null },
      caption: { default: null }
    };
  },
  atom: true,
  draggable: true,
  group: 'block',
  name: 'image',
  renderHTML({ HTMLAttributes, node }) {
    const label = typeof node.attrs.alt === 'string' && node.attrs.alt !== ''
      ? node.attrs.alt
      : 'Untitled uploaded image';
    const children = [['span', { class: 'staff-news-editor__media-label' }, `Image: ${label}`]];
    if (typeof node.attrs.caption === 'string' && node.attrs.caption !== '') {
      children.push(['figcaption', {}, node.attrs.caption]);
    }
    return ['figure', mergeAttributes({ 'data-news-image': 'true' }, HTMLAttributes), ...children];
  },
  selectable: true
});

/** Keeps ordered image references together as one explicit carousel or grid block. */
export const NewsImageGallery = Node.create({
  addAttributes() {
    return { layout: { default: 'carousel' } };
  },
  content: 'image{2,12}',
  group: 'block',
  isolating: true,
  name: 'imageGallery',
  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes({ 'data-news-image-gallery': 'true' }, HTMLAttributes), 0];
  }
});

/** Represents one validated YouTube ID without retaining an arbitrary iframe URL. */
export const NewsYoutube = Node.create({
  addAttributes() {
    return {
      startAt: { default: null },
      videoId: { default: null }
    };
  },
  atom: true,
  draggable: true,
  group: 'block',
  name: 'youtube',
  renderHTML({ HTMLAttributes, node }) {
    const source = createYoutubeEmbedUrl(node.attrs.videoId, node.attrs.startAt);
    return ['figure', mergeAttributes({ 'data-news-youtube': 'true' }, HTMLAttributes), [
      'a',
      { href: source ?? 'https://www.youtube.com/', rel: 'noreferrer noopener', target: '_blank' },
      source === undefined ? 'Invalid YouTube embed' : 'YouTube video embed'
    ]];
  },
  selectable: true
});

function createYoutubeEmbedUrl(videoId, startAt) {
  if (typeof videoId !== 'string' || !youtubeVideoIdPattern.test(videoId)) return undefined;
  const url = new URL(`https://www.youtube-nocookie.com/embed/${videoId}`);
  if (Number.isInteger(startAt) && startAt >= 0) url.searchParams.set('start', String(startAt));
  return url.toString();
}
