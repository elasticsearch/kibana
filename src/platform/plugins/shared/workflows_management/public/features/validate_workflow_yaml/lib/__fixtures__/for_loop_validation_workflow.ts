/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';

/** Foreach over consts.items; summarize step uses liquid for-loops against predecessor schemas. */
export const FOR_LOOP_VALIDATION_YAML = `name: For-loop collection validation
enabled: false
triggers:
  - type: manual
consts:
  items:
    - name: Alice
    - name: Bob
steps:
  - name: iterate_items
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log_item
        type: console
        with:
          message: '{{ foreach.item.name }}'
  - name: summarize
    type: console
    with:
      message: >-
        {%- for xx in steps.non_existing_step %}
        - {{ xx }}
        {%- endfor %}
        {%- for yy in steps.iterate_items.items %}
        - {{ yy.name }}
        {%- endfor %}
        {%- for zz in steps.log_item %}
        - {{ zz }}
        {%- endfor %}
`;

export const FOR_LOOP_VALIDATION_FOLDED_MESSAGE =
  '{%- for xx in steps.non_existing_step %} - {{ xx }} {%- endfor %} {%- for yy in steps.iterate_items.items %} - {{ yy.name }} {%- endfor %} {%- for zz in steps.log_item %} - {{ zz }} {%- endfor %}';

export const forLoopValidationWorkflowDefinition = {
  version: '1',
  name: 'For-loop collection validation',
  enabled: false,
  triggers: [{ type: 'manual' }],
  consts: {
    items: [{ name: 'Alice' }, { name: 'Bob' }],
  },
  steps: [
    {
      name: 'iterate_items',
      type: 'foreach',
      foreach: '{{ consts.items }}',
      steps: [
        {
          name: 'log_item',
          type: 'console',
          with: {
            message: '{{ foreach.item.name }}',
          },
        },
      ],
    },
    {
      name: 'summarize',
      type: 'console',
      with: { message: FOR_LOOP_VALIDATION_FOLDED_MESSAGE },
    },
  ],
} as WorkflowYaml;

export const FOR_LOOP_FOLDED_ONLY_YAML = `name: Folded for-loop validation
enabled: false
triggers:
  - type: manual
consts:
  items:
    - name: Alice
steps:
  - name: iterate_items
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log_item
        type: console
        with:
          message: '{{ foreach.item.name }}'
  - name: summarize
    type: console
    with:
      message: >-
        {%- for bad in steps.non_existing_step %}
        - {{ bad }}
        {%- endfor %}
`;

export const forLoopFoldedOnlyWorkflowDefinition = {
  version: '1',
  name: 'Folded for-loop validation',
  enabled: false,
  triggers: [{ type: 'manual' }],
  consts: {
    items: [{ name: 'Alice' }],
  },
  steps: [
    {
      name: 'iterate_items',
      type: 'foreach',
      foreach: '{{ consts.items }}',
      steps: [
        {
          name: 'log_item',
          type: 'console',
          with: { message: '{{ foreach.item.name }}' },
        },
      ],
    },
    {
      name: 'summarize',
      type: 'console',
      with: {
        message: '{%- for bad in steps.non_existing_step %} - {{ bad }} {%- endfor %}',
      },
    },
  ],
} as WorkflowYaml;

export const FOR_LOOP_NESTED_YAML = `name: Nested for-loop validation
enabled: false
triggers:
  - type: manual
consts:
  items:
    - name: Alice
steps:
  - name: iterate_items
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log_item
        type: console
        with:
          message: '{{ foreach.item.name }}'
  - name: summarize
    type: console
    with:
      message: >-
        {%- for outer in steps.iterate_items.items %}
          {%- for inner in steps.non_existing_step %}
          - {{ inner }}
          {%- endfor %}
        {%- endfor %}
`;

export const forLoopNestedWorkflowDefinition = {
  version: '1',
  name: 'Nested for-loop validation',
  enabled: false,
  triggers: [{ type: 'manual' }],
  consts: {
    items: [{ name: 'Alice' }],
  },
  steps: [
    {
      name: 'iterate_items',
      type: 'foreach',
      foreach: '{{ consts.items }}',
      steps: [
        {
          name: 'log_item',
          type: 'console',
          with: { message: '{{ foreach.item.name }}' },
        },
      ],
    },
    {
      name: 'summarize',
      type: 'console',
      with: {
        message:
          '{%- for outer in steps.iterate_items.items %}{%- for inner in steps.non_existing_step %}- {{ inner }}{%- endfor %}{%- endfor %}',
      },
    },
  ],
} as WorkflowYaml;

export const FOR_LOOP_RUNTIME_JSON_YAML = `name: Runtime JSON for-loop
enabled: false
triggers:
  - type: manual
steps:
  - name: fetch
    type: console
    with:
      message: 'done'
  - name: summarize
    type: console
    with:
      message: '{% for row in steps.fetch.output %}{{ row }}{% endfor %}'
`;

export const forLoopRuntimeJsonWorkflowDefinition = {
  version: '1',
  name: 'Runtime JSON for-loop',
  enabled: false,
  triggers: [{ type: 'manual' }],
  steps: [
    {
      name: 'fetch',
      type: 'console',
      with: { message: 'done' },
    },
    {
      name: 'summarize',
      type: 'console',
      with: {
        message: '{% for row in steps.fetch.output %}{{ row }}{% endfor %}',
      },
    },
  ],
} satisfies WorkflowYaml;
