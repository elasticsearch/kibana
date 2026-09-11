/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { VEGA_SANDBOX_PROTOCOL_VERSION, isVegaSandboxOutboundMessage } from './src/protocol';
export { SIGNAL_INSPECTOR_DEBOUNCE_MS } from './src/inspector_session';
export {
  serializeCell,
  serializeDataSetsFromView,
  serializeSignalsFromView,
} from './src/inspector_snapshot';
export {
  VEGA_SANDBOX_BUNDLE_FILE,
  VEGA_SANDBOX_BUNDLE_PUBLIC_PATH,
  VEGA_FUNCTION_NAMES,
  VegaSandboxErrorCode,
  VegaSandboxWarningCode,
} from './src/common';
export type { VegaFunctionName } from './src/common';
export type {
  VegaSandboxApplyFilterMessage,
  VegaSandboxDimensions,
  VegaSandboxErrorMessage,
  VegaSandboxErrorPayload,
  VegaSandboxInboundMessage,
  VegaSandboxInitMessage,
  VegaSandboxInspectorSnapshotMessage,
  VegaSandboxInspectorUpdateMessage,
  VegaSandboxMessage,
  VegaSandboxOpenHrefMessage,
  VegaSandboxOutboundMessage,
  VegaSandboxRenderedMessage,
  VegaSandboxRenderMessage,
  VegaSandboxRequestInspectorSnapshotMessage,
  VegaSandboxResizeMessage,
  VegaSandboxRestoreStateMessage,
  VegaSandboxSaveStateMessage,
  VegaSandboxSetInspectorActiveMessage,
  VegaSandboxValidateExternalUrlMessage,
  VegaSandboxValidateExternalUrlResultMessage,
  VegaSandboxWarningPayload,
  VegaSandboxWarnMessage,
} from './src/protocol';
