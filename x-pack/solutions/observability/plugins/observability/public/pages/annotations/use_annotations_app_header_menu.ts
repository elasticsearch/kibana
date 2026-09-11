/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import type { AppHeaderMenu } from '@kbn/app-header';
import type { ObservabilityOnboardingLocatorParams } from '@kbn/deeplinks-observability';
import { OBSERVABILITY_ONBOARDING_LOCATOR } from '@kbn/deeplinks-observability';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../utils/kibana_react';

export const CREATE_ANNOTATION_BUTTON_TEST_SUBJ = 'o11yRenderToolsRightCreateAnnotationButton';
export const ADD_DATA_BUTTON_TEST_SUBJ = 'o11yAnnotationsHeaderAddDataButton';

const addDataButtonLabel = i18n.translate('xpack.observability.home.addData', {
  defaultMessage: 'Add data',
});

const createAnnotationButtonLabel = i18n.translate(
  'xpack.observability.renderToolsRight.createAnnotationButtonLabel',
  { defaultMessage: 'Create annotation' }
);

const missingCreatePermissions = i18n.translate(
  'xpack.observability.createAnnotation.missingPermissions',
  { defaultMessage: 'You do not have permission to create annotations' }
);

export function useAnnotationsAppHeaderMenu({
  includeCreate,
  canWrite,
  onCreate,
}: {
  includeCreate: boolean;
  canWrite?: boolean;
  onCreate?: () => void;
}): AppHeaderMenu {
  const { share } = useKibana().services;
  const onboardingLocator = share?.url.locators.get<ObservabilityOnboardingLocatorParams>(
    OBSERVABILITY_ONBOARDING_LOCATOR
  );
  const addDataHref = onboardingLocator?.useUrl({});

  return useMemo<AppHeaderMenu>(() => {
    return {
      items: addDataHref
        ? [
            {
              id: 'addData',
              label: addDataButtonLabel,
              iconType: 'indexOpen',
              href: addDataHref,
              testId: ADD_DATA_BUTTON_TEST_SUBJ,
            },
          ]
        : undefined,
      primaryActionItem:
        includeCreate && onCreate
          ? {
              id: 'createAnnotation',
              label: createAnnotationButtonLabel,
              iconType: 'plusCircle',
              testId: CREATE_ANNOTATION_BUTTON_TEST_SUBJ,
              disableButton: !canWrite,
              tooltipContent: !canWrite ? missingCreatePermissions : undefined,
              run: onCreate,
            }
          : undefined,
    };
  }, [addDataHref, canWrite, includeCreate, onCreate]);
}
