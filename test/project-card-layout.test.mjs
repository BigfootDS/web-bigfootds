import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('..', import.meta.url);

async function readSource(relativePath) {
	return readFile(new URL(relativePath, root), 'utf8');
}

test('uses border-box sizing for Home and directory cards so padding stays inside each grid row', async () => {
	const [home, directory] = await Promise.all([
		readSource('src/pages/index.astro'),
		readSource('src/components/ProjectDiscovery.astro')
	]);

	assert.match(home, /\.home-card\s*\{[\s\S]*?box-sizing:\s*border-box;/);
	assert.match(directory, /#project-results article\s*\{[\s\S]*?box-sizing:\s*border-box;/);
	assert.match(directory, /#project-results > li\s*\{[\s\S]*?min-width:\s*0;/);
});

test('gives the staff News editor a wide workspace without widening public pages', async () => {
	const [editor, global] = await Promise.all([
		readSource('src/pages/admin/news/editor/index.astro'),
		readSource('src/styles/global.css')
	]);

	assert.match(editor, /<main class="staff-news-page">/);
	assert.match(editor, /main\.staff-news-page\s*\{[\s\S]*?width:\s*min\(78rem, calc\(100% - 2em\)\);/);
	assert.match(global, /main\s*\{[\s\S]*?width:\s*720px;/);
});
