/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import type { DataStreamOptions } from '../../../../../common/types/data_streams';
import type { TemplateDeserialized } from '../../../../../common';
import { Forms } from '../../../../shared_imports';
import type { WizardContent, WizardSection } from '../template_form';
import { StepReview } from './step_review';

interface Props {
  getTemplateData: (wizardContent: WizardContent) => TemplateDeserialized;
  dataStreamOptions?: DataStreamOptions;
  onSaveBlockedChange: (isBlocked: boolean) => void;
}

export const StepReviewContainer = React.memo(
  ({ getTemplateData, dataStreamOptions, onSaveBlockedChange }: Props) => {
    const { navigateToStep } = Forms.useFormWizardContext<WizardSection>();
    const { getData } = Forms.useMultiContentContext<WizardContent>();

    const wizardContent = getData();
    const template = getTemplateData(wizardContent);

    React.useEffect(() => {
      return () => onSaveBlockedChange(false);
    }, [onSaveBlockedChange]);

    return (
      <StepReview
        template={template}
        navigateToStep={navigateToStep}
        dataStreamOptions={dataStreamOptions}
        onSaveBlockedChange={onSaveBlockedChange}
      />
    );
  }
);
