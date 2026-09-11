/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  VEGA_FUNCTION_NAMES,
  VegaSandboxErrorCode,
  VegaSandboxWarningCode,
  type VegaFunctionName,
} from './common';
import type { VegaSandboxRenderDescriptor, VegaSandboxRenderIntent } from './types';

export const VEGA_SANDBOX_PROTOCOL_VERSION = 1;

export interface VegaSandboxDimensions {
  height?: number;
  width?: number;
}

export interface VegaSandboxErrorPayload {
  code: VegaSandboxErrorCode;
  values?: Record<string, unknown>;
}

export interface VegaSandboxWarningPayload {
  code: VegaSandboxWarningCode;
  values?: Record<string, unknown>;
}

export interface VegaSandboxInitMessage {
  /** Parent UI color mode (optional). */
  colorMode?: 'DARK' | 'LIGHT';
  protocolVersion: number;
  /**
   * Serialized CSS for `.vgaVis__tooltip` from the parent (EUI/Emotion).
   * Parent styles do not apply inside the opaque-origin sandbox iframe.
   */
  tooltipCss?: string;
  type: 'init';
}

export interface VegaSandboxRenderMessage {
  descriptor: VegaSandboxRenderDescriptor;
  dimensions?: VegaSandboxDimensions;
  /**
   * Correlates this request with outbound `rendered` / `error`. A stale completion must not
   * satisfy a newer render. Matching `rendered` is the signal PNG/PDF reporting waits on.
   */
  renderId: string;
  type: 'render';
}

/** Parent → iframe: update the existing view size. Does not emit outbound `rendered`. */
export interface VegaSandboxResizeMessage {
  dimensions: VegaSandboxDimensions;
  type: 'resize';
}

export interface VegaSandboxRestoreStateMessage {
  state: unknown;
  type: 'restoreState';
}

export interface VegaSandboxValidateExternalUrlResultMessage {
  allowed: boolean;
  reason?: 'denied' | 'not_enabled';
  requestId: string;
  type: 'validateExternalUrlResult';
}

export interface VegaSandboxRequestInspectorSnapshotMessage {
  kind: 'dataSets';
  requestId: string;
  type: 'requestInspectorSnapshot';
}

export interface VegaSandboxSetInspectorActiveMessage {
  active: boolean;
  kind: 'signals';
  type: 'setInspectorActive';
}

export type VegaSandboxInboundMessage =
  | VegaSandboxInitMessage
  | VegaSandboxRenderMessage
  | VegaSandboxResizeMessage
  | VegaSandboxRestoreStateMessage
  | VegaSandboxValidateExternalUrlResultMessage
  | VegaSandboxRequestInspectorSnapshotMessage
  | VegaSandboxSetInspectorActiveMessage;

export interface VegaSandboxRenderedMessage {
  /** Same id as the in-flight `render`. visTypeVega uses this to call `handlers.done()`. */
  renderId: string;
  type: 'rendered';
}

export interface VegaSandboxErrorMessage {
  error: VegaSandboxErrorPayload;
  renderId?: string;
  type: 'error';
}

export interface VegaSandboxWarnMessage {
  type: 'warn';
  warning: VegaSandboxWarningPayload;
}

export interface VegaSandboxApplyFilterMessage {
  intent: VegaSandboxRenderIntent & { fn: VegaFunctionName };
  type: 'applyFilter';
}

export interface VegaSandboxSaveStateMessage {
  state: unknown;
  type: 'saveState';
}

export interface VegaSandboxOpenHrefMessage {
  href: string;
  type: 'openHref';
}

export interface VegaSandboxValidateExternalUrlMessage {
  requestId: string;
  type: 'validateExternalUrl';
  uri: string;
}

export interface VegaSandboxInspectorSnapshotMessage {
  kind: 'dataSets';
  /** InspectDataSets[]; parent treats as untrusted and shape-validates */
  payload: unknown;
  requestId: string;
  type: 'inspectorSnapshot';
}

export interface VegaSandboxInspectorUpdateMessage {
  kind: 'signals';
  /** Signal rows without i18n column labels; parent treats as untrusted */
  payload: unknown;
  type: 'inspectorUpdate';
}

export type VegaSandboxOutboundMessage =
  | VegaSandboxRenderedMessage
  | VegaSandboxErrorMessage
  | VegaSandboxWarnMessage
  | VegaSandboxApplyFilterMessage
  | VegaSandboxSaveStateMessage
  | VegaSandboxOpenHrefMessage
  | VegaSandboxValidateExternalUrlMessage
  | VegaSandboxInspectorSnapshotMessage
  | VegaSandboxInspectorUpdateMessage;

export type VegaSandboxMessage = VegaSandboxInboundMessage | VegaSandboxOutboundMessage;

const ERROR_CODES = new Set<string>(Object.values(VegaSandboxErrorCode));
const WARNING_CODES = new Set<string>(Object.values(VegaSandboxWarningCode));
const FUNCTION_NAMES = new Set<string>(VEGA_FUNCTION_NAMES);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isErrorPayload = (value: unknown): value is VegaSandboxErrorPayload =>
  isPlainObject(value) && typeof value.code === 'string' && ERROR_CODES.has(value.code);

const isWarningPayload = (value: unknown): value is VegaSandboxWarningPayload =>
  isPlainObject(value) && typeof value.code === 'string' && WARNING_CODES.has(value.code);

const isApplyFilterIntent = (
  value: unknown
): value is VegaSandboxRenderIntent & { fn: VegaFunctionName } =>
  isPlainObject(value) &&
  typeof value.fn === 'string' &&
  FUNCTION_NAMES.has(value.fn) &&
  Array.isArray(value.args);

/** Shape-guard untrusted sandbox → parent messages. Malformed payloads return false. */
export const isVegaSandboxOutboundMessage = (
  value: unknown
): value is VegaSandboxOutboundMessage => {
  if (!isPlainObject(value) || typeof value.type !== 'string') {
    return false;
  }

  switch (value.type) {
    case 'rendered':
      return typeof value.renderId === 'string';
    case 'error':
      return (
        isErrorPayload(value.error) &&
        (value.renderId === undefined || typeof value.renderId === 'string')
      );
    case 'warn':
      return isWarningPayload(value.warning);
    case 'applyFilter':
      return isApplyFilterIntent(value.intent);
    case 'saveState':
      return isPlainObject(value.state);
    case 'openHref':
      return typeof value.href === 'string';
    case 'validateExternalUrl':
      return typeof value.requestId === 'string' && typeof value.uri === 'string';
    case 'inspectorSnapshot':
      return value.kind === 'dataSets' && typeof value.requestId === 'string';
    case 'inspectorUpdate':
      return value.kind === 'signals';
    default:
      return false;
  }
};
