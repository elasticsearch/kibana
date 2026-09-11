/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { LineCounter, parseDocument } from 'yaml';
import type { WorkflowValidationRuleId, WorkflowYaml } from '@kbn/workflows';
import type { PublicTriggerDefinition } from '@kbn/workflows-extensions/public';
import { z } from '@kbn/zod/v4';
import { getYamlMarkerRuleId } from './get_yaml_marker_rule_id';
import { validateGraphBuild } from './validate_graph_build';
import { validateLiquidTemplate } from './validate_liquid_template';
import { validateStepNameUniqueness } from './validate_step_name_uniqueness';
import { validateTriggerConditions } from './validate_trigger_conditions';
import { validateWorkflowYaml } from '../../../../common/lib/validate_workflow_yaml';
import { getWorkflowZodSchema } from '../../../../common/schema';
import { performComputation } from '../../../entities/workflows/store/workflow_detail/utils/computation';
import { triggerSchemas } from '../../../trigger_schemas';
import type { YamlValidationResult } from '../model/types';

const INVALID_YAML = 'name: [unclosed';
const SCHEMA_VIOLATION_YAML = ['enabled: true', 'steps: []'].join('\n');
const INVALID_LIQUID_YAML = [
  'name: invalid-liquid',
  'enabled: true',
  'triggers:',
  '  - type: manual',
  'steps:',
  '  - name: console_step',
  '    type: console',
  '    with:',
  '      message: "{{ unclosed"',
].join('\n');
const DUPLICATE_STEP_YAML = [
  'name: duplicate-steps',
  'enabled: true',
  'triggers:',
  '  - type: manual',
  'steps:',
  '  - name: duplicate_step',
  '    type: console',
  '    with:',
  '      message: first',
  '  - name: duplicate_step',
  '    type: console',
  '    with:',
  '      message: second',
].join('\n');
const GRAPH_BUILD_ERROR_YAML = [
  "version: '1'",
  'name: nested-flow-control',
  'enabled: true',
  'triggers:',
  '  - type: manual',
  'steps:',
  '  - name: outer',
  '    type: parallel',
  '    foreach: "{{ [1,2] }}"',
  '    steps:',
  '      - name: inner',
  '        type: parallel',
  '        foreach: "{{ [3,4] }}"',
  '        steps:',
  '          - name: leaf',
  '            type: console',
  '            with:',
  '              message: leaf',
].join('\n');
const CUSTOM_TRIGGER_ID = 'example.custom_trigger';
const INVALID_TRIGGER_YAML = [
  "version: '1'",
  'name: invalid-trigger-condition',
  'enabled: true',
  'triggers:',
  `  - type: ${CUSTOM_TRIGGER_ID}`,
  '    on:',
  '      condition: "event.unknown_field: value"',
  'steps:',
  '  - name: console_step',
  '    type: console',
  '    with:',
  '      message: test',
].join('\n');

const workflowSchema = getWorkflowZodSchema({}, []);
const workflowSchemaWithCustomTrigger = getWorkflowZodSchema({}, [CUSTOM_TRIGGER_ID]);
const customTriggerDefinition: PublicTriggerDefinition = {
  id: CUSTOM_TRIGGER_ID,
  stability: 'tech_preview',
  title: 'Example custom trigger',
  description: 'Example custom trigger for validation parity tests',
  eventSchema: z.object({ severity: z.string() }),
};

const getClientRuleIds = (results: YamlValidationResult[]): WorkflowValidationRuleId[] =>
  results.flatMap(({ ruleId }) => (ruleId ? [ruleId] : []));

const getServerRuleIds = (
  yaml: string,
  options?: Parameters<typeof validateWorkflowYaml>[2]
): WorkflowValidationRuleId[] =>
  validateWorkflowYaml(
    yaml,
    options?.triggerDefinitions ? workflowSchemaWithCustomTrigger : workflowSchema,
    options
  ).diagnostics.map(({ ruleId }) => ruleId);

