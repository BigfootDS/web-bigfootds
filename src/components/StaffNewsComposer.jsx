import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';

import { BrowserAuthSessionError, verifyStoredBrowserAuthSession } from '../lib/browser-auth-session.mjs';
import {
  EditorialNewsApiError,
  createEditorialMediaCompleteRequest,
  createEditorialMediaPreviewRequest,
  createEditorialMediaUploadIntentRequest,
  createEditorialNewsPostInput,
  createEditorialNewsPostRequest,
  createEditorialNewsScheduleInput,
  readEditorialMediaCompletionResponse,
  readEditorialMediaPreviewResponse,
  readEditorialMediaUploadIntentResponse,
  readEditorialNewsPostResponse,
  sendEditorialMediaUpload
} from '../lib/editorial-news-api.mjs';
import { createRichNewsDocumentFromTiptap, createTiptapNewsDocument } from '../lib/news-editor-document.mjs';
import { NewsImage, NewsImageGallery, NewsYoutube } from '../lib/news-editor-extensions.mjs';
import '../styles/staff-news.css';

const emptyEditorDocument = { content: [{ type: 'paragraph' }], type: 'doc' };

/**
 * Provides the staff-only MS-News composer on a static route.
 *
 * Records, media capabilities, signed preview data, and token pairs stay in
 * browser memory or local storage rather than being emitted into Astro's
 * static HTML. MS-News remains responsible for attestation, validation,
 * lifecycle decisions, and its audit history.
 */
