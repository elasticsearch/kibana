/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { DASHBOARD_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import {
  resolveDashboardsByIds,
  type Dashboard,
  type MissingDashboard,
} from '@kbn/alerting-v2-rule-form';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import type { RuleApiResponse } from '../../../../services/rules_api';

const haveSameDashboardIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
};

export const useDashboardArtifacts = (
  artifacts: RuleApiResponse['artifacts'],
  dashboard: DashboardStart | undefined
) => {
  const dashboardArtifacts = useMemo(
    () => artifacts?.filter((artifact) => artifact.type === DASHBOARD_ARTIFACT_TYPE) ?? [],
    [artifacts]
  );

  const dashboardIds = useMemo(
    () => dashboardArtifacts.map((artifact) => artifact.value),
    [dashboardArtifacts]
  );

  const [resolved, setResolved] = useState<Dashboard[]>([]);
  const [missing, setMissing] = useState<MissingDashboard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const resolvedIds = useRef<string[]>([]);

  useEffect(() => {
    if (!dashboard) {
      setResolved([]);
      setMissing([]);
      setIsLoading(false);
      setIsError(false);
      resolvedIds.current = [];
      return;
    }

    let ignore = false;

    const loadDashboards = async () => {
      if (haveSameDashboardIds(dashboardIds, resolvedIds.current)) {
        return;
      }

      if (!dashboardIds.length) {
        resolvedIds.current = [];
        setResolved([]);
        setMissing([]);
        setIsLoading(false);
        setIsError(false);
        return;
      }

      setIsLoading(true);
      setIsError(false);

      try {
        const result = await resolveDashboardsByIds(dashboard, dashboardIds);
        if (ignore) {
          return;
        }
        resolvedIds.current = dashboardIds;
        setResolved(result.resolved);
        setMissing(result.missing);
      } catch {
        if (ignore) {
          return;
        }
        resolvedIds.current = [];
        setResolved([]);
        setMissing([]);
        setIsError(true);
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    loadDashboards();

    return () => {
      ignore = true;
    };
  }, [dashboard, dashboardIds]);

  const artifactIdByDashboardId = useMemo(() => {
    // Keyed by dashboard saved-object id (`artifact.value`). Duplicate values collapse
    // to the last artifact id — deleting removes one artifact at a time.
    const map = new Map<string, string>();
    for (const artifact of dashboardArtifacts) {
      map.set(artifact.value, artifact.id);
    }
    return map;
  }, [dashboardArtifacts]);

  return {
    dashboardArtifacts,
    resolved,
    missing,
    isLoading,
    isError,
    artifactIdByDashboardId,
  };
};
