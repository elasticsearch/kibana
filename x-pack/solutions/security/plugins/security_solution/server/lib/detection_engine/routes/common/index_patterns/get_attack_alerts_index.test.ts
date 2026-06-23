/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SecuritySolutionRequestHandlerContextMock } from '../../__mocks__/request_context';
import { requestContextMock } from '../../__mocks__';
import { getAttackAlertsIndex } from './get_attack_alerts_index';

describe('getAttackAlertsIndex', () => {
  let context: SecuritySolutionRequestHandlerContextMock;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ context } = requestContextMock.createTools());
  });

  it('returns the scheduled and adhoc attack indices for the active space', async () => {
    const index = await getAttackAlertsIndex({
      context: requestContextMock.convertContext(context),
    });

    expect(index).toEqual([
      '.alerts-security.attack.discovery.alerts-default',
      '.adhoc.alerts-security.attack.discovery.alerts-default',
    ]);
  });

  it('suffixes the attack indices with the active Kibana space', async () => {
    context.securitySolution.getSpaceId.mockReturnValue('custom-space');

    const index = await getAttackAlertsIndex({
      context: requestContextMock.convertContext(context),
    });

    expect(index).toEqual([
      '.alerts-security.attack.discovery.alerts-custom-space',
      '.adhoc.alerts-security.attack.discovery.alerts-custom-space',
    ]);
  });
});
