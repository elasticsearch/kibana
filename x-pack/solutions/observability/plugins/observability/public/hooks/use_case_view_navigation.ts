/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { generatePath } from 'react-router-dom';
import { useCallback } from 'react';
import { observabilityAppId } from '../../common';
import { useKibana } from '../utils/kibana_react';

export type NavigateToCaseView = (pathParams: { caseId: string }) => void;

const CASE_DEEP_LINK_ID = 'cases';

const generateCaseViewPath = (caseId: string): string => {
  return generatePath('/:caseId', { caseId });
};

export const useCaseViewNavigation = () => {
  const {
    application: { navigateToApp },
  } = useKibana().services;

  const navigateToCaseView = useCallback<NavigateToCaseView>(
    (pathParams) =>
      navigateToApp(observabilityAppId, {
        deepLinkId: CASE_DEEP_LINK_ID,
        path: generateCaseViewPath(pathParams.caseId),
      }),
    [navigateToApp]
  );

  return { navigateToCaseView };
};
