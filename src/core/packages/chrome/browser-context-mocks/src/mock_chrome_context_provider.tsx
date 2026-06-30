/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState, type ReactNode } from 'react';
import { ChromeServiceProvider } from '@kbn/core-chrome-browser-context';
import { chromeServiceMock } from '@kbn/core-chrome-browser-mocks';

type MockChromeStart = ReturnType<typeof chromeServiceMock.createStartContract>;

export interface MockChromeContextProviderProps {
  children: ReactNode;
  /** Override the mock chrome service. Defaults to `chromeServiceMock.createStartContract()`. */
  chrome?: MockChromeStart;
}

/**
 * Supplies a `chromeServiceMock` via context so components that read chrome (e.g. `AppHeader`) render
 * in tests without the "useChromeService must be used within a ChromeServiceProvider" crash. Wrap the
 * component under test, or a shared render harness, in it.
 *
 * @example
 * render(
 *   <MockChromeContextProvider>
 *     <MyComponentThatReadsChrome />
 *   </MockChromeContextProvider>
 * );
 */
export const MockChromeContextProvider = ({
  children,
  chrome: chromeOverride,
}: MockChromeContextProviderProps) => {
  // One stable instance per mount so chrome-dependent effects don't re-fire each render.
  const [defaultChrome] = useState(() => chromeServiceMock.createStartContract());
  const chrome = chromeOverride ?? defaultChrome;
  return <ChromeServiceProvider value={{ chrome }}>{children}</ChromeServiceProvider>;
};
