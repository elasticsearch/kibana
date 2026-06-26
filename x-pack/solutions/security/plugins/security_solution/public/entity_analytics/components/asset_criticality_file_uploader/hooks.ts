/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { ParseLocalConfig } from 'papaparse';
import { parse, unparse } from 'papaparse';
import { useCallback, useMemo } from 'react';
import type { EuiStepHorizontalProps } from '@elastic/eui/src/components/steps/step_horizontal';
import { noop } from 'lodash/fp';
import { useFormatBytes } from '../../../common/components/formatted_bytes';
import { validateFile } from './validations';
import { useKibana } from '../../../common/lib/kibana';
import type { OnCompleteParams } from './types';
import type { ReducerState } from './reducer';
import { getStepStatus, isValidationStep } from './helpers';
import { EntityEventTypes } from '../../../common/lib/telemetry';

interface UseFileChangeCbParams {
  onError: (errorMessage: string, file: File) => void;
  onComplete: (param: OnCompleteParams) => void;
}

export const useFileValidation = ({ onError, onComplete }: UseFileChangeCbParams) => {
  const formatBytes = useFormatBytes();
  const { telemetry } = useKibana().services;

  const onErrorWrapper = useCallback(
    (
      error: {
        message: string;
        code?: string;
      },
      file: File
    ) => {
      telemetry.reportEvent(EntityEventTypes.AssetCriticalityFileSelected, {
        valid: false,
        errorCode: error.code,
        file: {
          size: file.size,
        },
      });
      onError(error.message, file);
    },
    [onError, telemetry]
  );

  return useCallback(
    (file: File) => {
      const processingStartTime = Date.now();
      const fileValidation = validateFile(file, formatBytes);
      if (!fileValidation.valid) {
        onErrorWrapper(
          {
            message: fileValidation.errorMessage,
            code: fileValidation.code,
          },
          file
        );
        return;
      }

      telemetry.reportEvent(EntityEventTypes.AssetCriticalityFileSelected, {
        valid: true,
        file: {
          size: file.size,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parserConfig: ParseLocalConfig<any, File> = {
        dynamicTyping: true,
        skipEmptyLines: true,
        complete(parsedFile, returnedFile) {
          if (parsedFile.data.length === 0) {
            onErrorWrapper(
              {
                message: i18n.translate(
                  'xpack.securitySolution.entityAnalytics.assetCriticalityFileUploader.emptyFileError',
                  { defaultMessage: 'The file is empty' }
                ),
              },
              file
            );
            return;
          }

          const valid = parsedFile.data;
          const validLinesAsText = unparse(valid);
          const processingEndTime = Date.now();
          const tookMs = processingEndTime - processingStartTime;
          onComplete({
            processingStartTime: new Date(processingStartTime).toISOString(),
            processingEndTime: new Date(processingEndTime).toISOString(),
            tookMs,
            validatedFile: {
              name: returnedFile?.name ?? '',
              size: returnedFile?.size ?? 0,
              validLines: {
                text: validLinesAsText,
                count: valid.length - 1, // Subtracting 1 to not count the header row
              },
              invalidLines: {
                text: ``,
                count: 0,
                errors: [],
              },
            },
          });
        },
        error(parserError) {
          onErrorWrapper({ message: parserError.message }, file);
        },
      };

      parse(file, parserConfig);
    },
    [formatBytes, telemetry, onErrorWrapper, onComplete]
  );
};

export const useNavigationSteps = (
  state: ReducerState,
  goToFirstStep: () => void
): Array<Omit<EuiStepHorizontalProps, 'step'>> => {
  return useMemo(
    () => [
      {
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.selectFileStepTitle',
          {
            defaultMessage: 'Select a file',
          }
        ),
        status: getStepStatus(1, state.step),
        onClick: () => {
          if (isValidationStep(state)) {
            goToFirstStep(); // User can only go back to the first step from the second step
          }
        },
      },
      {
        title: i18n.translate(
          'xpack.securitySolution.entityAnalytics.assetCriticalityUploadPage.resultsStepTitle',
          {
            defaultMessage: 'Results',
          }
        ),
        status: getStepStatus(3, state.step),
        onClick: noop, // Prevents the user from navigating by clicking on the step
      },
    ],
    [goToFirstStep, state]
  );
};