export default function StaffNewsComposer({ apiBaseUrl, authBaseUrl }) {
  const [draft, setDraft] = useState(undefined);
  const [phase, setPhase] = useState('loading');
  const [selectedLocale, setSelectedLocale] = useState('en-AU');
  const [status, setStatus] = useState('Checking staff access…');
  const [assets, setAssets] = useState([]);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [galleryLayout, setGalleryLayout] = useState('carousel');
  const editorRef = useRef(null);
  const previewUrls = useRef(new Set());

  useEffect(() => () => {
    for (const url of previewUrls.current) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    void loadDraft();
  }, [apiBaseUrl, authBaseUrl]);

  async function loadDraft() {
    if (!apiBaseUrl || !authBaseUrl) {
      setPhase('unavailable');
      setStatus('News administration is not available in this deployment yet.');
      return;
    }
    const parameters = new URLSearchParams(window.location.search);
    const id = parameters.get('id');
    const locale = parameters.get('locale') ?? 'en-AU';
    try {
      const session = await verifyStoredBrowserAuthSession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
      if (!session) throw new EditorialNewsApiError('rejected');
      if (id === null) {
        setDraft(createEmptyDraft(locale));
        setSelectedLocale(locale);
        setPhase('ready');
        setStatus('Create a draft. A rich article needs a title, summary, and content before it can be saved.');
        return;
      }
      const response = await requestWithCurrentSession((session) => createEditorialNewsPostRequest({
        apiBaseUrl,
        id,
        operation: 'read',
        session
      }), session);
      const post = await readEditorialNewsPostResponse(response);
      const normalisedDraft = createEditableDraft(post);
      setDraft(normalisedDraft);
      setSelectedLocale(normalisedDraft.content.some((entry) => entry.locale === locale) ? locale : normalisedDraft.content[0].locale);
      setPhase('ready');
      setStatus(post.status === 'published'
        ? 'This post is published. Unpublish it before changing its content.'
        : 'News record loaded.');
    } catch (error) {
      setPhase(isSignInRejection(error) ? 'signed-out' : 'unavailable');
      setStatus(statusForError(error));
    }
  }

  async function requestWithCurrentSession(createRequest, verifiedSession = undefined) {
    const session = verifiedSession ?? await verifyStoredBrowserAuthSession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
    if (!session) throw new EditorialNewsApiError('rejected');
    let request = createRequest(session);
    let response;
    try {
      response = await fetch(request.url, request.init);
    } catch {
      throw new EditorialNewsApiError('unavailable');
    }
    if (response.status !== 401 && response.status !== 403) return response;

    const renewed = await verifyStoredBrowserAuthSession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
    if (!renewed) return response;
    request = createRequest(renewed);
    try {
      return await fetch(request.url, request.init);
    } catch {
      throw new EditorialNewsApiError('unavailable');
    }
  }

  function updateDraft(update) {
    setDraft((current) => current === undefined ? current : { ...current, ...update });
  }

  function updateSelectedContent(update) {
    setDraft((current) => current === undefined ? current : {
      ...current,
      content: current.content.map((entry) => entry.locale === selectedLocale ? { ...entry, ...update } : entry)
    });
  }

  function addLocale(event) {
    event.preventDefault();
    const locale = String(new FormData(event.currentTarget).get('locale') ?? '').trim();
    if (!locale || draft.content.some((entry) => entry.locale === locale)) {
      setStatus('Use a new locale code such as en-AU before adding another translation.');
      return;
    }
    setDraft((current) => ({
      ...current,
      content: [...current.content, { document: emptyEditorDocument, locale, summary: '', title: '' }]
    }));
    setSelectedLocale(locale);
    event.currentTarget.reset();
  }

  function removeSelectedLocale() {
    if (draft.content.length < 2) return;
    setDraft((current) => ({ ...current, content: current.content.filter((entry) => entry.locale !== selectedLocale) }));
    setSelectedLocale(draft.content.find((entry) => entry.locale !== selectedLocale).locale);
  }

  async function saveDraft() {
    try {
      const body = createEditorialNewsPostInput({
        category: draft.category,
        contents: draft.content.map((entry) => ({
          ...entry,
          document: createRichNewsDocumentFromTiptap(entry.document)
        })),
        projectId: draft.projectId,
        tags: splitTags(draft.tags)
      });
      const operation = draft.id === undefined ? 'create' : 'save';
      const response = await requestWithCurrentSession((session) => createEditorialNewsPostRequest({
        apiBaseUrl,
        body,
        id: draft.id ?? '',
        operation,
        session
      }));
      const saved = await readEditorialNewsPostResponse(response);
      replaceDraft(saved, 'Draft saved.');
    } catch (error) {
      setStatus(error instanceof EditorialNewsApiError && error.kind === 'validation'
        ? 'Check each locale, title, summary, metadata, and rich content before saving.'
        : statusForError(error));
    }
  }

  async function publishNow() {
    await runLifecycleAction('publish', undefined, 'News was published.');
  }

  async function unpublish() {
    await runLifecycleAction('unpublish', undefined, 'News was unpublished and can now be edited.');
  }

  async function schedule(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const body = createEditorialNewsScheduleInput({
        publishAt: localTimeToIso(String(form.get('publishAt') ?? '')),
        unpublishAt: readOptionalLocalTime(String(form.get('unpublishAt') ?? ''))
      });
      await runLifecycleAction('schedule', body, 'News schedule saved.');
    } catch (error) {
      setStatus(error instanceof EditorialNewsApiError && error.kind === 'validation'
        ? 'Enter a future publishing time and, if needed, a later unpublish time.'
        : statusForError(error));
    }
  }

  async function runLifecycleAction(operation, body, success) {
    if (draft.id === undefined) {
      setStatus('Save this draft before changing its publication state.');
      return;
    }
    try {
      const response = await requestWithCurrentSession((session) => createEditorialNewsPostRequest({
        apiBaseUrl,
        ...(body === undefined ? {} : { body }),
        id: draft.id,
        operation,
        session
      }));
      replaceDraft(await readEditorialNewsPostResponse(response), success);
    } catch (error) {
      setStatus(statusForError(error));
    }
  }

  function replaceDraft(post, nextStatus) {
    const nextDraft = createEditableDraft(post);
    setDraft(nextDraft);
    setSelectedLocale(nextDraft.content.some((entry) => entry.locale === selectedLocale) ? selectedLocale : nextDraft.content[0].locale);
    if (post.id && window.location.search === '') {
      window.history.replaceState({}, '', `/admin/news/editor/?id=${encodeURIComponent(post.id)}&locale=${encodeURIComponent(selectedLocale)}`);
    }
    setStatus(nextStatus);
  }

  async function uploadImage(event) {
    event.preventDefault();
    const uploadForm = event.currentTarget;
    const form = new FormData(uploadForm);
    const file = form.get('image');
    const alt = String(form.get('alt') ?? '').trim();
    const caption = String(form.get('caption') ?? '').trim();
    if (!(file instanceof File) || file.size === 0 || !alt) {
      setStatus('Choose an image and provide concise alt text before uploading.');
      return;
    }

    setStatus('Requesting a one-image upload capability…');
    try {
      const intentResponse = await requestWithCurrentSession((session) => createEditorialMediaUploadIntentRequest({
        apiBaseUrl,
        byteLength: file.size,
        contentType: file.type,
        session
      }));
      const intent = await readEditorialMediaUploadIntentResponse(intentResponse);
      await sendEditorialMediaUpload({ file, upload: intent.upload });
      const completionResponse = await requestWithCurrentSession((session) => createEditorialMediaCompleteRequest({
        apiBaseUrl,
        assetId: intent.assetId,
        session
      }));
      const completed = await readEditorialMediaCompletionResponse(completionResponse);
      let previewUrl;
      try {
        const previewResponse = await requestWithCurrentSession((session) => createEditorialMediaPreviewRequest({
          apiBaseUrl,
          assetId: completed.assetId,
          session
        }));
        previewUrl = await readEditorialMediaPreviewResponse({ response: previewResponse });
        previewUrls.current.add(previewUrl);
      } catch {
        // Preview transport is an editor aid only. Completion already proved the
        // opaque asset is valid and ready for document insertion.
      }
      const asset = {
        ...completed,
        alt,
        ...(caption === '' ? {} : { caption }),
        ...(previewUrl === undefined ? {} : { previewUrl })
      };
      setAssets((current) => [...current, asset]);
      setStatus(previewUrl === undefined
        ? 'Image verified. Its temporary preview could not be loaded, but it can still be inserted into the article or selected for a gallery.'
        : 'Image verified. Insert it into the article or select it with another image for a gallery.');
      uploadForm.reset();
    } catch (error) {
      setStatus(error instanceof EditorialNewsApiError && error.kind === 'validation'
        ? 'Use a JPEG, PNG, or WebP image no larger than 10 MiB.'
        : 'The image could not be uploaded and verified. It was not added to the article.');
    }
  }

  function insertImage(asset) {
    editorRef.current?.chain().focus().insertContent({ attrs: assetToImageAttrs(asset), type: 'image' }).run();
  }

  function toggleGalleryAsset(assetId) {
    setSelectedAssets((current) => current.includes(assetId)
      ? current.filter((candidate) => candidate !== assetId)
      : [...current, assetId]);
  }

  function insertGallery() {
    const images = selectedAssets.map((assetId) => assets.find((asset) => asset.assetId === assetId)).filter(Boolean);
    if (images.length < 2) {
      setStatus('Select at least two verified images to insert a gallery.');
      return;
    }
    editorRef.current?.chain().focus().insertContent({
      attrs: { layout: galleryLayout },
      content: images.map((asset) => ({ attrs: assetToImageAttrs(asset), type: 'image' })),
      type: 'imageGallery'
    }).run();
  }

  function moveGalleryAsset(assetId, direction) {
    setSelectedAssets((current) => {
      const index = current.indexOf(assetId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function insertYoutube(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const videoId = readYoutubeVideoId(String(form.get('video') ?? ''));
    const startAt = String(form.get('startAt') ?? '').trim();
    if (videoId === undefined || (startAt !== '' && (!/^\d+$/.test(startAt) || Number(startAt) > 86_400))) {
      setStatus('Use a YouTube video URL or ID and an optional start time up to 86,400 seconds.');
      return;
    }
    editorRef.current?.chain().focus().insertContent({
      attrs: { ...(startAt === '' ? {} : { startAt: Number(startAt) }), videoId },
      type: 'youtube'
    }).run();
    event.currentTarget.reset();
  }

  if (phase === 'loading' || phase === 'signed-out' || phase === 'unavailable') {
    return <p aria-live="polite">{status}</p>;
  }

  const content = draft.content.find((entry) => entry.locale === selectedLocale);
  const locked = draft.status === 'published' || draft.status === 'archived';
  return (
    <section className="staff-news" aria-labelledby="staff-news-composer-heading">
      <p><a href="/admin/news/">← News administration</a></p>
      <h1 id="staff-news-composer-heading">{draft.id ? 'Edit News record' : 'New News draft'}</h1>
      <p aria-live="polite">{status}</p>

      <div className="staff-news__editor-grid">
        <div>
          <fieldset className="staff-news__fieldset" disabled={locked}>
            <legend>Record metadata</legend>
            <label>Project ID<input value={draft.projectId} onChange={(event) => updateDraft({ projectId: event.target.value })} required /></label>
            <label>Category<input value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })} required /></label>
            <label>Tags (space or comma separated)<input value={draft.tags} onChange={(event) => updateDraft({ tags: event.target.value })} /></label>
          </fieldset>

          <div className="staff-news__locale-row">
            <label>Editing locale<select value={selectedLocale} onChange={(event) => setSelectedLocale(event.target.value)}>{draft.content.map((entry) => <option key={entry.locale} value={entry.locale}>{entry.locale}</option>)}</select></label>
            {draft.content.length > 1 && <button type="button" onClick={removeSelectedLocale} disabled={locked}>Remove locale</button>}
          </div>
          <form className="staff-news__inline-form" onSubmit={addLocale}>
            <label>Add locale<input name="locale" placeholder="ja-JP" disabled={locked} /></label>
            <button type="submit" disabled={locked}>Add translation</button>
          </form>

          <fieldset className="staff-news__fieldset" disabled={locked}>
            <legend>Localised content</legend>
            <label>Title<input value={content.title} onChange={(event) => updateSelectedContent({ title: event.target.value })} maxLength="200" required /></label>
            <label>Summary<textarea value={content.summary} onChange={(event) => updateSelectedContent({ summary: event.target.value })} maxLength="600" rows="3" required /></label>
            <label>Article</label>
            <StaffNewsRichEditor
              key={`${draft.id ?? 'new'}-${selectedLocale}`}
              disabled={locked}
              document={content.document}
              onChange={(document) => updateSelectedContent({ document })}
              onReady={(editor) => { editorRef.current = editor; }}
            />
          </fieldset>

          {!locked && <button className="staff-news__primary-action" type="button" onClick={() => void saveDraft()}>Save draft</button>}
          {draft.id && <PublicationControls draft={draft} locked={locked} onPublish={() => void publishNow()} onSchedule={schedule} onUnpublish={() => void unpublish()} />}
        </div>

        {!locked && <aside className="staff-news__media" aria-labelledby="staff-news-media-heading">
          <h2 id="staff-news-media-heading">Verified media</h2>
          <p>Uploads go directly to a one-image Cloud Storage form capability. The article stores only the opaque media ID.</p>
          <form onSubmit={uploadImage}>
            <label>Image file<input name="image" accept="image/jpeg,image/png,image/webp" type="file" required /></label>
            <label>Alt text<input name="alt" maxLength="300" required /></label>
            <label>Caption (optional)<input name="caption" maxLength="600" /></label>
            <button type="submit">Upload and verify image</button>
          </form>
          {assets.length > 0 && <>
            <ul className="staff-news__media-list">
              {assets.map((asset) => <li key={asset.assetId}>
                {asset.previewUrl === undefined
                  ? <p className="staff-news__media-preview-unavailable">Temporary image preview unavailable.</p>
                  : <img alt={asset.alt} src={asset.previewUrl} />}
                <p>{asset.alt}</p>
                <button type="button" onClick={() => insertImage(asset)}>Insert image</button>
                <label><input checked={selectedAssets.includes(asset.assetId)} onChange={() => toggleGalleryAsset(asset.assetId)} type="checkbox" /> Include in gallery</label>
              </li>)}
            </ul>
            {selectedAssets.length > 0 && <ol className="staff-news__gallery-order" aria-label="Gallery image order">
              {selectedAssets.map((assetId, index) => {
                const asset = assets.find((candidate) => candidate.assetId === assetId);
                return asset === undefined ? null : <li key={asset.assetId}>
                  <span>{asset.alt}</span>
                  <button type="button" onClick={() => moveGalleryAsset(asset.assetId, -1)} disabled={index === 0}>Move earlier</button>
                  <button type="button" onClick={() => moveGalleryAsset(asset.assetId, 1)} disabled={index === selectedAssets.length - 1}>Move later</button>
                </li>;
              })}
            </ol>}
            <label>Gallery layout<select value={galleryLayout} onChange={(event) => setGalleryLayout(event.target.value)}><option value="carousel">Carousel</option><option value="grid">Grid</option></select></label>
            <button type="button" onClick={insertGallery}>Insert selected gallery</button>
          </>}
          <form onSubmit={insertYoutube}>
            <h3>YouTube embed</h3>
            <label>YouTube URL or video ID<input name="video" required /></label>
            <label>Start time in seconds (optional)<input name="startAt" inputMode="numeric" /></label>
            <button type="submit">Insert YouTube video</button>
          </form>
        </aside>}
      </div>
    </section>
  );
}

