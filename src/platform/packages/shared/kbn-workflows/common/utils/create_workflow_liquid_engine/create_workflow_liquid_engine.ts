/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FS, LiquidOptions } from 'liquidjs';
import { Liquid } from 'liquidjs';

/**
 * LiquidJS tags supported in workflow templates.
 * Tags not in this set are removed from the engine.
 */
export const LIQUID_ALLOWED_TAGS = new Set([
  'assign',
  'for',
  'capture',
  'case',
  'comment',
  'decrement',
  'increment',
  'cycle',
  'if',
  'unless',
  'break',
  'continue',
  'raw',
  'echo',
  'liquid',
  '#',
]);

/**
 * A no-op filesystem implementation for the LiquidJS engine.
 * Workflow templates do not support file operations.
 */
const noopFs: FS = {
  exists: async () => false,
  existsSync: () => false,
  readFile: async (filepath: string) => {
    throw new Error(
      `File reading is not supported in workflow templates. Attempted to read: ${filepath}`
    );
  },
  readFileSync: (filepath: string) => {
    throw new Error(
      `File reading is not supported in workflow templates. Attempted to read: ${filepath}`
    );
  },
  resolve: (_dir: string, file: string, _ext: string) => file,
  contains: async () => false,
};

/**
 * Removes unsupported tags from a LiquidJS engine instance.
 * Any tag not in {@link LIQUID_ALLOWED_TAGS} is deleted, causing
 * LiquidJS to treat it as an unknown tag (parse error).
 */
const removeDisallowedLiquidTags = (engine: Liquid): void => {
  for (const tagName of Object.keys(engine.tags)) {
    if (!LIQUID_ALLOWED_TAGS.has(tagName)) {
      delete engine.tags[tagName];
    }
  }
};

/**
 * Creates a LiquidJS engine configured for workflow templates.
 * Uses an in-memory filesystem, restricts tags to the supported set,
 * and enables ownPropertyOnly.
 *
 * Callers can pass additional {@link LiquidOptions} (e.g. `strictFilters`)
 * which are merged with the enforced defaults.
 */
export const createWorkflowLiquidEngine = (options?: LiquidOptions): Liquid => {
  const { parseLimit = 150_000, renderLimit = 1_000, memoryLimit = 15_000_000 } = options ?? {};

  const engine = new Liquid({
    ...options,
    // Only expose own properties of objects in templates (no prototype chain access)
    ownPropertyOnly: true,
    // Use a no-op filesystem as files are not supported in workflow templates
    fs: noopFs,
    // Disable relative references since file operations are not supported
    relativeReference: false,
    // Use an empty in-memory template store
    templates: {},
    // Default max total characters allowed in a single parse() call
    parseLimit,
    // Default max time in ms allowed for a single render() call
    renderLimit,
    // Default max object allocations (array ops, string ops) per render
    memoryLimit,
  });
  removeDisallowedLiquidTags(engine);
  return engine;
};
