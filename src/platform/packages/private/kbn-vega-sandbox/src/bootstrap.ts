/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { version as vegaVersion } from 'vega';
import { version as vegaLiteVersion } from 'vega-lite';
import { VegaSandboxErrorCode } from './common';
import {
  VEGA_SANDBOX_PROTOCOL_VERSION,
  type VegaSandboxInboundMessage,
  type VegaSandboxOutboundMessage,
} from './protocol';
import { createSandboxInspectorSession } from './inspector_session';
import { renderVegaDescriptor } from './render';
import type { VegaSandboxRenderController } from './types';

declare global {
  interface Window {
    __kbnVegaSandbox__?: {
      renderVegaDescriptor: typeof renderVegaDescriptor;
      versions: {
        vega: string;
        vegaLite: string;
      };
    };
  }
}

// Opaque sandboxed iframes (no allow-same-origin) report origin as the string "null".
// A normal same-origin or cross-origin parent does not — that is not proper isolation.
const isolationOk: boolean = window.origin === 'null';

if (!isolationOk) {
  window.parent.postMessage(
    { type: 'error', error: { code: VegaSandboxErrorCode.IsolationFailure } },
    '*'
  );
}

let controller: VegaSandboxRenderController | undefined;
let initialized = false;
let hrefInterceptorInstalled = false;
let pendingRestoreState: unknown | undefined;
let renderGeneration = 0;
let validateRequestCounter = 0;
// Captured from the first valid init message; narrows targetOrigin for outbound posts.
let parentOrigin = '*';
const pendingExternalUrlValidations = new Map<
  string,
  {
    resolve: (value: { allowed: boolean; reason?: 'denied' | 'not_enabled' }) => void;
    reject: (reason?: unknown) => void;
  }
>();

const TOOLTIP_STYLE_ID = 'vega-kibana-sandbox-tooltip-styles';

const getRoot = (): HTMLElement => {
  const root = document.getElementById('vega-sandbox-root');

  if (!root) {
    throw new Error('Vega sandbox root element is missing.');
  }

  return root;
};

