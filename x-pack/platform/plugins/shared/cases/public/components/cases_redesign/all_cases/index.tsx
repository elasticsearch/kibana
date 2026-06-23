/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { CasesDeepLinkId } from '../../../common/navigation';
import { CaseCallouts } from '../../callouts/case_callouts';
import { useCasesBreadcrumbs } from '../../use_breadcrumbs';
import { AllCasesList } from './all_cases_list';
import { CasesListAppHeader } from './components/cases_list_app_header';

export const AllCases: React.FC = () => {
  useCasesBreadcrumbs(CasesDeepLinkId.cases);

  return (
    <>
      <CaseCallouts />
      <CasesListAppHeader />
      <AllCasesList />
    </>
  );
};
AllCases.displayName = 'AllCases';

// eslint-disable-next-line import/no-default-export
export { AllCases as default };
