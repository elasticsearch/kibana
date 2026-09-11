/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  serializeDataSetsFromView,
  serializeSignalsFromView,
  type VegaInspectorRuntimeView,
} from './inspector_snapshot';
import type {
  VegaSandboxOutboundMessage,
  VegaSandboxRequestInspectorSnapshotMessage,
  VegaSandboxSetInspectorActiveMessage,
} from './protocol';

export const SIGNAL_INSPECTOR_DEBOUNCE_MS = 350;

export interface VegaSandboxInspectorSession {
  destroy: () => void;
  handleRequestSnapshot: (message: VegaSandboxRequestInspectorSnapshotMessage) => void;
  handleSetInspectorActive: (message: VegaSandboxSetInspectorActiveMessage) => void;
  onViewChanged: () => void;
  onViewWillDestroy: () => void;
}

export interface CreateSandboxInspectorSessionParams {
  clearTimeoutFn?: (timeoutId: ReturnType<typeof setTimeout>) => void;
  getView: () => VegaInspectorRuntimeView | undefined;
  postToParent: (message: VegaSandboxOutboundMessage) => void;
  setTimeoutFn?: (handler: () => void, timeout: number) => ReturnType<typeof setTimeout>;
}

export const createSandboxInspectorSession = ({
  clearTimeoutFn = clearTimeout,
  getView,
  postToParent,
  setTimeoutFn = setTimeout,
}: CreateSandboxInspectorSessionParams): VegaSandboxInspectorSession => {
  let signalsActive = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  const signalHandlers = new Map<string, (name: string, value: unknown) => void>();

  const postSignalsUpdate = (): void => {
    const view = getView();
    if (!view) {
      return;
    }
    postToParent({
      type: 'inspectorUpdate',
      kind: 'signals',
      payload: serializeSignalsFromView(view),
    });
  };

  const detachSignalListeners = (): void => {
    if (debounceTimer !== undefined) {
      clearTimeoutFn(debounceTimer);
      debounceTimer = undefined;
    }

    const view = getView();
    if (view) {
      for (const [key, handler] of signalHandlers) {
        view.removeSignalListener(key, handler);
      }
    }
    signalHandlers.clear();
  };

  const attachSignalListeners = (): void => {
    detachSignalListeners();
    const view = getView();
    if (!view) {
      return;
    }

    const onChange = () => {
      if (debounceTimer !== undefined) {
        clearTimeoutFn(debounceTimer);
      }
      debounceTimer = setTimeoutFn(() => {
        debounceTimer = undefined;
        postSignalsUpdate();
      }, SIGNAL_INSPECTOR_DEBOUNCE_MS);
    };

    for (const key of Object.keys(view._runtime?.signals ?? {})) {
      view.addSignalListener(key, onChange);
      signalHandlers.set(key, onChange);
    }
  };

  return {
    handleRequestSnapshot: (message) => {
      if (message.kind !== 'dataSets') {
        return;
      }
      const view = getView();
      postToParent({
        type: 'inspectorSnapshot',
        requestId: message.requestId,
        kind: 'dataSets',
        payload: view ? serializeDataSetsFromView(view) : [],
      });
    },
    handleSetInspectorActive: (message) => {
      if (message.kind !== 'signals') {
        return;
      }
      signalsActive = message.active;
      if (!message.active) {
        detachSignalListeners();
        return;
      }
      postSignalsUpdate();
      attachSignalListeners();
    },
    onViewChanged: () => {
      if (!signalsActive) {
        return;
      }
      postSignalsUpdate();
      attachSignalListeners();
    },
    onViewWillDestroy: () => {
      detachSignalListeners();
    },
    destroy: () => {
      signalsActive = false;
      detachSignalListeners();
    },
  };
};