/** Inject parent-serialized EUI tooltip CSS (opaque iframe cannot see parent Emotion styles). */
const applyTooltipCss = (tooltipCss?: string): void => {
  if (!tooltipCss) {
    return;
  }

  let style = document.getElementById(TOOLTIP_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = TOOLTIP_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = tooltipCss;
};

const postToParent = (message: VegaSandboxOutboundMessage): void => {
  window.parent.postMessage(message, parentOrigin);
};

const inspectorSession = createSandboxInspectorSession({
  getView: () => controller?.view,
  postToParent,
});

const requestValidateExternalUrl = (
  uri: string
): Promise<{ allowed: boolean; reason?: 'denied' | 'not_enabled' }> => {
  const requestId = `exturl-${++validateRequestCounter}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      pendingExternalUrlValidations.delete(requestId);
      reject(new Error('Timed out validating external URL with the Kibana parent.'));
    }, 5_000);

    pendingExternalUrlValidations.set(requestId, {
      resolve: (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      reject: (reason) => {
        window.clearTimeout(timeout);
        reject(reason);
      },
    });

    postToParent({ type: 'validateExternalUrl', requestId, uri });
  });
};

const handleValidateExternalUrlResult = (
  message: Extract<VegaSandboxInboundMessage, { type: 'validateExternalUrlResult' }>
): void => {
  const pending = pendingExternalUrlValidations.get(message.requestId);
  if (!pending) {
    return;
  }
  pendingExternalUrlValidations.delete(message.requestId);
  pending.resolve({ allowed: message.allowed, reason: message.reason });
};

const isAllowedHref = (href: string): boolean => {
  try {
    const { protocol } = new URL(href);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const installHrefInterceptor = (): void => {
  if (hrefInterceptorInstalled) return;
  hrefInterceptorInstalled = true;

  window.open = ((url?: string | URL, _target?: string, _features?: string) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.toString() : undefined;
    // Sandbox disallows popups/top-navigation; only forward http/https hrefs to the parent.
    if (href && isAllowedHref(href)) {
      postToParent({ type: 'openHref', href });
    }
    return null;
  }) as typeof window.open;

  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    const href = this.getAttribute('href') ?? this.href;
    if (href && isAllowedHref(href)) {
      postToParent({ type: 'openHref', href });
      return;
    }
    return originalAnchorClick.call(this);
  };

  // Vega's View.handleHref creates a detached <a> and calls dispatchEvent(click), not click()
  // or window.open. Intercept that path so href marks still reach the parent.
  const originalDispatchEvent = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (event: Event): boolean {
    const href = this.getAttribute('href') ?? this.href;
    if (href && event.type === 'click' && isAllowedHref(href)) {
      postToParent({ type: 'openHref', href });
      return false;
    }
    return originalDispatchEvent.call(this, event);
  };
};

const isInboundMessage = (value: unknown): value is VegaSandboxInboundMessage =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === 'string';

const handleInit = (
  { protocolVersion, colorMode, tooltipCss }: Extract<VegaSandboxInboundMessage, { type: 'init' }>,
  origin: string
): void => {
  if (protocolVersion !== VEGA_SANDBOX_PROTOCOL_VERSION) {
    postToParent({
      type: 'error',
      error: {
        code: VegaSandboxErrorCode.UnsupportedProtocolVersion,
        values: {
          expected: VEGA_SANDBOX_PROTOCOL_VERSION,
          received: protocolVersion,
        },
      },
    });
    return;
  }

  // Narrow targetOrigin for subsequent outbound posts. Opaque/'null' parent origins
  // (e.g. Kibana itself embedded in a sandboxed frame) must fall back to '*'.
  parentOrigin = origin && origin !== 'null' ? origin : '*';

  if (colorMode) {
    document.documentElement.style.colorScheme = colorMode === 'DARK' ? 'dark' : 'light';
  }

  applyTooltipCss(tooltipCss);
  installHrefInterceptor();
  initialized = true;
};

const toRestorableState = (state: unknown): unknown => {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return undefined;
  }
  const record = state as { data?: unknown; signals?: unknown };
  const signals =
    record.signals && typeof record.signals === 'object' && !Array.isArray(record.signals)
      ? Object.fromEntries(
          Object.entries(record.signals as Record<string, unknown>).filter(
            ([name]) => !['width', 'height', 'padding', 'autosize', 'background'].includes(name)
          )
        )
      : undefined;
  return { signals };
};

const handleRender = async (message: Extract<VegaSandboxInboundMessage, { type: 'render' }>) => {
  if (!initialized) {
    postToParent({
      type: 'error',
      renderId: message.renderId,
      error: {
        code: VegaSandboxErrorCode.RenderFailed,
        values: { message: 'Sandbox not initialized' },
      },
    });
    return;
  }

  const generation = ++renderGeneration;
  const isCurrent = (): boolean => generation === renderGeneration;
  const { renderId, descriptor } = message;
  let capturedState: unknown;
  if (controller?.view) {
    const state = controller.view.getState();
    if (state) {
      capturedState = state;
      postToParent({ type: 'saveState', state });
    }
  }
  inspectorSession.onViewWillDestroy();
  controller?.destroy();
  controller = undefined;
  const root = getRoot();
  root.replaceChildren();

  const container = document.createElement('div');
  const controls = document.createElement('div');
  container.style.height = '100%';
  container.style.width = '100%';
  container.style.flex = '1 1 auto';
  container.style.minHeight = '0';
  container.style.minWidth = '0';
  controls.style.flex = '0 0 auto';
  root.append(container, controls);

  let nextController: VegaSandboxRenderController;
  try {
    nextController = await renderVegaDescriptor({
      container,
      controls,
      descriptor,
      onError: (error) => {
        if (isCurrent()) {
          postToParent({ type: 'error', renderId, error });
        }
      },
      onFunction: (intent) => {
        if (isCurrent()) {
          postToParent({ type: 'applyFilter', intent });
        }
      },
      onValidateExternalUrl: requestValidateExternalUrl,
      onWarn: (warning) => {
        if (isCurrent()) {
          postToParent({ type: 'warn', warning });
        }
      },
    });
  } catch (error) {
    if (!isCurrent()) {
      return;
    }
    throw error;
  }

  if (!isCurrent()) {
    nextController.destroy();
    return;
  }

  controller = nextController;

  const restoreFromCapture =
    Boolean(descriptor.restoreSignalValuesOnRefresh) && capturedState !== undefined;
  const stateToRestore = restoreFromCapture
    ? toRestorableState(capturedState)
    : pendingRestoreState;
  pendingRestoreState = undefined;

  if (stateToRestore !== undefined && controller.view) {
    controller.view.setState(stateToRestore as never);
  }

  if (!isCurrent()) {
    return;
  }

  if (message.dimensions) {
    await controller.resize(message.dimensions);
  }

  if (!isCurrent()) {
    return;
  }

  inspectorSession.onViewChanged();
  postToParent({ type: 'rendered', renderId });
};

const handleRestoreState = (state: unknown): void => {
  if (!initialized || !state) {
    return;
  }
  if (!controller?.view) {
    pendingRestoreState = state;
    return;
  }
  controller.view.setState(state as never);
};

const handleMessage = (message: MessageEvent): void => {
  if (!isolationOk || message.source !== window.parent) {
    return;
  }
  if (!isInboundMessage(message.data)) {
    return;
  }

  switch (message.data.type) {
    case 'init':
      handleInit(message.data, message.origin);
      return;
    case 'render':
      handleRender(message.data).catch((error) => {
        const messageText = error instanceof Error ? error.message : String(error);
        // Loader already posted ExternalUrl* errors before rejecting sanitize.
        if (
          messageText === VegaSandboxErrorCode.ExternalUrlDenied ||
          messageText === VegaSandboxErrorCode.ExternalUrlsNotEnabled
        ) {
          return;
        }
        postToParent({
          type: 'error',
          renderId: message.data.renderId,
          error: {
            code: VegaSandboxErrorCode.RenderFailed,
            values: { message: messageText },
          },
        });
      });
      return;
    case 'resize':
      controller?.resize(message.data.dimensions);
      return;
    case 'restoreState':
      try {
        handleRestoreState(message.data.state);
      } catch (error) {
        postToParent({
          type: 'error',
          error: {
            code: VegaSandboxErrorCode.RenderFailed,
            values: { message: error instanceof Error ? error.message : String(error) },
          },
        });
      }
      return;
    case 'validateExternalUrlResult':
      handleValidateExternalUrlResult(message.data);
      return;
    case 'requestInspectorSnapshot':
      inspectorSession.handleRequestSnapshot(message.data);
      return;
    case 'setInspectorActive':
      inspectorSession.handleSetInspectorActive(message.data);
      return;
  }
};

window.addEventListener('message', handleMessage);

window.__kbnVegaSandbox__ = {
  renderVegaDescriptor,
  versions: {
    vega: vegaVersion,
    vegaLite: vegaLiteVersion,
  },
};