/**
 * Hosts the bounded Tiptap surface and applies lifecycle lock changes to the
 * existing editor instance. Tiptap does not update `editable` from later hook
 * options, so publication transitions require the explicit effect below.
 */
export function StaffNewsRichEditor({ disabled, document, onChange, onReady }) {
  const editor = useEditor({
    content: document,
    editable: !disabled,
    extensions: [
      StarterKit.configure({ codeBlock: false, heading: { levels: [2, 3, 4] } }),
      NewsImage,
      NewsImageGallery,
      NewsYoutube
    ],
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => onChange(nextEditor.getJSON())
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) return <p>Loading the editor…</p>;
  return (
    <div className="staff-news-editor">
      <div className="staff-news-editor__toolbar" aria-label="Article formatting">
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} aria-pressed={editor.isActive('bold')}>Bold</button>
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} aria-pressed={editor.isActive('italic')}>Italic</button>
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()} aria-pressed={editor.isActive('strike')}>Strike</button>
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-pressed={editor.isActive('bulletList')}>Bullets</button>
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-pressed={editor.isActive('orderedList')}>Numbered list</button>
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()} aria-pressed={editor.isActive('blockquote')}>Quote</button>
        <button type="button" disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()}>Rule</button>
        <button type="button" disabled={disabled} onClick={() => setLink(editor)}>Link</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

