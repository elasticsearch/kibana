/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolve } from 'path';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { stringify } from 'yaml';
import { checkTerraformImpact } from './check_terraform_impact';
import type { BreakingChange } from '../diff/breaking_rules';

describe('check_terraform_impact', () => {
  const testDir = resolve(__dirname, '__test_fixtures__');
  const testConfigPath = resolve(testDir, 'test_terraform_apis.yaml');

  const testConfig = {
    terraform_provider_apis: [
      {
        path: '/api/spaces/space',
        methods: ['GET', 'POST'],
        resource: 'elasticstack_kibana_space',
        owners: ['@elastic/kibana-security'],
      },
      {
        path: '/api/spaces/space/{id}',
        methods: ['GET', 'PUT', 'DELETE'],
        resource: 'elasticstack_kibana_space',
        owners: ['@elastic/kibana-security'],
      },
      {
        path: '/api/fleet/agent_policies',
        methods: ['GET', 'POST'],
        resource: 'elasticstack_fleet_agent_policy',
        owners: ['@elastic/fleet'],
      },
    ],
  };

  beforeAll(() => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(testConfigPath, stringify(testConfig));
  });

  afterAll(() => {
    unlinkSync(testConfigPath);
    rmdirSync(testDir);
  });

  it('returns no impact when no terraform APIs configured', () => {
    const breakingChanges: BreakingChange[] = [
      { type: 'path_removed', path: '/api/spaces/space', reason: 'Endpoint removed' },
    ];

    const result = checkTerraformImpact(breakingChanges, '/nonexistent/path.yaml');
    expect(result.hasImpact).toBe(false);
    expect(result.impactedChanges).toHaveLength(0);
  });

  it('detects impact on terraform APIs', () => {
    const breakingChanges: BreakingChange[] = [
      { type: 'path_removed', path: '/api/spaces/space', reason: 'Endpoint removed' },
    ];

    const result = checkTerraformImpact(breakingChanges, testConfigPath);
    expect(result.hasImpact).toBe(true);
    expect(result.impactedChanges).toHaveLength(1);
    expect(result.impactedChanges[0].terraformResource).toBe('elasticstack_kibana_space');
    expect(result.impactedChanges[0].owners).toEqual(['@elastic/kibana-security']);
  });

  it('matches breaking changes by method', () => {
    const breakingChanges: BreakingChange[] = [
      {
        type: 'method_removed',
        path: '/api/spaces/space/{id}',
        method: 'DELETE',
        reason: 'HTTP method removed',
      },
    ];

    const result = checkTerraformImpact(breakingChanges, testConfigPath);
    expect(result.hasImpact).toBe(true);
    expect(result.impactedChanges[0].terraformResource).toBe('elasticstack_kibana_space');
    expect(result.impactedChanges[0].owners).toEqual(['@elastic/kibana-security']);
  });

  it('does not match non-terraform APIs', () => {
    const breakingChanges: BreakingChange[] = [
      { type: 'path_removed', path: '/api/alerting/rules', reason: 'Endpoint removed' },
    ];

    const result = checkTerraformImpact(breakingChanges, testConfigPath);
    expect(result.hasImpact).toBe(false);
    expect(result.impactedChanges).toHaveLength(0);
  });

  it('handles multiple breaking changes with mixed impact', () => {
    const breakingChanges: BreakingChange[] = [
      { type: 'path_removed', path: '/api/spaces/space', reason: 'Endpoint removed' },
      { type: 'path_removed', path: '/api/alerting/rules', reason: 'Endpoint removed' },
      {
        type: 'method_removed',
        path: '/api/fleet/agent_policies',
        method: 'POST',
        reason: 'HTTP method removed',
      },
    ];

    const result = checkTerraformImpact(breakingChanges, testConfigPath);
    expect(result.hasImpact).toBe(true);
    expect(result.impactedChanges).toHaveLength(2);

    const resources = result.impactedChanges.map((i) => i.terraformResource);
    expect(resources).toContain('elasticstack_kibana_space');
    expect(resources).toContain('elasticstack_fleet_agent_policy');
  });
});
