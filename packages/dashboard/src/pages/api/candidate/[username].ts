import type { APIRoute } from 'astro';
import { join } from 'node:path';
import type { TalentEntry, Candidate, IgnoreList } from '@talent-scout/shared';
import { readJsonFile, resolveOutputDir, resolveUserDataDir } from '../../../lib/file.js';
import type { AnnotationMap } from '../../../lib/merge.js';

export const GET: APIRoute = async ({ params }) => {
  const { username } = params;
  if (!username) {
    return new Response(JSON.stringify({ error: 'Missing username' }), { status: 400 });
  }

  const base = process.cwd();
  const outputDir = resolveOutputDir(base);
  const userDataDir = resolveUserDataDir(base);

  const entries = await readJsonFile<TalentEntry[]>(join(outputDir, 'shortlist.json'), []);
  const entry = entries.find((e: TalentEntry) => e.username === username);
  if (!entry) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  const candidates = await readJsonFile<Candidate[]>(join(outputDir, 'step4_evaluated.json'), []);
  const candidate = candidates.find((c: Candidate) => c.username === username);

  const annotations = await readJsonFile<AnnotationMap>(join(userDataDir, 'annotations.json'), {});
  const ignoreList = await readJsonFile<IgnoreList>(join(userDataDir, 'ignore-list.json'), {});

  return new Response(
    JSON.stringify({
      entry,
      candidate: candidate ?? null,
      annotation: annotations[username] ?? null,
      ignored: username in ignoreList,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