function PublicationControls({ draft, locked, onPublish, onSchedule, onUnpublish }) {
  if (draft.status === 'published') {
    return <button type="button" onClick={onUnpublish}>Unpublish News</button>;
  }
  if (locked) return null;
  return <section className="staff-news__publication" aria-labelledby="staff-news-publication-heading">
    <h2 id="staff-news-publication-heading">Publication</h2>
    <button type="button" onClick={onPublish}>Publish now</button>
    <form onSubmit={onSchedule}>
      <label>Publish at (your local time)<input name="publishAt" type="datetime-local" required /></label>
      <label>Unpublish at (optional, your local time)<input name="unpublishAt" type="datetime-local" /></label>
      <button type="submit">Schedule publication</button>
    </form>
  </section>;
}

function createEmptyDraft(locale) {
  return {
    category: 'announcement',
    content: [{ document: emptyEditorDocument, locale, summary: '', title: '' }],
    projectId: 'website',
    status: 'draft',
    tags: ''
  };
}

function createEditableDraft(post) {
  return {
    ...post,
    content: post.content.map((entry) => ({
      document: entry.document === undefined ? createRichDocumentFromLegacy(entry.body) : createTiptapNewsDocument(entry.document),
      locale: entry.locale,
      summary: entry.summary,
      title: entry.title
    })),
    tags: post.tags.join(', ')
  };
}

