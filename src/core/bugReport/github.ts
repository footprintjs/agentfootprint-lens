/**
 * Talking to GitHub: where the issue goes, and what a URL can carry.
 *
 * The button never asks for an owner or a repo. It asks for the ISSUES URL a
 * maintainer would paste into a README —
 * `https://github.com/footprintjs/agentfootprint/issues` — and takes the rest
 * from it, including the API root, so the same prop works on GitHub Enterprise
 * Server (`https://github.acme.com/…` → `https://github.acme.com/api/v3`).
 */

/** Owner, repo, and the API root that serves them. */
export interface GithubTarget {
  readonly owner: string;
  readonly repo: string;
  /** `https://api.github.com`, or `<origin>/api/v3` on GitHub Enterprise Server. */
  readonly apiBase: string;
  /** The new-issue form, without a query. */
  readonly newIssueUrl: string;
}

/**
 * Parse `https://host/OWNER/REPO[/issues[/…]]`.
 *
 * Returns `undefined` for anything that is not one — a missing repo is a fact
 * the caller states ("this button cannot open an issue form"), never a guess.
 */
export function parseGithubRepo(issuesUrl: string): GithubTarget | undefined {
  let url: URL;
  try {
    url = new URL(issuesUrl);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const [owner, repo] = url.pathname.split('/').filter(Boolean);
  if (!owner || !repo) return undefined;
  const isDotCom = url.hostname === 'github.com' || url.hostname === 'www.github.com';
  return {
    owner,
    repo: repo.replace(/\.git$/, ''),
    apiBase: isDotCom ? 'https://api.github.com' : `${url.origin}/api/v3`,
    newIssueUrl: `${url.origin}/${owner}/${repo}/issues/new`,
  };
}

/**
 * GitHub's new-issue form is a GET, and a GET has a ceiling.
 *
 * The documented practical limit is around 8 KB of URL; browsers and proxies
 * differ below that. 8000 leaves room for the title, the labels and the scheme
 * without pretending to know one exact number.
 */
export const MAX_ISSUE_URL_BYTES = 8000;

/** The prefilled form URL, and whether the body had to be cut to fit. */
export interface PrefilledIssueUrl {
  readonly url: string;
  readonly truncated: boolean;
}

/** What a truncated body ends with — the reason the full one is not lost. */
export const TRUNCATION_NOTICE =
  '\n\n…truncated to fit a URL — the full report is on the clipboard, paste it over this.\n';

/**
 * Build `…/issues/new?title=&body=&labels=`, cutting the BODY (never the title,
 * never the labels) until the whole URL fits.
 *
 * A body that does not fit is not dropped and not silently shortened: it is cut
 * at a line boundary and told to be replaced from the clipboard, which is where
 * this flow always puts it first.
 */
export function buildNewIssueUrl(args: {
  readonly target: GithubTarget;
  readonly title: string;
  readonly body: string;
  readonly labels?: readonly string[];
  readonly maxBytes?: number;
}): PrefilledIssueUrl {
  const limit = args.maxBytes ?? MAX_ISSUE_URL_BYTES;
  const compose = (body: string): string => {
    const params = new URLSearchParams();
    params.set('title', args.title);
    params.set('body', body);
    if (args.labels && args.labels.length > 0) params.set('labels', args.labels.join(','));
    return `${args.target.newIssueUrl}?${params.toString()}`;
  };

  const full = compose(args.body);
  if (full.length <= limit) return { url: full, truncated: false };

  // Shrink the body until the composed URL fits. Percent-encoding means the
  // relationship between characters cut and bytes saved is not 1:1, so this
  // converges by measuring rather than by arithmetic.
  let keep = args.body.length;
  let url = full;
  while (keep > 0 && url.length > limit) {
    keep = Math.floor(keep * (limit / url.length) * 0.95);
    url = compose(cutAtLine(args.body, keep) + TRUNCATION_NOTICE);
  }
  return { url, truncated: true };
}

/** Cut to at most `keep` characters, preferring the last line break. */
function cutAtLine(body: string, keep: number): string {
  const head = body.slice(0, Math.max(0, keep));
  const lastBreak = head.lastIndexOf('\n');
  return lastBreak > keep * 0.5 ? head.slice(0, lastBreak) : head;
}

/**
 * The body Lens POSTs to an application's relay endpoint.
 *
 * The BROWSER builds the bundle (it is where the recording is) and the relay
 * holds the token (it is the only place a token belongs). So the payload is the
 * finished bundle plus the reporter's prose, and the server's whole job is:
 *
 * ```ts
 * app.post('/bug-report', async (req, res) => {
 *   const { fields, manifest, filename, zipBase64 } = req.body;
 *   const zip = Buffer.from(zipBase64, 'base64');
 *   res.json(await reporter.file({ manifest, files: [], zip, filename }));
 * });
 * ```
 *
 * `kind` and `version` are there so a relay can refuse a payload it does not
 * recognise instead of half-reading it.
 */
export interface RelayPayload {
  readonly kind: 'agentfootprint-lens.bug-report';
  readonly version: 1;
  readonly fields: {
    readonly title: string;
    readonly stepsToReproduce: string;
    readonly expected: string;
    readonly actual: string;
    readonly appVersion?: string;
  };
  /** The unit ids the reporter consented to. */
  readonly include: readonly string[];
  readonly labels?: readonly string[];
  /** The export's manifest — the same one `manifest.json` carries in the zip. */
  readonly manifest: unknown;
  /** The issue body Lens composed, so the relay files the text the reporter saw. */
  readonly body: string;
  readonly filename: string;
  /** The zip, base64. The size ceiling is what keeps this a reasonable POST. */
  readonly zipBase64: string;
}

/** What a relay is expected to answer with. Anything else is reported verbatim. */
export interface RelayResult {
  readonly issueUrl?: string;
  readonly zipUrl?: string;
  readonly error?: string;
  readonly message?: string;
}

/**
 * Base64 for a zip, without assuming a runtime.
 *
 * `btoa` in a browser, `Buffer` in Node (a relay flow tested under jsdom or
 * rendered on a server hits the second). Chunked so a multi-megabyte bundle
 * does not blow the argument limit of `String.fromCharCode`.
 */
export function encodeBase64(bytes: Uint8Array): string {
  const maybeBuffer = (globalThis as { Buffer?: { from(b: Uint8Array): { toString(e: string): string } } })
    .Buffer;
  if (typeof maybeBuffer?.from === 'function') return maybeBuffer.from(bytes).toString('base64');
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
