const MAXIMUM_DEPTH = 12;
const MAXIMUM_NODES = 500;
const MAXIMUM_TEXT_LENGTH = 100_000;
const MAXIMUM_LINK_LENGTH = 2_000;
const MAXIMUM_GALLERY_IMAGES = 12;
const MAXIMUM_ALT_LENGTH = 300;
const MAXIMUM_CAPTION_LENGTH = 600;
const assetIdPattern = /^nma_[a-f0-9]{32}$/;
const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;

/**
 * Validates and normalises the small rich document language published by
 * MS-News. This is deliberately not a general Tiptap parser. The static build
 * keeps its own allowlist so a malformed upstream response cannot become
 * executable article markup.
 *
 * @param {unknown} value - Untrusted public API value.
 * @returns {RichNewsDocument} Safe document suitable for trusted components.
 * @throws {Error} When the document is unknown, unsafe, or exceeds its bounds.
 */
export function normaliseRichNewsDocument(value) {
  const budget = { nodes: 0, textLength: 0 };
  const document = parseDocument(value, 0, budget);
  if (document.content.length === 0) {
    throw new Error('MS-News returned an empty rich document.');
  }
  return document;
}

/**
 * Derives the same bounded plain-text representation used for a rich article's
 * search-compatible body. It is useful as a defensive snapshot check and is
 * not rendered as HTML.
 *
 * @param {RichNewsDocument} document - Previously normalised rich document.
 * @returns {string} Whitespace-normalised readable content.
 */
