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
