/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  ATTACH_ALERT_TO_CASE_BUTTON,
  CREATE_NEW_CASE_FROM_MODAL_BUTTON,
  TAKE_ACTION_BTN,
} from '../screens/alerts';
import { createCase } from './create_new_case';
import {
  ALERTS_STEP_GUIDE_BUTTON,
  COMPLETE_SIEM_GUIDE_BUTTON,
  COMPLETION_POPOVER,
  GLOBAL_TOUR_BUTTON,
  NEXT_STEP_BUTTON,
} from '../screens/guided_onboarding';

export const goToNextStep = (currentStep: number) => {
  cy.get(
    `[data-test-subj="tourStepAnchor-alertsCases-${currentStep}"] ${NEXT_STEP_BUTTON}`
  ).click();
};

export const finishTour = () => {
  cy.get(COMPLETION_POPOVER).should('exist');
  cy.get(GLOBAL_TOUR_BUTTON).click();
  cy.get(ALERTS_STEP_GUIDE_BUTTON).click();
  cy.get(COMPLETE_SIEM_GUIDE_BUTTON).click();
};

export const addToCase = () => {
  cy.get(TAKE_ACTION_BTN).click();
  cy.get(ATTACH_ALERT_TO_CASE_BUTTON).click();
  cy.get(CREATE_NEW_CASE_FROM_MODAL_BUTTON).click();
};

export const goToStep = (step: number) => {
  for (let i = 1; i < 6; i++) {
    if (i === step) {
      break;
    }
    goToNextStep(i);
  }
  if (step === 7) {
    createCase();
  }
};
