/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPageSection, EuiSpacer, EuiTab, EuiTabs } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';
import {
  paths,
  SLOS_COMPOSITE_PATH,
  SLOS_PATH,
  SLOS_WELCOME_PATH,
} from '@kbn/slo-shared-plugin/common/locators/paths';
import React, { useEffect } from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { SloAppHeader } from '../../components/slo_app_header/slo_app_header';
import { SloOutdatedCallout } from '../../components/slo/slo_outdated_callout';
import { useCompositeSloEnabled } from '../../hooks/use_composite_slo_enabled';
import { useHasSlos } from '../../hooks/use_has_slos';
import { useKibana } from '../../hooks/use_kibana';
import { useLicense } from '../../hooks/use_license';
import { usePermissions } from '../../hooks/use_permissions';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { LoadingState } from '../../components/loading_state';
import { CompositeSloList } from './components/composite_slo/composite_slo_list';
import { useCreateSloPrimaryAction } from './components/common/create_slo_btn';
import { SloList } from './components/slo_list';
import { SloListSearchBar } from './components/slo_list_search_bar';
import { SLOsOverview } from './components/slos_overview/slos_overview';

const pageTitle = i18n.translate('xpack.slo.slosPage.', { defaultMessage: 'SLOs' });

export const SLO_PAGE_ID = 'slo-page-container';

type TabId = 'slos' | 'compositeSlos';

const tabs: Array<{ id: TabId; label: string; path: string }> = [
  {
    id: 'slos',
    label: i18n.translate('xpack.slo.slosPage.tabs.slos', { defaultMessage: 'SLOs' }),
    path: SLOS_PATH,
  },
  {
    id: 'compositeSlos',
    label: i18n.translate('xpack.slo.slosPage.tabs.compositeSlos', {
      defaultMessage: 'Composite SLOs',
    }),
    path: SLOS_COMPOSITE_PATH,
  },
];

export function SlosPage() {
  const {
    http: { basePath },
    serverless,
  } = useKibana().services;
  const { ObservabilityPageTemplate } = usePluginContext();
  const { hasAtLeast } = useLicense();
  const { data: permissions } = usePermissions();
  const history = useHistory();
  const location = useLocation();
  const isCompositeSloEnabled = useCompositeSloEnabled();
  const isCompositePath = location.pathname === SLOS_COMPOSITE_PATH;
  const selectedTabId: TabId = isCompositePath && isCompositeSloEnabled ? 'compositeSlos' : 'slos';

  useEffect(() => {
    if (isCompositePath && !isCompositeSloEnabled) {
      history.replace(SLOS_PATH);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompositePath, isCompositeSloEnabled]);

  const { hasSlos, isLoading, isError } = useHasSlos();

  useBreadcrumbs(
    [
      {
        href: basePath.prepend(paths.slos),
        text: i18n.translate('xpack.slo.breadcrumbs.slosLinkText', {
          defaultMessage: 'SLOs',
        }),
        deepLinkId: 'slo',
      },
    ],
    { serverless }
  );

  useEffect(() => {
    if ((!isLoading && !hasSlos) || hasAtLeast('platinum') === false || isError) {
      history.replace(SLOS_WELCOME_PATH);
    }

    if (permissions?.hasAllReadRequested === false) {
      history.replace(SLOS_WELCOME_PATH);
    }
  }, [history, basePath, hasAtLeast, isError, isLoading, hasSlos, permissions]);

  const { primaryActionItem, templatesFlyout } = useCreateSloPrimaryAction();

  return (
    <ObservabilityPageTemplate data-test-subj="slosPage" pageSectionProps={{ paddingSize: 'none' }}>
      <SloAppHeader title={pageTitle} primaryActionItem={hasSlos ? primaryActionItem : undefined} />
      {templatesFlyout}
      <EuiPageSection paddingSize="l" restrictWidth={false}>
        {isLoading ? (
          <LoadingState dataTestSubj="sloListPageLoading" />
        ) : (
          <>
            <SloOutdatedCallout />
            {isCompositeSloEnabled && (
              <>
                <EuiTabs>
                  {tabs.map(({ id, label, path }) => (
                    <EuiTab
                      key={id}
                      isSelected={id === selectedTabId}
                      onClick={() => history.push(path)}
                      data-test-subj={`sloTab-${id}`}
                    >
                      {label}
                    </EuiTab>
                  ))}
                </EuiTabs>
                <EuiSpacer size="m" />
              </>
            )}
            {selectedTabId === 'slos' && (
              <>
                <SloListSearchBar />
                <EuiSpacer size="m" />
                <SLOsOverview />
                <EuiSpacer size="m" />
                <SloList />
              </>
            )}
            {isCompositeSloEnabled && selectedTabId === 'compositeSlos' && <CompositeSloList />}
          </>
        )}
      </EuiPageSection>
    </ObservabilityPageTemplate>
  );
}
