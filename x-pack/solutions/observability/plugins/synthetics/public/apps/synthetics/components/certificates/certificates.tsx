/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useDispatch } from 'react-redux';
import { EuiFilterGroup, EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useMemo, useState } from 'react';
import { useTrackPageview } from '@kbn/observability-shared-plugin/public';
import type { CertFacetCount } from '../../../../../common/runtime_types';
import { MonitorTypeEnum } from '../../../../../common/runtime_types';
import { setCertificatesTotalAction } from '../../state/certificates/certificates';
import { CertificateSearch } from './cert_search';
import { CertStats } from './cert_stats';
import { CertQuickFilter } from './cert_quick_filter';
import type { QuickFilterOption } from './cert_quick_filter';
import { useCertFacets } from './use_cert_facets';
import { useCertFilters } from './use_cert_filters';
import {
  BROWSER_RESOURCE_TYPE_OPTIONS,
  MONITOR_TYPE_FILTER_OPTIONS,
  PARTY_FILTER_OPTIONS,
} from './cert_filter_options';
import * as labels from './translations';
import { useCertSearch } from './use_cert_search';
import type { CertSort } from './certificates_list';
import { CertificateList } from './certificates_list';
import { useBreadcrumbs } from '../../hooks';

const DEFAULT_PAGE_SIZE = 10;
const LOCAL_STORAGE_KEY = 'xpack.uptime.certList.pageSize';

// Merges global facet counts onto a static option list. While facets are still
// loading (`counts` undefined) options are returned untouched, so no counts render.
const withCounts = (
  options: QuickFilterOption[],
  counts?: CertFacetCount[]
): QuickFilterOption[] => {
  if (!counts) {
    return options;
  }
  const countByValue = new Map(counts.map(({ value, count }) => [value, count]));
  return options.map((option) => ({ ...option, count: countByValue.get(option.value) ?? 0 }));
};

const getPageSizeValue = () => {
  const value = parseInt(localStorage.getItem(LOCAL_STORAGE_KEY) ?? '', 10);
  if (isNaN(value)) {
    return DEFAULT_PAGE_SIZE;
  }
  return value;
};

