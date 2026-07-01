/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { RuleResponse } from '../../../../../../common/api/detection_engine/model/rule_schema';
import { useDeepLinkedPrebuiltRule } from './use_deep_linked_prebuilt_rule';
import { usePrebuiltRulesInstallReview } from '../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_install_review';
import { useFindInstalledPrebuiltRuleByRuleId } from '../../../../rule_management/logic/use_find_installed_prebuilt_rule_by_rule_id';

jest.mock('../../../../rule_management/logic/prebuilt_rules/use_prebuilt_rules_install_review');
jest.mock('../../../../rule_management/logic/use_find_installed_prebuilt_rule_by_rule_id');

const usePrebuiltRulesInstallReviewMock = usePrebuiltRulesInstallReview as jest.Mock;
const useFindInstalledPrebuiltRuleByRuleIdMock = useFindInstalledPrebuiltRuleByRuleId as jest.Mock;

const RULE_ID = 'rule-1';

const makeRule = (ruleId: string): RuleResponse =>
  ({ rule_id: ruleId, name: `Rule ${ruleId}` } as unknown as RuleResponse);

// Query state builders reused across tests (one-off states are inlined at their call site).
const installableSettledWith = (rules: RuleResponse[]) => ({
  data: { rules },
  isFetching: false,
  isFetched: true,
});
const fallbackSettledWith = (rule: RuleResponse | undefined) => ({
  rule,
  isFetching: false,
  isFetched: true,
});

// The `enabled` option each query was last called with.
const lastInstallableEnabled = () =>
  usePrebuiltRulesInstallReviewMock.mock.calls.at(-1)?.[1]?.enabled;
const lastFallbackEnabled = () =>
  useFindInstalledPrebuiltRuleByRuleIdMock.mock.calls.at(-1)?.[1]?.enabled;

const render = (ruleId: string | undefined, currentPageRules: RuleResponse[]) =>
  renderHook(() => useDeepLinkedPrebuiltRule({ ruleId, currentPageRules }));

beforeEach(() => {
  jest.clearAllMocks();
  // Default: neither query has run (tests override as needed).
  usePrebuiltRulesInstallReviewMock.mockReturnValue({
    data: undefined,
    isFetching: false,
    isFetched: false,
  });
  useFindInstalledPrebuiltRuleByRuleIdMock.mockReturnValue({
    rule: undefined,
    isFetching: false,
    isFetched: false,
  });
});

describe('useDeepLinkedPrebuiltRule', () => {
  describe('resolution tiers', () => {
    it('no ruleId -> resolves to nothing', () => {
      const { result } = render(undefined, []);

      expect(result.current.deepLinkedRule).toBeUndefined();
      expect(result.current.isDeepLinkedRuleInstalled).toBe(false);
      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
      expect(lastInstallableEnabled()).toBe(false);
      expect(lastFallbackEnabled()).toBe(false);
    });

    it('rule already loaded -> resolves to the rule', () => {
      const rule = makeRule(RULE_ID);

      const { result } = render(RULE_ID, [rule]);

      expect(result.current.deepLinkedRule).toBe(rule);
      expect(result.current.isDeepLinkedRuleInstalled).toBe(false);
      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
      expect(lastInstallableEnabled()).toBe(false);
      expect(lastFallbackEnabled()).toBe(false);
    });

    it('rule not yet loaded, but installable -> resolves to the installable rule', () => {
      const rule = makeRule(RULE_ID);
      usePrebuiltRulesInstallReviewMock.mockReturnValue(installableSettledWith([rule]));

      const { result } = render(RULE_ID, []);

      expect(lastInstallableEnabled()).toBe(true);
      expect(result.current.deepLinkedRule).toBe(rule);
      expect(result.current.isDeepLinkedRuleInstalled).toBe(false);
      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
      expect(lastFallbackEnabled()).toBe(false);
    });

    it('rule not yet loaded and not installable -> resolves to the installed rule', () => {
      const installedRule = makeRule(RULE_ID);
      usePrebuiltRulesInstallReviewMock.mockReturnValue(installableSettledWith([]));
      useFindInstalledPrebuiltRuleByRuleIdMock.mockReturnValue(fallbackSettledWith(installedRule));

      const { result } = render(RULE_ID, []);

      expect(lastFallbackEnabled()).toBe(true);
      expect(result.current.deepLinkedRule).toBe(installedRule);
      expect(result.current.isDeepLinkedRuleInstalled).toBe(true);
      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
    });

    it('resolves to nothing when the rule is not found anywhere', () => {
      usePrebuiltRulesInstallReviewMock.mockReturnValue(installableSettledWith([]));
      useFindInstalledPrebuiltRuleByRuleIdMock.mockReturnValue(fallbackSettledWith(undefined));

      const { result } = render(RULE_ID, []);

      expect(result.current.deepLinkedRule).toBeUndefined();
      expect(result.current.isDeepLinkedRuleInstalled).toBe(false);
      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
    });
  });

  describe('isDeepLinkedRuleResolved', () => {
    it('is false while the installable catalog lookup is fetching, true once it settles', () => {
      usePrebuiltRulesInstallReviewMock.mockReturnValue({
        data: undefined,
        isFetching: true,
        isFetched: false,
      });
      const { result, rerender } = render(RULE_ID, []);

      expect(result.current.isDeepLinkedRuleResolved).toBe(false);
      expect(result.current.deepLinkedRule).toBeUndefined();

      const rule = makeRule(RULE_ID);
      usePrebuiltRulesInstallReviewMock.mockReturnValue(installableSettledWith([rule]));
      rerender();

      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
      expect(result.current.deepLinkedRule).toBe(rule);
    });

    it('is false while the installed-rules fallback is fetching, true once it settles', () => {
      usePrebuiltRulesInstallReviewMock.mockReturnValue(installableSettledWith([]));
      useFindInstalledPrebuiltRuleByRuleIdMock.mockReturnValue({
        rule: undefined,
        isFetching: true,
        isFetched: false,
      });
      const { result, rerender } = render(RULE_ID, []);

      // Catalog settled empty but the fallback hasn't returned yet — not resolved.
      expect(result.current.isDeepLinkedRuleResolved).toBe(false);

      const installedRule = makeRule(RULE_ID);
      useFindInstalledPrebuiltRuleByRuleIdMock.mockReturnValue(fallbackSettledWith(installedRule));
      rerender();

      expect(result.current.isDeepLinkedRuleResolved).toBe(true);
      expect(result.current.deepLinkedRule).toBe(installedRule);
      expect(result.current.isDeepLinkedRuleInstalled).toBe(true);
    });
  });
});
