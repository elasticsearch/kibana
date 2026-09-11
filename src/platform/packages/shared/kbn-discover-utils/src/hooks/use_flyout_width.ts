/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
} from 'react';
import { useCallback, useRef } from 'react';
import type { EuiFlyoutProps } from '@elastic/eui';
import { keys } from '@elastic/eui';
import useLocalStorage from 'react-use/lib/useLocalStorage';

type FlyoutSize = NonNullable<EuiFlyoutProps['size']>;

/**
 * Every EUI resize handle carries this attribute: the one a resizable `EuiFlyout` renders for
 * itself, and the ones rendered by any resizable container nested in the flyout content. Only
 * the flyout's own handle is a direct child of the flyout element.
 */
const RESIZE_HANDLE_SELECTOR = '[data-test-subj="euiResizableButton"]';

const getResizeHandle = ({ target }: SyntheticEvent): Element | null =>
  target instanceof HTMLElement ? target.closest(RESIZE_HANDLE_SELECTOR) : null;

/** True when the event comes from any resize handle, including nested resizable containers. */
export const isResizeHandleEvent = (event: SyntheticEvent): boolean =>
  getResizeHandle(event) !== null;

/** True only for the resize handle the flyout renders for itself. */
const isOwnResizeHandleEvent = (event: SyntheticEvent): boolean =>
  getResizeHandle(event)?.parentElement === event.currentTarget;

const isResizeKey = (key: string): boolean => key === keys.ARROW_LEFT || key === keys.ARROW_RIGHT;

export interface UseFlyoutWidthParams {
  /** Local storage key the user-selected width is persisted under. */
  localStorageKey: string;
  /** Width used until the user resizes the flyout for the first time. */
  defaultWidth: FlyoutSize;
}

export interface UseFlyoutWidthResult {
  /** Value for the flyout `size` prop. Stable for the lifetime of the flyout. */
  initialWidth: FlyoutSize;
  onKeyDownCapture: (event: ReactKeyboardEvent) => void;
  onPointerCancel: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onResize: (width: number) => void;
}

/**
 * Persists the width of a resizable `EuiFlyout`, but only when the user is the one resizing it.
 * All returned handlers have to be spread onto the same flyout.
 */
export const useFlyoutWidth = ({
  localStorageKey,
  defaultWidth,
}: UseFlyoutWidthParams): UseFlyoutWidthResult => {
  const [persistedWidth, setPersistedWidth] = useLocalStorage<FlyoutSize>(
    localStorageKey,
    defaultWidth
  );

  // Read once: EUI remounts a flyout opened with `session="start"` whenever `size` changes, which
  // would tear down the expanded document. The flyout is sized from the persisted width at mount
  // and EUI owns the width from then on.
  const initialWidthRef = useRef(persistedWidth ?? defaultWidth);

  // EUI also calls `onResize` for width changes the user never asked for — most notably when the
  // container is resized and EUI rescales the flyout proportionally (elastic/eui#9969). Saving
  // those silently replaces the user's own width, so a resize is only persisted while this flag
  // is set by an interaction with the flyout's own resize handle. Each handler assigns the flag
  // rather than only arming it, so an interaction that ends without a resize cannot leave it set.
  const isUserResizingRef = useRef(false);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    isUserResizingRef.current = isOwnResizeHandleEvent(event);
  }, []);

  const onPointerCancel = useCallback(() => {
    isUserResizingRef.current = false;
  }, []);

  // Capture phase, because EUI resizes from the handle's own bubble-phase `keydown` handler.
  const onKeyDownCapture = useCallback((event: ReactKeyboardEvent) => {
    isUserResizingRef.current = isResizeKey(event.key) && isOwnResizeHandleEvent(event);
  }, []);

  const onResize = useCallback(
    (width: number) => {
      if (!isUserResizingRef.current) {
        return;
      }

      // Consume the interaction: EUI keeps reporting container-driven widths through the same
      // callback long after the user has let go of the handle.
      isUserResizingRef.current = false;
      setPersistedWidth(width);
    },
    [setPersistedWidth]
  );

  return {
    initialWidth: initialWidthRef.current,
    onKeyDownCapture,
    onPointerCancel,
    onPointerDown,
    onResize,
  };
};
