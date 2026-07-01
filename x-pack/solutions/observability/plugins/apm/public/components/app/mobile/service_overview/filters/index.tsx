/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { EuiFlexItem, EuiSelect } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { MobileProperty } from '../../../../../../common/mobile_types';
import { useTimeRange } from '../../../../../hooks/use_time_range';
import { useApmServiceContext } from '../../../../../context/apm_service/use_apm_service_context';
import { useAnyOfApmParams } from '../../../../../hooks/use_apm_params';
import { useFetcher, FETCH_STATUS } from '../../../../../hooks/use_fetcher';
import type { APIReturnType } from '../../../../../services/rest/create_call_apm_api';
import { push } from '../../../../shared/links/url_helpers';

type MobileFilter =
  APIReturnType<'GET /internal/apm/services/{serviceName}/mobile/filters'>['mobileFilters'][0];

const ALL_OPTION = {
  value: 'all',
  text: 'All',
};

const MOBILE_FILTERS: Array<{ key: MobileFilter['key']; label: string }> = [
  {
    key: MobileProperty.Device,
    label: i18n.translate('xpack.apm.mobile.filters.device', {
      defaultMessage: 'Device',
    }),
  },
  {
    key: MobileProperty.OsVersion,
    label: i18n.translate('xpack.apm.mobile.filters.osVersion', {
      defaultMessage: 'OS version',
    }),
  },
  {
    key: MobileProperty.AppVersion,
    label: i18n.translate('xpack.apm.mobile.filters.appVersion', {
      defaultMessage: 'App version',
    }),
  },
  {
    key: MobileProperty.NetworkConnectionType,
    label: i18n.translate('xpack.apm.mobile.filters.nct', {
      defaultMessage: 'NCT',
    }),
  },
];

export function MobileFilters() {
  const history = useHistory();
  const { serviceName } = useApmServiceContext();

  const {
    query: {
      environment,
      kuery,
      rangeFrom,
      rangeTo,
      netConnectionType,
      device,
      osVersion,
      appVersion,
      transactionType,
    },
  } = useAnyOfApmParams(
    '/mobile-services/{serviceName}/overview',
    '/mobile-services/{serviceName}/transactions',
    '/mobile-services/{serviceName}/transactions/view',
    '/mobile-services/{serviceName}/errors-and-crashes'
  );

  const filters = { netConnectionType, device, osVersion, appVersion };
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const { data = { mobileFilters: [] }, status } = useFetcher(
    (callApmApi) => {
      return callApmApi('GET /internal/apm/services/{serviceName}/mobile/filters', {
        params: {
          path: { serviceName },
          query: { start, end, environment, kuery, transactionType },
        },
      });
    },
    [start, end, environment, kuery, serviceName, transactionType]
  );

  function toSelectOptions(items?: string[]) {
    return [ALL_OPTION, ...(items?.map((item) => ({ value: item, text: item })) || [])];
  }

  function onChangeFilter(key: MobileFilter['key'], value: string) {
    push(history, {
      query: { [key]: value === ALL_OPTION.value ? '' : value },
    });
  }

  return (
    <>
      {MOBILE_FILTERS.map(({ key, label }) => {
        const selectOptions =
          data?.mobileFilters.find((filter: MobileFilter) => filter.key === key)?.options ?? [];

        return (
          <EuiFlexItem key={key}>
            <EuiSelect
              data-test-subj="apmMobileFiltersSelect"
              compressed
              fullWidth
              isLoading={status === FETCH_STATUS.LOADING}
              prepend={label}
              aria-label={label}
              options={toSelectOptions(selectOptions)}
              value={filters?.[key]}
              onChange={(e) => {
                onChangeFilter(key, e.target.value);
              }}
            />
          </EuiFlexItem>
        );
      })}
    </>
  );
}
