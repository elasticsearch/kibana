/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { lazy, Suspense, useCallback } from 'react';
import { Redirect } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';

import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { EuiLoadingSpinner } from '@elastic/eui';
import { AllCases } from '../all_cases';
import { CreateCase } from '../create';
import { ConfigureCases } from '../configure_cases';
import type { CasesRoutesProps } from './types';
import { useCasesContext } from '../cases_context/use_cases_context';
import {
  getCasesConfigurePath,
  getCreateCasePath,
  getCaseViewPath,
  getCaseViewWithCommentPath,
  useAllCasesNavigation,
  useCaseViewNavigation,
  getCasesConfigureCreateTemplatePath,
  getCasesConfigureEditTemplatePath,
  getCasesConfigureFieldLibraryPath,
} from '../../common/navigation';
import { NoPrivilegesPage } from '../no_privileges';
import * as i18n from './translations';
import { useReadonlyHeader } from './use_readonly_header';
import type { CaseViewProps } from '../case_view/types';
import type { CreateCaseFormProps } from '../create/form';
import type { CreateTemplatePageProps } from '../templates_v2/pages/create_template/page';
import type { EditTemplatePageProps } from '../templates_v2/pages/edit_template/page';
import type { AllFieldDefinitionsPageProps } from '../field_library/pages/all_field_definitions_page';
import { KibanaServices } from '../../common/lib/kibana/services';

const CaseViewLazy: FC<CaseViewProps> = lazy(() => import('../case_view'));

const CreateTemplateLazy: FC<CreateTemplatePageProps> = lazy(
  () => import('../templates_v2/pages/create_template/page')
);

const EditTemplateLazy: FC<EditTemplatePageProps> = lazy(
  () => import('../templates_v2/pages/edit_template/page')
);

const AllFieldDefinitionsLazy: FC<AllFieldDefinitionsPageProps> = lazy(
  () => import('../field_library/pages/all_field_definitions_page')
);

// Temporary: placeholder pages for the Cases UX redesign (elastic/security-team#17398).
// These will progressively replace the current pages and the FF will be removed.
const AllCasesRedesignLazy = lazy(() => import('../cases_redesign/all_cases'));
const CaseViewRedesignLazy: FC<CaseViewProps> = lazy(() => import('../cases_redesign/case_view'));
const ConfigureCasesRedesignLazy = lazy(
  () => import('../cases_redesign/configure_cases/configure_cases')
);

const CasesRoutesComponent: React.FC<CasesRoutesProps> = ({ refreshRef, timelineIntegration }) => {
  const { basePath, permissions } = useCasesContext();
  const { navigateToAllCases } = useAllCasesNavigation();
  const { navigateToCaseView } = useCaseViewNavigation();

  useReadonlyHeader();

  const onCreateCaseSuccess: CreateCaseFormProps['onSuccess'] = useCallback(
    async ({ id }) => navigateToCaseView({ detailName: id }),
    [navigateToCaseView]
  );
  const config = KibanaServices.getConfig();
  const isTemplatesEnabled = config?.templates?.enabled ?? false;
  const casesRedesign = {
    list: config?.casesRedesign?.list ?? false,
    details: config?.casesRedesign?.details ?? false,
    settings: config?.casesRedesign?.settings ?? false,
  };

  return (
    <>
      <ReactQueryDevtools initialIsOpen={false} />
      <Routes>
        <Route strict exact path={basePath}>
          {casesRedesign.list ? (
            <Suspense fallback={<EuiLoadingSpinner />}>
              <AllCasesRedesignLazy />
            </Suspense>
          ) : (
            <AllCases />
          )}
        </Route>

        <Route path={getCreateCasePath(basePath)}>
          {permissions.create ? (
            <CreateCase
              onSuccess={onCreateCaseSuccess}
              onCancel={navigateToAllCases}
              timelineIntegration={timelineIntegration}
            />
          ) : (
            <NoPrivilegesPage pageName={i18n.CREATE_CASE_PAGE_NAME} />
          )}
        </Route>

        {isTemplatesEnabled && (
          <Route exact path={getCasesConfigureFieldLibraryPath(basePath)}>
            {permissions.manageTemplates ? (
              <Suspense fallback={<EuiLoadingSpinner />}>
                <AllFieldDefinitionsLazy />
              </Suspense>
            ) : (
              <NoPrivilegesPage pageName={i18n.TEMPLATES_PAGE_NAME} />
            )}
          </Route>
        )}

        {isTemplatesEnabled && (
          <Route exact path={getCasesConfigureCreateTemplatePath(basePath)}>
            {permissions.manageTemplates ? (
              <Suspense fallback={<EuiLoadingSpinner />}>
                <CreateTemplateLazy />
              </Suspense>
            ) : (
              <NoPrivilegesPage pageName={i18n.TEMPLATES_PAGE_NAME} />
            )}
          </Route>
        )}

        {isTemplatesEnabled && (
          <Route exact path={getCasesConfigureEditTemplatePath(basePath)}>
            {permissions.manageTemplates ? (
              <Suspense fallback={<EuiLoadingSpinner />}>
                <EditTemplateLazy />
              </Suspense>
            ) : (
              <NoPrivilegesPage pageName={i18n.TEMPLATES_PAGE_NAME} />
            )}
          </Route>
        )}

        <Route path={getCasesConfigurePath(basePath)}>
          {permissions.settings ? (
            casesRedesign.settings ? (
              <Suspense fallback={<EuiLoadingSpinner />}>
                <ConfigureCasesRedesignLazy />
              </Suspense>
            ) : (
              <ConfigureCases />
            )
          ) : (
            <NoPrivilegesPage pageName={i18n.CONFIGURE_CASES_PAGE_NAME} />
          )}
        </Route>

        {/* NOTE: current case view implementation retains some local state between renders, eg. when going from one case directly to another one. as a short term fix, we are forcing the component remount. */}
        <Route exact path={[getCaseViewWithCommentPath(basePath), getCaseViewPath(basePath)]}>
          <Suspense fallback={<EuiLoadingSpinner />}>
            {casesRedesign.details ? (
              <CaseViewRedesignLazy
                refreshRef={refreshRef}
                timelineIntegration={timelineIntegration}
              />
            ) : (
              <CaseViewLazy refreshRef={refreshRef} timelineIntegration={timelineIntegration} />
            )}
          </Suspense>
        </Route>

        <Route path={basePath}>
          <Redirect to={basePath} />
        </Route>
      </Routes>
    </>
  );
};
CasesRoutesComponent.displayName = 'CasesRoutes';

export const CasesRoutes = React.memo(CasesRoutesComponent);
// eslint-disable-next-line import/no-default-export
export { CasesRoutes as default };
