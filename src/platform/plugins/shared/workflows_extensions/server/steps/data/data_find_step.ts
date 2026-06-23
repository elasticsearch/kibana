/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { evaluateKql } from '@kbn/eval-kql';
import { isKqlSyntaxError } from './kql_utils';
import { dataFindStepCommonDefinition } from '../../../common/steps/data';
import type { StepHandlerContext } from '../../step_registry/types';
import { createServerStepDefinition } from '../../step_registry/types';

type FindStepContext = StepHandlerContext<
  typeof dataFindStepCommonDefinition.inputSchema,
  typeof dataFindStepCommonDefinition.configSchema
>;

function searchForMatch(
  items: unknown[],
  condition: string,
  context: FindStepContext
): { item: unknown; index: number | null; aborted?: boolean } {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (context.abortSignal?.aborted) {
      context.logger.warn('Find operation aborted by signal');
      return { item: null, index: null, aborted: true };
    }

    if (item === null || typeof item !== 'object') {
      // A non-object item (e.g. `null` or a scalar) cannot satisfy an
      // `item.<field>` condition. KQL now evaluates such a path to a non-match
      // rather than throwing, so warn explicitly here to preserve the
      // visibility operators expect when a malformed item is skipped.
      context.logger.warn(
        `Skipping non-object item at index ${i} (received ${item === null ? 'null' : typeof item})`
      );
    } else {
      try {
        const matches = evaluateKql(condition, { item, index: i });

        if (matches) {
          context.logger.debug(`Found match at index ${i}`);
          return { item, index: i };
        }
      } catch (error) {
        if (isKqlSyntaxError(error)) {
          throw new Error(`Invalid KQL condition: ${(error as Error).message}`);
        }
        context.logger.warn(`Failed to evaluate condition for item at index ${i}`, error);
      }
    }
  }

  return { item: null, index: null };
}

export const dataFindStepDefinition = createServerStepDefinition({
  ...dataFindStepCommonDefinition,
  handler: async (context) => {
    try {
      const items = context.config.items;
      const { condition, errorIfEmpty } = context.input;

      if (!Array.isArray(items)) {
        context.logger.error(`Input items has invalid type: ${typeof items}`);
        return {
          error: new Error(
            `Expected items to be an array, but received ${typeof items}. Please provide an array to search.`
          ),
        };
      }

      if (!condition || condition.trim() === '') {
        context.logger.debug('No condition provided, returning first item');
        const firstItem = items.length > 0 ? items[0] : null;

        if (errorIfEmpty && firstItem === null) {
          context.logger.error('No items found and errorIfEmpty is true');
          return { error: new Error('No items found in the collection') };
        }

        return { output: { item: firstItem, index: firstItem !== null ? 0 : null } };
      }

      context.logger.debug(
        `Finding first match in ${items.length} item(s) with condition: ${condition}`
      );

      const { aborted, ...result } = searchForMatch(items, condition, context);

      if (aborted) {
        return { error: new Error('Operation was aborted') };
      }

      if (result.item === null && errorIfEmpty) {
        context.logger.error('No match found and errorIfEmpty is true');
        return { error: new Error('No item matching the condition was found') };
      }

      return { output: result };
    } catch (error) {
      context.logger.error('Failed to find item', error);
      return {
        error: new Error(error instanceof Error ? error.message : 'Failed to find item'),
      };
    }
  },
});
