/**
 * bug-report — the headless half of "Report a bug with this run".
 *
 * `<BugReportButton>` renders these; nothing here needs React, so a CLI or a
 * Vue shell can build the same consent dialog from the same three answers:
 * what is ticked by default, how big that is, and what the issue should say.
 *
 * The evidence itself is agentfootprint's: `describeBugReport` measures the
 * run, `exportBugReport` bundles the consented units. Lens never assembles a
 * bundle and never decides what a unit is — it renders the offer, takes the
 * ticks, and hands the ids back.
 */

export type {
  BugReportApi,
  BugReportBundleView,
  BugReportEnvironmentView,
  BugReportExcludedView,
  BugReportFieldsView,
  BugReportInputLike,
  BugReportManifestView,
  BugReportOversizeView,
  BugReportSourceLike,
  BugReportUnitView,
  DeviceIdentityView,
  DeviceSignInView,
} from './types.js';

export {
  DEFAULT_MAX_BYTES,
  conversationUnits,
  defaultSelection,
  fileUnits,
  formatBytes,
  measureSelection,
  trimHintFor,
  type SelectionSize,
} from './selection.js';

export { buildIssueBody, type EvidenceNote, type IssueBodyArgs } from './issueBody.js';

export {
  MAX_ISSUE_URL_BYTES,
  TRUNCATION_NOTICE,
  buildNewIssueUrl,
  encodeBase64,
  parseGithubRepo,
  type GithubTarget,
  type PrefilledIssueUrl,
  type RelayPayload,
  type RelayResult,
} from './github.js';