export function extractRichNewsDocumentText(document) {
  const fragments = [];
  collectText(document.content, fragments);
  return fragments.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Joins the stable public MS-News media route to a safe opaque asset ID.
 *
 * The generated URL is a service route, not a Cloud Storage URL. At request
 * time MS-News checks current visibility and creates any short-lived storage
 * redirect itself.
 *
 * @param {string} mediaDeliveryBaseUrl - Snapshot-provided route prefix.
 * @param {string} assetId - Opaque image ID from a normalised document.
 * @returns {string} Stable public image route.
 */
export function createNewsMediaDeliveryUrl(mediaDeliveryBaseUrl, assetId) {
  if (
    typeof mediaDeliveryBaseUrl !== 'string'
    || !mediaDeliveryBaseUrl.endsWith('/')
    || !assetIdPattern.test(assetId)
  ) {
    throw new Error('A safe News media delivery URL could not be created.');
  }

  return new URL(assetId, mediaDeliveryBaseUrl).toString();
}

function parseDocument(value, depth, budget) {
  const record = readExactRecord(value, ['content', 'format', 'type']);
  if (record.format !== 'tiptap-json-v1' || record.type !== 'doc') {
    throw new Error('MS-News returned an unsupported rich document.');
  }
  return {
    content: parseNodeList(record.content, depth + 1, budget, parseTopLevelNode),
    format: 'tiptap-json-v1',
    type: 'doc'
  };
}

function parseTopLevelNode(value, depth, budget) {
  const type = readNodeType(value);
  switch (type) {
    case 'paragraph': return parseParagraph(value, depth, budget);
    case 'heading': return parseHeading(value, depth, budget);
    case 'bulletList': return parseBulletList(value, depth, budget);
    case 'orderedList': return parseOrderedList(value, depth, budget);
    case 'blockquote': return parseBlockquote(value, depth, budget);
    case 'horizontalRule': return parseHorizontalRule(value, budget);
    case 'image': return parseImage(value, budget);
    case 'imageGallery': return parseImageGallery(value, depth, budget);
    case 'youtube': return parseYoutube(value, budget);
    default: throw new Error('MS-News returned an unsupported rich node.');
  }
}

function parseParagraph(value, depth, budget) {
  const record = readExactRecord(value, ['content', 'type']);
  if (record.type !== 'paragraph') {
    throw new Error('MS-News returned an invalid paragraph node.');
  }
  return {
    content: parseNodeList(record.content, depth + 1, budget, parseInlineNode),
    type: 'paragraph'
  };
}

function parseHeading(value, depth, budget) {
  const record = readExactRecord(value, ['attrs', 'content', 'type']);
  const attrs = readExactRecord(record.attrs, ['level']);
  if (record.type !== 'heading' || ![2, 3, 4].includes(attrs.level)) {
    throw new Error('MS-News returned an invalid heading node.');
  }
  return {
    attrs: { level: attrs.level },
    content: parseNodeList(record.content, depth + 1, budget, parseInlineNode),
    type: 'heading'
  };
}

function parseBulletList(value, depth, budget) {
  const record = readExactRecord(value, ['content', 'type']);
  if (record.type !== 'bulletList') {
    throw new Error('MS-News returned an invalid list node.');
  }
  return {
    content: parseNodeList(record.content, depth + 1, budget, parseListItem),
    type: 'bulletList'
  };
}

function parseOrderedList(value, depth, budget) {
  const record = readExactRecord(value, ['attrs', 'content', 'type']);
  if (record.type !== 'orderedList') {
    throw new Error('MS-News returned an invalid list node.');
  }
  const attrs = record.attrs === undefined ? undefined : readExactRecord(record.attrs, ['start']);
  const start = attrs === undefined ? undefined : parseOptionalInteger(attrs.start, 1, 1_000_000);
  return {
    ...(start === undefined ? {} : { attrs: { start } }),
    content: parseNodeList(record.content, depth + 1, budget, parseListItem),
    type: 'orderedList'
  };
}

function parseListItem(value, depth, budget) {
  const record = readExactRecord(value, ['content', 'type']);
  if (record.type !== 'listItem') {
    throw new Error('MS-News returned an invalid list item.');
  }
  return {
    content: parseNodeList(record.content, depth + 1, budget, parseListItemChild),
    type: 'listItem'
  };
}

function parseListItemChild(value, depth, budget) {
  const type = readNodeType(value);
  if (type === 'paragraph') return parseParagraph(value, depth, budget);
  if (type === 'bulletList') return parseBulletList(value, depth, budget);
  if (type === 'orderedList') return parseOrderedList(value, depth, budget);
  throw new Error('MS-News returned an invalid nested rich node.');
}

function parseBlockquote(value, depth, budget) {
  const record = readExactRecord(value, ['content', 'type']);
  if (record.type !== 'blockquote') {
    throw new Error('MS-News returned an invalid quote node.');
  }
  return {
    content: parseNodeList(record.content, depth + 1, budget, parseListItemChild),
    type: 'blockquote'
  };
}

function parseHorizontalRule(value, budget) {
  const record = readExactRecord(value, ['type']);
  if (record.type !== 'horizontalRule') {
    throw new Error('MS-News returned an invalid rule node.');
  }
  incrementNodeBudget(budget);
  return { type: 'horizontalRule' };
}

function parseImage(value, budget) {
  const record = readExactRecord(value, ['attrs', 'type']);
  const attrs = readExactRecord(record.attrs, ['alt', 'assetId', 'caption']);
  if (record.type !== 'image' || typeof attrs.assetId !== 'string' || !assetIdPattern.test(attrs.assetId)) {
    throw new Error('MS-News returned an invalid image node.');
  }
  const alt = parseShortText(attrs.alt, MAXIMUM_ALT_LENGTH, budget);
  const caption = attrs.caption === undefined ? undefined : parseShortText(attrs.caption, MAXIMUM_CAPTION_LENGTH, budget);
  incrementNodeBudget(budget);
  return {
    attrs: {
      ...(caption === undefined ? {} : { caption }),
      alt,
      assetId: attrs.assetId
    },
    type: 'image'
  };
}

function parseImageGallery(value, depth, budget) {
  const record = readExactRecord(value, ['attrs', 'content', 'type']);
  const attrs = readExactRecord(record.attrs, ['layout']);
  if (
    record.type !== 'imageGallery'
    || (attrs.layout !== 'carousel' && attrs.layout !== 'grid')
  ) {
    throw new Error('MS-News returned an invalid image gallery.');
  }
  const content = parseNodeList(record.content, depth + 1, budget, parseGalleryImage);
  if (content.length < 2 || content.length > MAXIMUM_GALLERY_IMAGES) {
    throw new Error('MS-News returned an invalid image gallery.');
  }
  return { attrs: { layout: attrs.layout }, content, type: 'imageGallery' };
}

function parseGalleryImage(value, _depth, budget) {
  return parseImage(value, budget);
}

function parseYoutube(value, budget) {
  const record = readExactRecord(value, ['attrs', 'type']);
  const attrs = readExactRecord(record.attrs, ['startAt', 'videoId']);
  const startAt = parseOptionalInteger(attrs.startAt, 0, 86_400);
  if (
    record.type !== 'youtube'
    || typeof attrs.videoId !== 'string'
    || !youtubeVideoIdPattern.test(attrs.videoId)
  ) {
    throw new Error('MS-News returned an invalid YouTube node.');
  }
  incrementNodeBudget(budget);
  return {
    attrs: {
      ...(startAt === undefined ? {} : { startAt }),
      videoId: attrs.videoId
    },
    type: 'youtube'
  };
}

function parseInlineNode(value, _depth, budget) {
  const record = readExactRecord(value, ['marks', 'text', 'type']);
  if (record.type !== 'text') {
    throw new Error('MS-News returned an invalid text node.');
  }
  const text = parseShortText(record.text, MAXIMUM_TEXT_LENGTH, budget, false);
  const marks = record.marks === undefined ? undefined : parseMarks(record.marks);
  incrementNodeBudget(budget);
  return { ...(marks === undefined ? {} : { marks }), text, type: 'text' };
}

function parseMarks(value) {
  if (!Array.isArray(value) || value.length > 5) {
    throw new Error('MS-News returned invalid text marks.');
  }
  const marks = value.map(parseMark);
  if (new Set(marks.map((mark) => mark.type)).size !== marks.length) {
    throw new Error('MS-News returned duplicate text marks.');
  }
  return marks;
}

function parseMark(value) {
  const record = readExactRecord(value, ['attrs', 'type']);
  if (['bold', 'italic', 'strike', 'code'].includes(record.type)) {
    if (record.attrs !== undefined) {
      throw new Error('MS-News returned invalid text marks.');
    }
    return { type: record.type };
  }
  if (record.type === 'link') {
    const attrs = readExactRecord(record.attrs, ['href']);
    if (
      typeof attrs.href !== 'string'
      || attrs.href.length === 0
      || attrs.href.length > MAXIMUM_LINK_LENGTH
      || !isApprovedLink(attrs.href)
    ) {
      throw new Error('MS-News returned an invalid link mark.');
    }
    return { attrs: { href: attrs.href }, type: 'link' };
  }
  throw new Error('MS-News returned an unsupported text mark.');
}

function isApprovedLink(value) {
  try {
    const url = new URL(value, 'https://bigfootds.com');
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function parseNodeList(value, depth, budget, parser) {
  if (!Array.isArray(value) || value.length === 0 || depth > MAXIMUM_DEPTH) {
    throw new Error('MS-News returned an invalid rich content list.');
  }
  return value.map((entry) => parser(entry, depth, budget));
}

function readExactRecord(value, allowedKeys) {
  if (!isRecord(value) || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new Error('MS-News returned an unexpected rich content field.');
  }
  return value;
}

function readNodeType(value) {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error('MS-News returned a rich node without a type.');
  }
  return value.type;
}

function parseShortText(value, maximumLength, budget, trim = true) {
  if (typeof value !== 'string') {
    throw new Error('MS-News returned non-text rich content.');
  }
  const result = trim ? value.trim() : value;
  if (
    result.length === 0
    || result.length > maximumLength
    || budget.textLength + result.length > MAXIMUM_TEXT_LENGTH
  ) {
    throw new Error('MS-News returned oversized rich content.');
  }
  budget.textLength += result.length;
  return result;
}

function parseOptionalInteger(value, minimum, maximum) {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error('MS-News returned an invalid rich number.');
  }
  return value;
}

function incrementNodeBudget(budget) {
  budget.nodes += 1;
  if (budget.nodes > MAXIMUM_NODES) {
    throw new Error('MS-News returned too many rich nodes.');
  }
}

function collectText(nodes, fragments) {
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        fragments.push(node.text);
        break;
      case 'image':
        fragments.push(node.attrs.alt, node.attrs.caption ?? '');
        break;
      case 'imageGallery':
      case 'paragraph':
      case 'heading':
      case 'bulletList':
      case 'orderedList':
      case 'blockquote':
      case 'listItem':
        collectText(node.content, fragments);
        break;
      case 'horizontalRule':
      case 'youtube':
        break;
      default:
        throw new Error('Unexpected normalised rich node.');
    }
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @typedef {{
 *   content: readonly RichNewsTopLevelNode[],
 *   format: 'tiptap-json-v1',
 *   type: 'doc'
 * }} RichNewsDocument
 */

/**
 * @typedef {{ attrs?: { href: string }, type: 'bold' | 'italic' | 'strike' | 'code' | 'link' }} RichNewsTextMark
 */

/** @typedef {{ marks?: readonly RichNewsTextMark[], text: string, type: 'text' }} RichNewsTextNode */
/** @typedef {{ content: readonly RichNewsTextNode[], type: 'paragraph' }} RichNewsParagraphNode */
/** @typedef {{ attrs: { level: 2 | 3 | 4 }, content: readonly RichNewsTextNode[], type: 'heading' }} RichNewsHeadingNode */
/** @typedef {{ content: readonly (RichNewsParagraphNode | RichNewsBulletListNode | RichNewsOrderedListNode)[], type: 'listItem' }} RichNewsListItemNode */
/** @typedef {{ content: readonly RichNewsListItemNode[], type: 'bulletList' }} RichNewsBulletListNode */
/** @typedef {{ attrs?: { start: number }, content: readonly RichNewsListItemNode[], type: 'orderedList' }} RichNewsOrderedListNode */
/** @typedef {{ content: readonly (RichNewsParagraphNode | RichNewsBulletListNode | RichNewsOrderedListNode)[], type: 'blockquote' }} RichNewsBlockquoteNode */
/** @typedef {{ type: 'horizontalRule' }} RichNewsHorizontalRuleNode */
/** @typedef {{ attrs: { alt: string, assetId: string, caption?: string }, type: 'image' }} RichNewsImageNode */
/** @typedef {{ attrs: { layout: 'carousel' | 'grid' }, content: readonly RichNewsImageNode[], type: 'imageGallery' }} RichNewsImageGalleryNode */
/** @typedef {{ attrs: { startAt?: number, videoId: string }, type: 'youtube' }} RichNewsYoutubeNode */

/**
 * @typedef {RichNewsParagraphNode | RichNewsHeadingNode | RichNewsBulletListNode | RichNewsOrderedListNode | RichNewsBlockquoteNode | RichNewsHorizontalRuleNode | RichNewsImageNode | RichNewsImageGalleryNode | RichNewsYoutubeNode} RichNewsTopLevelNode
 */

/**
 * @typedef {RichNewsTopLevelNode | RichNewsListItemNode} RichNewsNode
 */
