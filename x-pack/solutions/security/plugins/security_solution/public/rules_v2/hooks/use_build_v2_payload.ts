/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CreateRuleData } from '@kbn/alerting-v2-schemas';
import { useKibana } from '../../common/lib/kibana';
import type { Rule } from '../../detection_engine/rule_management/logic/types';
import { toV2CreatePayload } from '../utils/v1_rule_to_v2_create';

const resolveIndexPatterns = async (
  rule: Rule,
  dataViewsService: { get: (id: string) => Promise<{ getIndexPattern: () => string }> }
): Promise<string[] | undefined> => {
  const index = 'index' in rule ? rule.index : undefined;
  if (index && index.length > 0) {
    return undefined;
  }

  const dataViewId = 'data_view_id' in rule ? (rule.data_view_id as string | undefined) : undefined;

  if (!dataViewId) {
    return undefined;
  }

  const dataView = await dataViewsService.get(dataViewId);
  const pattern = dataView.getIndexPattern();
  return pattern ? pattern.split(',').map((p) => p.trim()) : undefined;
};

export interface BuildV2PayloadResult {
  /** The computed v2 create payload, or null while loading / on error */
  payload: CreateRuleData | null;
  /** Whether the payload is currently being built (async data view resolution) */
  isLoading: boolean;
  /** Error message if payload building failed */
  error: string | null;
  /** Trigger payload computation. Resolves data views if needed, then caches the result. */
  buildPayload: () => Promise<CreateRuleData | null>;
}

/**
 * Lazily builds a v2 CreateRuleData payload for a given v1 rule.
 *
 * Resolves data view index patterns (async) if the rule uses a data view
 * without explicit index patterns, then calls `toV2CreatePayload`.
 *
 * The result is cached per rule reference — calling `buildPayload` again
 * for the same rule returns the cached result without re-resolving.
 */
export const useBuildV2Payload = (rule: Rule | null): BuildV2PayloadResult => {
  const { data } = useKibana().services;
  const [payload, setPayload] = useState<CreateRuleData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const builtForRuleIdRef = useRef<string | null>(null);

  const ruleId = rule?.id ?? null;
  useEffect(() => {
    if (ruleId !== builtForRuleIdRef.current) {
      setPayload(null);
      setError(null);
      setIsLoading(false);
      builtForRuleIdRef.current = null;
    }
  }, [ruleId]);

  const buildPayload = useCallback(async (): Promise<CreateRuleData | null> => {
    if (!rule) {
      return null;
    }

    if (builtForRuleIdRef.current === rule.id && payload) {
      return payload;
    }

    setIsLoading(true);
    setError(null);
    try {
      const resolvedIndexPatterns = await resolveIndexPatterns(rule, data.dataViews);
      const built = toV2CreatePayload(rule, { resolvedIndexPatterns });
      builtForRuleIdRef.current = rule.id;
      setPayload(built);
      setIsLoading(false);
      return built;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      setPayload(null);
      builtForRuleIdRef.current = null;
      setIsLoading(false);
      return null;
    }
  }, [rule, payload, data.dataViews]);

  return { payload, isLoading, error, buildPayload };
};
