/**
 * The bug-report shapes, mirrored STRUCTURALLY.
 *
 * agentfootprint 9.9.0 shipped `describeBugReport` / `exportBugReport` /
 * `githubDeviceSignIn` on its `/observe` door, and those are the real types.
 * This file re-declares the fields Lens reads instead of importing them,
 * for one reason: **the lens peer range admits agentfootprint 7, 8 and 9.**
 * A type-only import of a symbol that does not exist on 7.x turns a graceful
 * runtime degradation into a compile error in the consumer's build — the exact
 * failure `<BugReportButton>`'s feature detection exists to avoid.
 *
 * Same reason `observeRecording` declares its own `Recording` next door: what
 * Lens reads off a foreign shape is Lens's contract to keep.
 *
 * These are READ shapes. Every field is optional that the library marks
 * optional, and nothing here is constructed by Lens — the manifest always
 * comes back from the library.
 */

/**
 * A selectable piece of the bundle, as the manifest offers it.
 *
 * `kind` is left open (`string`) beside the two the library ships: a manifest
 * from a newer agentfootprint that adds a third kind renders as itself instead
 * of vanishing from a consent list.
 */
export interface BugReportUnitView {
  /** Stable within one manifest — `conv-1`, `file-narrative`. Selection is by this id. */
  readonly id: string;
  readonly kind: 'conversation' | 'file' | (string & {});
  /** One line a human reads in the consent list. */
  readonly label: string;
  /** Bytes this unit contributes, uncompressed. */
  readonly bytes: number;
  readonly eventCount?: number;
  readonly turnCount?: number;
  readonly runCount?: number;
  readonly sessionId?: string;
  /** Files this unit puts in the bundle. */
  readonly files?: readonly string[];
}

/** What the reporter left out — counted by the library, never silently absent. */
export interface BugReportExcludedView {
  readonly conversations?: number;
  readonly files?: number;
  readonly events?: number;
  readonly turns?: number;
  readonly unitIds?: readonly string[];
}

/** Versions, and deliberately nothing that identifies a machine or a person. */
export interface BugReportEnvironmentView {
  readonly agentfootprint?: string;
  readonly footprintjs?: string;
  readonly node?: string;
  readonly platform?: string;
  readonly arch?: string;
  readonly appVersion?: string;
}

/** The library's own oversize verdict, with hints that name real unit ids. */
export interface BugReportOversizeView {
  readonly totalBytes: number;
  readonly limitBytes: number;
  /** Sentences naming unit ids and what dropping each one saves. Rendered verbatim. */
  readonly trimHints: readonly string[];
}

/** The honest summary a human reads BEFORE consenting. */
export interface BugReportManifestView {
  readonly manifestVersion?: number;
  readonly createdAt?: string;
  /** Everything on offer, selected or not. */
  readonly units: readonly BugReportUnitView[];
  /** The unit ids this manifest describes as included. */
  readonly selected?: readonly string[];
  readonly excluded?: BugReportExcludedView;
  readonly counts?: {
    readonly conversations?: number;
    readonly runs?: number;
    readonly events?: number;
    readonly turns?: number;
    readonly files?: number;
  };
  readonly totalBytes?: number;
  /** State keys whose values arrived already scrubbed, BY NAME ONLY. */
  readonly redactedKeys?: readonly string[];
  /** Loud, human-readable problems. Rendered verbatim. */
  readonly warnings?: readonly string[];
  /** Quiet, true facts about how the bundle was assembled. Rendered verbatim. */
  readonly notes?: readonly string[];
  readonly oversize?: BugReportOversizeView;
  readonly environment?: BugReportEnvironmentView;
}

/** What the reporter says happened — the prose half of the report. */
export interface BugReportFieldsView {
  readonly title: string;
  readonly stepsToReproduce: string;
  readonly expected: string;
  readonly actual: string;
  readonly appVersion?: string;
}

/** The finished bundle, as `exportBugReport` returns it. */
export interface BugReportBundleView {
  readonly manifest: BugReportManifestView;
  readonly zip: Uint8Array;
  readonly filename: string;
}

/**
 * Anything `describeBugReport` accepts: a `Recording`, the handle `recordRun()`
 * returns, a `Runner`, or an array of them.
 *
 * Typed as `object` on purpose — see the file header. The library validates its
 * own input and says what it could not read, in its own words.
 */
export type BugReportSourceLike = object;

/** One source, or several — several runs of one session are one conversation. */
export type BugReportInputLike = BugReportSourceLike | readonly BugReportSourceLike[];

/** Who signed in. The token is a live credential — see `BugReportApi.signIn`. */
export interface DeviceIdentityView {
  readonly token: string;
  readonly login?: string;
  readonly scopes?: readonly string[];
}

/** The code to show a human, and the promise that resolves when they approve. */
export interface DeviceSignInView {
  /** Show it verbatim — it is case-sensitive. */
  readonly userCode: string;
  /** The page they type it into. */
  readonly verificationUri: string;
  readonly expiresIn?: number;
  readonly interval?: number;
  /** Resolves on approval; rejects on denial, expiry or abort. */
  readonly completed: Promise<DeviceIdentityView>;
}

/**
 * The agentfootprint functions the button calls.
 *
 * Every one is optional, because that is the truth on an older agentfootprint:
 * the button feature-detects `describeBugReport` and renders a version hint in
 * place of itself rather than throwing at click time.
 *
 * Pass one to `<BugReportButton api={…}>` to hand the button a different build
 * (or, in a test, a stub). What you pass REPLACES the resolved set — `{}` is a
 * complete answer meaning "this agentfootprint has none of it".
 */
export interface BugReportApi {
  /** Measure the run: the selectable units, their sizes, the redacted key names. */
  readonly describeBugReport?: (
    input: BugReportInputLike,
    options?: { readonly warnOverBytes?: number; readonly now?: Date },
  ) => BugReportManifestView;
  /** Bundle the consented units into named files plus a real zip. */
  readonly exportBugReport?: (
    input: BugReportInputLike,
    options: BugReportFieldsView & {
      readonly include?: readonly string[];
      readonly warnOverBytes?: number;
    },
  ) => BugReportBundleView;
  /**
   * GitHub's OAuth device flow, so the issue is filed as the REPORTER.
   *
   * The token it yields is a live credential for that account. Lens holds it in
   * memory for the life of the modal and drops it on close: never
   * `localStorage`, never a cookie, never a log line, never the issue body.
   */
  readonly signIn?: (options: {
    readonly clientId: string;
    readonly scopes?: readonly string[];
    readonly signal?: AbortSignal;
  }) => Promise<DeviceSignInView>;
}
