/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer, EuiSwitch } from '@elastic/eui';
import type { AlertsFilter } from '@kbn/alerting-types';
import { AlertsSearchBar, type AlertsSearchBarProps } from '@kbn/alerts-ui-shared';
import type { Filter } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import deepEqual from 'fast-deep-equal';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRuleFormState } from '../hooks';
import type { RuleAction } from '../types';
import type { RuleFormPlugins } from '../types';
import { normalizePersistedFilterMeta } from './normalize_filter_meta';

const DEFAULT_QUERY = { kql: '', filters: [] };

export interface RuleActionsAlertsFilterProps {
  action: RuleAction;
  onChange: (update?: AlertsFilter['query']) => void;
  appName: string;
  ruleTypeId?: string;
  plugins?: {
    http: RuleFormPlugins['http'];
    notifications: RuleFormPlugins['notifications'];
    unifiedSearch: RuleFormPlugins['unifiedSearch'];
    data: RuleFormPlugins['data'];
  };
}

export const RuleActionsAlertsFilter = ({
  action,
  onChange,
  appName,
  ruleTypeId,
  plugins: propsPlugins,
}: RuleActionsAlertsFilterProps) => {
  const { plugins } = useRuleFormState();
  const {
    http,
    notifications: { toasts },
    unifiedSearch,
    data,
  } = propsPlugins || plugins;

  const [query, setQuery] = useState(action.alertsFilter?.query ?? DEFAULT_QUERY);

  const state = useMemo(() => {
    return action.alertsFilter?.query;
  }, [action]);

  const queryEnabled = useMemo(() => Boolean(state), [state]);

  useEffect(() => {
    const nextState = queryEnabled ? query : undefined;
    if (!deepEqual(state, nextState)) onChange(nextState);
  }, [queryEnabled, query, state, onChange]);

  const toggleQuery = useCallback(
    () => onChange(state ? undefined : query),
    [state, query, onChange]
  );

  const updateQuery = useCallback(
    (update: Partial<AlertsFilter['query']>) => {
      setQuery({
        ...query,
        ...update,
      });
    },
    [query, setQuery]
  );

  const onQueryChange = useCallback<NonNullable<AlertsSearchBarProps['onQueryChange']>>(
    ({ query: newQuery }) => updateQuery({ kql: newQuery }),
    [updateQuery]
  );

  const onFiltersUpdated = useCallback(
    (filters: Filter[]) => {
      const updatedFilters = filters.map((filter) => {
        const { $state, meta, ...rest } = filter;
        return {
          $state,
          meta: normalizePersistedFilterMeta(meta),
          query: filter?.query ? { ...filter.query } : { ...rest },
        };
      });

      // Wrapping filters in query object here to avoid schema validation failure
      updateQuery({ filters: updatedFilters });
    },
    [updateQuery]
  );

  const ruleTypeIds = useMemo(() => (ruleTypeId != null ? [ruleTypeId] : []), [ruleTypeId]);

  return (
    <>
      <EuiSwitch
        label={i18n.translate(
          'responseOpsRuleForm.ruleActionsAlertsFilter.ActionAlertsFilterQueryToggleLabel',
          {
            defaultMessage: 'If alert matches a query',
          }
        )}
        checked={queryEnabled}
        onChange={toggleQuery}
        data-test-subj="alertsFilterQueryToggle"
      />
      {queryEnabled && (
        <>
          <EuiSpacer size="s" />
          <AlertsSearchBar
            http={http}
            toasts={toasts}
            unifiedSearchBar={unifiedSearch.ui.SearchBar}
            dataService={data}
            appName={appName}
            ruleTypeIds={ruleTypeIds}
            disableQueryLanguageSwitcher={true}
            query={query.kql}
            filters={query.filters ?? []}
            onQueryChange={onQueryChange}
            onQuerySubmit={onQueryChange}
            onFiltersUpdated={onFiltersUpdated}
            showFilterBar
            submitOnBlur
            showDatePicker={false}
            showSubmitButton={false}
            placeholder={i18n.translate(
              'responseOpsRuleForm.ruleActionsAlertsFilter.ActionAlertsFilterQueryPlaceholder',
              {
                defaultMessage: 'Filter alerts using KQL syntax',
              }
            )}
          />
        </>
      )}
    </>
  );
};
