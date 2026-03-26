import type { IgnoreEntry, IgnoreList } from '@talent-scout/shared';
import type { APIRoute } from 'astro';
import { join } from 'node:path';

import { readJsonFile, resolveUserDataDir, writeJsonAtomic } from '@/lib/file.js';

export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { username?: string; reason?: string };
  if (!body.username) {
    return new Response(JSON.stringify({ error: 'Missing username' }), {
      status: 400,
    });
  }

  const userDataDir = resolveUserDataDir(process.cwd());
  const filePath = join(userDataDir, 'ignore-list.json');
  const ignoreList = await readJsonFile<IgnoreList>(filePath, {});

  const entry: IgnoreEntry = {
    reason: body.reason ?? 'Ignored via dashboard',
    ignored_at: new Date().toISOString(),
  };
  ignoreList[body.username] = entry;
  await writeJsonAtomic(filePath, ignoreList);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  const body = (await request.json()) as { username?: string };
  if (!body.username) {
    return new Response(JSON.stringify({ error: 'Missing username' }), {
      status: 400,
    });
  }

  const userDataDir = resolveUserDataDir(process.cwd());
  const filePath = join(userDataDir, 'ignore-list.json');
  const ignoreList = await readJsonFile<IgnoreList>(filePath, {});

  const rest = Object.fromEntries(
    Object.entries(ignoreList).filter(([key]) => key !== body.username)
  ) as IgnoreList;
  await writeJsonAtomic(filePath, rest);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
