/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IDetectionRulesClient } from '../../../../detection_engine/rule_management/logic/detection_rules_client/detection_rules_client_interface';
import { SiemMigrationStatus } from '../../../../../../common/siem_migrations/constants';
import type { StoredRuleMigrationRule } from '../../types';
import { installCustomRules } from './installation';

const translatedRule: StoredRuleMigrationRule = {
  id: 'migration-rule-id',
  '@timestamp': '2026-05-20T00:00:00.000Z',
  migration_id: 'migration-id',
  created_by: 'user-id',
  status: SiemMigrationStatus.COMPLETED,
  original_rule: {
    id: 'sentinel-rule-id',
    vendor: 'microsoft-sentinel',
    title: 'NRT Security Event log cleared',
    description: 'Detects Windows Security Event ID 1102.',
    query: 'SecurityEvent | where EventID == 1102',
    query_language: 'kql',
    annotations: {
      from: 'now-60s',
      to: 'now',
      interval: '60s',
      timestamp_override: 'event.ingested',
      ignored_annotation: 'do not copy',
    },
  },
  elastic_rule: {
    title: 'NRT Security Event log cleared',
    description: 'Detects Windows Security Event ID 1102.',
    query: 'FROM logs-*',
    query_language: 'esql',
    severity: 'medium',
    risk_score: 47,
  },
};

describe('installCustomRules', () => {
  it('uses timing overrides from original rule annotations', async () => {
    const createCustomRule = jest.fn().mockResolvedValue({ id: 'created-rule-id' });
    const detectionRulesClient = { createCustomRule } as unknown as IDetectionRulesClient;

    await installCustomRules([translatedRule], false, detectionRulesClient);

    expect(createCustomRule).toHaveBeenCalledWith({
      params: expect.objectContaining({
        from: 'now-60s',
        to: 'now',
        interval: '60s',
      }),
    });
    expect(createCustomRule.mock.calls[0][0].params).not.toHaveProperty('timestamp_override');
    expect(createCustomRule.mock.calls[0][0].params).not.toHaveProperty('ignored_annotation');
  });

  it('uses shared defaults when timing annotations are missing', async () => {
    const createCustomRule = jest.fn().mockResolvedValue({ id: 'created-rule-id' });
    const detectionRulesClient = { createCustomRule } as unknown as IDetectionRulesClient;
    const ruleWithoutAnnotations: StoredRuleMigrationRule = {
      ...translatedRule,
      original_rule: {
        ...translatedRule.original_rule,
        annotations: undefined,
      },
    };

    await installCustomRules([ruleWithoutAnnotations], false, detectionRulesClient);

    expect(createCustomRule).toHaveBeenCalledWith({
      params: expect.objectContaining({
        from: 'now-360s',
        to: 'now',
        interval: '5m',
      }),
    });
  });

  it('uses shared interval default for non-Sentinel rules without interval annotation', async () => {
    const createCustomRule = jest.fn().mockResolvedValue({ id: 'created-rule-id' });
    const detectionRulesClient = { createCustomRule } as unknown as IDetectionRulesClient;
    const ruleWithoutAnnotations: StoredRuleMigrationRule = {
      ...translatedRule,
      original_rule: {
        ...translatedRule.original_rule,
        vendor: 'qradar',
        annotations: undefined,
      },
    };

    await installCustomRules([ruleWithoutAnnotations], false, detectionRulesClient);

    expect(createCustomRule).toHaveBeenCalledWith({
      params: expect.objectContaining({
        from: 'now-360s',
        to: 'now',
        interval: '5m',
      }),
    });
  });
});
