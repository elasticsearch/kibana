/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import path from 'node:path';
import { schema } from '@kbn/config-schema';
import { stringOrStringArraySchema } from '../../../../../../schemas';
import { ruleResponseSchemaV1 } from '../../../../response';

export const findRuleParamsExamples = () => path.join(__dirname, 'examples_find_rules.yaml');

const UNSUPPORTED_FIELDS = [
  'monitoring',
  'mapped_params',
  'snoozeSchedule',
  'activeSnoozes',
  'snoozedInstances',
];

export const findRulesRequestQuerySchema = schema.object({
  per_page: schema.number({
    defaultValue: 10,
    min: 0,
    meta: {
      description: 'The number of rules to return per page.',
    },
  }),
  page: schema.number({
    defaultValue: 1,
    min: 1,
    meta: {
      description: 'The page number to return.',
    },
  }),
  search: schema.maybe(
    schema.string({
      meta: {
        description:
          'An Elasticsearch simple_query_string query that filters the objects in the response.',
      },
    })
  ),
  default_search_operator: schema.oneOf([schema.literal('OR'), schema.literal('AND')], {
    defaultValue: 'OR',
    meta: {
      description: 'The default operator to use for the simple_query_string.',
    },
  }),
  search_fields: schema.maybe(
    stringOrStringArraySchema({
      meta: {
        description: 'The fields to perform the simple_query_string parsed query against.',
      },
      validate: (value) =>
        validateUnsupportedFields(value, (field) => `Search field ${field} is not supported`),
    })
  ),
  sort_field: schema.maybe(
    schema.string({
      meta: {
        description:
          'Determines which field is used to sort the results. The field must exist in the `attributes` key of the response.',
      },
      validate: (value) =>
        validateUnsupportedFields(value, (field) => `Sort is not supported on this field ${field}`),
    })
  ),
  sort_order: schema.maybe(
    schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
      meta: {
        description: 'Determines the sort order.',
      },
    })
  ),
  has_reference: schema.maybe(
    // use nullable as maybe is currently broken
    // in config-schema
    schema.nullable(
      schema.object(
        {
          type: schema.string(),
          id: schema.string(),
        },
        {
          meta: {
            description:
              'Filters the rules that have a relation with the reference objects with a specific type and identifier.',
          },
        }
      )
    )
  ),
  fields: schema.maybe(
    stringOrStringArraySchema({
      meta: {
        description: 'The fields to return in the `attributes` key of the response.',
      },
    })
  ),
  filter: schema.maybe(
    schema.string({
      meta: {
        description:
          'A KQL string that you filter with an attribute from your saved object. It should look like `savedObjectType.attributes.title: "myTitle"`. However, if you used a direct attribute of a saved object, such as `updatedAt`, you must define your filter, for example, `savedObjectType.updatedAt > 2018-12-22`.',
      },
      validate: (value) =>
        validateUnsupportedFields(
          value,
          (field) => `Filter is not supported on this field ${field}`
        ),
    })
  ),
  filter_consumers: schema.maybe(
    schema.arrayOf(
      schema.string({
        meta: {
          description: 'List of consumers to filter.',
        },
      }),
      {
        meta: {
          description:
            'Filters the returned rules by the consumer (Kibana application) that owns them, for example: `siem`, `apm`, `infrastructure`.',
        },
      }
    )
  ),
});

const findRulesResponseDataSchema = schema.arrayOf(ruleResponseSchemaV1.extends({}));

export const findRulesResponseSchema = schema.object({
  page: schema.number(),
  per_page: schema.number(),
  total: schema.number(),
  data: findRulesResponseDataSchema,
});

const validateUnsupportedFields = (
  value: string | string[] | undefined,
  getErrorMessage: (field: string) => string
) => {
  if (!value) {
    return;
  }

  const valueArray = Array.isArray(value) ? value : [value];

  const unsupportedFieldValue = valueArray.find((field) =>
    UNSUPPORTED_FIELDS.some((unsupportedField) => isFieldUnsupported(field, unsupportedField))
  );

  return unsupportedFieldValue ? getErrorMessage(unsupportedFieldValue) : undefined;
};

/**
 * Matches the unsupported field as a complete segment either at the start of
 * a field path (e.g. "monitoring.execution.metrics") or right after
 * "attributes." in a KQL filter string (e.g. "alert.attributes.monitoring.execution > 50").
 * A boundary check (non-identifier char, ".", or end of string) prevents
 * partial matches like "monitoringExtra" or "new_field.monitoring".
 */
const isFieldUnsupported = (val: string, unsupportedField: string): boolean =>
  new RegExp(`(?:^|attributes\\.)${unsupportedField}(?:\\.|[^a-zA-Z0-9_]|$)`).test(val);
