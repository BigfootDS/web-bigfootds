import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const projectsPath = resolve(process.cwd(), 'src/content/projects');

async function readProjectFrontmatter(name) {
  const content = await readFile(resolve(projectsPath, name), 'utf8');
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.notEqual(frontmatter, null, `${name} should have frontmatter`);
  return frontmatter[1];
}

test('includes the current BigfootDS semantic-versioning project suite', async () => {
  const entries = [
    ['unitysemverupdater.md', 'Unity Semver Updater'],
    ['godotsemverupdater.md', 'Godot Semver Updater'],
    ['unrealsemverupdater.md', 'Unreal Semver Updater'],
    ['nodejssemverupdater.md', 'NodeJS Semver Updater'],
    ['gameautomatedsemver.md', 'Game Automated Semver']
  ];

  for (const [name, title] of entries) {
    const frontmatter = await readProjectFrontmatter(name);
    assert.match(frontmatter, new RegExp(`title: '${title}'`));
    assert.match(frontmatter, /^heroImage: 'https:\/\//m);
  }
});

test('sets the approved Home feature order and retains the Godmaker route', async () => {
  const [planetProtector, godmaker, gameAutomated] = await Promise.all([
    readProjectFrontmatter('planetprotectorvr.md'),
    readProjectFrontmatter('patronsimulator.mdx'),
    readProjectFrontmatter('gameautomatedsemver.md')
  ]);

  assert.match(planetProtector, /^featuredOrder: 1$/m);
  assert.match(godmaker, /^title: 'Godmaker: Patrons & Prophets'$/m);
  assert.match(godmaker, /^featuredOrder: 2$/m);
  assert.match(gameAutomated, /^featuredOrder: 3$/m);
});

test('adds the other approved current BigfootDS project cards', async () => {
  const entries = [
    ['bigfootdsstreamdockicons.md', 'BigfootDS Stream Dock Icons'],
    ['nodejstrickplay.md', 'NodeJS Trickplay']
  ];

  for (const [name, title] of entries) {
    const frontmatter = await readProjectFrontmatter(name);
    assert.match(frontmatter, new RegExp(`title: '${title}'`));
    assert.match(frontmatter, /^heroImage: 'https:\/\//m);
  }
});