interface RuleParityCase {
  name: string;
  expectedRuleId: WorkflowValidationRuleId;
  getClientRuleIds: () => WorkflowValidationRuleId[];
  getServerRuleIds: () => WorkflowValidationRuleId[];
}

const ruleParityCases: RuleParityCase[] = [
  {
    name: 'YAML syntax errors',
    expectedRuleId: 'yamlSyntaxError',
    getClientRuleIds: () => [getYamlMarkerRuleId('YAML')],
    getServerRuleIds: () => getServerRuleIds(INVALID_YAML),
  },
  {
    name: 'schema violations',
    expectedRuleId: 'schemaViolation',
    getClientRuleIds: () => [getYamlMarkerRuleId('yaml-schema:workflow')],
    getServerRuleIds: () => getServerRuleIds(SCHEMA_VIOLATION_YAML),
  },
  {
    name: 'Liquid syntax errors',
    expectedRuleId: 'liquidSyntaxError',
    getClientRuleIds: () => {
      const lineCounter = new LineCounter();
      const yamlDocument = parseDocument(INVALID_LIQUID_YAML, { lineCounter });
      return getClientRuleIds(
        validateLiquidTemplate(INVALID_LIQUID_YAML, yamlDocument, lineCounter)
      );
    },
    getServerRuleIds: () => getServerRuleIds(INVALID_LIQUID_YAML),
  },
  {
    name: 'duplicate step names',
    expectedRuleId: 'duplicateStepName',
    getClientRuleIds: () => {
      const { yamlDocument, yamlLineCounter } = performComputation(DUPLICATE_STEP_YAML);
      if (!yamlDocument || !yamlLineCounter) {
        throw new Error('Expected duplicate-step fixture to parse');
      }
      return getClientRuleIds(validateStepNameUniqueness(yamlDocument, yamlLineCounter));
    },
    getServerRuleIds: () => getServerRuleIds(DUPLICATE_STEP_YAML),
  },
  {
    name: 'graph build errors',
    expectedRuleId: 'graphBuildError',
    getClientRuleIds: () => {
      const { graphBuildError, workflowLookup, yamlLineCounter } =
        performComputation(GRAPH_BUILD_ERROR_YAML);
      return getClientRuleIds(validateGraphBuild(graphBuildError, workflowLookup, yamlLineCounter));
    },
    getServerRuleIds: () => getServerRuleIds(GRAPH_BUILD_ERROR_YAML),
  },
  {
    name: 'invalid trigger conditions',
    expectedRuleId: 'invalidTriggerCondition',
    getClientRuleIds: () => {
      const getTriggerDefinitionSpy = jest
        .spyOn(triggerSchemas, 'getTriggerDefinition')
        .mockReturnValue(customTriggerDefinition);
      try {
        return getClientRuleIds(
          validateTriggerConditions(
            parseDocument(INVALID_TRIGGER_YAML).toJS() as unknown as WorkflowYaml,
            parseDocument(INVALID_TRIGGER_YAML)
          )
        );
      } finally {
        getTriggerDefinitionSpy.mockRestore();
      }
    },
    getServerRuleIds: () =>
      getServerRuleIds(INVALID_TRIGGER_YAML, { triggerDefinitions: [customTriggerDefinition] }),
  },
];

describe('workflow validation rule parity', () => {
  it.each(ruleParityCases)(
    'uses $expectedRuleId for $name in both client and server validation',
    ({ expectedRuleId, getClientRuleIds: getClientIds, getServerRuleIds: getServerIds }) => {
      const clientRuleId = getClientIds().find((ruleId) => ruleId === expectedRuleId);
      const serverRuleId = getServerIds().find((ruleId) => ruleId === expectedRuleId);

      expect(clientRuleId).toBe(expectedRuleId);
      expect(serverRuleId).toBe(clientRuleId);
    }
  );
});
