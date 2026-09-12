import { createElement } from 'react';

/**
 * Renders one already-normalised inline rich-document node.
 *
 * It never parses HTML. The static snapshot validator has reduced marks to the
 * small News allowlist, then this component creates React elements directly.
 *
 * @param {{ marks?: readonly { attrs?: { href: string }, type: string }[], text: string }} props - Safe rich text node.
 * @returns {import('react').ReactNode} Text wrapped in the approved mark elements.
 */
export default function RichNewsText({ marks = [], text }) {
	let output = text;

	for (const mark of marks) {
		switch (mark.type) {
			case 'bold':
				output = createElement('strong', { key: 'bold' }, output);
				break;
			case 'italic':
				output = createElement('em', { key: 'italic' }, output);
				break;
			case 'strike':
				output = createElement('s', { key: 'strike' }, output);
				break;
			case 'code':
				output = createElement('code', { key: 'code' }, output);
				break;
			case 'link':
				output = createElement('a', { href: mark.attrs?.href, key: 'link' }, output);
				break;
			default:
				throw new Error('A non-normalised rich text mark reached the renderer.');
		}
	}

	return output;
}
