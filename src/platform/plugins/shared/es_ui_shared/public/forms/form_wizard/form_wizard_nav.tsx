/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButton, EuiButtonEmpty, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';

interface Props {
  activeStepIndex: number;
  lastStep: number;
  onBack: () => void;
  onNext: () => void;
  isSaving?: boolean;
  isNextButtonDisabled?: boolean;
  isStepValid?: boolean;
  texts?: Partial<NavTexts>;
  getRightContent?: () => JSX.Element | null | undefined;
}

export interface NavTexts {
  back: string | JSX.Element;
  next: string | JSX.Element;
  save: string | JSX.Element;
  saving: string | JSX.Element;
}

const DEFAULT_TEXTS = {
  back: i18n.translate('esUi.formWizard.backButtonLabel', { defaultMessage: 'Back' }),
  next: i18n.translate('esUi.formWizard.nextButtonLabel', { defaultMessage: 'Next' }),
  save: i18n.translate('esUi.formWizard.saveButtonLabel', { defaultMessage: 'Save' }),
  saving: i18n.translate('esUi.formWizard.savingButtonLabel', { defaultMessage: 'Saving...' }),
};

export const FormWizardNav = ({
  activeStepIndex,
  lastStep,
  isStepValid,
  isSaving,
  isNextButtonDisabled,
  onBack,
  onNext,
  texts,
  getRightContent,
}: Props) => {
  const isLastStep = activeStepIndex === lastStep;
  const labels = {
    ...DEFAULT_TEXTS,
    ...texts,
  };

  const nextButtonLabel = isLastStep
    ? Boolean(isSaving)
      ? labels.saving
      : labels.save
    : labels.next;

  const rightContent = getRightContent !== undefined ? getRightContent() : undefined;

  return (
    <EuiFlexGroup justifyContent="spaceBetween">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup>
          {/* Back button */}
          {activeStepIndex > 0 ? (
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                iconType="chevronSingleLeft"
                onClick={onBack}
                data-test-subj="backButton"
                disabled={isStepValid === false}
              >
                {labels.back}
              </EuiButtonEmpty>
            </EuiFlexItem>
          ) : null}

          {/* Next button */}
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              iconType={isLastStep ? 'check' : 'chevronSingleRight'}
              onClick={onNext}
              iconSide={isLastStep ? 'left' : 'right'}
              disabled={isStepValid === false || isNextButtonDisabled}
              data-test-subj="nextButton"
              isLoading={isSaving}
            >
              {nextButtonLabel}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>

      {rightContent && <EuiFlexItem grow={false}>{rightContent}</EuiFlexItem>}
    </EuiFlexGroup>
  );
};
