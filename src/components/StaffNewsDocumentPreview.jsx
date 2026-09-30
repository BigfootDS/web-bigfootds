import { Fragment } from 'react';

import NewsImageGallery from './NewsImageGallery.jsx';
import { createRichNewsDocumentFromTiptap } from '../lib/news-editor-document.mjs';

/**
 * Renders an in-editor approximation of the public News article from the same
 * narrow document that will be sent to MS-News. It deliberately does not
 * invent delivery URLs for opaque media IDs: newly uploaded in-memory preview
 * URLs are used when available and other verified references remain labelled
 * placeholders until the public delivery path is allowed to resolve them.
 */
export function StaffNewsDocumentPreview({ assets, document }) {
  let richDocument;
  try {
    richDocument = createRichNewsDocumentFromTiptap(document);
  } catch {
    return <p className="staff-news-preview__unavailable">Add supported article content to preview it here.</p>;
  }
  const previewUrls = new Map(assets.flatMap((asset) => asset.previewUrl === undefined ? [] : [[asset.assetId, asset.previewUrl]]));
  return <article className="staff-news-preview" aria-label="Article preview">
    <RichNodeList nodes={richDocument.content} previewUrls={previewUrls} />
  </article>;
}

function RichNodeList({ nodes, previewUrls }) {
  return nodes.map((node, index) => <RichNode key={`${node.type}-${index}`} node={node} previewUrls={previewUrls} />);
}

function RichNode({ node, previewUrls }) {
  switch (node.type) {
    case 'paragraph': return <p><RichText nodes={node.content} /></p>;
    case 'heading': {
      const Heading = `h${node.attrs.level}`;
      return <Heading><RichText nodes={node.content} /></Heading>;
    }
    case 'bulletList': return <ul><RichNodeList nodes={node.content} previewUrls={previewUrls} /></ul>;
    case 'orderedList': return <ol start={node.attrs?.start}><RichNodeList nodes={node.content} previewUrls={previewUrls} /></ol>;
    case 'listItem': return <li><RichNodeList nodes={node.content} previewUrls={previewUrls} /></li>;
    case 'blockquote': return <blockquote><RichNodeList nodes={node.content} previewUrls={previewUrls} /></blockquote>;
    case 'horizontalRule': return <hr />;
    case 'image': return <PreviewImage image={node} previewUrls={previewUrls} />;
    case 'imageGallery': return <PreviewGallery gallery={node} previewUrls={previewUrls} />;
    case 'youtube': return <PreviewYoutube video={node} />;
    default: return null;
  }
}

function RichText({ nodes }) {
  return nodes.map((node, index) => {
    let element = node.text;
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') element = <strong>{element}</strong>;
      if (mark.type === 'italic') element = <em>{element}</em>;
      if (mark.type === 'strike') element = <s>{element}</s>;
      if (mark.type === 'code') element = <code>{element}</code>;
      if (mark.type === 'link') element = <a href={mark.attrs.href} rel="noreferrer noopener" target="_blank">{element}</a>;
    }
    return <Fragment key={`${node.text}-${index}`}>{element}</Fragment>;
  });
}

function PreviewImage({ image, previewUrls }) {
  const source = previewUrls.get(image.attrs.assetId);
  return <figure className="staff-news-preview__image">
    {source === undefined
      ? <div aria-label={`Verified image: ${image.attrs.alt}`} className="staff-news-preview__media-placeholder" role="img">Verified image: {image.attrs.alt}</div>
      : <img alt={image.attrs.alt} src={source} />}
    {image.attrs.caption === undefined ? null : <figcaption>{image.attrs.caption}</figcaption>}
  </figure>;
}

function PreviewGallery({ gallery, previewUrls }) {
  const images = gallery.content.map((image) => ({
    ...(image.attrs.caption === undefined ? {} : { caption: image.attrs.caption }),
    alt: image.attrs.alt,
    assetId: image.attrs.assetId,
    src: previewUrls.get(image.attrs.assetId)
  }));
  if (images.every((image) => image.src !== undefined)) {
    return <NewsImageGallery images={images} layout={gallery.attrs.layout} />;
  }
  return <section aria-label={`${gallery.attrs.layout} gallery preview`} className={`staff-news-preview__gallery staff-news-preview__gallery--${gallery.attrs.layout}`}>
    {images.map((image) => <PreviewImage image={{ attrs: image }} key={image.assetId} previewUrls={previewUrls} />)}
  </section>;
}

function PreviewYoutube({ video }) {
  const source = new URL(`https://www.youtube-nocookie.com/embed/${video.attrs.videoId}`);
  source.searchParams.set('modestbranding', '1');
  source.searchParams.set('rel', '0');
  if (video.attrs.startAt !== undefined) source.searchParams.set('start', String(video.attrs.startAt));
  return <div className="staff-news-preview__youtube">
    <iframe
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      src={source.toString()}
      title="Embedded YouTube video preview"
    />
  </div>;
}
