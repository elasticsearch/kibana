/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { set } from '@kbn/safer-lodash-set';

import type { AgentlessAgentPolicyConfig, GlobalDataTag } from '../../../common/types';
import { getSettings } from '../../services/form_settings';

import { AgentPolicyBaseSchema, FullAgentPolicyResponseSchema } from './agent_policy';

describe('AgentPolicyBaseSchema', () => {
  describe('global_data_tags validations', () => {
    it('should throw an error if provided with duplicate tag names', () => {
      const tags: GlobalDataTag[] = [
        {
          name: 'testName',
          value: 'testValue',
        },
        {
          name: 'testName',
          value: 'testValue2',
        },
        {
          name: 'anotherName',
          value: 'value',
        },
        {
          name: 'anotherName',
          value: 'value2',
        },
      ];

      expect(() => {
        AgentPolicyBaseSchema.global_data_tags.validate(tags);
      }).toThrow(
        `Found duplicate tag names: ['testName', 'anotherName'], duplicate tag names are not allowed.`
      );
    });

    it('should throw an error if provided with tag names with spaces in it', () => {
      const tags: GlobalDataTag[] = [
        {
          name: ' testName',
          value: 'testValue',
        },
        {
          name: 'test Name',
          value: 'testValue2',
        },
      ];

      expect(() => {
        AgentPolicyBaseSchema.global_data_tags.validate(tags);
      }).toThrow(
        `Found tag names with spaces: [' testName', 'test Name'], tag names with spaces are not allowed.`
      );
    });

    it('should throw an error showing all validation errors', () => {
      const tags: GlobalDataTag[] = [
        {
          name: ' testName',
          value: 'testValue',
        },
        {
          name: 'testName ',
          value: 'testValue2',
        },
      ];

      expect(() => {
        AgentPolicyBaseSchema.global_data_tags.validate(tags);
      }).toThrow(
        `Found duplicate tag names: ['testName'], duplicate tag names are not allowed. Found tag names with spaces: [' testName', 'testName '], tag names with spaces are not allowed.`
      );
    });

    it('should not throw an error if provided with valid global data tags', () => {
      const tags: GlobalDataTag[] = [
        {
          name: 'testName',
          value: 'testValue',
        },
        {
          name: 'anotherName',
          value: 'anotherValue',
        },
      ];

      expect(() => {
        AgentPolicyBaseSchema.global_data_tags.validate(tags);
      }).not.toThrow();
    });

    it('should not throw an error if provided with empty agentless resources', () => {
      const agentless: AgentlessAgentPolicyConfig = {};

      expect(() => {
        AgentPolicyBaseSchema.agentless.validate(agentless);
      }).not.toThrow();
    });

    it('should not throw an error if provided with valid agentless resources', () => {
      const agentless: AgentlessAgentPolicyConfig = {
        resources: {
          requests: {
            memory: '1Gi',
            cpu: '1',
          },
        },
      };

      expect(() => {
        AgentPolicyBaseSchema.agentless.validate(agentless);
      }).not.toThrow();
    });

    it('should throw an error if provided with invalid agentless memory', () => {
      const agentless: AgentlessAgentPolicyConfig = {
        resources: {
          requests: {
            memory: '1',
          },
        },
      };

      expect(() => {
        AgentPolicyBaseSchema.agentless.validate(agentless);
      }).toThrow();
    });

    it('should throw an error if provided with invalid agentless CPU', () => {
      const agentless: AgentlessAgentPolicyConfig = {
        resources: {
          requests: {
            cpu: '1CPU',
          },
        },
      };

      expect(() => {
        AgentPolicyBaseSchema.agentless.validate(agentless);
      }).toThrow();
    });
  });

  describe('overrides validations', () => {
    it('should throw an error if inputs key is provided', () => {
      expect(() => {
        AgentPolicyBaseSchema.overrides.validate({ 'inputs.foo': 'bar' });
      }).toThrow('inputs overrides is not allowed');
    });

    it('should throw an error if output_permissions key is provided', () => {
      expect(() => {
        AgentPolicyBaseSchema.overrides.validate({ output_permissions: { _fallback: {} } });
      }).toThrow('output_permissions overrides is not allowed');
    });

    it('should throw an error if nested output_permissions key is provided', () => {
      expect(() => {
        AgentPolicyBaseSchema.overrides.validate({ 'output_permissions.someOutput': {} });
      }).toThrow('output_permissions overrides is not allowed');
    });

    it('should not throw for valid overrides keys', () => {
      expect(() => {
        AgentPolicyBaseSchema.overrides.validate({ 'agent.monitoring.use_output': 'custom' });
      }).not.toThrow();
    });
  });
});

describe('FullAgentPolicySchema', () => {
  it('support all advanced settings', () => {
    expect(() => {
      const advancedPolicySettings = getSettings('AGENT_POLICY_ADVANCED_SETTINGS');

      const policyData = {
        id: 'test-id',
        outputs: {},
        inputs: [],
        agent: {
          monitoring: {
            enabled: true,
            metrics: true,
            logs: true,
            traces: true,
          },
          download: { sourceURI: 'http://test' },
          features: {},
        },
      };

      for (const settings of advancedPolicySettings) {
        if (settings.example_value) {
          set(policyData, settings.name, settings.example_value);
        } else {
          throw new Error(`No example value provided for ${settings.name}`);
        }
      }

      FullAgentPolicyResponseSchema.validate(policyData);
    }).not.toThrow();
  });
});
