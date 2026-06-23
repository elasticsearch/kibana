/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import {
  DEFAULT_DSL_OPTIONS_LIST_STATE,
  DEFAULT_ESQL_OPTIONS_LIST_STATE,
  MAX_OPTIONS_LIST_REQUEST_SIZE,
  SELECTIONS_MAX,
} from '@kbn/controls-constants';
import {
  controlTitleSchema,
  dataControlEsqlVariantProps,
  dataControlFieldVariantProps,
} from './control_schema';

export const optionsListDisplaySettingsSchema = schema.object({
  placeholder: schema.maybe(
    schema.string({
      meta: {
        description: 'Placeholder text displayed in the control input when no option is selected.',
      },
    })
  ),
  hide_action_bar: schema.maybe(
    schema.boolean({
      meta: {
        description:
          'When `true`, the search bar, sorting options, and select all toggle are hidden from the control.',
      },
    })
  ),
  hide_exclude: schema.maybe(
    schema.boolean({
      meta: {
        description: 'When `true`, the exclude mode toggle is hidden from the control.',
      },
    })
  ),
  hide_exists: schema.maybe(
    schema.boolean({
      meta: {
        description: 'When `true`, the exists filter option is hidden from the control.',
      },
    })
  ),
  hide_sort: schema.maybe(
    schema.boolean({
      meta: {
        description: 'When `true`, the sort selector is hidden from the control.',
      },
    })
  ),
});

export const optionsListSearchTechniqueSchema = schema.oneOf(
  [schema.literal('prefix'), schema.literal('wildcard'), schema.literal('exact')],
  {
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.search_technique,
    meta: {
      description:
        'The matching technique used when searching available options. `prefix` matches values starting with the search term, `wildcard` matches values containing the search term, and `exact` requires a complete match. Only applies to string and IP fields. Defaults to `wildcard`.',
    },
  }
);

export const optionsListSortSchema = schema.object(
  {
    by: schema.oneOf([schema.literal('_count'), schema.literal('_key')], {
      meta: {
        description:
          'The field used to sort the available options list. `_count` sorts by document count and `_key` sorts alphabetically by option value.',
      },
    }),
    direction: schema.oneOf([schema.literal('asc'), schema.literal('desc')], {
      meta: {
        description: 'The sort direction. `asc` sorts ascending and `desc` sorts descending.',
      },
    }),
  },
  {
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.sort,
    meta: {
      description:
        'Defines how the available options are sorted in the control popover. Defaults to `{ by: "_count", direction: "desc" }`.',
    },
  }
);

export const optionsListSelectionSchema = schema.oneOf([schema.string(), schema.number()], {
  meta: {
    description: 'A selected option value. Accepts a string or a number.',
  },
});

const optionsListControlBaseParameters = schema.object({
  display_settings: schema.maybe(optionsListDisplaySettingsSchema),
});

const optionsListDSLExtras = {
  ...optionsListControlBaseParameters.getPropSchemas(),
  exclude: schema.boolean({
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.exclude,
    meta: {
      description:
        'When `true`, the control filters to documents that do NOT match the selected options. Defaults to `false`.',
    },
  }),
  exists_selected: schema.boolean({
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.exists_selected,
    meta: {
      description:
        "When `true`, the control filters to documents where the field exists, regardless of the field's value. Defaults to `false`.",
    },
  }),
  run_past_timeout: schema.boolean({
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.run_past_timeout,
    meta: {
      description:
        'When `true`, the options list query continues running even if it exceeds the configured timeout threshold. Defaults to `false`.',
    },
  }),
  search_technique: optionsListSearchTechniqueSchema,
  selected_options: schema.arrayOf(optionsListSelectionSchema, {
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.selected_options,
    maxSize: SELECTIONS_MAX,
    meta: {
      description: 'The list of currently selected option values.',
    },
  }),
  single_select: schema.boolean({
    defaultValue: DEFAULT_DSL_OPTIONS_LIST_STATE.single_select,
    meta: {
      description:
        'When `true`, only one option can be selected at a time. Selecting a new option deselects any previously selected option. Defaults to `false`.',
    },
  }),
  sort: optionsListSortSchema,
};

export const optionsListDSLControlSchema = schema.discriminatedUnion('values_source', [
  schema.object(
    { ...dataControlEsqlVariantProps, ...optionsListDSLExtras },
    {
      meta: {
        id: 'kbn-controls-schemas-options-list-dsl-control-schema-esql',
        title: 'EsqlOptionsListControl',
        description:
          "An options list control whose available options come from an ES|QL query's results.",
      },
    }
  ),
  schema.object(
    { ...dataControlFieldVariantProps, ...optionsListDSLExtras },
    {
      meta: {
        id: 'kbn-controls-schemas-options-list-dsl-control-schema-field',
        title: 'FieldOptionsListControl',
        description: 'An options list control whose available options come from a data view field.',
      },
    }
  ),
]);

const baseEsqlControl = {
  ...controlTitleSchema.getPropSchemas(),
  ...optionsListControlBaseParameters.getPropSchemas(),
  selected_options: schema.arrayOf(schema.string(), {
    maxSize: SELECTIONS_MAX,
    meta: {
      description: 'The list of currently selected option values.',
    },
  }),
  single_select: schema.boolean({
    defaultValue: DEFAULT_ESQL_OPTIONS_LIST_STATE.single_select,
    meta: {
      description:
        'When `true`, only one option can be selected at a time. Selecting a new option deselects any previously selected option. Defaults to `true`.',
    },
  }),
  variable_name: schema.string({
    meta: {
      description:
        'The name of the ES|QL variable that this control populates. The variable is referenced in ES|QL queries using the `?variable_name` syntax.',
    },
  }),
  variable_type: schema.oneOf(
    [
      schema.literal('fields'),
      schema.literal('values'),
      schema.literal('functions'),
      schema.literal('time_literal'),
      schema.literal('multi_values'),
    ],
    {
      meta: {
        description:
          'The ES|QL variable type that determines how the selected value is substituted into the query. Accepts `fields`, `values`, `functions`, `time_literal`, or `multi_values`.',
      },
    }
  ),
};

export const optionsListESQLControlSchema = schema.discriminatedUnion('control_type', [
  schema.object(
    {
      ...baseEsqlControl,
      control_type: schema.literal('STATIC_VALUES'),
      available_options: schema.arrayOf(schema.string(), {
        maxSize: MAX_OPTIONS_LIST_REQUEST_SIZE,
        meta: {
          description: 'A fixed list of option strings displayed in the control.',
        },
      }),
    },
    {
      meta: {
        id: 'kbn-controls-schemas-options-list-esql-control-schema-static-values',
        title: 'STATIC_VALUES',
        description:
          'An ES|QL variable control with a fixed list of selectable options defined directly in `available_options`.',
      },
    }
  ),
  schema.object(
    {
      ...baseEsqlControl,
      control_type: schema.literal('VALUES_FROM_QUERY'),
      esql_query: schema.string({
        meta: {
          description:
            'An ES|QL query whose results populate the list of available options in the control popover.',
        },
      }),
    },
    {
      meta: {
        id: 'kbn-controls-schemas-options-list-esql-control-schema-values-from-query',
        title: 'VALUES_FROM_QUERY',
        description:
          'An ES|QL variable control whose selectable options are dynamically retrieved by running an ES|QL query.',
      },
    }
  ),
]);
