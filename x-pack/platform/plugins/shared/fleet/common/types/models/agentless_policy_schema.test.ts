/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentlessPolicySchema, AgentlessPolicyResponseSchema } from './agentless_policy_schema';

const validMinimalPolicy = {
  id: 'policy-1',
  name: 'My Agentless Policy',
  package: {
    name: 'cloud_security_posture',
    title: 'Cloud Security Posture',
    version: '1.0.0',
  },
  inputs: {},
  created_at: '2026-06-04T10:00:00.000Z',
  created_by: 'elastic',
  updated_at: '2026-06-04T10:00:00.000Z',
  updated_by: 'elastic',
};

const validFullPolicy = {
  ...validMinimalPolicy,
  description: 'My agentless policy description',
  namespace: 'production',
  package: {
    name: 'cloud_security_posture',
    title: 'Cloud Security Posture',
    version: '1.12.0',
  },
  inputs: {
    'cspm-cloudbeat/cis_aws': {
      enabled: true,
      vars: { access_key_id: 'AKIA...' },
      streams: {
        'cloud_security_posture.findings': {
          enabled: true,
          vars: { period: '24h' },
        },
      },
    },
  },
  vars: { some_var: 'some_value' },
  var_group_selections: { auth: 'oauth2' },
  additional_datastreams_permissions: ['logs-test-default', 'metrics-test-default'],
  global_data_tags: [
    { name: 'team', value: 'cloud-security' },
    { name: 'priority', value: 1 },
  ],
  cloud_connector: {
    enabled: true,
    cloud_connector_id: 'connector-abc',
  },
};

