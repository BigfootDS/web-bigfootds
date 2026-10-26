import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect, useRef, useState } from 'react';

import { BrowserAuthSessionError } from '../lib/browser-auth-session.mjs';
import { EmailVerificationRequiredNotice, useEmailVerificationRecovery } from './EmailVerificationRecovery.jsx';
import {
  EditorialNewsApiError,
  createEditorialMediaCompleteRequest,
  createEditorialMediaPreviewRequest,
  createEditorialMediaUploadIntentRequest,
  createEditorialNewsHistoricalPublicationInput,
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
import { createLocalNewsEditorDemo, createLocalNewsEditorDemoAssets, isLocalNewsEditorDemo } from '../lib/news-editor-local-demo.mjs';
import { StaffNewsDocumentPreview } from './StaffNewsDocumentPreview.jsx';
import '../styles/staff-news.css';

const emptyEditorDocument = { content: [{ type: 'paragraph' }], type: 'doc' };

/**
 * Provides the staff-only MS-News composer on a static route.
 *
 * Records, media capabilities and preview blobs stay in browser memory. Only
 * the normal token pair uses the established session storage boundary; none
 * is emitted into Astro's static HTML. MS-News owns attestation, validation,
 * lifecycle decisions, and its audit history.
 */
export default function StaffNewsComposer({ apiBaseUrl, authBaseUrl }) {
  const [draft, setDraft] = useState(undefined);
  const [phase, setPhase] = useState('loading');
  const [selectedLocale, setSelectedLocale] = useState('en-AU');
  const [status, setStatus] = useState('Checking staff access…');
  const { requiresVerification, verifySession } = useEmailVerificationRecovery();
  const [assets, setAssets] = useState([]);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [galleryLayout, setGalleryLayout] = useState('carousel');
  const [isLocalDemo, setIsLocalDemo] = useState(false);
  const [isStandaloneLocalDemo, setIsStandaloneLocalDemo] = useState(false);
  const editorRef = useRef(null);
  const previewUrls = useRef(new Set());
  const previewActive = useRef(true);

  useEffect(() => {
    previewActive.current = true;
    return () => {
      previewActive.current = false;
      for (const url of previewUrls.current) URL.revokeObjectURL(url);
      previewUrls.current.clear();
    };
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
    if (isLocalEditorDevelopment() && parameters.get('demo') === 'local') {
      setDraft(createLocalNewsEditorDemo(locale));
      setAssets(createLocalNewsEditorDemoAssets());
      setSelectedLocale(locale);
      setSelectedAssets([]);
      setIsLocalDemo(true);
      setIsStandaloneLocalDemo(true);
      setPhase('ready');
      setStatus('Local-only content demonstration loaded. It does not contact MS-Auth, MS-News, MongoDB, or a production service.');
      return;
    }
    try {
      const session = await verifySession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
      if (!session) throw new EditorialNewsApiError('rejected');
      if (id === null) {
        setDraft(createEmptyDraft(locale));
        setIsLocalDemo(false);
        setIsStandaloneLocalDemo(false);
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
      setIsLocalDemo(false);
      setIsStandaloneLocalDemo(false);
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
    const session = verifiedSession ?? await verifySession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
    if (!session) throw new EditorialNewsApiError('rejected');
    let request = createRequest(session);
    let response;
    try {
      response = await fetch(request.url, request.init);
    } catch {
      throw new EditorialNewsApiError('unavailable');
    }
    if (response.status !== 401 && response.status !== 403) return response;

    const renewed = await verifySession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
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

  async function publishHistorically(event) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      const body = createEditorialNewsHistoricalPublicationInput({
        publishedOn: String(form.get('publishedOn') ?? '')
      });
      await runLifecycleAction('schedule', body, 'News was published with its historical date.');
    } catch (error) {
      setStatus(error instanceof EditorialNewsApiError && error.kind === 'validation'
        ? 'Enter the original publication date as a valid calendar date.'
        : statusForError(error));
    }
  }

  async function runLifecycleAction(operation, body, success) {
    if (isLocalDemo || isLocalNewsEditorDemo(draft)) {
      setStatus('This local content demonstration is deliberately protected from publication. Create a normal News record for a real release.');
      return;
    }
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
        if (!previewActive.current) {
          URL.revokeObjectURL(previewUrl);
          return;
        }
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

  if (requiresVerification) return <EmailVerificationRequiredNotice />;

  if (phase === 'loading' || phase === 'signed-out' || phase === 'unavailable') {
    return <p aria-live="polite">{status}</p>;
  }

  const content = draft.content.find((entry) => entry.locale === selectedLocale);
  const locked = draft.status === 'published' || draft.status === 'archived';
  const localDemo = isLocalDemo || isLocalNewsEditorDemo(draft);
  return (
    <section className="staff-news" aria-labelledby="staff-news-composer-heading">
      <p><a href="/admin/news/">← News administration</a></p>
      <header className="staff-news__composer-header">
        <h1 id="staff-news-composer-heading">{draft.id ? 'Edit News record' : 'New News draft'}</h1>
        <p aria-live="polite">{status}</p>
        {localDemo && <p className="staff-news__local-demo-notice"><strong>DO NOT PUBLISH:</strong> this is a local content demonstration. Its fixture media references are for editor preview only.{isStandaloneLocalDemo ? ' This development URL does not contact any service or database.' : ''}</p>}
      </header>

      <div className="staff-news__workspace">
        <details className="staff-news__settings" open>
          <summary>Article settings</summary>
          <fieldset className="staff-news__fieldset" disabled={locked}>
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
        </details>

        <fieldset className="staff-news__content" disabled={locked}>
          <legend>Article content</legend>
          <label>Title<input value={content.title} onChange={(event) => updateSelectedContent({ title: event.target.value })} maxLength="200" required /></label>
          <label>Summary<textarea value={content.summary} onChange={(event) => updateSelectedContent({ summary: event.target.value })} maxLength="600" rows="3" required /></label>
          <StaffNewsRichEditor
            assets={assets}
            key={`${draft.id ?? 'new'}-${selectedLocale}`}
            disabled={locked}
            document={content.document}
            onChange={(document) => updateSelectedContent({ document })}
            onReady={(editor) => { editorRef.current = editor; }}
          />
        </fieldset>

        {!locked && <details className="staff-news__media" open>
          <summary>Media and embeds</summary>
          <p>Uploads use a one-image Cloud Storage capability. The article stores only a verified opaque media ID.</p>
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
        </details>}

        {!locked && !isStandaloneLocalDemo && <button className="staff-news__primary-action" type="button" onClick={() => void saveDraft()}>{localDemo ? 'Save local demo draft' : 'Save draft'}</button>}
        {draft.id && !localDemo && <PublicationControls draft={draft} locked={locked} onPublish={() => void publishNow()} onPublishHistorically={publishHistorically} onSchedule={schedule} onUnpublish={() => void unpublish()} />}
      </div>
    </section>
  );
}

/**
 * Hosts the bounded Tiptap surface and applies lifecycle lock changes to the
 * existing editor instance. Tiptap does not update `editable` from later hook
 * options, so publication transitions require the explicit effect below.
 */
export function StaffNewsRichEditor({ assets = [], disabled, document, onChange, onReady }) {
  const [mode, setMode] = useState('write');
  const [linkEditor, setLinkEditor] = useState(undefined);
  const [previewDocument, setPreviewDocument] = useState(document);
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
    onUpdate: ({ editor: nextEditor }) => {
      const nextDocument = nextEditor.getJSON();
      setPreviewDocument(nextDocument);
      onChange(nextDocument);
    }
  });

  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  function chooseTextStyle(event) {
    const value = event.target.value;
    const chain = editor.chain().focus();
    if (value === 'paragraph') chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value) }).run();
  }

  function openLinkEditor() {
    setLinkEditor({ error: '', href: editor.getAttributes('link').href ?? '' });
  }

  function saveLink(event) {
    event.preventDefault();
    const href = linkEditor.href.trim();
    if (!isApprovedEditorLink(href)) {
      setLinkEditor((current) => ({ ...current, error: 'Use an HTTP(S), mailto, or site-relative link.' }));
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkEditor(undefined);
  }

  function removeLink() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkEditor(undefined);
  }

  if (!editor) return <p>Loading the editor…</p>;
  return (
    <div className="staff-news-editor">
      <div className="staff-news-editor__mode-tabs" role="tablist" aria-label="Article view">
        <button aria-selected={mode === 'write'} onClick={() => setMode('write')} role="tab" type="button">Write</button>
        <button aria-selected={mode === 'preview'} onClick={() => setMode('preview')} role="tab" type="button">Preview</button>
      </div>
      {mode === 'write' && <>
        <div className="staff-news-editor__toolbar" aria-label="Article formatting" role="toolbar">
          <div aria-label="History" className="staff-news-editor__toolbar-group" role="group">
            <button disabled={disabled || !editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} type="button">Undo</button>
            <button disabled={disabled || !editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} type="button">Redo</button>
          </div>
          <div aria-label="Text style" className="staff-news-editor__toolbar-group" role="group">
            <label>Text style
              <select disabled={disabled} onChange={chooseTextStyle} value={editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : editor.isActive('heading', { level: 4 }) ? '4' : 'paragraph'}>
                <option value="paragraph">Paragraph</option>
                <option value="2">Heading 2</option>
                <option value="3">Heading 3</option>
                <option value="4">Heading 4</option>
              </select>
            </label>
          </div>
          <div aria-label="Text formatting" className="staff-news-editor__toolbar-group" role="group">
            <button aria-pressed={editor.isActive('bold')} disabled={disabled} onClick={() => editor.chain().focus().toggleBold().run()} type="button">Bold</button>
            <button aria-pressed={editor.isActive('italic')} disabled={disabled} onClick={() => editor.chain().focus().toggleItalic().run()} type="button">Italic</button>
            <button aria-pressed={editor.isActive('strike')} disabled={disabled} onClick={() => editor.chain().focus().toggleStrike().run()} type="button">Strike</button>
            <button aria-pressed={editor.isActive('code')} disabled={disabled} onClick={() => editor.chain().focus().toggleCode().run()} type="button">Code</button>
          </div>
          <div aria-label="Blocks" className="staff-news-editor__toolbar-group" role="group">
            <button aria-pressed={editor.isActive('bulletList')} disabled={disabled} onClick={() => editor.chain().focus().toggleBulletList().run()} type="button">Bullets</button>
            <button aria-pressed={editor.isActive('orderedList')} disabled={disabled} onClick={() => editor.chain().focus().toggleOrderedList().run()} type="button">Numbered list</button>
            <button aria-pressed={editor.isActive('blockquote')} disabled={disabled} onClick={() => editor.chain().focus().toggleBlockquote().run()} type="button">Quote</button>
            <button disabled={disabled} onClick={() => editor.chain().focus().setHorizontalRule().run()} type="button">Divider</button>
          </div>
          <div aria-label="Links" className="staff-news-editor__toolbar-group" role="group">
            <button aria-pressed={editor.isActive('link')} disabled={disabled} onClick={openLinkEditor} type="button">Link</button>
            <button disabled={disabled || !editor.isActive('link')} onClick={removeLink} type="button">Remove link</button>
          </div>
        </div>
        {linkEditor !== undefined && <form className="staff-news-editor__link-editor" onSubmit={saveLink}>
          <label>Link destination<input autoFocus onChange={(event) => setLinkEditor((current) => ({ ...current, href: event.target.value }))} placeholder="https://example.com or /projects/" type="text" value={linkEditor.href} /></label>
          {linkEditor.error && <p role="alert">{linkEditor.error}</p>}
          <button type="submit">Save link</button>
          <button onClick={removeLink} type="button">Remove link</button>
          <button onClick={() => setLinkEditor(undefined)} type="button">Cancel</button>
        </form>}
        <EditorContent editor={editor} />
      </>}
      {mode === 'preview' && <StaffNewsDocumentPreview assets={assets} document={previewDocument} />}
    </div>
  );
}

