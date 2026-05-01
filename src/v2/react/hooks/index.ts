/**
 * Lens React hooks — small, composable bindings between the headless
 * selectors and React state.
 *
 * Each hook is independently testable with `@testing-library/react`'s
 * `renderHook`. None of them contain derivation logic — they delegate
 * to the pure selectors in `lens/core/selectors/`.
 */

export { useLensRecorder } from './useLensRecorder.js';
export { useStepFocus, type UseStepFocusResult } from './useStepFocus.js';
export { useDrillPath, type UseDrillPathResult } from './useDrillPath.js';
export { useStepView } from './useStepView.js';
