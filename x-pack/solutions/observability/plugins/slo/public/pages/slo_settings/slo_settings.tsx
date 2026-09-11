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
import React from 'react';
import { SloAppHeader } from '../../components/slo_app_header/slo_app_header';
import { useKibana } from '../../hooks/use_kibana';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { SettingsForm } from './settings_form';

const pageTitle = i18n.translate('xpack.slo.pageHeader.title.', {
  defaultMessage: 'SLOs Settings',
});

const slosBackLabel = i18n.translate('xpack.slo.breadcrumbs.sloLabel', {
  defaultMessage: 'SLOs',
});

export function SloSettingsPage() {
  const {
    http: { basePath },
    serverless,
  } = useKibana().services;
  const { ObservabilityPageTemplate } = usePluginContext();

  useBreadcrumbs(
    [
      {
        href: basePath.prepend(paths.slos),
        text: i18n.translate('xpack.slo.breadcrumbs.sloLabel', {
          defaultMessage: 'SLOs',
        }),
        deepLinkId: 'slo',
      },
      {
        href: basePath.prepend(paths.slosSettings),
        text: i18n.translate('xpack.slo.breadcrumbs.slosSettingsText', {
          defaultMessage: 'Settings',
        }),
      },
    ],
    { serverless }
  );

  return (
    <ObservabilityPageTemplate
      data-test-subj="slosSettingsPage"
      pageSectionProps={{ paddingSize: 'none' }}
    >
      <SloAppHeader
        title={pageTitle}
        hiddenItemIds={['settings']}
        back={{ href: basePath.prepend(paths.slos), label: slosBackLabel }}
      />
      <EuiPageSection paddingSize="l" restrictWidth={false}>
        <SettingsForm />
      </EuiPageSection>
    </ObservabilityPageTemplate>
  );
}
