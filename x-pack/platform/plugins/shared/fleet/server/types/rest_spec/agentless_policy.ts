/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';

import {
  LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE,
  PACKAGE_POLICY_SAVED_OBJECT_TYPE,
} from '../../constants';
import { AgentlessPolicySchema } from '../../../common/types/models/agentless_policy_schema';
import { ListAgentlessPoliciesRequestQuerySchema } from '../../../common/types/rest_spec/agentless_policy';

import { validateKuery } from '../../routes/utils/filter_utils';
import { ListResponseSchema } from '../../routes/schema/utils';

/**
 * Restricts agentless LIST filtering to the fields exposed by the clean
 * `AgentlessPolicy` contract. `validateKuery` rejects any field that is not
 * present in this mapping, so callers cannot filter on the underlying Fleet
 * package-policy internals (e.g. `policy_ids`, `revision`, `supports_agentless`)
 * that this API deliberately hides.
 *
 * `supports_agentless` is intentionally excluded: the service always ANDs
 * `supports_agentless:true` onto the query to scope results to agentless
 * policies, so it must not be something callers can filter (or override).
 */
export const AGENTLESS_POLICY_FILTER_MAPPINGS = {
  properties: {
    name: { type: 'keyword' },
    namespace: { type: 'keyword' },
    package: {
      properties: {
        name: { type: 'keyword' },
      },
    },
  },
} as const;

interface FilterMappingNode {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, FilterMappingNode>>;
}

/**
 * Walks a mapping's `properties` tree and returns the dotted paths of every leaf
 * field (e.g. `name`, `package.name`). Used to keep the allowed-filter-field list
 * single-sourced from {@link AGENTLESS_POLICY_FILTER_MAPPINGS} rather than
 * duplicating it in the OpenAPI description and the validation error message.
 */
const getLeafFieldPaths = (
  properties: Readonly<Record<string, FilterMappingNode>>,
  prefix = ''
): string[] =>
  Object.entries(properties).flatMap(([key, node]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return node.properties ? getLeafFieldPaths(node.properties, path) : [path];
  });

/**
 * The fields a caller may filter on via `kuery`, derived from the filter mapping
 * so the contract stays in one place.
 */
export const ALLOWED_AGENTLESS_POLICY_FILTER_FIELDS = getLeafFieldPaths(
  AGENTLESS_POLICY_FILTER_MAPPINGS.properties
);

const ALLOWED_FILTER_FIELDS_LIST = ALLOWED_AGENTLESS_POLICY_FILTER_FIELDS.map(
  (field) => `\`${field}\``
).join(', ');

/**
 * Reuses the shared Fleet list envelope (`{ items, total, page, perPage }` with a
 * `maxSize` bound on `items`) so the agentless LIST response stays single-sourced
 * with every other Fleet list endpoint.
 */
export const AgentlessPolicyListResponseSchema = ListResponseSchema(AgentlessPolicySchema);

/**
 * Extends the layering-safe base query shape from `common/` with the server-only
 * `kuery` validator. The base lives in `common/` so the request TypeScript type
 * can be derived there; only the validation (which depends on `validateKuery`)
 * lives here. The override replaces the base `kuery` field with a validating one
 * of the same type, so the derived `ListAgentlessPoliciesRequest` type stays accurate.
 */
export const ListAgentlessPoliciesRequestSchema = {
  query: ListAgentlessPoliciesRequestQuerySchema.extends({
    kuery: schema.maybe(
      schema.string({
        maxLength: 4096,
        meta: {
          description: `A KQL query string to filter results. Filtering is restricted to the following fields: ${ALLOWED_FILTER_FIELDS_LIST}.`,
        },
        validate: (value: string) => {
          // The filter mapping above already uses unprefixed field names (e.g. `name`,
          // `package.name`), so the SO-type prefix normalization step must be skipped.
          const skipNormalization = true;
          const validationObj = validateKuery(
            value,
            [PACKAGE_POLICY_SAVED_OBJECT_TYPE, LEGACY_PACKAGE_POLICY_SAVED_OBJECT_TYPE],
            AGENTLESS_POLICY_FILTER_MAPPINGS,
            skipNormalization
          );
          if (validationObj?.error) {
            // Enumerate the allowed fields so the 400 is self-correcting; the list is
            // derived from the mapping above, never hardcoded.
            return `${validationObj.error}. Filtering is only allowed on the following fields: ${ALLOWED_FILTER_FIELDS_LIST}.`;
          }
        },
      })
    ),
  }),
};
