/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import {
  RuleCustomizationStatus,
  type RuleResponse,
  type RuleUpgradeInfoForReview,
} from '../../../../common/api/detection_engine';
import { TestProviders } from '../../../common/mock';
import { usePrebuiltRulesUpgrade } from './use_prebuilt_rules_upgrade';
import { usePerformUpgradeRules } from '../logic/prebuilt_rules/use_perform_rule_upgrade';
import { usePrebuiltRulesUpgradeReview } from '../logic/prebuilt_rules/use_prebuilt_rules_upgrade_review';
import { usePrebuiltRulesCustomizationStatus } from '../logic/prebuilt_rules/use_prebuilt_rules_customization_status';
import { useIsInitializingPrebuiltRulesPackage } from '../logic/prebuilt_rules/use_is_initializing_prebuilt_rules_package';
import { useOutdatedMlJobsUpgradeModal } from '../../rule_management_ui/components/rules_table/upgrade_prebuilt_rules_table/use_ml_jobs_upgrade_modal';
import { useUpgradeWithConflictsModal } from '../../rule_management_ui/components/rules_table/upgrade_prebuilt_rules_table/use_upgrade_with_conflicts_modal';

jest.mock('../logic/prebuilt_rules/use_perform_rule_upgrade');
jest.mock('../logic/prebuilt_rules/use_prebuilt_rules_upgrade_review');
jest.mock('../logic/prebuilt_rules/use_prebuilt_rules_customization_status');
jest.mock('../logic/prebuilt_rules/use_is_initializing_prebuilt_rules_package');
jest.mock(
  '../../rule_management_ui/components/rules_table/upgrade_prebuilt_rules_table/use_ml_jobs_upgrade_modal'
);
jest.mock(
  '../../rule_management_ui/components/rules_table/upgrade_prebuilt_rules_table/use_upgrade_with_conflicts_modal'
);
jest.mock('../../../common/components/user_privileges');
jest.mock('../../../common/lib/kibana');

const mockUsePerformUpgradeRules = usePerformUpgradeRules as jest.Mock;
const mockUsePrebuiltRulesUpgradeReview = usePrebuiltRulesUpgradeReview as jest.Mock;
const mockUsePrebuiltRulesCustomizationStatus = usePrebuiltRulesCustomizationStatus as jest.Mock;
const mockUseIsInitializingPrebuiltRulesPackage =
  useIsInitializingPrebuiltRulesPackage as jest.Mock;
const mockUseOutdatedMlJobsUpgradeModal = useOutdatedMlJobsUpgradeModal as jest.Mock;
const mockUseUpgradeWithConflictsModal = useUpgradeWithConflictsModal as jest.Mock;

