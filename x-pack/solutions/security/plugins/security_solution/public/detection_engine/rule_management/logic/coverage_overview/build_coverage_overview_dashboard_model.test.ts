/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CoverageOverviewRuleActivity } from '../../../../../common/api/detection_engine';
import type { CoverageOverviewResponse } from '../../../../../common/api/detection_engine';
import { buildCoverageOverviewDashboardModel } from './build_coverage_overview_dashboard_model';
import {
  getMockCoverageOverviewSubtechniques,
  getMockCoverageOverviewTactics,
  getMockCoverageOverviewTechniques,
} from '../../model/coverage_overview/__mocks__';

const mockTactics = getMockCoverageOverviewTactics();
const mockTechniques = getMockCoverageOverviewTechniques();
const mockSubtechniques = getMockCoverageOverviewSubtechniques();

describe('buildCoverageOverviewDashboardModel', () => {
  beforeEach(() => {
    jest.mock('../../../../../common/detection_engine/mitre/mitre_tactics_techniques', () => {
      return {
        tactics: mockTactics,
        techniques: mockTechniques,
        subtechniques: mockSubtechniques,
      };
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('maps API response', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {
        TA001: ['test-rule-1'],
        TA002: ['test-rule-1'],
        T001: ['test-rule-1'],
        T002: ['test-rule-1'],
        'T001.001': ['test-rule-1'],
      },
      unmapped_rule_ids: ['test-rule-2'],
      invalid_mitre_ids: {},
      rules_data: {
        'test-rule-1': {
          name: 'Test rule 1',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
        'test-rule-2': {
          name: 'Test rule 2',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
      },
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model).toEqual({
      metrics: {
        totalEnabledRulesCount: 2,
        totalRulesCount: 2,
      },
      mitreTactics: [
        {
          availableRules: [],
          disabledRules: [],
          enabledRules: [
            {
              id: 'test-rule-1',
              name: 'Test rule 1',
            },
          ],
          id: 'TA001',
          name: 'Tactic 1',
          reference: 'https://some-link/TA001',
          techniques: [
            {
              availableRules: [],
              disabledRules: [],
              enabledRules: [
                {
                  id: 'test-rule-1',
                  name: 'Test rule 1',
                },
              ],
              id: 'T001',
              name: 'Technique 1',
              reference: 'https://some-link/T001',
              subtechniques: [
                {
                  availableRules: [],
                  disabledRules: [],
                  enabledRules: [
                    {
                      id: 'test-rule-1',
                      name: 'Test rule 1',
                    },
                  ],
                  id: 'T001.001',
                  name: 'Subtechnique 1',
                  reference: 'https://some-link/T001/001',
                },
                {
                  availableRules: [],
                  disabledRules: [],
                  enabledRules: [],
                  id: 'T001.002',
                  name: 'Subtechnique 2',
                  reference: 'https://some-link/T001/002',
                },
              ],
            },
            {
              availableRules: [],
              disabledRules: [],
              enabledRules: [
                {
                  id: 'test-rule-1',
                  name: 'Test rule 1',
                },
              ],
              id: 'T002',
              name: 'Technique 2',
              reference: 'https://some-link/T002',
              subtechniques: [],
            },
          ],
        },
        {
          availableRules: [],
          disabledRules: [],
          enabledRules: [
            {
              id: 'test-rule-1',
              name: 'Test rule 1',
            },
          ],
          id: 'TA002',
          name: 'Tactic 2',
          reference: 'https://some-link/TA002',
          techniques: [
            {
              availableRules: [],
              disabledRules: [],
              enabledRules: [
                {
                  id: 'test-rule-1',
                  name: 'Test rule 1',
                },
              ],
              id: 'T002',
              name: 'Technique 2',
              reference: 'https://some-link/T002',
              subtechniques: [],
            },
          ],
        },
      ],
      unmappedRules: {
        availableRules: [],
        disabledRules: [],
        enabledRules: [expect.objectContaining({ id: 'test-rule-2' })],
      },
      invalidlyMappedRules: {
        enabledRules: [],
        disabledRules: [],
      },
    });
  });

  it('maps techniques that appear in multiple tactics', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {
        TA001: ['test-rule-1', 'test-rule-2'],
        TA002: ['test-rule-2'],
        T002: ['test-rule-1', 'test-rule-2'],
      },
      unmapped_rule_ids: [],
      invalid_mitre_ids: {},
      rules_data: {
        'test-rule-1': {
          name: 'Test rule',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
        'test-rule-2': {
          name: 'Test rule 2',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
      },
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model.mitreTactics).toEqual([
      expect.objectContaining({
        id: 'TA001',
        enabledRules: [
          expect.objectContaining({ id: 'test-rule-1' }),
          expect.objectContaining({ id: 'test-rule-2' }),
        ],
        techniques: [
          expect.objectContaining({ id: 'T001', enabledRules: [] }),
          expect.objectContaining({
            id: 'T002',
            enabledRules: [
              expect.objectContaining({ id: 'test-rule-1' }),
              expect.objectContaining({ id: 'test-rule-2' }),
            ],
          }),
        ],
      }),
      expect.objectContaining({
        id: 'TA002',
        enabledRules: [expect.objectContaining({ id: 'test-rule-2' })],
        techniques: [
          expect.objectContaining({
            id: 'T002',
            enabledRules: [expect.objectContaining({ id: 'test-rule-2' })],
          }),
        ],
      }),
    ]);
  });

  it('maps unmapped rules', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {
        TA001: ['test-rule-1'],
        T002: ['test-rule-1'],
      },
      unmapped_rule_ids: ['test-rule-2'],
      invalid_mitre_ids: {},
      rules_data: {
        'test-rule-1': {
          name: 'Test rule 1',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
        'test-rule-2': {
          name: 'Test rule 2',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
      },
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model.unmappedRules).toEqual({
      availableRules: [],
      disabledRules: [],
      enabledRules: [expect.objectContaining({ id: 'test-rule-2' })],
    });
    expect(model.mitreTactics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'TA001',
          enabledRules: expect.not.arrayContaining(['test-rule-2']),
        }),
      ])
    );
  });

  it('maps metrics fields', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {
        TA001: ['test-rule-1'],
        T002: ['test-rule-1'],
      },
      unmapped_rule_ids: ['test-rule-2'],
      invalid_mitre_ids: {},
      rules_data: {
        'test-rule-1': {
          name: 'Test rule 1',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
        'test-rule-2': {
          name: 'Test rule 2',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
        'test-rule-3': {
          name: 'Test rule 3',
          activity: CoverageOverviewRuleActivity.Disabled,
        },
      },
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model.metrics).toEqual({
      totalEnabledRulesCount: 2,
      totalRulesCount: 3,
    });
  });

  it('maps invalidlyMappedRules for enabled rules', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {},
      unmapped_rule_ids: [],
      invalid_mitre_ids: {
        'test-rule-invalid': ['TA9999', 'T9999'],
      },
      rules_data: {
        'test-rule-invalid': {
          name: 'Rule with invalid MITRE',
          activity: CoverageOverviewRuleActivity.Enabled,
        },
      },
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model.invalidlyMappedRules).toEqual({
      enabledRules: [
        {
          id: 'test-rule-invalid',
          name: 'Rule with invalid MITRE',
          invalidMitreIds: ['TA9999', 'T9999'],
        },
      ],
      disabledRules: [],
    });
  });

  it('maps invalidlyMappedRules for disabled rules', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {},
      unmapped_rule_ids: [],
      invalid_mitre_ids: {
        'test-rule-disabled-invalid': ['T1234.999'],
      },
      rules_data: {
        'test-rule-disabled-invalid': {
          name: 'Disabled rule with invalid MITRE',
          activity: CoverageOverviewRuleActivity.Disabled,
        },
      },
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model.invalidlyMappedRules).toEqual({
      enabledRules: [],
      disabledRules: [
        {
          id: 'test-rule-disabled-invalid',
          name: 'Disabled rule with invalid MITRE',
          invalidMitreIds: ['T1234.999'],
        },
      ],
    });
  });

  it('returns empty invalidlyMappedRules when invalid_mitre_ids is empty', async () => {
    const mockApiResponse: CoverageOverviewResponse = {
      coverage: {},
      unmapped_rule_ids: [],
      invalid_mitre_ids: {},
      rules_data: {},
    };

    const model = await buildCoverageOverviewDashboardModel(mockApiResponse);

    expect(model.invalidlyMappedRules).toEqual({
      enabledRules: [],
      disabledRules: [],
    });
  });
});
