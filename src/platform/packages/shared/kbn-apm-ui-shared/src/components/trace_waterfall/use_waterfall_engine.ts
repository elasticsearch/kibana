/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Engine that drives the waterfall rendering:
 * - `'dom'`: existing react-virtualized row list (default, production).
 * - `'charts'`: elastic-charts `<Trace>` canvas (spike / experimentation only).
 */
export type WaterfallEngine = 'dom' | 'charts';

const URL_PARAM = 'traceWaterfallEngine';
const STORAGE_KEY = 'apm.traceWaterfall.engine';

const isValidEngine = (v: string | null): v is WaterfallEngine => v === 'dom' || v === 'charts';

/**
 * Resolves the active waterfall engine in priority order:
 *   1. `engine` prop (explicit, for stories / tests).
 *   2. `?traceWaterfallEngine=charts` URL query parameter (live-flip without rebuild).
 *   3. `localStorage.getItem('apm.traceWaterfall.engine')`.
 *   4. `'dom'` fallback.
 */
export const useWaterfallEngine = (engine?: WaterfallEngine): WaterfallEngine => {
  if (engine !== undefined) return engine;

  if (typeof window !== 'undefined') {
    const urlParam = new URLSearchParams(window.location.search).get(URL_PARAM);
    if (isValidEngine(urlParam)) return urlParam;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (isValidEngine(stored)) return stored;
    } catch {
      // localStorage access may throw in sandboxed environments
    }
  }

  return 'dom';
};
