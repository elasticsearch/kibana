/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowYaml } from '@kbn/workflows';
import { performComputation } from './computation';

describe('performComputation', () => {
  describe('empty input', () => {
    it('should return undefined fields for empty string', () => {
      const result = performComputation('');
      expect(result.yamlLineCounter).toBeUndefined();
      expect(result.yamlDocument).toBeUndefined();
      expect(result.workflowLookup).toBeUndefined();
      expect(result.workflowGraph).toBeUndefined();
      expect(result.workflowDefinition).toBeUndefined();
    });
  });

  describe('basic workflow', () => {
    it('should parse a simple workflow and build graph with all steps', () => {
      const yaml = `name: test
enabled: false
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: "hello"
  - name: step2
    type: console
    with:
      message: "world"`;

      const result = performComputation(yaml);

      expect(result.yamlDocument).toBeDefined();
      expect(result.yamlLineCounter).toBeDefined();
      expect(result.workflowLookup).toBeDefined();
      expect(result.workflowGraph).toBeDefined();
      expect(result.workflowDefinition).toBeDefined();

      // Both steps should be in the lookup
      expect(result.workflowLookup?.steps).toHaveProperty('step1');
      expect(result.workflowLookup?.steps).toHaveProperty('step2');

      // Both steps should be in the definition
      expect(result.workflowDefinition?.steps).toHaveLength(2);
    });
  });

  describe('waitForApproval step', () => {
    it('should parse workflow with waitForApproval step and build graph', () => {
      const yaml = `name: test
enabled: false
triggers:
  - type: manual
steps:
  - name: request-approval
    type: waitForApproval
    timeout: 24h
    with:
      message: "Approve?"
      approveLabel: Approve
      rejectLabel: Decline`;

      const result = performComputation(yaml);

      expect(result.yamlDocument).toBeDefined();
      expect(result.workflowLookup?.steps).toHaveProperty('request-approval');
      expect(result.workflowDefinition?.steps?.[0]?.type).toBe('waitForApproval');
      expect(result.workflowGraph).toBeDefined();
    });
  });

  describe('multi-line JSON object in YAML value (issue #15420)', () => {
    it('should parse workflow with multi-line JSON schema and preserve all downstream steps', () => {
      const yaml = `name: AI Steps Demo
enabled: false
description: This is a new workflow
triggers:
  - type: manual
steps:
  - name: generate_obs_alert
    type: ai.prompt
    connector-id: azure_open_ai
    with:
      prompt: |
        You are a system that generates Observability alerts.
        I need you to generate 2 alerts.
      schema: {
        "type": "array",
        "items": {
          "title": "ObservabilityAlert",
          "type": "object",
          "additionalProperties": false,
          "required": ["id", "severity", "message", "timestamp"],
          "properties": {
            "id": {
              "type": "string",
              "description": "Unique identifier of the alert",
              "examples": ["cpu_high_usage", "service_down"]
            },
            "severity": {
              "type": "string",
              "description": "Alert severity level",
              "enum": ["critical", "high", "medium", "low", "info"]
            }
          }
        }
      }
  - name: console
    type: console
    with:
      message: foo`;

      const result = performComputation(yaml);

      // Both steps should be parsed and present
      expect(result.workflowDefinition).toBeDefined();
      expect(result.workflowDefinition?.steps).toHaveLength(2);
      expect(result.workflowDefinition?.steps[0].name).toBe('generate_obs_alert');
      expect(result.workflowDefinition?.steps[1].name).toBe('console');

      // The graph should include both steps
      expect(result.workflowGraph).toBeDefined();

      // The lookup should include both steps
      expect(result.workflowLookup?.steps).toHaveProperty('generate_obs_alert');
      expect(result.workflowLookup?.steps).toHaveProperty('console');

      // Schema should be parsed as an object, not a string
      const schema = (result.workflowDefinition?.steps[0] as any).with?.schema;
      expect(schema).toBeDefined();
      expect(typeof schema).toBe('object');
      expect((schema as Record<string, unknown>).type).toBe('array');
    });
  });

  describe('flow-style consts with special characters', () => {
    it('should parse workflow with flow-style consts containing @timestamp', () => {
      const yaml = `name: New workflow
enabled: false
triggers:
  - type: manual
consts:
  items: [{"type": "foo", "@timestamp": "now"}, {"type": "bar", "@timestamp": "yesterday"}]
steps:
  - name: foreach
    type: foreach
    foreach: "{{consts.items}}"
    steps:
      - name: console
        type: console
        with:
          message: "{{foreach.item.type}}"`;

      const result = performComputation(yaml);

      expect(result.workflowDefinition).toBeDefined();

      // Consts should be parsed as an array of objects, not a string
      const items = result.workflowDefinition?.consts?.items;
      expect(Array.isArray(items)).toBe(true);
      expect(items).toEqual([
        { type: 'foo', '@timestamp': 'now' },
        { type: 'bar', '@timestamp': 'yesterday' },
      ]);

      // The foreach step and its nested console step should be present
      expect(result.workflowDefinition?.steps).toHaveLength(1);
      expect(result.workflowDefinition?.steps[0].name).toBe('foreach');

      // Graph should be built
      expect(result.workflowGraph).toBeDefined();
    });
  });

  describe('unclosed quotes (user typing)', () => {
    it('should still produce a definition and graph with unclosed quotes', () => {
      const yaml = `name: New workflow
enabled: false
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: "hello world`;

      const result = performComputation(yaml);

      // Should still parse — the YAML parser handles unclosed quotes gracefully
      expect(result.workflowDefinition).toBeDefined();
      expect(result.workflowDefinition?.steps).toHaveLength(1);
      expect(result.workflowDefinition?.steps[0].name).toBe('step1');
      expect(result.workflowGraph).toBeDefined();
    });
  });

  describe('bare special characters in values', () => {
    it('should parse workflow with bare @ in values', () => {
      const yaml = `name: New workflow
enabled: false
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: @mention hello
  - name: step2
    type: console
    with:
      message: "second step"`;

      const result = performComputation(yaml);

      expect(result.workflowDefinition).toBeDefined();
      expect(result.workflowDefinition?.steps).toHaveLength(2);
      expect(result.workflowDefinition?.steps[0].name).toBe('step1');
      expect(result.workflowDefinition?.steps[1].name).toBe('step2');
    });

    it('should parse workflow with !, *, & in values', () => {
      const yaml = `name: New workflow
enabled: false
triggers:
  - type: manual
steps:
  - name: step1
    type: console
    with:
      message: !important
  - name: step2
    type: console
    with:
      message: *pointer
  - name: step3
    type: console
    with:
      message: &anchor
  - name: step4
    type: console
    with:
      message: "after anchor"`;

      const result = performComputation(yaml);

      expect(result.workflowDefinition).toBeDefined();
      const steps = result.workflowDefinition?.steps as Array<Record<string, any>>;
      expect(steps).toHaveLength(4);
      expect(steps[0].name).toBe('step1');
      expect(steps[0].with?.message).toBe('!important');
      expect(steps[1].name).toBe('step2');
      expect(steps[1].with?.message).toBe('*pointer');
      expect(steps[2].name).toBe('step3');
      expect(steps[2].with?.message).toBe('&anchor');
      expect(steps[3].name).toBe('step4');
      expect(steps[3].with?.message).toBe('after anchor');
    });
  });

  describe('loadedDefinition bypass', () => {
    it('should use loadedDefinition when provided and skip YAML parsing for definition', () => {
      const yaml = `name: test
enabled: false
triggers:
  - type: manual
steps:
  - name: step1
    type: console`;

      const loadedDef: WorkflowYaml = {
        version: '1',
        name: 'loaded',
        enabled: true,
        triggers: [{ type: 'manual' }],
        steps: [
          {
            name: 'loaded-step',
            type: 'console',
            with: { message: 'from loaded' },
          },
        ],
      };

      const result = performComputation(yaml, loadedDef);

      // Should use the loaded definition, not parse from YAML
      expect(result.workflowDefinition).toBe(loadedDef);
      expect(result.workflowDefinition?.name).toBe('loaded');

      // Lookup still comes from the YAML string
      expect(result.workflowLookup?.steps).toHaveProperty('step1');
    });
  });

  describe('complex multi-line JSON with downstream steps', () => {
    it('should not lose downstream steps after a step with multi-line JSON and special chars', () => {
      const yaml = `name: Complex Workflow
enabled: false
triggers:
  - type: manual
steps:
  - name: ai_step
    type: ai.prompt
    with:
      schema: {
        "type": "object",
        "properties": {
          "@timestamp": {
            "type": "string"
          },
          "message": {
            "type": "string"
          }
        }
      }
  - name: log_step
    type: console
    with:
      message: "{{steps.ai_step.output}}"
  - name: final_step
    type: console
    with:
      message: "done"`;

      const result = performComputation(yaml);

      expect(result.workflowDefinition).toBeDefined();
      expect(result.workflowDefinition?.steps).toHaveLength(3);
      expect(result.workflowDefinition?.steps[0].name).toBe('ai_step');
      expect(result.workflowDefinition?.steps[1].name).toBe('log_step');
      expect(result.workflowDefinition?.steps[2].name).toBe('final_step');

      // All three steps should appear in the lookup
      expect(result.workflowLookup?.steps).toHaveProperty('ai_step');
      expect(result.workflowLookup?.steps).toHaveProperty('log_step');
      expect(result.workflowLookup?.steps).toHaveProperty('final_step');

      // Graph should be built with all steps
      expect(result.workflowGraph).toBeDefined();
    });
  });

  describe('JSON Schema outputs', () => {
    it('should preserve outputs in JSON Schema format from performComputation', () => {
      const yaml = `name: New workflow
enabled: true
description: This is a new workflow
triggers:
  - type: alert

inputs:
  - name: message
    type: string
    default: "hello world"

outputs: 
  required:
    - b
  properties:
    a:
      type: string
      default: "aaaa"
    b:
      type: number

steps:
  - name: hello_world_step
    type: console
    with:
      message: "{{ event.alerts[0] | json: 2 }}"

  - name: return
    type: workflow.output
    with:
      a: {}`;

      const result = performComputation(yaml);

      expect(result.workflowDefinition).toBeDefined();
      expect(result.workflowDefinition?.outputs).toBeDefined();

      const outputs = result.workflowDefinition?.outputs as Record<string, unknown>;
      expect(outputs?.properties).toBeDefined();
      expect(outputs?.required).toEqual(['b']);
    });
  });
});
