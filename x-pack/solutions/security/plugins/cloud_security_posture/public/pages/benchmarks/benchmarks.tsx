/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useRef, useState } from 'react';
import type { EuiFieldSearchProps } from '@elastic/eui';
import {
  EuiButton,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPageHeader,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
  EuiTextColor,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import useDebounce from 'react-use/lib/useDebounce';
import { i18n } from '@kbn/i18n';
import { pagePathGetters } from '@kbn/fleet-plugin/public';
import { extractErrorMessage } from '@kbn/cloud-security-posture-common';
import { useCspSetupStatusApi } from '@kbn/cloud-security-posture/src/hooks/use_csp_setup_status_api';
import { ProjectRoutingAccess, useRouteBasedCpsPickerAccess } from '@kbn/cps-utils';
import type { CPSPluginStart } from '@kbn/cps/public';
import type { CoreStart } from '@kbn/core/public';
import { useKibana as useKibanaBase } from '@kbn/kibana-react-plugin/public';
import { CLOUD_SECURITY_POSTURE_PACKAGE_NAME } from '../../../common/constants';
import { CloudPosturePageTitle } from '../../components/cloud_posture_page_title';
import { CloudPosturePage } from '../../components/cloud_posture_page';
import { BenchmarksTable } from './benchmarks_table';
import type { UseCspBenchmarkIntegrationsProps } from './use_csp_benchmark_integrations';
import { useCspBenchmarkIntegrationsV2 } from './use_csp_benchmark_integrations';
import { getBenchmarkCisName } from '../../../common/utils/helpers';
import * as TEST_SUBJ from './test_subjects';
import {
  LOCAL_STORAGE_PAGE_SIZE_BENCHMARK_KEY,
  NO_FINDINGS_STATUS_REFRESH_INTERVAL_MS,
} from '../../common/constants';
import { usePageSize } from '../../common/hooks/use_page_size';
import { useKibana } from '../../common/hooks/use_kibana';
import { NoFindingsStates } from '../../components/no_findings_states';

const SEARCH_DEBOUNCE_MS = 300;

const AddCisIntegrationButton = () => {
  const { http, fleet } = useKibana().services;
  const canInstallPackages = fleet?.authz?.integrations.installPackages;

  const integrationsPath = pagePathGetters
    .integrations_all({
      searchTerm: CLOUD_SECURITY_POSTURE_PACKAGE_NAME,
    })
    .join('');

  return canInstallPackages ? (
    <EuiButton
      data-test-subj={TEST_SUBJ.ADD_INTEGRATION_TEST_SUBJ}
      fill
      iconType="plusCircle"
      href={http.basePath.prepend(integrationsPath)}
    >
      <FormattedMessage
        id="xpack.csp.benchmarks.benchmarksPageHeader.addIntegrationButtonLabel"
        defaultMessage="Add Integration"
      />
    </EuiButton>
  ) : null;
};

const BenchmarkEmptyState = ({ name }: { name: string }) => (
  <div>
    <EuiSpacer size="l" />
    {
      <EuiText>
        <strong>
          <FormattedMessage
            id="xpack.csp.benchmarks.benchmarkEmptyState.rulesNotFoundTitle"
            defaultMessage="No benchmark rules found"
          />
          {name && (
            <FormattedMessage
              id="xpack.csp.benchmarks.benchmarkEmptyState.integrationsNotFoundForNameTitle"
              defaultMessage=' for "{name}"'
              values={{ name }}
            />
          )}
        </strong>
      </EuiText>
    }
    <EuiSpacer size="s" />
    <EuiText>
      <EuiTextColor color="subdued">
        <FormattedMessage
          id="xpack.csp.benchmarks.benchmarkEmptyState.rulesNotFoundWithFiltersTitle"
          defaultMessage="We weren't able to find any benchmark rules with the above filters."
        />
      </EuiTextColor>
    </EuiText>
    <EuiSpacer size="l" />
  </div>
);

const TotalIntegrationsCount = ({
  pageCount,
  totalCount,
}: Record<'pageCount' | 'totalCount', number>) => (
  <EuiText size="xs" css={{ marginLeft: 8 }}>
    <EuiTextColor color="subdued">
      <FormattedMessage
        id="xpack.csp.benchmarks.totalIntegrationsCountMessage"
        defaultMessage="Showing {pageCount} of {totalCount, plural, one {# benchmark} other {# benchmarks}}"
        values={{ pageCount, totalCount }}
      />
    </EuiTextColor>
  </EuiText>
);

const SearchAnnouncement = ({
  resultCount,
  searchValue,
}: {
  resultCount: number;
  searchValue: string;
}) => {
  const liveRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = searchValue
        ? i18n.translate('xpack.csp.benchmarks.searchResultAnnouncementWithQuery', {
            defaultMessage: '{resultCount} benchmark table results found for "{searchValue}"',
            values: { resultCount, searchValue },
          })
        : i18n.translate('xpack.csp.benchmarks.searchResultAnnouncementWithoutQuery', {
            defaultMessage: '{resultCount} total benchmarks',
            values: { resultCount },
          });
    }
  }, [resultCount, searchValue]);

  return (
    <EuiScreenReaderOnly>
      <div aria-live="polite" aria-atomic="true" ref={liveRegionRef} role="status" />
    </EuiScreenReaderOnly>
  );
};
const BenchmarkSearchField = ({
  onSearch,
  isLoading,
}: Required<Pick<EuiFieldSearchProps, 'isLoading' | 'onSearch'>>) => {
  const [localValue, setLocalValue] = useState('');

  useDebounce(() => onSearch(localValue), SEARCH_DEBOUNCE_MS, [localValue]);

  return (
    <EuiFlexGroup>
      <EuiFlexItem grow={true} css={{ alignItems: 'flex-end' }}>
        <EuiFieldSearch
          fullWidth
          onSearch={setLocalValue}
          isLoading={isLoading}
          placeholder={i18n.translate(
            'xpack.csp.benchmarks.benchmarkSearchField.searchPlaceholder',
            { defaultMessage: 'Search by Benchmark Name' }
          )}
          incremental
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const Benchmarks = () => {
  const { pageSize, setPageSize } = usePageSize(LOCAL_STORAGE_PAGE_SIZE_BENCHMARK_KEY);
  const { application, cps } = useKibanaBase<CoreStart & { cps?: CPSPluginStart }>().services;
  useRouteBasedCpsPickerAccess(ProjectRoutingAccess.DISABLED, { application, cps });

  const [query, setQuery] = useState<UseCspBenchmarkIntegrationsProps>({
    name: '',
    page: 1,
    perPage: pageSize,
    sortField: 'package_policy.name',
    sortOrder: 'asc',
  });

  const queryResult = useCspBenchmarkIntegrationsV2();
  const lowerCaseQueryName = query.name.toLowerCase();
  const benchmarkResult =
    queryResult.data?.items.filter((obj) =>
      getBenchmarkCisName(obj.id)?.toLowerCase().includes(lowerCaseQueryName)
    ) || [];
  const totalItemCount = queryResult.data?.items.length || 0;

  // Check if we have any CSP Integration or not
  const getSetupStatus = useCspSetupStatusApi({
    refetchInterval: NO_FINDINGS_STATUS_REFRESH_INTERVAL_MS,
  });

  const kspmStatus = getSetupStatus.data?.kspm?.status;
  const cspmStatus = getSetupStatus.data?.cspm?.status;

  const showNoFindingsStates =
    (kspmStatus === 'not-installed' && cspmStatus === 'not-installed') ||
    cspmStatus === 'unprivileged' ||
    kspmStatus === 'unprivileged';

  return (
    <CloudPosturePage>
      <EuiPageHeader
        data-test-subj={TEST_SUBJ.BENCHMARKS_PAGE_HEADER}
        pageTitle={
          <CloudPosturePageTitle
            title={i18n.translate('xpack.csp.benchmarks.benchmarksPageHeader.benchmarksTitle', {
              defaultMessage: 'Benchmarks',
            })}
          />
        }
        rightSideItems={[<AddCisIntegrationButton />]}
        bottomBorder
      />
      <EuiSpacer />
      {showNoFindingsStates ? (
        <NoFindingsStates postureType={'all'} />
      ) : (
        <>
          <BenchmarkSearchField
            isLoading={queryResult.isFetching}
            onSearch={(name) => setQuery((current) => ({ ...current, name }))}
          />
          <EuiSpacer />
          <TotalIntegrationsCount
            pageCount={(queryResult.data?.items || []).length}
            totalCount={totalItemCount}
          />
          <EuiSpacer size="s" />
          <SearchAnnouncement resultCount={benchmarkResult.length} searchValue={query.name} />
          <BenchmarksTable
            benchmarks={benchmarkResult}
            data-test-subj={TEST_SUBJ.BENCHMARKS_TABLE_DATA_TEST_SUBJ}
            error={queryResult.error ? extractErrorMessage(queryResult.error) : undefined}
            loading={queryResult.isFetching}
            pageIndex={query.page}
            pageSize={pageSize || query.perPage}
            sorting={{
              // @ts-expect-error - EUI types currently do not support sorting by nested fields
              sort: { field: query.sortField, direction: query.sortOrder },
              allowNeutralSort: false,
            }}
            totalItemCount={totalItemCount}
            setQuery={({ page, sort }) => {
              setPageSize(page.size);
              setQuery((current) => ({
                ...current,
                page: page.index,
                perPage: page.size,
                sortField:
                  (sort?.field as UseCspBenchmarkIntegrationsProps['sortField']) ||
                  current.sortField,
                sortOrder: sort?.direction || current.sortOrder,
              }));
            }}
            noItemsMessage={
              queryResult.isSuccess ? <BenchmarkEmptyState name={query.name} /> : undefined
            }
          />
        </>
      )}
    </CloudPosturePage>
  );
};