function PublicationControls({ draft, locked, onPublish, onPublishHistorically, onSchedule, onUnpublish }) {
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
    <details className="staff-news__legacy-publication">
      <summary>Legacy article migration</summary>
      <p>Use this only when an existing article has a known original publication date. It makes the article public immediately and preserves that calendar date.</p>
      <form onSubmit={onPublishHistorically}>
        <label>Original publication date<input name="publishedOn" type="date" required /></label>
        <button type="submit">Publish with historical date</button>
      </form>
    </details>
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

function isApprovedEditorLink(value) {
  try {
    const url = new URL(value, 'https://bigfootds.com');
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}

/**
 * Allows the browser-only content fixture only in a Vite development server.
 * Vitest uses the `test` mode rather than setting `DEV`, so it is included to
 * exercise the same no-network path in component tests; neither mode is part
 * of a production client build.
 *
 * @returns {boolean} Whether the current browser is a supported local development host.
 */
function isLocalEditorDevelopment() {
  const isDevelopmentMode = import.meta.env.DEV || import.meta.env.MODE === 'test';
  return isDevelopmentMode && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

function statusForError(error) {
  if (isSignInRejection(error)) return 'Your staff sign-in has ended. Please sign in again.';
  if (error instanceof EditorialNewsApiError && error.kind === 'not-found') return 'That News record no longer exists or is not available to this staff account.';
  if (error instanceof EditorialNewsApiError && error.kind === 'conflict') return 'News changed while you were editing it. Reload it before saving again.';
  if (error instanceof EditorialNewsApiError && error.kind === 'validation') return 'MS-News did not accept that News change. Check the content and try again.';
  return 'News administration is not available right now. Please try again later.';
}

function isSignInRejection(error) {
  return (error instanceof BrowserAuthSessionError && ['rejected', 'verification-required'].includes(error.kind))
    || (error instanceof EditorialNewsApiError && error.kind === 'rejected');
}
