/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import { validateSkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import { createMockEndpointAppContext } from '../../../endpoint/mocks';
import { COMPARE_POLICIES_TOOL_ID } from './tools/compare_policies';
import { GET_POLICY_TOOL_ID } from './tools/get_policy';
import { GET_POLICY_ROLLOUT_STATUS_TOOL_ID } from './tools/get_policy_rollout_status';
import { GET_POLICY_FIELD_REFERENCE_TOOL_ID } from './tools/get_policy_field_reference';
import { ASSESS_POLICY_CHANGE_TOOL_ID } from './tools/assess_policy_change';
import { LIST_POLICIES_TOOL_ID } from './tools/list_policies';
import {
  ELASTIC_DEFEND_POLICY_MANAGEMENT_SKILL_ID,
  createElasticDefendPolicyManagementSkill,
} from './skill';
jest.mock(
  './tools/get_policy_field_reference',
  () => ({
    GET_POLICY_FIELD_REFERENCE_TOOL_ID: 'security.policy_management.get_policy_field_reference',
    createGetPolicyFieldReferenceTool: jest.fn((deps: unknown) => ({
      id: 'security.policy_management.get_policy_field_reference',
      ...((deps ?? {}) as object),
    })),
  }),
  { virtual: true }
);

jest.mock(
  './tools/list_policies',
  () => ({
    LIST_POLICIES_TOOL_ID: 'security.policy_management.list_policies',
    createListPoliciesTool: jest.fn((deps: unknown) => ({
      id: 'security.policy_management.list_policies',
      ...((deps ?? {}) as object),
    })),
  }),
  { virtual: true }
);

jest.mock(
  './tools/get_policy',
  () => ({
    GET_POLICY_TOOL_ID: 'security.policy_management.get_policy',
    createGetPolicyTool: jest.fn((deps: unknown) => ({
      id: 'security.policy_management.get_policy',
      ...((deps ?? {}) as object),
    })),
  }),
  { virtual: true }
);

jest.mock(
  './tools/compare_policies',
  () => ({
    COMPARE_POLICIES_TOOL_ID: 'security.policy_management.compare_policies',
    createComparePoliciesTool: jest.fn((deps: unknown) => ({
      id: 'security.policy_management.compare_policies',
      ...((deps ?? {}) as object),
    })),
  }),
  { virtual: true }
);

jest.mock(
  './tools/get_policy_rollout_status',
  () => ({
    GET_POLICY_ROLLOUT_STATUS_TOOL_ID: 'security.policy_management.get_policy_rollout_status',
    createGetPolicyRolloutStatusTool: jest.fn((deps: unknown) => ({
      id: 'security.policy_management.get_policy_rollout_status',
      ...((deps ?? {}) as object),
    })),
  }),
  { virtual: true }
);

jest.mock(
  './tools/assess_policy_change',
  () => ({
    ASSESS_POLICY_CHANGE_TOOL_ID: 'security.policy_management.assess_policy_change',
    createAssessPolicyChangeTool: jest.fn((deps: unknown) => ({
      id: 'security.policy_management.assess_policy_change',
      ...((deps ?? {}) as object),
    })),
  }),
  { virtual: true }
);

const INLINE_TOOL_IDS = [
  GET_POLICY_FIELD_REFERENCE_TOOL_ID,
  LIST_POLICIES_TOOL_ID,
  GET_POLICY_TOOL_ID,
  COMPARE_POLICIES_TOOL_ID,
  GET_POLICY_ROLLOUT_STATUS_TOOL_ID,
  ASSESS_POLICY_CHANGE_TOOL_ID,
] as const;

const createSkill = () => {
  const endpointAppContextService = createMockEndpointAppContext().service;
  const getStartServices = jest.fn();
  return {
    endpointAppContextService,
    getStartServices,
    skill: createElasticDefendPolicyManagementSkill({
      endpointAppContextService,
      getStartServices,
    }),
  };
};

describe('createElasticDefendPolicyManagementSkill', () => {
  it('uses an allow-listed built-in skill id', () => {
    expect(isAllowedBuiltinSkill(ELASTIC_DEFEND_POLICY_MANAGEMENT_SKILL_ID)).toBe(true);
  });

  it('uses the planned identifiers', () => {
    const { skill } = createSkill();
    expect(skill.id).toBe('elastic-defend-policy-management');
  });

  it('exposes only the integration knowledge registry tool', () => {
    const { skill } = createSkill();
    const registryTools = skill.getRegistryTools?.() ?? [];
    expect(registryTools).toEqual([platformCoreTools.integrationKnowledge]);
  });

  it('defines exactly six inline tools', async () => {
    const { skill } = createSkill();
    const inlineTools = await skill.getInlineTools?.();

    expect(inlineTools).toHaveLength(INLINE_TOOL_IDS.length);
    expect(inlineTools?.map((tool) => tool.id)).toEqual(
      expect.arrayContaining([...INLINE_TOOL_IDS])
    );
  });

  it('uses a decision-framed description under the selector length limit', () => {
    const { skill } = createSkill();
    const { description, content } = skill;
    expect(description).toContain('Elastic Defend integration policy decisions and inspection');
    expect(description).toContain('malware, ransomware, memory threat, and behavior protection');
    expect(content).toContain('broken-host or configuration');
    expect(content).toMatch(/separate troubleshooting\s+question/);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it('reports rollout status as a closed counts-only result without host or causal inference', () => {
    const { skill } = createSkill();
    const flatten = (text: string) => text.replace(/\s+/g, ' ');
    const rolloutStatusRule = flatten(
      skill.content.slice(
        skill.content.indexOf('### Report rollout status as a closed counts-only result'),
        skill.content.indexOf('## Workflows')
      )
    );

    expect(rolloutStatusRule).toContain('response_coverage_incomplete');
    expect(rolloutStatusRule).toContain(
      'When `response_coverage_incomplete` is true, do not present a zero needs-attention value as complete coverage; zero needs-attention applies only to the assignment-matched agents and available response evidence.'
    );
    expect(rolloutStatusRule).toContain('`revision_coverage`');
    expect(rolloutStatusRule).toContain('`current_revision_responses`');
    expect(rolloutStatusRule).toContain(
      'latest policy responses only for the bounded assignment-matched agents'
    );
    expect(rolloutStatusRule).toContain('not every response document at that revision');
  });

  it('discloses partiality whenever a returned truncation marker is true', () => {
    const { skill } = createSkill();
    const flatten = (text: string) => text.replace(/\s+/g, ' ');
    const truncationRule = flatten(
      skill.content.slice(
        skill.content.indexOf('### Disclose partiality when a result is truncated'),
        skill.content.indexOf('### Hand off advanced writes to the UI')
      )
    );

    expect(truncationRule).toContain('When `name_string_truncated` is true');
    expect(truncationRule).toContain(
      'later get, compare, rollout status, or assess `idOrName` calls must pass `policy.id`, not the presented `name`'
    );
    expect(truncationRule).toContain('the truncated name is not an exact stored name');
  });

  it('omits model-facing implementation vocabulary from rendered skill content', () => {
    const { skill } = createSkill();
    const { content } = skill;

    expect(content).not.toContain('Process 4');
    expect(content).not.toContain('Slot 7');
    expect(content).not.toContain('countEndpoints');
  });

  it('uses the grouped rollout-status field names and keeps operation names out of skill prose', () => {
    const { skill } = createSkill();
    const { content } = skill;
    const flattened = content.replace(/\s+/g, ' ');

    expect(flattened).toContain('needs_attention_hosts');
    expect(flattened).not.toContain('current_policy_response_needs_attention');
    expect(content).not.toContain('set_field');
    expect(content).not.toContain('set_protection_level');
  });

  it('validates successfully via validateSkillDefinition', async () => {
    const { skill } = createSkill();
    await expect(validateSkillDefinition(skill)).resolves.toBeDefined();
  });
});