describe('usePrebuiltRulesUpgrade', () => {
  const mutateAsync = jest.fn().mockResolvedValue({});
  const confirmLegacyMLJobs = jest.fn().mockResolvedValue(true);

  beforeEach(() => {
    jest.clearAllMocks();

    mutateAsync.mockResolvedValue({});
    confirmLegacyMLJobs.mockResolvedValue(true);

    mockUsePerformUpgradeRules.mockReturnValue({ mutateAsync });
    mockUsePrebuiltRulesCustomizationStatus.mockReturnValue({
      isRulesCustomizationEnabled: true,
    });
    mockUseIsInitializingPrebuiltRulesPackage.mockReturnValue(false);
    mockUseOutdatedMlJobsUpgradeModal.mockReturnValue({
      modal: null,
      confirmLegacyMLJobs,
      isLoading: false,
    });
    mockUseUpgradeWithConflictsModal.mockReturnValue({
      modal: null,
      confirmConflictsUpgrade: jest.fn(),
    });

    mockUsePrebuiltRulesUpgradeReview.mockReturnValue(buildReviewResult());
  });

  it('exposes upgradeRulesToTarget as a function on the returned object', () => {
    const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
      wrapper: TestProviders,
    });

    expect(typeof result.current.upgradeRulesToTarget).toBe('function');
  });

  it('issues exactly one SPECIFIC_RULES/TARGET _perform request', async () => {
    mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
      buildReviewResult([
        createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 3 }),
        createRuleUpgradeInfoMock({ rule_id: 'rule-b', revision: 2, targetVersion: 5 }),
      ])
    );

    const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
      wrapper: TestProviders,
    });

    await act(async () => {
      await result.current.upgradeRulesToTarget(['rule-a', 'rule-b']);
    });

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({
      mode: 'SPECIFIC_RULES',
      pick_version: 'TARGET',
      rules: [
        { rule_id: 'rule-a', version: 3, revision: 1 },
        { rule_id: 'rule-b', version: 5, revision: 2 },
      ],
    });
  });

  it('carries no fields, dry_run, or on_conflict key on any specifier or request body', async () => {
    mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
      buildReviewResult([
        createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 3 }),
      ])
    );

    const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
      wrapper: TestProviders,
    });

    await act(async () => {
      await result.current.upgradeRulesToTarget(['rule-a']);
    });

    const requestArg = mutateAsync.mock.calls[0][0];
    expect(Object.keys(requestArg)).not.toContain('dry_run');
    expect(Object.keys(requestArg)).not.toContain('on_conflict');
    for (const specifier of requestArg.rules) {
      expect(Object.keys(specifier)).not.toContain('fields');
    }
  });

  it('drops a stale rule id and still upgrades the remaining ids without throwing', async () => {
    mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
      buildReviewResult([
        createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 3 }),
      ])
    );

    const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
      wrapper: TestProviders,
    });

    await expect(
      act(async () => {
        await result.current.upgradeRulesToTarget(['rule-a', 'ghost-rule']);
      })
    ).resolves.not.toThrow();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0].rules).toHaveLength(1);
    expect(mutateAsync.mock.calls[0][0].rules[0]).toEqual({
      rule_id: 'rule-a',
      version: 3,
      revision: 1,
    });
  });

  it('drops a stale rule id via the default upgradeRules path when customization is enabled', async () => {
    mockUsePrebuiltRulesCustomizationStatus.mockReturnValue({
      isRulesCustomizationEnabled: true,
    });
    mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
      buildReviewResult([
        createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 3 }),
      ])
    );
    // upgradeRules (customization enabled) routes through the dry-run mutation path,
    // which issues a dry_run request first and then the real request.
    mutateAsync.mockImplementation(async (params) =>
      params.dry_run ? { results: { skipped: [], updated: [] } } : {}
    );

    const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
      wrapper: TestProviders,
    });

    await expect(
      act(async () => {
        await result.current.upgradeRules(['rule-a', 'ghost-rule']);
      })
    ).resolves.not.toThrow();

    // The dry-run request itself carries the specifier list built from the stale-id
    // filter under test — proving the filter applies on this path without needing to
    // follow the conflict-check indirection through to the final non-dry-run request.
    expect(mutateAsync.mock.calls[0][0].rules).toHaveLength(1);
    expect(mutateAsync.mock.calls[0][0].rules[0]).toEqual(
      expect.objectContaining({ rule_id: 'rule-a', revision: 1 })
    );
  });

  describe('upgradeAllRulesToTarget', () => {
    it('issues one ALL_RULES/TARGET request with no filter when no search term or filters are supplied', async () => {
      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      await act(async () => {
        await result.current.upgradeAllRulesToTarget();
      });

      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(mutateAsync).toHaveBeenCalledWith({
        mode: 'ALL_RULES',
        pick_version: 'TARGET',
        filter: undefined,
      });
    });

    it('scopes the request to the trimmed search term and the active filters', async () => {
      const { result } = renderHook(
        () =>
          usePrebuiltRulesUpgrade({
            searchTerm: '  windows  ',
            filterOptions: {
              tags: ['tag-a'],
              customizationStatus: RuleCustomizationStatus.CUSTOMIZED,
            },
          }),
        { wrapper: TestProviders }
      );

      await act(async () => {
        await result.current.upgradeAllRulesToTarget();
      });

      expect(mutateAsync).toHaveBeenCalledWith({
        mode: 'ALL_RULES',
        pick_version: 'TARGET',
        filter: {
          name: 'windows',
          tags: ['tag-a'],
          customization_status: RuleCustomizationStatus.CUSTOMIZED,
        },
      });
    });

    it('produces an identical request whether rules customization is enabled or disabled', async () => {
      mockUsePrebuiltRulesCustomizationStatus.mockReturnValue({
        isRulesCustomizationEnabled: true,
      });
      const { result: enabledResult } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });
      await act(async () => {
        await enabledResult.current.upgradeAllRulesToTarget();
      });
      const enabledArg = mutateAsync.mock.calls[0][0];

      mutateAsync.mockClear();
      mockUsePrebuiltRulesCustomizationStatus.mockReturnValue({
        isRulesCustomizationEnabled: false,
      });
      const { result: disabledResult } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });
      await act(async () => {
        await disabledResult.current.upgradeAllRulesToTarget();
      });
      const disabledArg = mutateAsync.mock.calls[0][0];

      expect(enabledArg).toEqual(disabledArg);
    });

    it('carries no dry_run or on_conflict key', async () => {
      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      await act(async () => {
        await result.current.upgradeAllRulesToTarget();
      });

      const requestArg = mutateAsync.mock.calls[0][0];
      expect(Object.keys(requestArg)).not.toContain('dry_run');
      expect(Object.keys(requestArg)).not.toContain('on_conflict');
      expect(mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ dry_run: true }));
    });

    it('scopes to the selected rule ids instead of firing an unscoped ALL_RULES request when filterOptions.ruleIds is set', async () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult([
          createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 3 }),
          createRuleUpgradeInfoMock({ rule_id: 'rule-b', revision: 2, targetVersion: 5 }),
        ])
      );

      const { result } = renderHook(
        () =>
          usePrebuiltRulesUpgrade({
            filterOptions: { ruleIds: ['rule-a', 'rule-b'] },
          }),
        { wrapper: TestProviders }
      );

      await act(async () => {
        await result.current.upgradeAllRulesToTarget();
      });

      expect(mutateAsync).toHaveBeenCalledTimes(1);
      expect(mutateAsync).toHaveBeenCalledWith({
        mode: 'SPECIFIC_RULES',
        pick_version: 'TARGET',
        rules: [
          { rule_id: 'rule-a', version: 3, revision: 1 },
          { rule_id: 'rule-b', version: 5, revision: 2 },
        ],
      });
    });

    it('does not call onUpgrade when the legacy-ML-jobs confirmation is cancelled', async () => {
      confirmLegacyMLJobs.mockResolvedValueOnce(false);
      const onUpgrade = jest.fn();

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({ onUpgrade }), {
        wrapper: TestProviders,
      });

      await act(async () => {
        await result.current.upgradeAllRulesToTarget();
      });

      expect(mutateAsync).not.toHaveBeenCalled();
      expect(onUpgrade).not.toHaveBeenCalled();
    });

    it('does not affect the pre-existing upgradeAllRules MERGED primary path', async () => {
      mockUsePrebuiltRulesCustomizationStatus.mockReturnValue({
        isRulesCustomizationEnabled: true,
      });
      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      await act(async () => {
        await result.current.upgradeAllRules();
      });

      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          dry_run: true,
          pick_version: 'MERGED',
        })
      );
    });

    it('resolves even when mutateAsync rejects, clearing loadingRules', async () => {
      mutateAsync.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      await expect(
        act(async () => {
          await result.current.upgradeAllRulesToTarget();
        })
      ).resolves.not.toThrow();

      expect(result.current.loadingRules).toEqual([]);
    });
  });

  describe('customization counts', () => {
    it('requests the isCustomized aggregation exactly once per render pass', () => {
      renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(mockUsePrebuiltRulesUpgradeReview).toHaveBeenCalledTimes(1);
      expect(mockUsePrebuiltRulesUpgradeReview).toHaveBeenCalledWith(
        expect.objectContaining({ aggregations: { counts: ['isCustomized'] } }),
        expect.anything()
      );
    });

    it('derives allRulesCustomizationCounts from the total and isCustomized.true facet', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult(
          [createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 3 })],
          { total: 137, counts: { isCustomized: { true: 12, false: 125 } } }
        )
      );

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(result.current.allRulesCustomizationCounts).toEqual({
        total: 137,
        customizedCount: 12,
      });
    });

    it('defaults customizedCount to 0 when the counts facet is absent', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(buildReviewResult([], { total: 42 }));

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(result.current.allRulesCustomizationCounts).toEqual({
        total: 42,
        customizedCount: 0,
      });
    });

    it('defaults to { total: 0, customizedCount: 0 } when there is no review data', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue({
        data: undefined,
        refetch: jest.fn(),
        dataUpdatedAt: 0,
        isFetched: false,
        isLoading: true,
        isFetching: true,
        isRefetching: false,
      });

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(result.current.allRulesCustomizationCounts).toEqual({
        total: 0,
        customizedCount: 0,
      });
    });

    it('getSelectedRulesCustomizationCounts counts customized rules among the selected ids', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult([
          createRuleUpgradeInfoMock({
            rule_id: 'rule-a',
            revision: 1,
            targetVersion: 1,
            currentRuleOverrides: {
              rule_source: {
                type: 'external',
                is_customized: true,
                has_base_version: true,
                customized_fields: [],
              },
            },
          }),
          createRuleUpgradeInfoMock({ rule_id: 'rule-b', revision: 1, targetVersion: 1 }),
          createRuleUpgradeInfoMock({ rule_id: 'rule-c', revision: 1, targetVersion: 1 }),
        ])
      );

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(
        result.current.getSelectedRulesCustomizationCounts(['rule-a', 'rule-b', 'rule-c'])
      ).toEqual({ total: 3, customizedCount: 1 });
    });

    it('excludes stale ids from the selected total rather than counting them as non-customized', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult([
          createRuleUpgradeInfoMock({
            rule_id: 'rule-a',
            revision: 1,
            targetVersion: 1,
            currentRuleOverrides: {
              rule_source: {
                type: 'external',
                is_customized: true,
                has_base_version: true,
                customized_fields: [],
              },
            },
          }),
        ])
      );

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(result.current.getSelectedRulesCustomizationCounts(['rule-a', 'ghost-rule'])).toEqual({
        total: 1,
        customizedCount: 1,
      });
    });

    it('issues no network request when calling getSelectedRulesCustomizationCounts', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult([
          createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 1 }),
        ])
      );

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      const callCountBefore = mockUsePrebuiltRulesUpgradeReview.mock.calls.length;
      result.current.getSelectedRulesCustomizationCounts(['rule-a']);

      expect(mockUsePrebuiltRulesUpgradeReview.mock.calls.length).toBe(callCountBefore);
      expect(mutateAsync).not.toHaveBeenCalled();
    });

    it('counts a non-external rule toward total but not toward customizedCount', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult([
          createRuleUpgradeInfoMock({
            rule_id: 'rule-a',
            revision: 1,
            targetVersion: 1,
            currentRuleOverrides: { rule_source: { type: 'internal' } },
          }),
        ])
      );

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(result.current.getSelectedRulesCustomizationCounts(['rule-a'])).toEqual({
        total: 1,
        customizedCount: 0,
      });
    });

    it('getSelectedRulesCustomizationCounts and allRulesCustomizationCounts share the same key shape', () => {
      mockUsePrebuiltRulesUpgradeReview.mockReturnValue(
        buildReviewResult(
          [createRuleUpgradeInfoMock({ rule_id: 'rule-a', revision: 1, targetVersion: 1 })],
          { total: 1, counts: { isCustomized: { true: 0, false: 1 } } }
        )
      );

      const { result } = renderHook(() => usePrebuiltRulesUpgrade({}), {
        wrapper: TestProviders,
      });

      expect(
        Object.keys(result.current.getSelectedRulesCustomizationCounts(['rule-a'])).sort()
      ).toEqual(['customizedCount', 'total']);
      expect(Object.keys(result.current.allRulesCustomizationCounts).sort()).toEqual([
        'customizedCount',
        'total',
      ]);
    });
  });
});

