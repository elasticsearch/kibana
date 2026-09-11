/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPageSection } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useEffect } from 'react';
import { SloAppHeader } from '../../components/slo_app_header/slo_app_header';
import { LoadingState } from '../../components/loading_state';
import { ActionModalProvider } from '../../context/action_modal';
import { useFetchSloDefinitions } from '../../hooks/use_fetch_slo_definitions';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { usePermissions } from '../../hooks/use_permissions';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { useSloManagementActionsPrimary } from './components/header_control/header_control';
import {
  SloManagementTabContent,
  useActiveManagementTab,
  useSloManagementHeaderTabs,
} from './components/slo_management_tabs';

const pageTitle = i18n.translate('xpack.slo.managementPage.pageTitle', {
  defaultMessage: 'SLO Management',
});

const slosBackLabel = i18n.translate('xpack.slo.breadcrumbs.sloTitle', {
  defaultMessage: 'SLOs',
});

export function SloManagementPage() {
  const {
    http: { basePath },
    serverless,
    application: { navigateToUrl },
  } = useKibana().services;
  const { ObservabilityPageTemplate } = usePluginContext();
  const { data: permissions } = usePermissions();
  const { hasAtLeast } = useLicense();
  const {
    isLoading,
    isError,
    data: { total } = { total: 0 },
  } = useFetchSloDefinitions({ perPage: 0 });

  useEffect(() => {
    if (
      hasAtLeast('platinum') === false ||
      permissions?.hasAllReadRequested === false ||
      (!isLoading && total === 0) ||
      isError
    ) {
      navigateToUrl(basePath.prepend(paths.slosWelcome));
    }
  }, [basePath, hasAtLeast, isError, isLoading, navigateToUrl, total, permissions]);

  useBreadcrumbs(
    [
      {
        href: basePath.prepend(paths.slos),
        text: i18n.translate('xpack.slo.breadcrumbs.sloTitle', {
          defaultMessage: 'SLOs',
        }),
        deepLinkId: 'slo',
      },
      {
        text: i18n.translate('xpack.slo.breadcrumbs.managementTitle', {
          defaultMessage: 'Management',
        }),
      },
    ],
    { serverless }
  );

  return (
    <ObservabilityPageTemplate
      data-test-subj="managementPage"
      pageSectionProps={{ paddingSize: 'none' }}
    >
      <ActionModalProvider>
        <SloManagementPageContent isLoading={isLoading} hasSlos={total > 0} />
      </ActionModalProvider>
    </ObservabilityPageTemplate>
  );
}

function SloManagementPageContent({
  isLoading,
  hasSlos,
}: {
  isLoading: boolean;
  hasSlos: boolean;
}) {
  const {
    http: { basePath },
  } = useKibana().services;
  const activeTab = useActiveManagementTab();
  const tabs = useSloManagementHeaderTabs();
  const actionsPrimary = useSloManagementActionsPrimary();
  const showActions = !isLoading && hasSlos && activeTab === 'definitions';

  return (
    <>
      <SloAppHeader
        title={pageTitle}
        back={{ href: basePath.prepend(paths.slos), label: slosBackLabel }}
        hiddenItemIds={['management']}
        tabs={tabs}
        primaryActionItem={showActions ? actionsPrimary : undefined}
      />
      <EuiPageSection paddingSize="l" restrictWidth={false}>
        {isLoading ? (
          <LoadingState dataTestSubj="sloManagementPageLoading" />
        ) : (
          <SloManagementTabContent />
        )}
      </EuiPageSection>
    </>
  );
}
