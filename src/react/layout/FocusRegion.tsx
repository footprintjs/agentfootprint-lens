/**
 * FocusRegion + useFocusTracking — keyboard focus engine.
 *
 * Tracks when focus enters / leaves a region and which descendant
 * element currently holds focus. Two surfaces:
 *
 *   • `useFocusTracking(rootRef)` hook — for custom components.
 *     Returns `{ focused, focusedElement, focusVisible }`.
 *
 *   • `<FocusRegion>` component — drop-in wrapper. Fires
 *     `onFocusChange(state)` callbacks and optionally renders a
 *     visual ring around the region when focused. Useful for
 *     panels, dialogs, and any surface that should visibly respond
 *     to keyboard navigation.
 *
 * `focusVisible` tracks `:focus-visible` semantics — true only when
 * focus moved via keyboard, not a mouse click. Matches browser
 * behaviour for ring rendering.
 *
 * Uses `focusin` / `focusout` events (which bubble, unlike plain
 * `focus`/`blur`). Safe for nested inputs, portals, and late-mounted
 * children.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";

export interface FocusState {
  /** True when focus is inside the region. */
  readonly focused: boolean;
  /** Whether the focus was moved by keyboard (true) or mouse (false).
   *  Drives whether a focus ring should render. */
  readonly focusVisible: boolean;
  /** The element that currently holds focus, if inside the region. */
  readonly focusedElement: Element | null;
}

const EMPTY_STATE: FocusState = {
  focused: false,
  focusVisible: false,
  focusedElement: null,
};

/**
 * Hook form. Pass a ref to your region; get back a live FocusState.
 * Re-renders when focus state changes.
 */
export function useFocusTracking<T extends HTMLElement>(
  ref: RefObject<T | null>,
): FocusState {
  const [state, setState] = useState<FocusState>(EMPTY_STATE);
  // Track keyboard vs pointer globally — Chrome's `:focus-visible`
  // heuristic is basically "true unless the last interaction was
  // mouse/touch". We mirror that with a document-level flag.
  const lastInputKeyboardRef = useRef<boolean>(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const onKeyDown = () => {
      lastInputKeyboardRef.current = true;
    };
    const onPointerDown = () => {
      lastInputKeyboardRef.current = false;
    };

    const onFocusIn = (e: FocusEvent) => {
      setState({
        focused: true,
        focusVisible: lastInputKeyboardRef.current,
        focusedElement: (e.target as Element) ?? null,
      });
    };
    const onFocusOut = (e: FocusEvent) => {
      // Only reset when focus actually leaves the region, not when
      // it moves between descendants. `relatedTarget` is the
      // incoming element; if it's inside `node`, we're still focused.
      const next = e.relatedTarget as Node | null;
      if (next && node.contains(next)) {
        // Focus moved within the region — update focusedElement but
        // keep `focused: true`.
        setState((prev) => ({
          ...prev,
          focusedElement: next instanceof Element ? next : null,
        }));
        return;
      }
      setState(EMPTY_STATE);
    };

    node.addEventListener("focusin", onFocusIn);
    node.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      node.removeEventListener("focusin", onFocusIn);
      node.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [ref]);

  return state;
}

export interface FocusRegionProps {
  readonly children: ReactNode;
  /** Fires whenever the region's focus state changes. */
  readonly onFocusChange?: (state: FocusState) => void;
  /** Render a visible focus ring when focused via keyboard. Default
   *  `true`. Set `false` to handle visuals yourself via
   *  `onFocusChange`. */
  readonly showRing?: boolean;
  /** Ring color. Default `"#6366f1"` (indigo). */
  readonly ringColor?: string;
  /** Ring thickness in pixels. Default `2`. */
  readonly ringWidth?: number;
  /** Data-attribute hook. */
  readonly dataAttr?: string;
  readonly style?: CSSProperties;
  readonly className?: string;
}

export function FocusRegion({
  children,
  onFocusChange,
  showRing = true,
  ringColor = "#6366f1",
  ringWidth = 2,
  dataAttr,
  style,
  className,
}: FocusRegionProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const state = useFocusTracking(ref);

  // Fire callback on state change — but only when the callback
  // reference is stable (caller memoized it) OR when we're OK with
  // firing every render. We use a ref to compare against last
  // emitted state so we don't notify on value-equal renders.
  const lastEmittedRef = useRef<FocusState>(EMPTY_STATE);
  const emit = useCallback(
    (s: FocusState) => {
      const prev = lastEmittedRef.current;
      if (
        prev.focused === s.focused &&
        prev.focusVisible === s.focusVisible &&
        prev.focusedElement === s.focusedElement
      ) {
        return;
      }
      lastEmittedRef.current = s;
      onFocusChange?.(s);
    },
    [onFocusChange],
  );
  useEffect(() => {
    emit(state);
  }, [state, emit]);

  const ringVisible = showRing && state.focusVisible && state.focused;

  return (
    <div
      ref={ref}
      data-fp-lens={dataAttr ?? "focus-region"}
      data-focused={state.focused}
      data-focus-visible={state.focusVisible}
      className={className}
      style={{
        position: "relative",
        outline: ringVisible
          ? `${ringWidth}px solid ${ringColor}`
          : "none",
        outlineOffset: 2,
        transition: "outline-color 140ms ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
