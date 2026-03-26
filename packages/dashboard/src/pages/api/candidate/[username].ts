import type { APIRoute } from 'astro';
import { join } from 'node:path';
import type { TalentEntry, Candidate, IgnoreList } from '@talent-scout/shared';
import { loadShortlist, loadEvaluation } from '@talent-scout/ai-evaluator';
import {
  readJsonFile,
  writeJsonAtomic,
  resolveOutputDir,
  resolveUserDataDir,
} from '../../../lib/file.js';
import type { Annotation, AnnotationMap } from '../../../lib/merge.js';

export const GET: APIRoute = async ({ params }) => {
  const { username } = params;
  if (!username) {
    return new Response(JSON.stringify({ error: 'Missing username' }), { status: 400 });
  }

  const base = process.cwd();
  const outputDir = resolveOutputDir(base);
  const userDataDir = resolveUserDataDir(base);

  const entries = await loadShortlist(outputDir).catch(() => [] as TalentEntry[]);
  const entry = entries.find((e: TalentEntry) => e.username === username);
  if (!entry) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  }

  const evaluation = await loadEvaluation(outputDir).catch(() => ({}) as Record<string, Candidate>);
  const candidate = evaluation[username] ?? null;

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

export const PATCH: APIRoute = async ({ params, request }) => {
  const { username } = params;
  if (!username) {
    return new Response(JSON.stringify({ error: 'Missing username' }), { status: 400 });
  }

  const body = (await request.json()) as {
    action?: string;
    note?: string;
  };

  const validActions = ['approved', 'rejected', 'noted'];
  if (!body.action || !validActions.includes(body.action)) {
    return new Response(
      JSON.stringify({ error: 'Invalid action. Must be approved, rejected, or noted.' }),
      { status: 400 },
    );
  }

  const userDataDir = resolveUserDataDir(process.cwd());
  const filePath = join(userDataDir, 'annotations.json');
  const annotations = await readJsonFile<AnnotationMap>(filePath, {});

  const annotation: Annotation = {
    status: body.action as Annotation['status'],
    note: body.note ?? '',
    annotated_at: new Date().toISOString(),
  };
  annotations[username] = annotation;
  await writeJsonAtomic(filePath, annotations);

  return new Response(JSON.stringify({ ok: true, annotation }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
