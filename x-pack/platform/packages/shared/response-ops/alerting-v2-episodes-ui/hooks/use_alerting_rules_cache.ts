/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState } from 'react';
import type { HttpStart } from '@kbn/core-http-browser';
import type { FindRulesResponse } from '@kbn/alerting-v2-schemas';
import useAsync from 'react-use/lib/useAsync';
import { fetchRulesByIds } from '../apis/fetch_rules_by_ids';

export interface UseAlertingRulesCacheOptions {
  ruleIds: string[];
  services: {
    http: HttpStart;
  };
}

type Rule = FindRulesResponse['items'][number];

/**
 * Provides a rules cache by id, fetching uncached rules
 * with the minimum number of find requests possible.
 * Returns rulesCache as state so consumers re-render when rules are loaded.
 */
export const useAlertingRulesCache = ({ ruleIds, services }: UseAlertingRulesCacheOptions) => {
  const [rulesCache, setRulesCache] = useState<Record<string, Rule>>({});
  const [missingRuleIds, setMissingRuleIds] = useState<ReadonlySet<string>>(new Set());

  const { loading, error } = useAsync(async () => {
    const uncachedIds = ruleIds.filter((id) => !rulesCache[id] && !missingRuleIds.has(id));

    if (uncachedIds.length === 0) {
      return;
    }

    const rules = await fetchRulesByIds({ http: services.http, ids: uncachedIds });
    const returnedRuleIds = new Set(rules.map((rule) => rule.id));

    setRulesCache((prev) => {
      const next = { ...prev };
      rules.forEach((rule) => {
        next[rule.id] = rule;
      });
      return next;
    });

    setMissingRuleIds((prev) => {
      const next = new Set(prev);
      uncachedIds.forEach((id) => {
        if (!returnedRuleIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [ruleIds, services.http]);

  return {
    rulesCache,
    loading,
    error,
  };
};
