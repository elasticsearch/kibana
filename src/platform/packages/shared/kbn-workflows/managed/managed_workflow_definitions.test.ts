/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parse } from 'yaml';
import { z } from '@kbn/zod/v4';
import { managedWorkflowDefinitions } from '.';
import type { ManagedWorkflowTemplateValuesById, TemplatedManagedWorkflowId } from '.';
import {
  EXAMPLE_MANAGED_WORKFLOW_ID,
  SECURITY_ALERT_VALIDATION_WORKFLOW,
  SECURITY_ALERT_VALIDATION_WORKFLOW_ID,
} from './definitions';
import type { ManagedWorkflowDefinition, ManagedWorkflowTemplateValues } from './types';
import { WorkflowSchemaBase } from '../spec/schema';

const ManagedWorkflowSchema = WorkflowSchemaBase.extend({
  triggers: z.array(z.object({ type: z.string().min(1) }).passthrough()).min(1),
});

type RegistryManagedWorkflowDefinition = (typeof managedWorkflowDefinitions)[number];
type TemplateManagedWorkflowDefinition<TDefinition> = TDefinition extends {
  yamlTemplate: (values: infer _TValues) => string;
}
  ? TDefinition
  : never;
type RegistryTemplateManagedWorkflowDefinition =
  TemplateManagedWorkflowDefinition<RegistryManagedWorkflowDefinition>;
type YamlTemplateManagedWorkflowDefinition = ManagedWorkflowDefinition & {
  yamlTemplate: (values: ManagedWorkflowTemplateValues) => string;
};

const templateRepresentativeValuesById: ManagedWorkflowTemplateValuesById = {
  [EXAMPLE_MANAGED_WORKFLOW_ID]: {
    recipient: 'World',
  },
  [SECURITY_ALERT_VALIDATION_WORKFLOW_ID]: {
    workflowEnabled: true,
    autoCloseEnabled: true,
    autoCloseConfidenceScoreMinThreshold: 0.85,
    autoCloseConfidenceScoreMaxThreshold: 1,
    connectorId: '',
    createConversation: true,
  },
};

const templateValuesLookup = templateRepresentativeValuesById as Record<
  string,
  ManagedWorkflowTemplateValues | undefined
>;

const managedDefinitionsById: Array<[string, RegistryManagedWorkflowDefinition]> =
  managedWorkflowDefinitions.map((definition) => [definition.id, definition]);
const managedTemplateDefinitionsById: Array<[string, RegistryTemplateManagedWorkflowDefinition]> =
  managedDefinitionsById.filter(
    (definitionEntry): definitionEntry is [string, RegistryTemplateManagedWorkflowDefinition] =>
      hasYamlTemplate(definitionEntry[1])
  );

function hasYamlTemplate(
  definition: ManagedWorkflowDefinition
): definition is YamlTemplateManagedWorkflowDefinition {
  return typeof definition.yamlTemplate === 'function';
}

function hasYaml(
  definition: ManagedWorkflowDefinition
): definition is ManagedWorkflowDefinition & { yaml: string } {
  return typeof definition.yaml === 'string';
}

function renderWorkflowYaml(definition: ManagedWorkflowDefinition): string {
  const { id } = definition;

  if (hasYaml(definition)) {
    return definition.yaml;
  }

  if (!hasYamlTemplate(definition)) {
    throw new Error(`Managed workflow '${id}' must define either yaml or yamlTemplate`);
  }

  const representativeValues = templateValuesLookup[definition.id];
  if (!representativeValues) {
    throw new Error(
      `Missing representative template values for managed workflow '${definition.id}'. Add an entry to templateRepresentativeValuesById.`
    );
  }

  return definition.yamlTemplate(representativeValues);
}

