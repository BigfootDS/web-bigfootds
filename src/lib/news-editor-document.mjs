import { normaliseRichNewsDocument } from './news-rich-document.mjs';

/**
 * Converts the persisted MS-News document into the shape Tiptap accepts.
 *
 * `format` is a service contract field, not a ProseMirror node attribute, so
 * it must never be handed to Tiptap as though an extension owns it.
 */
export function createTiptapNewsDocument(document) {
  const normalised = normaliseRichNewsDocument(document);
  return { content: normalised.content, type: 'doc' };
}

/**
 * Converts a Tiptap JSON tree back into the narrow MS-News document language.
 *
 * Extensions can add presentation attributes such as link targets or null
 * defaults. This function retains only the reviewed content semantics then
 * runs the same strict normaliser that protects public static rendering. It
 * rejects unknown editor nodes rather than silently storing a partial article.
 */
export function createRichNewsDocumentFromTiptap(value) {
  if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content)) {
    throw new Error('The editor document is invalid.');
  }
  return normaliseRichNewsDocument({
    content: value.content.map(convertTopLevelNode),
    format: 'tiptap-json-v1',
    type: 'doc'
  });
}

function convertTopLevelNode(value) {
  const type = readNodeType(value);
  switch (type) {
    case 'paragraph': return { content: convertInlineNodes(value.content), type };
    case 'heading': return {
      attrs: { level: readHeadingLevel(value.attrs) },
      content: convertInlineNodes(value.content),
      type
    };
    case 'bulletList':
    case 'orderedList': return convertList(value, type);
    case 'blockquote': return { content: convertListChildren(value.content), type };
    case 'horizontalRule': return { type };
    case 'image': return convertImage(value);
    case 'imageGallery': return convertImageGallery(value);
    case 'youtube': return convertYoutube(value);
    default: throw new Error('The editor contains an unsupported node.');
  }
}

function convertList(value, type) {
  const result = { content: convertListItems(value.content), type };
  if (type === 'orderedList' && value.attrs?.start !== undefined && value.attrs.start !== null) {
    return { ...result, attrs: { start: value.attrs.start } };
  }
  return result;
}

function convertListItems(value) {
  if (!Array.isArray(value)) throw new Error('The editor contains an invalid list.');
  return value.map((entry) => {
    if (readNodeType(entry) !== 'listItem') throw new Error('The editor contains an invalid list item.');
    return { content: convertListChildren(entry.content), type: 'listItem' };
  });
}

function convertListChildren(value) {
  if (!Array.isArray(value)) throw new Error('The editor contains invalid nested content.');
  return value.map((entry) => {
    const type = readNodeType(entry);
    if (type === 'paragraph') return { content: convertInlineNodes(entry.content), type };
    if (type === 'bulletList' || type === 'orderedList') return convertList(entry, type);
    throw new Error('The editor contains invalid nested content.');
  });
}

function convertInlineNodes(value) {
  if (!Array.isArray(value)) throw new Error('The editor contains invalid text content.');
  return value.map((entry) => {
    if (!isRecord(entry) || entry.type !== 'text' || typeof entry.text !== 'string') {
      throw new Error('The editor contains invalid text content.');
    }
    const marks = entry.marks === undefined ? undefined : convertMarks(entry.marks);
    return { ...(marks === undefined ? {} : { marks }), text: entry.text, type: 'text' };
  });
}

function convertMarks(value) {
  if (!Array.isArray(value)) throw new Error('The editor contains invalid text formatting.');
  return value.map((entry) => {
    if (!isRecord(entry) || typeof entry.type !== 'string') throw new Error('The editor contains invalid text formatting.');
    if (['bold', 'italic', 'strike', 'code'].includes(entry.type)) return { type: entry.type };
    if (entry.type === 'link' && isRecord(entry.attrs) && typeof entry.attrs.href === 'string') {
      return { attrs: { href: entry.attrs.href }, type: 'link' };
    }
    throw new Error('The editor contains unsupported text formatting.');
  });
}

function convertImage(value) {
  if (!isRecord(value.attrs)) throw new Error('The editor contains an invalid image.');
  const attrs = value.attrs;
  if (typeof attrs.assetId !== 'string' || typeof attrs.alt !== 'string') {
    throw new Error('The editor contains an invalid image.');
  }
  return {
    attrs: {
      ...(typeof attrs.caption === 'string' && attrs.caption !== '' ? { caption: attrs.caption } : {}),
      alt: attrs.alt,
      assetId: attrs.assetId
    },
    type: 'image'
  };
}

function convertImageGallery(value) {
  if (!isRecord(value.attrs) || (value.attrs.layout !== 'carousel' && value.attrs.layout !== 'grid') || !Array.isArray(value.content)) {
    throw new Error('The editor contains an invalid image gallery.');
  }
  return {
    attrs: { layout: value.attrs.layout },
    content: value.content.map((entry) => {
      if (readNodeType(entry) !== 'image') throw new Error('The editor contains an invalid image gallery.');
      return convertImage(entry);
    }),
    type: 'imageGallery'
  };
}

function convertYoutube(value) {
  if (!isRecord(value.attrs) || typeof value.attrs.videoId !== 'string') {
    throw new Error('The editor contains an invalid video.');
  }
  return {
    attrs: {
      ...(value.attrs.startAt === undefined || value.attrs.startAt === null ? {} : { startAt: value.attrs.startAt }),
      videoId: value.attrs.videoId
    },
    type: 'youtube'
  };
}

function readNodeType(value) {
  if (!isRecord(value) || typeof value.type !== 'string') throw new Error('The editor contains a node without a type.');
  return value.type;
}

function readHeadingLevel(value) {
  if (!isRecord(value) || ![2, 3, 4].includes(value.level)) throw new Error('The editor contains an invalid heading.');
  return value.level;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
