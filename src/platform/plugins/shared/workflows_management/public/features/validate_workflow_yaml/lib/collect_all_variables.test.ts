/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import type { WorkflowYaml } from '@kbn/workflows';
import { WorkflowGraph } from '@kbn/workflows/graph';
import { collectAllVariables } from './collect_all_variables';

describe('collectAllVariables', () => {
  it('should collect mustache template variables', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      value: "{{myVariable}}"
      other: "{{anotherVariable}}"
`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{myVariable}}',
            other: '{{anotherVariable}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('myVariable');
    expect(result[0].type).toBe('regexp');
    expect(result[1].key).toBe('anotherVariable');
    expect(result[1].type).toBe('regexp');
  });

  it('should collect foreach variables', () => {
    const yaml = `name: Test Workflow
steps:
  - name: Foreach Step
    foreach: "{{items}}"
    type: foreach
    steps:
      - name: Inner Step
        action: test`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Foreach Step',
          type: 'foreach',
          foreach: '{{items}}',
          steps: [
            {
              name: 'Inner Step',
              type: 'test.action',
            },
          ],
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    const foreachVariables = result.filter((v) => v.type === 'foreach');
    // With the proper foreach step structure, the function should detect the foreach variable
    expect(foreachVariables).toHaveLength(1);
    expect(foreachVariables[0].key).toBe('items');
  });

  it('should handle complex variable paths', () => {
    const yaml = `name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      value: "{{response.data.items[0].name}}"`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{response.data.items[0].name}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('response.data.items[0].name');
  });

  it('should handle empty variables', () => {
    const yaml = `name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      valid: "{{validVar}}"`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            valid: '{{validVar}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    // The regex pattern VARIABLE_REGEX_GLOBAL requires at least one character in the key
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('validVar');
  });

  it('should calculate correct positions for variables', () => {
    const yaml = `name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      value: "{{myVar}}"`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{myVar}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      key: 'myVar',
      startLineNumber: 6,
      startColumn: 15,
      endLineNumber: 6,
      endColumn: 24,
    });
  });

  it('should handle multiple variables in same line', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      value: "{{var1}} and {{var2}} and {{var3}}"
`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{var1}} and {{var2}} and {{var3}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(3);
    expect(result.map((v) => v.key)).toEqual(['var1', 'var2', 'var3']);
    expect(result.every((v) => v.type === 'regexp')).toBe(true);
  });

  it('should handle variables in conditional expressions', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: Conditional Step
    if:
      eq:
        - "{{status}}"
        - "active"
    then:
      - name: Then Step
        action: test
        params:
          value: "{{thenVar}}"
`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Conditional Step',
          type: 'if',
          condition: 'eq',
          steps: [
            {
              name: 'Then Step',
              type: 'test.action',
            },
          ],
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.key)).toContain('status');
    expect(result.map((v) => v.key)).toContain('thenVar');
  });

  it('should generate unique IDs for variables', () => {
    const yaml = `
name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      value1: "{{myVar}}"
      value2: "{{myVar}}"
`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value1: '{{myVar}}',
            value2: '{{myVar}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(2);
    expect(result[0].id).not.toBe(result[1].id);
    expect(result[0].key).toBe('myVar');
    expect(result[1].key).toBe('myVar');
  });

  it('should NOT collect variables from YAML comment lines', () => {
    const yaml = `
name: Test Workflow
# This is a comment with {{commentedVar}}
steps:
  - name: Test Step
    action: test
    params:
      value: "{{activeVar}}"
`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{activeVar}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('activeVar');
  });

  it('should NOT collect variables from indented YAML comment lines', () => {
    const yaml = `name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      # old value: "{{deprecatedVar}}"
      value: "{{currentVar}}"`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{currentVar}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('currentVar');
  });

  it('should collect variables from non-comment lines while skipping comment lines in mixed content', () => {
    const yaml = `
name: Test Workflow
# {{commentVar1}}
steps:
  - name: Test Step
    action: test
    # {{commentVar2}}
    params:
      value: "{{realVar1}} and {{realVar2}}"
`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{realVar1}} and {{realVar2}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(2);
    expect(result.map((v) => v.key)).toEqual(['realVar1', 'realVar2']);
  });

  it('should NOT collect variables from inline YAML comments', () => {
    const yaml = `name: Test Workflow
steps:
  - name: Test Step
    action: test
    params:
      value: "{{activeVar}}" # {{inlineCommentVar}}`;

    const lineCounter = new LineCounter();
    const yamlDocument = parseDocument(yaml, { lineCounter });
    const workflowDefinition: WorkflowYaml = {
      name: 'Test Workflow',
      version: '1',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'Test Step',
          type: 'test.action',
          with: {
            value: '{{activeVar}}',
          },
        },
      ],
    };
    const workflowGraph = WorkflowGraph.fromWorkflowDefinition(workflowDefinition);

    const result = collectAllVariables(yaml, yamlDocument, lineCounter, workflowGraph);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('activeVar');
  });
});
