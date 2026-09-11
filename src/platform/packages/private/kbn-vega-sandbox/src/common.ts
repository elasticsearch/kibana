/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const VEGA_SANDBOX_BUNDLE_PUBLIC_PATH = '/bundles/kbn-vega-sandbox/';

export const VEGA_SANDBOX_BUNDLE_FILE = 'vega_sandbox.bootstrap.js';

export const VEGA_FUNCTION_NAMES = [
  'kibanaAddFilter',
  'kibanaRemoveFilter',
  'kibanaRemoveAllFilters',
  'kibanaSetTimeFilter',
] as const;

export type VegaFunctionName = (typeof VEGA_FUNCTION_NAMES)[number];

export enum VegaSandboxErrorCode {
  RenderFailed = 'render_failed',
  UnsupportedProtocolVersion = 'unsupported_protocol_version',
  ExternalUrlDenied = 'external_url_denied',
  ExternalUrlsNotEnabled = 'external_urls_not_enabled',
  /** Bootstrap detected a non-opaque iframe origin — sandbox isolation is missing. */
  IsolationFailure = 'isolation_failure',
  /** Vega data.url fetches are not supported in the sandbox (no connect-src in phase 1). */
  DataUrlsUnsupported = 'data_urls_unsupported',
}

export enum VegaSandboxWarningCode {
  RuntimeWarning = 'runtime_warning',
}
