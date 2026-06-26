/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer, EuiStepsHorizontal } from '@elastic/eui';
import React, { useCallback, useReducer } from 'react';
import { useKibana } from '../../../common/lib/kibana/kibana_react';
import { AssetCriticalityFilePickerStep } from './components/file_picker_step';
import { AssetCriticalityValidationStep } from './components/validation_step';
import { INITIAL_STATE, reducer } from './reducer';
import { isFilePickerStep, isResultStep, isValidationStep } from './helpers';
import { AssetCriticalityResultStep } from './components/result_step';
import { useEntityAnalyticsRoutes } from '../../api/api';
import { useFileValidation, useNavigationSteps } from './hooks';
import type { OnCompleteParams } from './types';
import { EntityEventTypes } from '../../../common/lib/telemetry';

export const AssetCriticalityFileUploader: React.FC = () => {
  const { telemetry } = useKibana().services;

  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const { uploadAssetCriticalityFile } = useEntityAnalyticsRoutes();

  const onValidationComplete = useCallback(
    ({ validatedFile, processingStartTime, processingEndTime, tookMs }: OnCompleteParams) => {
      telemetry.reportEvent(EntityEventTypes.AssetCriticalityCsvPreviewGenerated, {
        file: {
          size: validatedFile.size,
        },
        processing: {
          startTime: processingStartTime,
          endTime: processingEndTime,
          tookMs,
        },
        stats: {
          validLines: validatedFile.validLines.count,
          invalidLines: validatedFile.invalidLines.count,
          totalLines: validatedFile.validLines.count + validatedFile.invalidLines.count,
        },
      });

      dispatch({
        type: 'fileValidated',
        payload: {
          validatedFile: {
            name: validatedFile.name,
            size: validatedFile.size,
            validLines: {
              text: validatedFile.validLines.text,
              count: validatedFile.validLines.count,
            },
            invalidLines: {
              text: validatedFile.invalidLines.text,
              count: validatedFile.invalidLines.count,
              errors: validatedFile.invalidLines.errors,
            },
          },
        },
      });
    },
    [telemetry]
  );
  const onValidationError = useCallback((message: string) => {
    dispatch({ type: 'fileError', payload: { message } });
  }, []);

  const validateFile = useFileValidation({
    onError: onValidationError,
    onComplete: onValidationComplete,
  });

  const goToFirstStep = useCallback(() => {
    dispatch({ type: 'resetState' });
  }, []);

  const onFileChange = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.item(0);

      if (!file) {
        // file removed
        goToFirstStep();
        return;
      }

      dispatch({
        type: 'loadingFile',
        payload: { fileName: file.name },
      });

      validateFile(file);
    },
    [validateFile, goToFirstStep]
  );

  const onUploadFile = useCallback(async () => {
    if (isValidationStep(state)) {
      dispatch({
        type: 'uploadingFile',
      });

      try {
        const result = await uploadAssetCriticalityFile(
          state.validatedFile.validLines.text,
          state.validatedFile.name
        );

        dispatch({
          type: 'fileUploaded',
          payload: { response: result },
        });
      } catch (e) {
        dispatch({
          type: 'fileUploaded',
          payload: { errorMessage: e.message },
        });
      }
    }
  }, [state, uploadAssetCriticalityFile]);

  const steps = useNavigationSteps(state, goToFirstStep);

  return (
    <div>
      <EuiStepsHorizontal size="s" steps={steps} />
      <EuiSpacer size="l" />

      <div>
        {isFilePickerStep(state) && (
          <AssetCriticalityFilePickerStep
            onFileChange={onFileChange}
            isLoading={state.isLoading}
            errorMessage={state.fileError}
          />
        )}

        {isValidationStep(state) && (
          <AssetCriticalityValidationStep
            validatedFile={state.validatedFile}
            isLoading={state.isLoading}
            onReturn={goToFirstStep}
            onConfirm={onUploadFile}
          />
        )}

        {isResultStep(state) && (
          <AssetCriticalityResultStep
            result={state.fileUploadResponse}
            errorMessage={state.fileUploadError}
            validLinesAsText={state.validLinesAsText}
            onReturn={goToFirstStep}
          />
        )}
      </div>
    </div>
  );
};
