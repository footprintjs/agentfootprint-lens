/**
 * generate — the In plain words fixtures, from the REAL archived field run
 * (house rule: fixture data is GENERATED, never hand-authored).
 *
 * Input: one `recording/run` artifact (`{ meta, snapshot, events, structure }`,
 * as the hosting `artifact-get` op returns it). Default: the multi-user eval's
 * turn-2 recording. Output, beside this file — `{ account, shown }`, the exact
 * reply shape of the `answer-account` wire op:
 *
 *   answer-account-turn2.json        fixture A — with the app's declarations
 *                                    (skill labels, `rowsAt`, `appDecides`),
 *                                    what the field app's server returns.
 *   answer-account-turn2-bare.json   fixture A0 — no declarations: what the
 *                                    library alone can say.
 *
 * `accountForAnswer` is the public door (`agentfootprint/observe`). `showLeaves`
 * is the hosting op's own step and not a door, so it is read from the installed
 * build's module file — the same function the server runs.
 *
 * The ONE edit made to the recording, before anything reads it: the field
 * app's own identifiers are replaced by neutral ones (`SCRUB`), so no app name
 * is checked into this public repo. It is a rename over the whole text, so the
 * account and its leaves stay consistent (every `from` still resolves).
 *
 *   npx tsx test/plain-words/fixtures/generate.ts <recording-turn2.json>
 *
 * (The source is the multi-user eval's archived turn-2 recording,
 * `session-archive/2026-09-25-multiuser-eval/turn-account/recording-turn2.json`.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { accountForAnswer, type AnswerAccountDeclarations } from 'agentfootprint/observe';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = process.argv[2];

/** The field app's identifiers → neutral names (the one edit to the recording). */
const SCRUB: ReadonlyArray<readonly [string, string]> = [['neo-declared-capability-ranking', 'app-declared-capability-ranking']];

/** The field app's declarations for this run (its skill label, its wrapper-shaped lookup, its own routing). */
const DECLARATIONS: AnswerAccountDeclarations = {
  id: 'field-app',
  version: '1',
  skills: { 'array-inventory': { label: 'array estate report' } },
  tools: { powerstore_get_volumes: { rowsAt: 'volumes' } },
  routing: { appDecides: true },
};

async function main(): Promise<void> {
  if (SOURCE === undefined) throw new Error('usage: generate.ts <recording.json>');
  const text = SCRUB.reduce((t, [from, to]) => t.split(from).join(to), readFileSync(SOURCE, 'utf8'));
  const artifact = JSON.parse(text) as {
    meta?: { origin?: { runId?: string } };
    snapshot: unknown;
    events: unknown;
    structure: unknown;
  };
  const runId = artifact.meta?.origin?.runId;
  const options = runId !== undefined ? { runId } : undefined;

  const require = createRequire(import.meta.url);
  const afRoot = dirname(require.resolve('agentfootprint/package.json'));
  const shownModule = (await import(
    pathToFileURL(join(afRoot, 'dist/esm/lib/answer-account/shown.js')).href
  )) as { showLeaves: (a: unknown, r: unknown, d?: unknown) => Record<string, unknown> };

  const write = (name: string, declarations: AnswerAccountDeclarations | undefined): void => {
    const account = accountForAnswer(artifact as never, declarations, options);
    const shown = shownModule.showLeaves(account, artifact, declarations);
    writeFileSync(join(HERE, name), `${JSON.stringify({ account, shown }, null, 2)}\n`);
    console.log(`${name}: ${account.rows.length} rows, ${Object.keys(shown).length} shown leaves`);
  };
  write('answer-account-turn2.json', DECLARATIONS);
  write('answer-account-turn2-bare.json', undefined);
}

void main();
