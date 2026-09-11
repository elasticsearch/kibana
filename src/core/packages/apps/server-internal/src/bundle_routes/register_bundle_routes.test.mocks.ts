/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const registerRouteForBundleMock = jest.fn();
jest.doMock('./bundles_route', () => ({
  registerRouteForBundle: registerRouteForBundleMock,
}));

jest.doMock('@kbn/ui-shared-deps-src', () => ({
  distDir: 'uiSharedDepsSrcDistDir',
}));

jest.doMock('@kbn/ui-shared-deps-npm', () => ({
  distDir: 'uiSharedDepsNpmDistDir',
}));

jest.doMock('@kbn/monaco/server', () => ({
  bundleDir: 'kbnMonacoBundleDir',
}));

jest.doMock('@kbn/vega-sandbox/server', () => ({
  bundleDir: 'kbnVegaSandboxBundleDir',
}));
