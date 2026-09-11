/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import YAML, { LineCounter } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';
import { collectAllVariables } from './collect_all_variables';
import { validateVariables } from './validate_variables';

describe('validateVariables data.map nested $map bindings', () => {
  it('treats custom nested $map item bindings as valid variables', () => {
    const yaml = `name: Data Map Validation
enabled: false
triggers:
  - type: manual
consts:
  items:
    created_at: "asdf"
    title: "asdf"
    labels:
      - name: bug
steps:
  - name: filter_results
    type: data.map
    items: "\${{ consts.items }}"
    with:
      fields:
        created_at: "\${{ item.created_at }}"
        title: "\${{ item.title }}"
        labels:
          $map: { items: '\${{ item.labels }}', item: 'label' }
          name: "\${{ label.name }}"
`;
    const lineCounter = new LineCounter();
    const yamlDocument = YAML.parseDocument(yaml, { lineCounter, keepSourceTokens: true });
    const workflowDefinition = yamlDocument.toJSON() as WorkflowYaml;
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const variableItems = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);
    const results = validateVariables(
      variableItems,
      workflowGraph,
      workflowDefinition,
      yamlDocument,
      yaml
    );

    const labelResult = results.find((result) => 'key' in result && result.key === 'label.name');

    expect(labelResult?.message).toBe(null);
    expect(results.filter((result) => result.severity === 'error')).toEqual([]);
  });
});
