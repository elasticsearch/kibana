/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  CreateAgentlessPolicyRequestSchema,
  UpdateAgentlessPolicyRequestSchema,
} from './agentless_policy';

const validBody = {
  name: 'my-agentless-policy',
  namespace: 'default',
  package: {
    name: 'agentless_hello_world',
    version: '0.5.0',
  },
  inputs: {},
};

describe('agentless policy request schemas', () => {
  describe('cloud_connector', () => {
    // The GET response mapper emits `cloud_connector: null` when no connector is attached, so a
    // GET -> edit -> PUT/POST round-trip sends `null`. The request body must accept it.
    it.each([
      ['create', CreateAgentlessPolicyRequestSchema.body],
      ['update', UpdateAgentlessPolicyRequestSchema.body],
    ])('should accept a null cloud_connector on %s (GET round-trip)', (_name, bodySchema) => {
      expect(() => bodySchema.validate({ ...validBody, cloud_connector: null })).not.toThrow();
    });

    it.each([
      ['create', CreateAgentlessPolicyRequestSchema.body],
      ['update', UpdateAgentlessPolicyRequestSchema.body],
    ])('should accept an omitted cloud_connector on %s', (_name, bodySchema) => {
      expect(() => bodySchema.validate(validBody)).not.toThrow();
    });

    it.each([
      ['create', CreateAgentlessPolicyRequestSchema.body],
      ['update', UpdateAgentlessPolicyRequestSchema.body],
    ])('should accept a populated cloud_connector on %s', (_name, bodySchema) => {
      expect(() =>
        bodySchema.validate({
          ...validBody,
          cloud_connector: { enabled: true, target_csp: 'aws', cloud_connector_id: 'cc-1' },
        })
      ).not.toThrow();
    });
  });
});
