/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PrivateLocationAttributesCodec } from './private_locations';

const classic = {
  label: 'Loc',
  id: 'loc-1',
  agentPolicyId: 'ap-1',
  isServiceManaged: false,
};

describe('PrivateLocationAttributesCodec isAgentSharding', () => {
  it('decodes a classic location without the flag', () => {
    expect(PrivateLocationAttributesCodec.safeParse(classic).success).toBe(true);
  });

  it('decodes a scalable location with the flag', () => {
    const result = PrivateLocationAttributesCodec.safeParse({
      ...classic,
      isAgentSharding: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isAgentSharding).toBe(true);
    }
  });

  it('rejects a non-boolean flag', () => {
    expect(
      PrivateLocationAttributesCodec.safeParse({ ...classic, isAgentSharding: 'yes' }).success
    ).toBe(false);
  });
});