function createRichDocumentFromLegacy(body) {
  const paragraphs = body.split(/\r?\n\s*\r?\n/).map((value) => value.trim()).filter(Boolean);
  return {
    content: paragraphs.map((value) => ({ content: [{ text: value.replace(/\s+/g, ' '), type: 'text' }], type: 'paragraph' })),
    type: 'doc'
  };
}

function splitTags(value) {
  return value.split(/[\s,]+/).map((tag) => tag.trim()).filter(Boolean);
}

function assetToImageAttrs(asset) {
  return {
    ...(asset.caption === undefined ? {} : { caption: asset.caption }),
    alt: asset.alt,
    assetId: asset.assetId
  };
}

function readYoutubeVideoId(value) {
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be') return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.slice(1)) ? url.pathname.slice(1) : undefined;
    if (url.hostname.endsWith('youtube.com')) {
      const id = url.pathname.startsWith('/embed/') ? url.pathname.split('/')[2] : url.searchParams.get('v');
      return id !== null && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function localTimeToIso(value) {
  const date = new Date(value);
  if (value === '' || Number.isNaN(date.getTime())) throw new EditorialNewsApiError('validation');
  return date.toISOString();
}

function readOptionalLocalTime(value) {
  return value === '' ? '' : localTimeToIso(value);
}

function setLink(editor) {
  const href = window.prompt('Enter an HTTP(S) or mailto link.');
  if (!href) return;
  editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
}

function statusForError(error) {
  if (isSignInRejection(error)) return 'Your staff sign-in has ended. Please sign in again.';
  if (error instanceof EditorialNewsApiError && error.kind === 'not-found') return 'That News record no longer exists or is not available to this staff account.';
  if (error instanceof EditorialNewsApiError && error.kind === 'conflict') return 'News changed while you were editing it. Reload it before saving again.';
  if (error instanceof EditorialNewsApiError && error.kind === 'validation') return 'MS-News did not accept that News change. Check the content and try again.';
  return 'News administration is not available right now. Please try again later.';
}

function isSignInRejection(error) {
  return (error instanceof BrowserAuthSessionError && error.kind === 'rejected')
    || (error instanceof EditorialNewsApiError && error.kind === 'rejected');
}
