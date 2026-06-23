/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRuleDataClient } from '@kbn/rule-registry-plugin/server';

import type { SecuritySolutionRequestHandlerContextMock } from '../../__mocks__/request_context';
import { requestContextMock } from '../../__mocks__';
import { getUnifiedAlertsIndex } from './get_unified_alerts_index';

describe('getUnifiedAlertsIndex', () => {
  let context: SecuritySolutionRequestHandlerContextMock;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ context } = requestContextMock.createTools());
  });

  it('includes the detection alerts index together with the attack indices', async () => {
    const ruleDataClient = {
      indexNameWithNamespace: jest.fn(() => '.alerts-security.alerts-default'),
    } as unknown as IRuleDataClient;

    const index = await getUnifiedAlertsIndex({
      context: requestContextMock.convertContext(context),
      ruleDataClient,
    });

    expect(index).toEqual([
      '.alerts-security.alerts-default',
      '.alerts-security.attack.discovery.alerts-default',
      '.adhoc.alerts-security.attack.discovery.alerts-default',
    ]);
  });

  it('omits the detection alerts index when the rule data client is not available', async () => {
    const index = await getUnifiedAlertsIndex({
      context: requestContextMock.convertContext(context),
      ruleDataClient: null,
    });

    expect(index).toEqual([
      '.alerts-security.attack.discovery.alerts-default',
      '.adhoc.alerts-security.attack.discovery.alerts-default',
    ]);
  });
});
