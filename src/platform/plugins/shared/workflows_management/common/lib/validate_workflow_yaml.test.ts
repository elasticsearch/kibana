/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/* eslint-disable import/no-nodejs-modules */

import { readFileSync } from 'fs';
import Path from 'path';
import {
  ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID,
  isWorkflowValidationRuleId,
  KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX,
} from '@kbn/workflows';
import { z } from '@kbn/zod/v4';
import { validateWorkflowYaml } from './validate_workflow_yaml';
import { getWorkflowZodSchema } from '../schema';

const loadExample = (name: string) =>
  readFileSync(Path.join(__dirname, '..', 'examples', name), 'utf8');

describe('validateWorkflowYaml', () => {
  const schema = getWorkflowZodSchema({});

  describe('valid example workflows', () => {
    const examples = [
      { name: 'national_parks.yaml', yaml: loadExample('national_parks.yaml') },
      { name: 'automated_triaging.yaml', yaml: loadExample('automated_triaging.yaml') },
    ];

    examples.forEach(({ name, yaml }) => {
      it(`should return valid for ${name}`, () => {
        const result = validateWorkflowYaml(yaml, schema);
        expect(result.valid).toBe(true);
        expect(result.diagnostics).toEqual([]);
      });
    });
  });

  describe('yaml syntax errors', () => {
    it('should detect invalid YAML syntax', () => {
      const result = validateWorkflowYaml(':\n  invalid: [unclosed', schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].source).toBe('yaml-syntax');
    });

    it('should detect completely malformed YAML', () => {
      const result = validateWorkflowYaml('{{{{', schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.source === 'yaml-syntax')).toBe(true);
    });
  });

  describe('schema validation errors', () => {
    it('should detect missing required name field', () => {
      const yaml = `
version: '1'
enabled: true
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.source === 'schema')).toBe(true);
    });

    it('should provide an actionable message for an empty steps array', () => {
      const yaml = `
version: '1'
name: Test
triggers:
  - type: manual
steps: []
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          message: 'No steps found. Add at least one step.',
          path: ['steps'],
          ruleId: 'schemaViolation',
          source: 'schema',
        }),
      ]);
    });

    it('should detect invalid step type', () => {
      const yaml = `
version: '1'
name: Test
triggers:
  - type: manual
steps:
  - name: step1
    type: nonexistent_connector_type_xyz
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.source === 'schema')).toBe(true);
    });

    it('should provide path information in schema errors', () => {
      const yaml = `
version: '1'
name: Test
triggers:
  - type: manual
steps:
  - name: step1
    type: nonexistent_connector_type_xyz
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schema);

      const schemaErrors = result.diagnostics.filter((d) => d.source === 'schema');
      expect(schemaErrors.length).toBeGreaterThan(0);
    });
  });

  describe('step name uniqueness', () => {
    it('should detect duplicate step names', () => {
      const yaml = `
version: '1'
name: Duplicate Steps Test
triggers:
  - type: manual
steps:
  - name: my_step
    type: console
    with:
      message: first
  - name: my_step
    type: console
    with:
      message: second
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      const stepNameErrors = result.diagnostics.filter((d) => d.source === 'step-name');
      expect(stepNameErrors.length).toBeGreaterThan(0);
      expect(stepNameErrors[0].message).toContain('my_step');
    });

    it('should allow unique step names', () => {
      const yaml = `
version: '1'
name: Unique Steps Test
triggers:
  - type: manual
steps:
  - name: step_one
    type: console
    with:
      message: first
  - name: step_two
    type: console
    with:
      message: second
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'step-name')).toHaveLength(0);
    });
  });

  describe('liquid template errors', () => {
    it('should detect unclosed liquid expressions', () => {
      const yaml = `
version: '1'
name: Liquid Error Test
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: "{{ unclosed"
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'liquid', ruleId: 'liquidSyntaxError' }),
        ])
      );
    });

    it('should not flag valid liquid templates', () => {
      const yaml = `
version: '1'
name: Valid Liquid Test
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: "Hello {{ name }}"
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.diagnostics.filter((d) => d.source === 'liquid')).toHaveLength(0);
    });

    it('should not flag liquid expressions inside YAML comment lines', () => {
      const yaml = `
version: '1'
name: Comment Liquid Test
# This comment has {{ steps.foo.output | json }}
triggers:
  - type: manual
steps:
  # {{ some_commented_variable }}
  - name: step1
    type: console
    with:
      message: "Hello world"
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'liquid')).toHaveLength(0);
    });

    it('should not flag invalid liquid inside YAML comment lines', () => {
      const yaml = `
version: '1'
name: Comment Invalid Liquid Test
# {{ unclosed
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: "Hello world"
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.diagnostics.filter((d) => d.source === 'liquid')).toHaveLength(0);
    });

    it('should not flag liquid expressions inside inline YAML comments', () => {
      const yaml = `
version: '1'
name: Inline Comment Liquid Test
triggers:
  - type: manual
steps:
  - name: step1
    type: console  # was {{ steps.old.output | unknownFilter }}
    with:
      message: "Hello world" # {{ unclosed
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'liquid')).toHaveLength(0);
    });
  });

  describe('trigger validation', () => {
    const customTriggerId = 'custom-trigger';
    const schemaWithCustomTrigger = getWorkflowZodSchema({}, [customTriggerId]);
    const triggerDefinitions = [
      {
        id: customTriggerId,
        eventSchema: z.object({
          severity: z.string(),
          host: z.string(),
        }),
      },
    ];

    it('should pass when a custom trigger has a valid KQL condition', () => {
      const yaml = `
version: '1'
name: Valid Trigger Condition
triggers:
  - type: ${customTriggerId}
    on:
      condition: "event.severity: critical"
steps:
  - name: step1
    type: console
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schemaWithCustomTrigger, { triggerDefinitions });

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'trigger')).toHaveLength(0);
    });

    it('should detect an invalid KQL condition in a custom trigger', () => {
      const yaml = `
version: '1'
name: Invalid Trigger Condition
triggers:
  - type: ${customTriggerId}
    on:
      condition: "event.unknown_field: value"
steps:
  - name: step1
    type: console
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schemaWithCustomTrigger, { triggerDefinitions });

      expect(result.valid).toBe(false);
      const triggerErrors = result.diagnostics.filter((d) => d.source === 'trigger');
      expect(triggerErrors.length).toBeGreaterThan(0);
      expect(triggerErrors).toEqual(
        expect.arrayContaining([expect.objectContaining({ ruleId: 'invalidTriggerCondition' })])
      );
    });

    it('should skip trigger validation when no triggerDefinitions are provided', () => {
      const yaml = `
version: '1'
name: No Trigger Defs
triggers:
  - type: ${customTriggerId}
    on:
      condition: "event.unknown_field: value"
steps:
  - name: step1
    type: console
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schemaWithCustomTrigger);

      const triggerErrors = result.diagnostics.filter((d) => d.source === 'trigger');
      expect(triggerErrors).toHaveLength(0);
    });

    it('should not validate conditions on built-in trigger types', () => {
      const yaml = `
version: '1'
name: Built-in Trigger
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schema, { triggerDefinitions });

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'trigger')).toHaveLength(0);
    });
  });

  describe('connector-id on requiresConnectorId triggers', () => {
    const connectorEventTriggerId = 'example.connector_event';
    const schemaRequiringConnectorId = getWorkflowZodSchema({}, [
      { id: connectorEventTriggerId, requiresConnectorId: true },
    ]);

    const workflowYaml = (triggerBlock: string) => `
version: '1'
name: Connector Event Trigger
triggers:
  - ${triggerBlock}
steps:
  - name: step1
    type: console
    with:
      message: hello
`;

    it('should pass when connector-id is present', () => {
      const result = validateWorkflowYaml(
        workflowYaml(`type: ${connectorEventTriggerId}\n    connector-id: webhook-1`),
        schemaRequiringConnectorId
      );

      expect(result.valid).toBe(true);
    });

    it('should fail when connector-id is missing', () => {
      const result = validateWorkflowYaml(
        workflowYaml(`type: ${connectorEventTriggerId}`),
        schemaRequiringConnectorId
      );

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.source === 'schema')).toBe(true);
      expect(result.diagnostics.some((d) => d.message.includes('connector-id'))).toBe(true);
    });

    it('should fail when connector-id is empty', () => {
      const result = validateWorkflowYaml(
        workflowYaml(`type: ${connectorEventTriggerId}\n    connector-id: ""`),
        schemaRequiringConnectorId
      );

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.source === 'schema')).toBe(true);
    });
  });

  describe('graph build validation', () => {
    it('rejects nested flow-control inside a parallel branch (nested parallel)', () => {
      // The schema accepts this, but compiling to an execution graph fails because
      // a parallel branch body must be straight-line. Without graph validation the
      // workflow would pass as valid and crash the run task later.
      const yaml = `
version: '1'
name: Nested Parallel
enabled: true
triggers:
  - type: manual
steps:
  - name: outer
    type: parallel
    foreach: "{{ [1,2] }}"
    steps:
      - name: inner
        type: parallel
        foreach: "{{ [3,4] }}"
        steps:
          - name: leaf
            type: console
            with:
              message: leaf
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      const graphErrors = result.diagnostics.filter((d) => d.source === 'graph');
      expect(graphErrors.length).toBeGreaterThan(0);
      expect(graphErrors[0].message).toMatch(/parallel/i);
    });

    it('rejects an if inside a parallel branch body', () => {
      const yaml = `
version: '1'
name: If In Branch
enabled: true
triggers:
  - type: manual
steps:
  - name: fan_out
    type: parallel
    foreach: "{{ [1,2] }}"
    steps:
      - name: maybe
        type: if
        condition: "{{ true }}"
        steps:
          - name: yes_branch
            type: console
            with:
              message: yes
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.source === 'graph')).toBe(true);
    });

    it('accepts a straight-line parallel branch body', () => {
      const yaml = `
version: '1'
name: Valid Parallel
enabled: true
triggers:
  - type: manual
steps:
  - name: fan_out
    type: parallel
    foreach: "{{ [1,2] }}"
    steps:
      - name: work
        type: console
        with:
          message: "item {{ foreach.item }}"
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'graph')).toHaveLength(0);
    });
  });

  describe('expectedInputRefs', () => {
    const notificationGroupRef = `${KIBANA_WORKFLOW_INPUT_DEFINITION_REF_PREFIX}${ALERTING_V2_NOTIFICATION_GROUP_INPUT_DEFINITION_ID}`;

    // Inputs are declared on the manual trigger; the workflow schema drops root-level `inputs`.
    const workflowYaml = (inputsBlock: string, message: string) => `
version: '1'
name: Notification Workflow
triggers:
  - type: manual${inputsBlock}
steps:
  - name: notify
    type: console
    with:
      message: "${message}"
`;

    const withPayloadInput = `
    inputs:
      properties:
        payload:
          $ref: '${notificationGroupRef}'
      required:
        - payload`;

    it('passes when the workflow declares the ref and uses known fields', () => {
      const result = validateWorkflowYaml(
        workflowYaml(withPayloadInput, 'policy {{ inputs.payload.policyId }}'),
        schema,
        { expectedInputRefs: [notificationGroupRef] }
      );

      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.source === 'input-ref')).toHaveLength(0);
    });

    it('reports a missing input declaration', () => {
      const result = validateWorkflowYaml(
        workflowYaml('', 'hello {{ inputs.payload.policyId }}'),
        schema,
        { expectedInputRefs: [notificationGroupRef] }
      );

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'input-ref', ruleId: 'missingInputRef' }),
        ])
      );
    });

    it('reports a template path the ref schema does not define', () => {
      const result = validateWorkflowYaml(
        workflowYaml(withPayloadInput, 'policy {{ inputs.payload.policyName }}'),
        schema,
        { expectedInputRefs: [notificationGroupRef] }
      );

      expect(result.valid).toBe(false);
      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'input-ref', ruleId: 'unknownInputRefPath' }),
        ])
      );
    });

    it('catches unknown fields referenced only inside a liquid tag', () => {
      const result = validateWorkflowYaml(
        workflowYaml(
          withPayloadInput,
          '{% for ep in inputs.payload.nope %}{{ ep.episode_id }}{% endfor %}'
        ),
        schema,
        { expectedInputRefs: [notificationGroupRef] }
      );

      expect(result.valid).toBe(false);
      expect(result.diagnostics.map((d) => d.ruleId)).toContain('unknownInputRefPath');
    });

    it('runs no input-ref checks when the option is omitted', () => {
      const yaml = workflowYaml('', 'hello {{ inputs.payload.policyName }}');

      expect(validateWorkflowYaml(yaml, schema).diagnostics).toEqual(
        validateWorkflowYaml(yaml, schema, { expectedInputRefs: [] }).diagnostics
      );
      expect(validateWorkflowYaml(yaml, schema).valid).toBe(true);
    });
  });

  describe('multiple error sources', () => {
    it('should collect diagnostics from multiple sources without short-circuiting', () => {
      const yaml = `
version: '1'
name: Multi Error Test
triggers:
  - type: manual
steps:
  - name: dup
    type: console
    with:
      message: "{{ unclosed"
  - name: dup
    type: console
    with:
      message: ok
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(false);
      const sources = new Set(result.diagnostics.map((d) => d.source));
      expect(sources.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('response shape', () => {
    it('should return valid=true with empty diagnostics for valid YAML', () => {
      const yaml = `
version: '1'
name: Simple Valid
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: hello
`;
      const result = validateWorkflowYaml(yaml, schema);

      expect(result.valid).toBe(true);
      expect(result.diagnostics).toEqual([]);
      expect(result.parsedWorkflow).toBeDefined();
    });

    it('should include severity, message, and source in each diagnostic', () => {
      const result = validateWorkflowYaml('not: valid: yaml: [[[', schema);

      expect(result.valid).toBe(false);
      for (const diag of result.diagnostics) {
        expect(diag).toHaveProperty('severity');
        expect(diag).toHaveProperty('message');
        expect(diag).toHaveProperty('source');
        expect(typeof diag.message).toBe('string');
        expect(diag.message.length).toBeGreaterThan(0);
      }
    });
  });

  describe('rule IDs', () => {
    it('tags every diagnostic with a registered rule ID', () => {
      const result = validateWorkflowYaml('not: valid: yaml: [[[', schema);

      expect(result.diagnostics.length).toBeGreaterThan(0);
      for (const diag of result.diagnostics) {
        expect(isWorkflowValidationRuleId(diag.ruleId)).toBe(true);
      }
    });

    it('identifies a syntax error by rule ID rather than by message', () => {
      const result = validateWorkflowYaml('not: valid: yaml: [[[', schema);

      expect(result.diagnostics.map((diag) => diag.ruleId)).toContain('yamlSyntaxError');
    });

    it('identifies a schema violation by rule ID', () => {
      const result = validateWorkflowYaml(
        `enabled: true
triggers:
  - type: manual
steps:
  - name: first
    type: console
    with:
      message: hello`,
        schema
      );

      expect(result.valid).toBe(false);
      expect(result.diagnostics.map((diag) => diag.ruleId)).toContain('schemaViolation');
    });

    it('identifies duplicate step names by rule ID', () => {
      const result = validateWorkflowYaml(
        `name: duplicate-steps
enabled: true
triggers:
  - type: manual
steps:
  - name: same
    type: console
    with:
      message: one
  - name: same
    type: console
    with:
      message: two`,
        schema
      );

      expect(result.diagnostics.map((diag) => diag.ruleId)).toContain('duplicateStepName');
    });
  });
});
