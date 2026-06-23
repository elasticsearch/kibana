/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { CasesDeepLinkId } from '../../../common/navigation';
import { useGetActionLicense } from '../../../containers/use_get_action_license';
import { CaseCallouts } from '../../callouts/case_callouts';
import { useCasesBreadcrumbs } from '../../use_breadcrumbs';
import { getActionLicenseError } from '../../use_push_to_service/helpers';
import { AllCasesList } from './all_cases_list';
import { CasesTableHeader } from '../../all_cases/header';
import { useKibana } from '../../../common/lib/kibana';

export const AllCases: React.FC = () => {
  useCasesBreadcrumbs(CasesDeepLinkId.cases);

  const { docLinks } = useKibana().services;
  const { data: actionLicense = null } = useGetActionLicense();
  const actionsErrors = useMemo(
    () => getActionLicenseError(actionLicense, docLinks),
    [actionLicense, docLinks]
  );

  return (
    <>
      <CaseCallouts />
      <CasesTableHeader actionsErrors={actionsErrors} />
      <AllCasesList />
    </>
  );
};
AllCases.displayName = 'AllCases';

// eslint-disable-next-line import/no-default-export
export { AllCases as default };