function buildReviewResult(
  rules: RuleUpgradeInfoForReview[] = [],
  overrides: { total?: number; counts?: Record<string, Record<string, number>> } = {}
) {
  return {
    data: {
      page: 1,
      per_page: 20,
      total: overrides.total ?? rules.length,
      stats: {
        num_rules_to_upgrade_total: rules.length,
        num_rules_with_conflicts: 0,
        num_rules_with_non_solvable_conflicts: 0,
      },
      rules,
      counts: overrides.counts,
    },
    refetch: jest.fn(),
    dataUpdatedAt: 0,
    isFetched: true,
    isLoading: false,
    isFetching: false,
    isRefetching: false,
  };
}

function createRuleUpgradeInfoMock({
  rule_id: ruleId,
  revision,
  targetVersion,
  currentRuleOverrides,
}: {
  rule_id: string;
  revision: number;
  targetVersion: number;
  currentRuleOverrides?: Partial<RuleResponse>;
}): RuleUpgradeInfoForReview {
  return {
    id: `${ruleId}-so-id`,
    rule_id: ruleId,
    version: targetVersion,
    revision,
    current_rule: createRuleResponseMock({ revision, ...currentRuleOverrides }),
    target_rule: createRuleResponseMock({ version: targetVersion }),
    diff: {
      num_fields_with_updates: 0,
      num_fields_with_conflicts: 0,
      num_fields_with_non_solvable_conflicts: 0,
      fields: {},
    },
    has_base_version: true,
  };
}

function createRuleResponseMock(rewrites?: Partial<RuleResponse>): RuleResponse {
  return {
    version: 1,
    revision: 1,
    rule_source: { type: 'external', is_customized: false },
    ...rewrites,
  } as RuleResponse;
}