function assertWorkflowYamlIsValid(workflowId: string, yamlContent: string): void {
  let parsedYaml: unknown;
  try {
    parsedYaml = parse(yamlContent);
  } catch (error) {
    throw new Error(
      `Managed workflow '${workflowId}' has invalid YAML: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const validationResult = ManagedWorkflowSchema.safeParse(parsedYaml);
  if (!validationResult.success) {
    throw new Error(
      `Managed workflow '${workflowId}' failed workflow schema validation: ${validationResult.error.message}`
    );
  }
}

const findStepByName = (steps: unknown[], name: string): Record<string, unknown> | undefined => {
  for (const step of steps) {
    const s = step as Record<string, unknown>;
    if (s.name === name) return s;
    for (const key of ['steps', 'else']) {
      const nested = s[key];
      if (Array.isArray(nested)) {
        const found = findStepByName(nested, name);
        if (found) return found;
      }
    }
  }
  return undefined;
};

describe('managedWorkflowDefinitions', () => {
  it('contains unique workflow ids', () => {
    const ids = managedWorkflowDefinitions.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains the Security alert validation workflow', () => {
    const ids = managedWorkflowDefinitions.map(({ id }) => id);
    expect(ids).toContain(SECURITY_ALERT_VALIDATION_WORKFLOW_ID);
  });

  it('renders the Security alert validation workflow with template values', () => {
    const renderedYaml = SECURITY_ALERT_VALIDATION_WORKFLOW.yamlTemplate({
      workflowEnabled: true,
      autoCloseEnabled: false,
      autoCloseConfidenceScoreMinThreshold: 0.7,
      autoCloseConfidenceScoreMaxThreshold: 0.9,
      connectorId: '',
      createConversation: false,
    });

    const workflow = parse(renderedYaml) as { consts: Record<string, unknown> };
    expect(workflow.consts.auto_close_enabled).toBe(false);
    expect(workflow.consts.auto_close_confidence_score_min_threshold).toBe(0.7);
    expect(workflow.consts.auto_close_confidence_score_max_threshold).toBe(0.9);
  });

  it('confidence score schema uses the same 0-1 scale as the auto-close thresholds', () => {
    // Regression: the LLM schema maximum must stay on the same scale as the threshold
    // consts (0-1) so the auto-close condition comparison is valid. If maximum drifts
    // back to 100 while thresholds stay at e.g. 0.85, the condition `score <= 1.0`
    // will never be true for any meaningful score.
    const renderedYaml = SECURITY_ALERT_VALIDATION_WORKFLOW.yamlTemplate({
      workflowEnabled: true,
      autoCloseEnabled: true,
      autoCloseConfidenceScoreMinThreshold: 0.85,
      autoCloseConfidenceScoreMaxThreshold: 1.0,
      connectorId: '',
      createConversation: true,
    });

    const workflow = parse(renderedYaml) as {
      consts: Record<string, unknown>;
      steps: Array<{ steps?: unknown[] }>;
    };

    const agentStep = findStepByName(workflow.steps as unknown[], 'onechat_runAgent_step') as {
      with: { schema: { properties: { confidence_score: { minimum: number; maximum: number } } } };
    };

    expect(agentStep).toBeDefined();
    expect(agentStep.with.schema.properties.confidence_score.minimum).toBe(0);
    // maximum must be 1 (not 100) so the threshold comparison `score <= 1.0` is valid
    expect(agentStep.with.schema.properties.confidence_score.maximum).toBe(1);
  });

  it('auto-close condition references thresholds via consts Liquid templates', () => {
    // Regression: the condition must reference the threshold consts so that the
    // renderer-injected values are used at runtime. A hardcoded literal would
    // ignore any configured threshold.
    const renderedYaml = SECURITY_ALERT_VALIDATION_WORKFLOW.yamlTemplate({
      workflowEnabled: true,
      autoCloseEnabled: true,
      autoCloseConfidenceScoreMinThreshold: 0.85,
      autoCloseConfidenceScoreMaxThreshold: 1.0,
      connectorId: '',
      createConversation: true,
    });

    const workflow = parse(renderedYaml) as { steps: unknown[] };

    const autoCloseStep = findStepByName(workflow.steps, 'check_auto_close_conditions') as {
      condition: string;
    };

    expect(autoCloseStep).toBeDefined();
    // Condition must gate on classification=false_positive
    expect(autoCloseStep.condition).toContain('false_positive');
    // Condition must use >= and <= comparisons for the score
    expect(autoCloseStep.condition).toContain('confidence_score >=');
    expect(autoCloseStep.condition).toContain('confidence_score <=');
    // Comparisons must reference consts (not hardcoded literals) so the renderer values are used
    expect(autoCloseStep.condition).toContain('auto_close_confidence_score_min_threshold');
    expect(autoCloseStep.condition).toContain('auto_close_confidence_score_max_threshold');
  });

  it.each(managedDefinitionsById)('%s uses the reserved system- id prefix', (id) => {
    expect(id.startsWith('system-')).toBe(true);
  });

  it.each(managedDefinitionsById)('%s declares an explicit pluginId', (_id, definition) => {
    expect(typeof definition.pluginId).toBe('string');
    expect(definition.pluginId.trim()).not.toHaveLength(0);
  });

  it.each(managedDefinitionsById)(
    '%s declares a version that is a positive integer',
    (_id, definition) => {
      expect(typeof definition.version).toBe('number');
      expect(Number.isInteger(definition.version)).toBe(true);
      expect(definition.version).toBeGreaterThanOrEqual(1);
    }
  );

  it.each(managedDefinitionsById)('%s declares whether it is billable', (_id, definition) => {
    expect(typeof definition.billable).toBe('boolean');
  });

  it.each(managedDefinitionsById)(
    '%s defines exactly one source field: yaml xor yamlTemplate',
    (_id, definition) => {
      const hasYamlField = hasYaml(definition);
      const hasYamlTemplateField = hasYamlTemplate(definition);

      expect(hasYamlField || hasYamlTemplateField).toBe(true);
      expect(hasYamlField && hasYamlTemplateField).toBe(false);
    }
  );

  it('defines representative template values for every yamlTemplate workflow', () => {
    const templatedIds = managedTemplateDefinitionsById.map(([id]) => id).sort();
    const representedIds = Object.keys(templateRepresentativeValuesById).sort();

    expect(representedIds).toEqual(templatedIds);
  });

  it.each(managedDefinitionsById)(
    '%s parses and validates as a workflow definition',
    (id, definition) => {
      const renderedYaml = renderWorkflowYaml(definition);
      assertWorkflowYamlIsValid(id, renderedYaml);
    }
  );

  it.each(managedTemplateDefinitionsById)(
    '%s yamlTemplate renders cleanly with representative values',
    (id, definition) => {
      const representativeValues =
        templateRepresentativeValuesById[id as TemplatedManagedWorkflowId];
      const renderedYaml = (definition as YamlTemplateManagedWorkflowDefinition).yamlTemplate(
        representativeValues
      );

      expect(typeof renderedYaml).toBe('string');
      expect(renderedYaml.trim()).not.toHaveLength(0);
      expect(renderedYaml).not.toContain('undefined');
      assertWorkflowYamlIsValid(id, renderedYaml);
    }
  );
});
