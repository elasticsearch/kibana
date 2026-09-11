/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { View, expressionFunction, loader, logger, parse, scheme, Warn } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { VEGA_FUNCTION_NAMES, VegaSandboxErrorCode, VegaSandboxWarningCode } from './common';
import { TooltipHandler } from './tooltip';
import type {
  VegaSandboxRenderCallbacks,
  VegaSandboxRenderController,
  VegaSandboxRenderIntent,
  VegaSandboxRenderParams,
} from './types';

interface ViewWithSandboxHandler extends View {
  _kbnVegaSandboxFunctionHandler?: (intent: VegaSandboxRenderIntent) => void;
}

const registerVegaFunctionForwarders = (): void => {
  for (const funcName of VEGA_FUNCTION_NAMES) {
    if (!expressionFunction(funcName)) {
      expressionFunction(
        funcName,
        function handlerFwd(this: { context: { dataflow: View } }, ...args: unknown[]) {
          const view = this.context.dataflow as ViewWithSandboxHandler;
          view.runAfter(() => view._kbnVegaSandboxFunctionHandler?.({ fn: funcName, args }));
        }
      );
    }
  }
};

const registerVegaColorSchemes = (colorSchemes?: Record<string, string[]>): void => {
  if (!colorSchemes) return;
  for (const [name, colors] of Object.entries(colorSchemes)) {
    if (Array.isArray(colors) && colors.length) {
      scheme(name, colors);
    }
  }
};

const updateVegaSize = (
  view: View,
  container: HTMLElement,
  dimensions?: { height?: number; width?: number }
): boolean => {
  const width = Math.floor(Math.max(0, dimensions?.width ?? container.clientWidth - 1));
  const height = Math.floor(Math.max(0, dimensions?.height ?? container.clientHeight - 1));

  if (view.width() !== width || view.height() !== height) {
    view.width(width).height(height);
    return true;
  }
  return false;
};

const createViewConfig = (
  { onError, onValidateExternalUrl, onWarn }: VegaSandboxRenderCallbacks,
  renderer: 'canvas' | 'svg'
) => {
  const vegaLogger = logger(Warn);

  vegaLogger.warn = (...args) => {
    onWarn?.({ code: VegaSandboxWarningCode.RuntimeWarning, values: { message: String(args[0]) } });
    return vegaLogger;
  };
  vegaLogger.error = (...args) => {
    onError?.({ code: VegaSandboxErrorCode.RenderFailed, values: { message: String(args[0]) } });
    return vegaLogger;
  };

  const vegaLoader = loader();
  const originalSanitize = vegaLoader.sanitize.bind(vegaLoader);
  vegaLoader.sanitize = async (uri, options) => {
    // href navigation is handled by the openHref protocol message, not the loader.
    if (options?.context === 'href') {
      throw new Error('href navigation is handled via the openHref protocol message');
    }

    // data.url fetches (no context) are not supported in the sandbox in phase 1 — there is no
    // connect-src and no parent fetch-proxy. Fail with an actionable error rather than a silent
    // CSP block. Pending product decision on string data.url support (see design Open Questions).
    if (!options?.context) {
      const code = VegaSandboxErrorCode.DataUrlsUnsupported;
      onError?.({ code, values: { uri } });
      throw new Error(code);
    }

    // Image marks load inside the opaque iframe under CSP img-src. Validate with the parent
    // first so policy denials surface the same admin-facing errors as the unsandboxed path,
    // instead of a Canvas drawImage InvalidStateError on a broken image.
    if (options.context === 'image' && onValidateExternalUrl) {
      const decision = await onValidateExternalUrl(uri);
      if (!decision.allowed) {
        const code =
          decision.reason === 'not_enabled'
            ? VegaSandboxErrorCode.ExternalUrlsNotEnabled
            : VegaSandboxErrorCode.ExternalUrlDenied;
        onError?.({ code, values: { uri } });
        throw new Error(code);
      }
    }

    const result = (await originalSanitize(uri, options)) as {
      href: string;
      crossOrigin?: string | null;
    };
    // Match unsandboxed VegaBaseView: allow cross-origin images without CORS tainting.
    result.crossOrigin = null;
    return result;
  };

  return {
    expr: expressionInterpreter,
    loader: vegaLoader,
    logger: vegaLogger,
    renderer,
  };
};

export const renderVegaDescriptor = async ({
  container,
  controls,
  descriptor,
  onError,
  onFunction,
  onValidateExternalUrl,
  onWarn,
}: VegaSandboxRenderParams): Promise<VegaSandboxRenderController> => {
  registerVegaFunctionForwarders();
  registerVegaColorSchemes(descriptor.colorSchemes);

  const view = new View(
    parse(descriptor.spec, undefined, { ast: true }),
    createViewConfig({ onError, onValidateExternalUrl, onWarn }, descriptor.renderer)
  ) as ViewWithSandboxHandler;
  let tooltipHandler: TooltipHandler | undefined;

  view._kbnVegaSandboxFunctionHandler = onFunction;

  if (descriptor.useResize) {
    updateVegaSize(view, container);
  }

  view.initialize(container, controls);

  if (descriptor.useResize) {
    updateVegaSize(view, container);
  }

  if (descriptor.useHover) {
    view.hover();
  }

  if (descriptor.tooltips && typeof descriptor.tooltips === 'object') {
    tooltipHandler = new TooltipHandler(container, view, descriptor.tooltips);
  }

  try {
    await view.runAsync();
  } catch (error) {
    tooltipHandler?.hideTooltip();
    view.finalize();
    throw error;
  }

  return {
    view,
    destroy: () => {
      tooltipHandler?.hideTooltip();
      view.finalize();
    },
    resize: async (dimensions) => {
      if (descriptor.useResize && updateVegaSize(view, container, dimensions)) {
        await view.runAsync();
      }
    },
  };
};