export const CertificatesPage: React.FC = () => {
  useTrackPageview({ app: 'synthetics', path: 'certificates' });
  useTrackPageview({ app: 'synthetics', path: 'certificates', delay: 15000 });

  useBreadcrumbs([{ text: 'Certificates' }]);

  const [page, setPage] = useState({ index: 0, size: getPageSizeValue() });
  const [sort, setSort] = useState<CertSort>({
    field: 'not_after',
    direction: 'asc',
  });

  // Quick filters and search are persisted in the URL so a filtered view
  // survives a refresh and can be shared.
  const {
    search,
    monitorTypes,
    browserResourceTypes,
    party,
    tags,
    issuers,
    remoteNames,
    expiringWithin,
    setSearch,
    setMonitorTypes,
    setBrowserResourceTypes,
    setParty,
    setTags,
    setIssuers,
    setExpiringWithin,
  } = useCertFilters();

  const dispatch = useDispatch();

  // URL-driven cluster selection — see #273622 for the planned quick filter.
  const facets = useCertFacets(remoteNames);

  const monitorTypeOptions = useMemo(
    () => withCounts(MONITOR_TYPE_FILTER_OPTIONS, facets?.monitorTypes),
    [facets?.monitorTypes]
  );
  const resourceTypeOptions = useMemo(
    () => withCounts(BROWSER_RESOURCE_TYPE_OPTIONS, facets?.resourceTypes),
    [facets?.resourceTypes]
  );
  const partyOptions = useMemo(
    () => withCounts(PARTY_FILTER_OPTIONS, facets?.party),
    [facets?.party]
  );
  // The tag list itself is derived from the cert facets, so only tags that actually
  // appear on certificate-bearing documents are offered (each with its cert count).
  const tagOptions: QuickFilterOption[] = useMemo(
    () => (facets?.tags ?? []).map(({ value, count }) => ({ value, label: value, count })),
    [facets?.tags]
  );
  // Issuer (certificate authority) options are likewise derived from the facets, so
  // only CAs that actually signed a listed certificate are offered, each with a count.
  const issuerOptions: QuickFilterOption[] = useMemo(
    () => (facets?.issuers ?? []).map(({ value, count }) => ({ value, label: value, count })),
    [facets?.issuers]
  );

  // Browser-specific filters are only meaningful when browser certs can appear,
  // i.e. when no monitor-type filter is set (all types) or browser is selected.
  const isBrowserIncluded =
    monitorTypes.length === 0 || monitorTypes.includes(MonitorTypeEnum.BROWSER);

  const resetToFirstPage = () => setPage((prevPage) => ({ ...prevPage, index: 0 }));

  const certificates = useCertSearch({
    search,
    size: page.size,
    pageIndex: page.index,
    sortBy: sort.field,
    direction: sort.direction,
    monitorTypes,
    browserResourceTypes: isBrowserIncluded ? browserResourceTypes : undefined,
    party: isBrowserIncluded ? party : undefined,
    tags,
    issuers,
    notValidAfter: expiringWithin,
    remoteNames,
  });

  useEffect(() => {
    dispatch(setCertificatesTotalAction({ total: certificates.total }));
  }, [certificates.total, dispatch]);

  return (
    <>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem>
          <CertificateSearch
            initialValue={search}
            setSearch={(value) => {
              setSearch(value);
              resetToFirstPage();
            }}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup>
            <CertQuickFilter
              label={labels.MONITOR_TYPE_FILTER}
              dataTestSubj="certMonitorTypeFilterButton"
              options={monitorTypeOptions}
              selectedValues={monitorTypes}
              onChange={(types) => {
                setMonitorTypes(types);
                resetToFirstPage();
              }}
            />
            <CertQuickFilter
              label={labels.TAGS_FILTER}
              dataTestSubj="certTagsFilterButton"
              options={tagOptions}
              selectedValues={tags}
              isDisabled={tagOptions.length === 0}
              disabledTooltip={labels.TAGS_FILTER_NO_TAGS}
              onChange={(values) => {
                setTags(values);
                resetToFirstPage();
              }}
            />
            <CertQuickFilter
              label={labels.ISSUER_FILTER}
              dataTestSubj="certIssuerFilterButton"
              options={issuerOptions}
              selectedValues={issuers}
              isDisabled={issuerOptions.length === 0}
              disabledTooltip={labels.ISSUER_FILTER_NO_ISSUERS}
              onChange={(values) => {
                setIssuers(values);
                resetToFirstPage();
              }}
            />
            <CertQuickFilter
              label={labels.RESOURCE_TYPE_FILTER}
              dataTestSubj="certResourceTypeFilterButton"
              options={resourceTypeOptions}
              selectedValues={browserResourceTypes}
              isDisabled={!isBrowserIncluded}
              disabledTooltip={labels.BROWSER_FILTER_DISABLED_TOOLTIP}
              onChange={(types) => {
                setBrowserResourceTypes(types);
                resetToFirstPage();
              }}
            />
            <CertQuickFilter
              label={labels.PARTY_FILTER}
              dataTestSubj="certPartyFilterButton"
              options={partyOptions}
              selectedValues={party}
              isDisabled={!isBrowserIncluded}
              disabledTooltip={labels.BROWSER_FILTER_DISABLED_TOOLTIP}
              onChange={(values) => {
                setParty(values);
                resetToFirstPage();
              }}
            />
          </EuiFilterGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <CertStats
        counts={facets?.expiringWithin}
        selected={expiringWithin}
        onSelect={(value) => {
          setExpiringWithin(value);
          resetToFirstPage();
        }}
      />
      <EuiSpacer size="m" />
      <CertificateList
        page={page}
        onChange={(pageVal, sortVal) => {
          setPage(pageVal);
          setSort(sortVal);
          localStorage.setItem(LOCAL_STORAGE_KEY, pageVal.size.toString());
        }}
        sort={sort}
        certificates={certificates}
      />
    </>
  );
};
