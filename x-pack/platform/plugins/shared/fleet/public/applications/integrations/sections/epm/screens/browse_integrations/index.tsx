/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { EuiFlexItem, EuiFlexGroup, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { useLocation, useHistory } from 'react-router-dom';

import { useBreadcrumbs, useStartServices } from '../../../../hooks';
import { NoEprCallout } from '../../components/no_epr_callout';
import { categoryExists } from '../home';

import { ResponsivePackageGrid } from './components/responsive_package_grid';
import { SearchAndFiltersBar } from './components/search_and_filters_bar';
import { Sidebar } from './components/side_bar';
import { useBrowseIntegrationHook } from './hooks';
import {
  useSetUrlCategory,
  useUrlDefaultCategories,
  useSetUrlDefaultCategories,
} from './hooks/url_categories';
import { NoDataPrompt } from './components/no_data_prompt';
import {
  ManageIntegrationsTable,
  type CreatedIntegrationRow,
} from './components/manage_integrations_table';

const OBLT_DEFAULT_CATEGORIES = ['opentelemetry', 'observability'];

export const BrowseIntegrationsPage: React.FC<{ prereleaseIntegrationsEnabled: boolean }> = ({
  prereleaseIntegrationsEnabled,
}) => {
  useBreadcrumbs('integrations_all');

  const { automaticImport, application, cloud } = useStartServices();
  const { pathname, search } = useLocation();
  const history = useHistory();
  const euiTheme = useEuiTheme();

  const automaticImportCapabilities = (
    application.capabilities as Record<string, { view?: boolean } | undefined>
  ).automatic_import;
  const canReadAutomaticImportIntegrations =
    automaticImportCapabilities?.view ?? Boolean(automaticImport);

  const useGetAllIntegrationsHook = canReadAutomaticImportIntegrations
    ? automaticImport?.hooks.useGetAllIntegrations ?? useEmptyAllIntegrations
    : useEmptyAllIntegrations;
  const {
    integrations,
    isInitialLoading: isLoadingCreatedIntegrations,
    isError: isCreatedIntegrationsError,
    refetch: refetchCreatedIntegrations,
  } = useGetAllIntegrationsHook();
  const hasCreatedIntegrations = integrations.length > 0;
  const isManageIntegrationsView = useMemo(() => {
    const params = new URLSearchParams(search);
    return canReadAutomaticImportIntegrations && params.get('view') === 'manage';
  }, [canReadAutomaticImportIntegrations, search]);

  const manageIntegrationsHref = useMemo(() => {
    const params = new URLSearchParams(search);
    params.set('view', 'manage');
    return `${pathname}?${params.toString()}`;
  }, [pathname, search]);
  const onManageIntegrationsClick = useCallback(
    (ev: React.MouseEvent<HTMLAnchorElement>) => {
      ev.preventDefault();
      history.push(manageIntegrationsHref);
    },
    [history, manageIntegrationsHref]
  );

  const setUrlCategory = useSetUrlCategory();
  const setUrlDefaultCategories = useSetUrlDefaultCategories();
  const urlDefaultCategories = useUrlDefaultCategories();
  const {
    allCategories,
    initialSelectedCategory,
    selectedCategories,
    mainCategories,
    isLoading,
    isLoadingCategories,
    isLoadingAllPackages,
    isLoadingAppendCustomIntegrations,
    eprPackageLoadingError,
    eprCategoryLoadingError,
    filteredCards,
    onCategoryChange,
    availableSubCategories,
  } = useBrowseIntegrationHook({ prereleaseIntegrationsEnabled });

  // Tracks whether we've already auto-redirected to the default categories this page visit.
  // Without this, clicking "All categories" (which clears URL categories) would immediately
  // trigger another redirect back to the defaults — preventing the user from removing them.
  const hasAutoRedirectedRef = useRef(false);

  const isObservability = cloud?.serverless?.projectType === 'observability';

  useEffect(() => {
    if (
      hasAutoRedirectedRef.current ||
      !isObservability ||
      isLoading ||
      isManageIntegrationsView ||
      initialSelectedCategory ||
      urlDefaultCategories.length > 0
    )
      return;
    // Mark as redirected regardless of whether valid defaults exist, so the
    // effect does not keep re-running when none of the default categories exist
    // in the catalog.
    hasAutoRedirectedRef.current = true;
    const validDefaults = OBLT_DEFAULT_CATEGORIES.filter((cat) =>
      categoryExists(cat, allCategories)
    );
    if (validDefaults.length > 0) {
      setUrlDefaultCategories(validDefaults, { replace: true });
    }
  }, [
    isObservability,
    isLoading,
    isManageIntegrationsView,
    initialSelectedCategory,
    urlDefaultCategories.length,
    allCategories,
    setUrlDefaultCategories,
  ]);

  if (!isLoading && !categoryExists(initialSelectedCategory, allCategories)) {
    setUrlCategory({ category: '' }, { replace: true });
    return null;
  }

  let noEprCallout;
  if (eprPackageLoadingError || eprCategoryLoadingError) {
    const error = eprPackageLoadingError || eprCategoryLoadingError;
    noEprCallout = (
      <EuiFlexItem grow={1}>
        <NoEprCallout statusCode={error?.statusCode} />
        <EuiSpacer size="s" />
      </EuiFlexItem>
    );
  }

  return (
    <EuiFlexGroup
      justifyContent="flexEnd"
      alignItems="flexStart"
      gutterSize="none"
      data-test-subj="epmList.integrationCards"
    >
      <Sidebar
        isLoading={isLoading}
        categories={mainCategories}
        selectedCategories={selectedCategories}
        onCategoryChange={onCategoryChange}
        CreateIntegrationCardButton={
          canReadAutomaticImportIntegrations
            ? automaticImport?.components.CreateIntegrationSideCardButton
            : undefined
        }
        hasCreatedIntegrations={hasCreatedIntegrations}
        isLoadingCreatedIntegrations={isLoadingCreatedIntegrations}
        manageIntegrationsHref={manageIntegrationsHref}
        onManageIntegrationsClick={onManageIntegrationsClick}
      />
      <EuiFlexItem grow={5}>
        <EuiFlexGroup direction="column" gutterSize="none">
          {!isManageIntegrationsView && (
            <SearchAndFiltersBar
              categories={mainCategories}
              availableSubCategories={availableSubCategories}
            />
          )}
          {noEprCallout ? noEprCallout : null}
          <EuiFlexItem
            grow={1}
            data-test-subj="epmList.mainColumn"
            style={{
              position: 'relative',
              backgroundColor: euiTheme.euiTheme.colors.backgroundBasePlain,
            }}
          >
            {isManageIntegrationsView ? (
              <>
                <EuiSpacer size="m" />
                <ManageIntegrationsTable
                  integrations={integrations}
                  isLoading={isLoadingCreatedIntegrations}
                  isError={isCreatedIntegrationsError}
                  onRefetch={refetchCreatedIntegrations}
                  prereleaseIntegrationsEnabled={prereleaseIntegrationsEnabled}
                />
              </>
            ) : filteredCards.length === 0 && !isLoading ? (
              <NoDataPrompt />
            ) : (
              <ResponsivePackageGrid
                items={filteredCards}
                isLoading={
                  isLoadingCategories || isLoadingAllPackages || isLoadingAppendCustomIntegrations
                }
              />
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

function useEmptyAllIntegrations() {
  return {
    integrations: [] as CreatedIntegrationRow[],
    isInitialLoading: false,
    isError: false,
    error: null,
    refetch: () => {},
  };
}
