/**
 * The issue body and the URL that carries it.
 *
 * What is pinned here is what a maintainer reads: the reporter's prose, the
 * manifest as a table, what was left out, the redacted key NAMES — and, on the
 * URL side, that an over-long body is cut with a sentence pointing at the
 * clipboard rather than silently shortened.
 */

import { describe, it, expect } from 'vitest';
import { buildIssueBody } from './issueBody.js';
import {
  MAX_ISSUE_URL_BYTES,
  buildNewIssueUrl,
  encodeBase64,
  parseGithubRepo,
} from './github.js';
import type { BugReportManifestView } from './types.js';

const manifest: BugReportManifestView = {
  units: [
    {
      id: 'conv-1',
      kind: 'conversation',
      label: 'conv-1 — session s-old: 1 run, 2 turns, 20 events',
      bytes: 2 * 1024 * 1024,
      eventCount: 20,
      turnCount: 2,
    },
    {
      id: 'conv-2',
      kind: 'conversation',
      label: 'conv-2 — session s-new: 1 run, 4 turns, 84 events',
      bytes: 3 * 1024 * 1024,
      eventCount: 84,
      turnCount: 4,
    },
    { id: 'file-narrative', kind: 'file', label: 'narrative.txt', bytes: 4096 },
  ],
  redactedKeys: ['apiKey', 'customer.ssn'],
  warnings: ['This run recorded no boundary events.'],
  notes: ['Embeddings were summarized, not stored.'],
  environment: {
    agentfootprint: '9.9.0',
    footprintjs: '9.15.0',
    node: 'v20.11.0',
    platform: 'darwin',
    arch: 'arm64',
  },
};

const fields = {
  title: 'Agent loops on the refund tool',
  stepsToReproduce: '1. ask for a refund\n2. watch iteration 3',
  expected: 'it answers once',
  actual: 'it calls the tool four times',
};

describe('buildIssueBody', () => {
  const body = buildIssueBody({ fields, manifest, selected: ['conv-2', 'file-narrative'] });

  it('carries the reporter’s four fields under headings a maintainer can scan', () => {
    expect(body).toContain('### Steps to reproduce');
    expect(body).toContain('2. watch iteration 3');
    expect(body).toContain('### Expected');
    expect(body).toContain('it answers once');
    expect(body).toContain('### Actual');
    expect(body).toContain('it calls the tool four times');
  });

  it('renders the manifest as a table of exactly what was ticked', () => {
    expect(body).toContain('| unit | kind | size | events | turns |');
    expect(body).toContain('| `conv-2` | conversation | 3.0 MB | 84 | 4 |');
    expect(body).toContain('| `file-narrative` | file | 4.0 KB |');
    expect(body).not.toContain('| `conv-1` |');
  });

  it('states what was left out, by id', () => {
    expect(body).toContain('left out 1 unit: `conv-1`');
  });

  it('names redacted keys and never a redacted value', () => {
    expect(body).toContain('`apiKey`');
    expect(body).toContain('`customer.ssn`');
    expect(body).toContain('the values never left');
  });

  it('passes the library’s warnings and notes through verbatim', () => {
    expect(body).toContain('This run recorded no boundary events.');
    expect(body).toContain('Embeddings were summarized, not stored.');
  });

  it('carries the environment block, and nothing that identifies a machine', () => {
    expect(body).toContain('- agentfootprint: `9.9.0`');
    expect(body).toContain('- footprintjs: `9.15.0`');
    expect(body).toContain('- platform: `darwin/arm64`');
  });

  it('says where the evidence zip is, and who has to attach it', () => {
    const withZip = buildIssueBody({
      fields,
      manifest,
      selected: ['conv-2'],
      evidence: { filename: 'report.zip', bytes: 1024 * 1024, delivery: 'by-hand' },
    });
    expect(withZip).toContain('`report.zip` (1.0 MB)');
    expect(withZip).toContain('nothing was uploaded automatically');

    const relayed = buildIssueBody({
      fields,
      manifest,
      selected: ['conv-2'],
      evidence: { filename: 'report.zip', bytes: 1024 * 1024, delivery: 'relayed' },
    });
    expect(relayed).toContain("application's bug-report endpoint");
  });

  it('marks a field the reporter left blank instead of pretending it was answered', () => {
    const blank = buildIssueBody({
      fields: { ...fields, expected: '   ' },
      manifest,
      selected: ['conv-2'],
    });
    expect(blank).toContain('_(not given)_');
  });

  it('is deterministic — same inputs, same bytes', () => {
    expect(buildIssueBody({ fields, manifest, selected: ['conv-2', 'file-narrative'] })).toBe(body);
  });
});

describe('parseGithubRepo', () => {
  it('reads owner and repo off an issues URL', () => {
    expect(parseGithubRepo('https://github.com/acme/checkout-agent/issues')).toMatchObject({
      owner: 'acme',
      repo: 'checkout-agent',
      apiBase: 'https://api.github.com',
      newIssueUrl: 'https://github.com/acme/checkout-agent/issues/new',
    });
  });

  it('points GitHub Enterprise Server at its own API root', () => {
    expect(parseGithubRepo('https://github.acme.com/team/agent/issues')?.apiBase).toBe(
      'https://github.acme.com/api/v3',
    );
  });

  it('is undefined for anything that names no repo', () => {
    expect(parseGithubRepo('https://github.com/acme')).toBeUndefined();
    expect(parseGithubRepo('not a url')).toBeUndefined();
  });
});

describe('buildNewIssueUrl', () => {
  const target = parseGithubRepo('https://github.com/acme/agent/issues')!;

  it('prefills title, body and labels', () => {
    const { url, truncated } = buildNewIssueUrl({
      target,
      title: 'It loops',
      body: 'short body',
      labels: ['bug', 'from-lens'],
    });
    expect(truncated).toBe(false);
    const params = new URL(url).searchParams;
    expect(params.get('title')).toBe('It loops');
    expect(params.get('body')).toBe('short body');
    expect(params.get('labels')).toBe('bug,from-lens');
  });

  it('cuts an over-long body to fit, and says where the whole one is', () => {
    const body = `${'line of the report\n'.repeat(2000)}`;
    const { url, truncated } = buildNewIssueUrl({ target, title: 'Big', body });
    expect(truncated).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL_BYTES);
    expect(new URL(url).searchParams.get('body')).toContain('full report is on the clipboard');
    // The title survives whole — only the body is ever cut.
    expect(new URL(url).searchParams.get('title')).toBe('Big');
  });
});

describe('encodeBase64', () => {
  it('round-trips the zip bytes', () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff]);
    expect(Buffer.from(encodeBase64(bytes), 'base64').equals(Buffer.from(bytes))).toBe(true);
  });
});
