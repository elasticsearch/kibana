/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useState } from 'react';
import type { EuiStepStatus } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPageBody,
  EuiSpacer,
  EuiSteps,
  EuiSwitch,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { DataFrameAnalyticsId } from '@kbn/ml-data-frame-analytics-utils';
import { useDataSource } from '../../../contexts/ml/data_source_context';
import { useMlApi } from '../../../contexts/kibana';
import { useCreateAnalyticsForm } from '../analytics_management/hooks/use_create_analytics_form';
import { CreateAnalyticsAdvancedEditor } from './components/create_analytics_advanced_editor';
import {
  AdvancedStep,
  ConfigurationStep,
  CreateStep,
  DetailsStep,
  ValidationStepWrapper,
} from './components';
import { MlAppHeader } from '../../../components/ml_app_header';

export enum ANALYTICS_STEPS {
  CONFIGURATION,
  ADVANCED,
  DETAILS,
  VALIDATION,
  CREATE,
}

interface Props {
  jobId?: DataFrameAnalyticsId;
}

export const Page: FC<Props> = ({ jobId }) => {
  const mlApi = useMlApi();
  const [currentStep, setCurrentStep] = useState<ANALYTICS_STEPS>(ANALYTICS_STEPS.CONFIGURATION);
  const [activatedSteps, setActivatedSteps] = useState<boolean[]>([
    true,
    false,
    false,
    false,
    false,
  ]);

  const { selectedDataView } = useDataSource();

  const createAnalyticsForm = useCreateAnalyticsForm();
  const { state } = createAnalyticsForm;
  const { isAdvancedEditorEnabled, disableSwitchToForm, isJobCreated } = state;
  const { jobType } = state.form;
  const { initiateWizard, setJobClone, switchToAdvancedEditor, switchToForm } =
    createAnalyticsForm.actions;

  useEffect(() => {
    initiateWizard();

    if (selectedDataView) {
      (async function () {
        if (jobId !== undefined) {
          const analyticsConfigs = await mlApi.dataFrameAnalytics.getDataFrameAnalytics(
            jobId,
            true
          );
          if (
            Array.isArray(analyticsConfigs.data_frame_analytics) &&
            analyticsConfigs.data_frame_analytics.length > 0
          ) {
            const clonedJobConfig: any = analyticsConfigs.data_frame_analytics[0];
            await setJobClone(clonedJobConfig);
          }
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activatedSteps[currentStep] === false) {
      activatedSteps.splice(currentStep, 1, true);
      setActivatedSteps(activatedSteps);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  const analyticsWizardSteps = [
    {
      title: i18n.translate('xpack.ml.dataframe.analytics.creation.configurationStepTitle', {
        defaultMessage: 'Configuration',
      }),
      children: (
        <ConfigurationStep
          {...createAnalyticsForm}
          isClone={jobId !== undefined}
          setCurrentStep={setCurrentStep}
          step={currentStep}
          stepActivated={activatedSteps[ANALYTICS_STEPS.CONFIGURATION]}
          sourceDataViewTitle={selectedDataView.getIndexPattern()}
        />
      ),
      status:
        currentStep >= ANALYTICS_STEPS.CONFIGURATION ? undefined : ('incomplete' as EuiStepStatus),
    },
    {
      title: i18n.translate('xpack.ml.dataframe.analytics.creation.advancedStepTitle', {
        defaultMessage: 'Additional options',
      }),
      children: (
        <AdvancedStep
          {...createAnalyticsForm}
          setCurrentStep={setCurrentStep}
          step={currentStep}
          stepActivated={activatedSteps[ANALYTICS_STEPS.ADVANCED]}
        />
      ),
      status: currentStep >= ANALYTICS_STEPS.ADVANCED ? undefined : ('incomplete' as EuiStepStatus),
    },
    {
      title: i18n.translate('xpack.ml.dataframe.analytics.creation.detailsStepTitle', {
        defaultMessage: 'Job details',
      }),
      children: (
        <DetailsStep
          {...createAnalyticsForm}
          setCurrentStep={setCurrentStep}
          step={currentStep}
          stepActivated={activatedSteps[ANALYTICS_STEPS.DETAILS]}
        />
      ),
      status: currentStep >= ANALYTICS_STEPS.DETAILS ? undefined : ('incomplete' as EuiStepStatus),
    },
    {
      title: i18n.translate('xpack.ml.dataframe.analytics.creation.validationStepTitle', {
        defaultMessage: 'Validation',
      }),
      children: (
        <ValidationStepWrapper
          {...createAnalyticsForm}
          setCurrentStep={setCurrentStep}
          step={currentStep}
          stepActivated={activatedSteps[ANALYTICS_STEPS.VALIDATION]}
        />
      ),
      status:
        currentStep >= ANALYTICS_STEPS.VALIDATION ? undefined : ('incomplete' as EuiStepStatus),
    },
    {
      title: i18n.translate('xpack.ml.dataframe.analytics.creation.createStepTitle', {
        defaultMessage: 'Create',
      }),
      children: <CreateStep {...createAnalyticsForm} step={currentStep} />,
      status: currentStep >= ANALYTICS_STEPS.CREATE ? undefined : ('incomplete' as EuiStepStatus),
    },
  ];

  return (
    <div data-test-subj="mlAnalyticsCreationContainer">
      <MlAppHeader
        title={
          jobId === undefined
            ? i18n.translate('xpack.ml.dataframe.analytics.creationPageTitle', {
                defaultMessage: 'Create job',
              })
            : i18n.translate('xpack.ml.dataframe.analytics.clone.creationPageTitle', {
                defaultMessage: 'Clone job from {jobId}',
                values: { jobId },
              })
        }
      />
      <EuiPageBody restrictWidth={1200}>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFlexGroup direction="column" gutterSize="none">
              <EuiFlexItem grow={false}>
                <h2>
                  <FormattedMessage
                    id="xpack.ml.dataframe.analytics.creationPageSourceIndexTitle"
                    defaultMessage="Source data view: {dataViewTitle}"
                    values={{ dataViewTitle: selectedDataView.getIndexPattern() }}
                  />
                </h2>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiFormRow
              helpText={
                disableSwitchToForm &&
                i18n.translate('xpack.ml.dataframe.analytics.create.jsonEditorDisabledSwitchText', {
                  defaultMessage:
                    'Configuration contains advanced fields not supported by the form. You cannot switch back to the form.',
                })
              }
            >
              <EuiSwitch
                disabled={jobType === undefined || disableSwitchToForm || isJobCreated}
                label={i18n.translate(
                  'xpack.ml.dataframe.analytics.create.switchToJsonEditorSwitch',
                  {
                    defaultMessage: 'Switch to json editor',
                  }
                )}
                checked={isAdvancedEditorEnabled}
                onChange={(e) => {
                  if (e.target.checked === true) {
                    switchToAdvancedEditor();
                  } else {
                    switchToForm();
                  }
                }}
                data-test-subj="mlAnalyticsCreateJobWizardAdvancedEditorSwitch"
              />
            </EuiFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        {isAdvancedEditorEnabled === true && (
          <CreateAnalyticsAdvancedEditor {...createAnalyticsForm} />
        )}
        {isAdvancedEditorEnabled === false && (
          <EuiSteps data-test-subj="mlAnalyticsCreateJobWizardSteps" steps={analyticsWizardSteps} />
        )}
      </EuiPageBody>
    </div>
  );
};
