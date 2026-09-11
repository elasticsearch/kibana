/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiPageSection } from '@elastic/eui';
import { AppHeader } from '@kbn/app-header';
import { useBreadcrumbs } from '@kbn/observability-shared-plugin/public';

import { i18n } from '@kbn/i18n';
import { useAnnotationsPrivileges } from './annotations_privileges';
import { AnnotationsList } from './annotations_list';
import { useAnnotationsAppHeaderMenu } from './use_annotations_app_header_menu';
import { useKibana } from '../../utils/kibana_react';
import { usePluginContext } from '../../hooks/use_plugin_context';
import { paths } from '../../../common/locators/paths';

export const ANNOTATIONS_PAGE_ID = 'annotations-container';

const pageTitle = i18n.translate('xpack.observability.annotations.heading', {
  defaultMessage: 'Annotations',
});

export function AnnotationsPage() {
  const {
    http: { basePath },
    serverless,
  } = useKibana().services;
  const { ObservabilityPageTemplate } = usePluginContext();

  const checkPrivileges = useAnnotationsPrivileges();
  const privilegesMenu = useAnnotationsAppHeaderMenu({ includeCreate: false });

  useBreadcrumbs(
    [
      {
        href: basePath.prepend(paths.observability.annotations),
        text: i18n.translate('xpack.observability.breadcrumbs.annotationsLinkText', {
          defaultMessage: 'Annotations',
        }),
        deepLinkId: 'observability-overview',
      },
    ],
    { serverless }
  );

  return (
    <ObservabilityPageTemplate
      data-test-subj="annotationsPage"
      pageSectionProps={{ paddingSize: 'none' }}
    >
      {checkPrivileges ? (
        <>
          <AppHeader title={pageTitle} menu={privilegesMenu} />
          <EuiPageSection paddingSize="l" restrictWidth={false}>
            {checkPrivileges}
          </EuiPageSection>
        </>
      ) : (
        <AnnotationsList />
      )}
    </ObservabilityPageTemplate>
  );
}
