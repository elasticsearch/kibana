/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import {
  MockChromeContextProvider,
  type MockChromeContextProviderProps,
} from '@kbn/core-chrome-browser-context-mocks';

// The chrome context provider needed to render an `AppHeader` in tests lives in the chrome-context
// mocks package; re-exported here so header consumers have a single test entry point.
export { MockChromeContextProvider } from '@kbn/core-chrome-browser-context-mocks';

/**
 * Supplies everything an `AppHeader` needs to render in tests. Today that is just the chrome context,
 * so this is a thin wrapper around `MockChromeContextProvider`; as the header grows new dependencies
 * they can be wired in here without touching consumers.
 */
export const MockAppHeaderProvider = (props: MockChromeContextProviderProps) => (
  <MockChromeContextProvider {...props} />
);

// RTL helpers live in `@kbn/app-header/test_helpers`; test subjects in `@kbn/app-header`.