describe('AgentlessPolicySchema', () => {
  describe('valid policies', () => {
    it('should accept a minimal policy with only required fields', () => {
      expect(() => AgentlessPolicySchema.validate(validMinimalPolicy)).not.toThrow();
    });

    it('should accept a fully populated policy', () => {
      expect(() => AgentlessPolicySchema.validate(validFullPolicy)).not.toThrow();
    });
  });

  describe('required fields', () => {
    it('should reject a policy without name', () => {
      const { name: _, ...policyWithoutName } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policyWithoutName)).toThrow();
    });

    it('should reject a policy without id', () => {
      const { id: _, ...policyWithoutId } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policyWithoutId)).toThrow();
    });

    it('should reject a policy without created_at', () => {
      const { created_at: _, ...policy } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policy)).toThrow();
    });

    it('should reject a policy without updated_by', () => {
      const { updated_by: _, ...policy } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policy)).toThrow();
    });

    it('should reject a policy without package', () => {
      const { package: _, ...policy } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policy)).toThrow();
    });

    it('should reject a policy without inputs', () => {
      const { inputs: _, ...policy } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policy)).toThrow();
    });
  });

  describe('description', () => {
    it('should accept a policy with a description', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          description: 'Some description',
        })
      ).not.toThrow();
    });

    it('should accept a policy without a description', () => {
      const { description: _, ...policyWithoutDescription } = validFullPolicy;
      expect(() => AgentlessPolicySchema.validate(policyWithoutDescription)).not.toThrow();
    });
  });

  describe('additional_datastreams_permissions', () => {
    it('should accept a policy with additional_datastreams_permissions', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          additional_datastreams_permissions: ['logs-test-default'],
        })
      ).not.toThrow();
    });

    it('should accept a policy without additional_datastreams_permissions', () => {
      const { additional_datastreams_permissions: _, ...policy } = validFullPolicy;
      expect(() => AgentlessPolicySchema.validate(policy)).not.toThrow();
    });
  });

  describe('cloud_connector', () => {
    it('should accept null cloud_connector', () => {
      expect(() =>
        AgentlessPolicySchema.validate({ ...validMinimalPolicy, cloud_connector: null })
      ).not.toThrow();
    });

    it('should accept a valid cloud_connector object', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          cloud_connector: { enabled: true, cloud_connector_id: 'cc-1' },
        })
      ).not.toThrow();
    });

    it('should reject cloud_connector without cloud_connector_id', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          cloud_connector: { enabled: true },
        })
      ).toThrow();
    });

    it('should reject cloud_connector without enabled', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          cloud_connector: { cloud_connector_id: 'cc-1' },
        })
      ).toThrow();
    });
  });

  describe('package', () => {
    it('should accept a valid package', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          package: { name: 'nginx', title: 'Nginx', version: '2.0.0' },
        })
      ).not.toThrow();
    });

    it('should reject a package missing name', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          package: { title: 'Nginx', version: '2.0.0' },
        })
      ).toThrow();
    });

    it('should reject a package missing title', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          package: { name: 'nginx', version: '2.0.0' },
        })
      ).toThrow();
    });

    it('should reject a package missing version', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          package: { name: 'nginx', title: 'Nginx' },
        })
      ).toThrow();
    });
  });

  describe('global_data_tags', () => {
    it('should accept valid tags with string values', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          global_data_tags: [{ name: 'env', value: 'prod' }],
        })
      ).not.toThrow();
    });

    it('should accept valid tags with numeric values', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          global_data_tags: [{ name: 'priority', value: 42 }],
        })
      ).not.toThrow();
    });

    it('should reject tags without a name', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          global_data_tags: [{ value: 'prod' }],
        })
      ).toThrow();
    });

    it('should reject tags without a value', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          global_data_tags: [{ name: 'env' }],
        })
      ).toThrow();
    });
  });

  describe('vars', () => {
    it('should validate a string "true" as a string and not coerce to boolean', () => {
      const result = AgentlessPolicySchema.validate({
        ...validMinimalPolicy,
        vars: { myVar: 'true' },
      });
      expect(result.vars?.myVar).toBe('true');
      expect(typeof result.vars?.myVar).toBe('string');
    });

    it('should validate an actual boolean value correctly', () => {
      const result = AgentlessPolicySchema.validate({
        ...validMinimalPolicy,
        vars: { myVar: true },
      });
      expect(result.vars?.myVar).toBe(true);
      expect(typeof result.vars?.myVar).toBe('boolean');
    });

    it('should accept null var values', () => {
      const result = AgentlessPolicySchema.validate({
        ...validMinimalPolicy,
        vars: { myVar: null },
      });
      expect(result.vars?.myVar).toBeNull();
    });
  });

  describe('var_group_selections', () => {
    it('should accept a policy with var_group_selections', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          var_group_selections: { auth: 'oauth2' },
        })
      ).not.toThrow();
    });

    it('should accept a policy without var_group_selections', () => {
      const { var_group_selections: _, ...policy } = validFullPolicy;
      expect(() => AgentlessPolicySchema.validate(policy)).not.toThrow();
    });

    it('should reject non-string var_group_selections values', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          var_group_selections: { auth: 123 },
        })
      ).toThrow();
    });
  });

  describe('inputs', () => {
    it('should accept valid simplified inputs', () => {
      expect(() =>
        AgentlessPolicySchema.validate({
          ...validMinimalPolicy,
          inputs: {
            'my-input': {
              enabled: true,
              vars: { host: 'localhost' },
            },
          },
        })
      ).not.toThrow();
    });

    it('should reject a policy without inputs', () => {
      const { inputs: _, ...policyWithoutInputs } = validMinimalPolicy;
      expect(() => AgentlessPolicySchema.validate(policyWithoutInputs)).toThrow();
    });
  });
});

describe('AgentlessPolicyResponseSchema', () => {
  it('should accept a valid response wrapper', () => {
    expect(() => AgentlessPolicyResponseSchema.validate({ item: validFullPolicy })).not.toThrow();
  });

  it('should reject a response without item', () => {
    expect(() => AgentlessPolicyResponseSchema.validate({})).toThrow();
  });

  it('should reject a response with an invalid item', () => {
    expect(() =>
      AgentlessPolicyResponseSchema.validate({ item: { name: 'missing-id' } })
    ).toThrow();
  });
});
