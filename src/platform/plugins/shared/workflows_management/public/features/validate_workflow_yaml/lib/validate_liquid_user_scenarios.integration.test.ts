/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';
import { validateLiquidForLoopCollections } from './validate_liquid_for_loop_collections';
import { validateVariables } from './validate_variables';
import { VARIABLE_REGEX_GLOBAL } from '../../../../common/lib/regex';
import { createFakeMonacoModel } from '../../../../common/mocks/monaco_model';

interface ScenarioDefinition {
  readonly yaml: string;
  readonly definition: WorkflowYaml;
  readonly variableKeys: readonly string[];
}

function assertScenarioPassesValidation(scenario: ScenarioDefinition): void {
  const doc = parseDocument(scenario.yaml);
  const model = createFakeMonacoModel(scenario.yaml);
  const graph = WorkflowGraph.fromWorkflowDefinition(scenario.definition);

  const collectionResults = validateLiquidForLoopCollections(
    scenario.yaml,
    doc,
    model,
    graph,
    scenario.definition
  );
  const collectionErrors = collectionResults.filter((r) => r.severity === 'error');
  expect(collectionErrors).toEqual([]);

  const variableItems = scenario.variableKeys.map((key) => {
    const match = [...scenario.yaml.matchAll(VARIABLE_REGEX_GLOBAL)].find(
      (m) => m.groups?.key === key
    );
    expect(match).toBeDefined();
    const offset = match!.index ?? 0;
    const start = model.getPositionAt(offset);
    const end = model.getPositionAt(offset + match![0].length);
    return {
      id: `${key}-var`,
      type: 'regexp' as const,
      key,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
      yamlPath: ['steps', 0, 'with', 'message'],
      offset,
    };
  });

  const variableResults = validateVariables(variableItems, graph, scenario.definition, doc, model);
  const variableErrors = variableResults.filter((r) => r.severity === 'error');
  expect(variableErrors).toEqual([]);
}

describe('validateLiquid user scenarios integration', () => {
  it('passes validation for assign-aliased collection in block folded scalar', () => {
    assertScenarioPassesValidation({
      yaml: `name: Local assigned collection
enabled: false
triggers:
  - type: manual
consts:
  items:
    - name: Alice
    - name: Bob
steps:
  - name: summarize
    type: console
    with:
      message: >-
        {% assign rows = consts.items %}
        {% for row in rows %}
        - {{ row.name }}
        {% endfor %}`,
      definition: {
        version: '1',
        name: 'Local assigned collection',
        enabled: false,
        triggers: [{ type: 'manual' }],
        consts: { items: [{ name: 'Alice' }, { name: 'Bob' }] },
        steps: [{ name: 'summarize', type: 'console', with: { message: 'x' } }],
      },
      variableKeys: ['row.name'],
    });
  });

  it('passes validation for Liquid range loop in block folded scalar', () => {
    assertScenarioPassesValidation({
      yaml: `name: Range loop
enabled: false
triggers:
  - type: manual
steps:
  - name: count
    type: console
    with:
      message: >-
        {% for i in (1..3) %}
        Page {{ i }}
        {% endfor %}`,
      definition: {
        version: '1',
        name: 'Range loop',
        enabled: false,
        triggers: [{ type: 'manual' }],
        steps: [{ name: 'count', type: 'console', with: { message: 'x' } }],
      },
      variableKeys: ['i'],
    });
  });

  it('reports variable error for invalid property on assign-aliased loop variable', () => {
    const yaml = `name: Local assigned collection typo
enabled: false
triggers:
  - type: manual
consts:
  items:
    - name: Alice
    - name: Bob
steps:
  - name: summarize
    type: console
    with:
      message: >-
        {% assign rows = consts.items %}
        {% for row in rows %}
        - {{ row.typo }}
        {% endfor %}`;
    const definition = {
      version: '1',
      name: 'Local assigned collection typo',
      enabled: false,
      triggers: [{ type: 'manual' }],
      consts: { items: [{ name: 'Alice' }, { name: 'Bob' }] },
      steps: [{ name: 'summarize', type: 'console', with: { message: 'x' } }],
    } satisfies WorkflowYaml;
    const doc = parseDocument(yaml);
    const model = createFakeMonacoModel(yaml);
    const graph = WorkflowGraph.fromWorkflowDefinition(definition);

    const collectionResults = validateLiquidForLoopCollections(yaml, doc, model, graph, definition);
    expect(collectionResults.filter((r) => r.severity === 'error')).toEqual([]);

    const match = [...yaml.matchAll(VARIABLE_REGEX_GLOBAL)].find(
      (m) => m.groups?.key === 'row.typo'
    );
    expect(match).toBeDefined();
    const offset = match!.index ?? 0;
    const start = model.getPositionAt(offset);
    const end = model.getPositionAt(offset + match![0].length);

    const variableResults = validateVariables(
      [
        {
          id: 'row.typo-var',
          type: 'regexp',
          key: 'row.typo',
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
          yamlPath: ['steps', 0, 'with', 'message'],
          offset,
        },
      ],
      graph,
      definition,
      doc,
      model
    );

    const rowTypoResult = variableResults.find((r) => r.id === 'row.typo-var');
    expect(rowTypoResult?.severity).toBe('error');
    expect(rowTypoResult?.message).toBe('Variable row.typo is invalid');
  });

  it('passes validation for nested assign-aliased collection in block folded scalar', () => {
    assertScenarioPassesValidation({
      yaml: `name: Nested local collection
enabled: false
triggers:
  - type: manual
consts:
  groups:
    - name: admins
      users:
        - name: Alice
steps:
  - name: summarize
    type: console
    with:
      message: >-
        {% for group in consts.groups %}
          {% assign users = group.users %}
          {% for user in users %}
          {{ group.name }}: {{ user.name }}
          {% endfor %}
        {% endfor %}`,
      definition: {
        version: '1',
        name: 'Nested local collection',
        enabled: false,
        triggers: [{ type: 'manual' }],
        consts: { groups: [{ name: 'admins', users: [{ name: 'Alice' }] }] },
        steps: [{ name: 'summarize', type: 'console', with: { message: 'x' } }],
      },
      variableKeys: ['group.name', 'user.name'],
    });
  });
});
