/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPageSection, EuiSpacer } from '@elastic/eui';
import type { ChromeBreadcrumb } from '@kbn/core-chrome-browser';
import type { IBasePath } from '@kbn/core-http-browser';
import { usePageReady } from '@kbn/ebt-tools';
import { i18n } from '@kbn/i18n';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';
import { useIsMutating } from '@kbn/react-query';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import dedent from 'dedent';
import React, { useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { OBSERVABILITY_SLO_ATTACHMENT_TYPE_ID } from '@kbn/observability-agent-builder-plugin/public';
import { SloAppHeader } from '../../components/slo_app_header/slo_app_header';
import { LoadingState } from '../../components/loading_state';
import { ActionModalProvider } from '../../context/action_modal';
import { useFetchSloDetails } from '../../hooks/use_fetch_slo_details';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { usePermissions } from '../../hooks/use_permissions';
import { usePluginContext } from '../../hooks/use_plugin_context';
import PageNotFound from '../404';
import { useAutoRefreshOverflowItem } from './components/auto_refresh_button';
import { useSloDetailsActionsPrimary } from './components/header_control';
import { HeaderTitle } from './components/header_title';
import { SloDetails } from './components/slo_details';
import { useAutoRefreshState } from './hooks/use_auto_refresh_state';
import { useGetQueryParams } from './hooks/use_get_query_params';
import { useSelectedTab } from './hooks/use_selected_tab';
import { useSloDetailsAppHeader } from './hooks/use_slo_details_app_header';
import { useSloDetailsTabs } from './hooks/use_slo_details_tabs';
import type { SloDetailsPathParams } from './types';

const slosBackLabel = i18n.translate('xpack.slo.breadcrumbs.slosLinkText', {
  defaultMessage: 'SLOs',
});

const detailsFallbackTitle = i18n.translate('xpack.slo.breadcrumbs.sloDetailsLinkText', {
  defaultMessage: 'Details',
});

export function SloDetailsPage() {
  const {
    application: { navigateToUrl },
    http: { basePath },
    observabilityAIAssistant,
    serverless,
    agentBuilder,
  } = useKibana().services;
  const { ObservabilityPageTemplate } = usePluginContext();
  const { hasAtLeast } = useLicense();
  const hasRightLicense = hasAtLeast('platinum');
  const { data: permissions } = usePermissions();

  const { sloId } = useParams<SloDetailsPathParams>();
  const { instanceId: sloInstanceId, remoteName } = useGetQueryParams();
  const [isAutoRefreshing, setAutoRefresh] = useAutoRefreshState();

  const {
    isLoading,
    data: slo,
    isRefetching,
  } = useFetchSloDetails({
    sloId,
    remoteName,
    instanceId: sloInstanceId,
    shouldRefetch: isAutoRefreshing,
  });
  const isDeleting = Boolean(useIsMutating(['deleteSlo']));

  const { selectedTabId } = useSelectedTab();

  const { appHeaderTabs } = useSloDetailsTabs({
    slo,
    isAutoRefreshing,
    selectedTabId,
  });

  useEffect(() => {
    if (!slo || !observabilityAIAssistant) {
      return;
    }

    return observabilityAIAssistant.service.setScreenContext({
      screenDescription: dedent(`
        The user is looking at the detail page for the following SLO

        Name: ${slo.name}.
        Id: ${slo.id}
        Instance Id: ${slo.instanceId}
        Description: ${slo.description}
        Observed value: ${slo.summary.sliValue}
        Error budget remaining: ${slo.summary.errorBudget.remaining}
        Status: ${slo.summary.status}
      `),
      data: [
        {
          name: 'slo',
          description: 'The SLO and its metadata',
          value: slo,
        },
      ],
    });
  }, [observabilityAIAssistant, slo]);

  // Configure agent builder global flyout with the SLO attachment
  useEffect(() => {
    if (!agentBuilder || !slo) {
      return;
    }

    agentBuilder.setChatConfig({
      attachments: [
        {
          type: OBSERVABILITY_SLO_ATTACHMENT_TYPE_ID,
          data: {
            sloId: slo.id,
            remoteName,
            sloInstanceId,
            attachmentLabel: i18n.translate('xpack.slo.sloDetails.sloAttachmentLabel', {
              defaultMessage: '{sloName} SLO',
              values: { sloName: slo.name },
            }),
          },
        },
      ],
    });

    return () => {
      agentBuilder.clearChatConfig();
    };
  }, [agentBuilder, sloId, sloInstanceId, remoteName, slo]);

  useEffect(() => {
    if (hasRightLicense === false || permissions?.hasAllReadRequested === false) {
      navigateToUrl(basePath.prepend(paths.slosWelcome));
    }
  }, [hasRightLicense, permissions, navigateToUrl, basePath]);

  usePageReady({
    isReady: !isLoading && slo !== undefined,
    isRefreshing: isRefetching,
    meta: {
      description: '[ttfmp_slos] The SLO details page has loaded and SLO data is present.',
    },
  });

  useBreadcrumbs(getBreadcrumbs(basePath, slo), { serverless });

  const isSloNotFound = !isLoading && slo === undefined;
  if (isSloNotFound) {
    return <PageNotFound />;
  }

  const isPerformingAction = isLoading || isDeleting;

  return (
    <ObservabilityPageTemplate
      data-test-subj="sloDetailsPage"
      pageSectionProps={{ paddingSize: 'none' }}
    >
      <ActionModalProvider>
        {slo ? (
          <SloDetailsPageContent
            slo={slo}
            isAutoRefreshing={isAutoRefreshing}
            setAutoRefresh={setAutoRefresh}
            isPerformingAction={isPerformingAction}
            selectedTabId={selectedTabId}
            tabs={appHeaderTabs}
          />
        ) : (
          <>
            <SloAppHeader
              title={detailsFallbackTitle}
              back={{ href: basePath.prepend(paths.slos), label: slosBackLabel }}
            />
            <EuiPageSection paddingSize="l" restrictWidth={false}>
              <HeaderTitle isLoading={isPerformingAction} slo={slo} />
              <LoadingState dataTestSubj="sloDetailsLoading" />
            </EuiPageSection>
          </>
        )}
      </ActionModalProvider>
    </ObservabilityPageTemplate>
  );
}

function SloDetailsPageContent({
  slo,
  isAutoRefreshing,
  setAutoRefresh,
  isPerformingAction,
  selectedTabId,
  tabs,
}: {
  slo: SLOWithSummaryResponse;
  isAutoRefreshing: boolean;
  setAutoRefresh: (value: boolean | ((val: boolean) => boolean)) => void;
  isPerformingAction: boolean;
  selectedTabId: ReturnType<typeof useSelectedTab>['selectedTabId'];
  tabs: ReturnType<typeof useSloDetailsTabs>['appHeaderTabs'];
}) {
  const {
    http: { basePath },
  } = useKibana().services;
  const { primaryActionItem, flyouts } = useSloDetailsActionsPrimary({ slo });
  const { badges, metadata } = useSloDetailsAppHeader(slo);
  const onToggleAutoRefresh = useCallback(() => {
    setAutoRefresh((prev) => !prev);
  }, [setAutoRefresh]);
  const autoRefreshItem = useAutoRefreshOverflowItem({
    isAutoRefreshing,
    onToggle: onToggleAutoRefresh,
  });

  return (
    <>
      <SloAppHeader
        title={slo.name}
        back={{ href: basePath.prepend(paths.slos), label: slosBackLabel }}
        primaryActionItem={primaryActionItem}
        extraItems={[autoRefreshItem]}
        tabs={tabs}
        badges={badges}
        metadata={metadata}
      />
      {flyouts}
      <EuiPageSection paddingSize="l" restrictWidth={false}>
        <HeaderTitle isLoading={isPerformingAction} slo={slo} omitAppHeaderItems />
        <EuiSpacer size="m" />
        <SloDetails slo={slo} isAutoRefreshing={isAutoRefreshing} selectedTabId={selectedTabId} />
      </EuiPageSection>
    </>
  );
}

function getBreadcrumbs(
  basePath: IBasePath,
  slo: SLOWithSummaryResponse | undefined
): ChromeBreadcrumb[] {
  return [
    {
      href: basePath.prepend(paths.slos),
      text: slosBackLabel,
      deepLinkId: 'slo',
    },
    {
      text: slo?.name ?? detailsFallbackTitle,
    },
  ];
}
