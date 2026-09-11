/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createContext, useContext } from 'react';

/**
 * The display mode of a system flyout: `overlay` renders on top of the page,
 * `push` displaces the page content to sit next to it.
 * Mirrors EUI's `EuiFlyoutProps['type']`.
 */
export type SystemFlyoutType = 'overlay' | 'push';

/**
 * Value exposed by {@link SystemFlyoutTypeContext} so content rendered inside a
 * system flyout can read and reactively change the flyout's push/overlay type.
 */
export interface SystemFlyoutTypeContextValue {
  /** The current push/overlay type of the enclosing flyout. */
  type: SystemFlyoutType;
  /** Reactively switch the enclosing flyout between `push` and `overlay`. */
  setType: (type: SystemFlyoutType) => void;
}

/**
 * Context made available to everything rendered inside a system flyout. The
 * system flyout service seeds it from the `type` open option and owns the
 * underlying React state, which is why toggling `type` re-renders the live
 * flyout instead of only taking effect on the next open.
 *
 * `undefined` when consumed outside of a system flyout.
 */
export const SystemFlyoutTypeContext = createContext<SystemFlyoutTypeContextValue | undefined>(
  undefined
);

/**
 * Read (and change) the push/overlay type of the system flyout that encloses
 * the calling component. Returns `undefined` when not rendered inside a system
 * flyout.
 */
export const useSystemFlyoutType = (): SystemFlyoutTypeContextValue | undefined =>
  useContext(SystemFlyoutTypeContext);
