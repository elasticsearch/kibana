/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { i18n } from '@kbn/i18n';

import { useKibana, useForm } from '../../../../../shared_imports';
import { useTestPipelineContext } from '../../context';
import { serialize } from '../../serialize';
import type { DeserializeResult } from '../../deserialize';
import type { Document } from '../../types';
import { useIsMounted } from '../../use_is_mounted';
import { TestPipelineFlyout as ViewComponent } from './test_pipeline_flyout';

import type { TestPipelineFlyoutTab } from './test_pipeline_tabs';

export interface Props {
  activeTab: TestPipelineFlyoutTab;
  setActiveTab: (tab: TestPipelineFlyoutTab) => void;
  onClose: () => void;
  processors: DeserializeResult;
}

export interface TestPipelineConfig {
  documents: Document[];
  verbose?: boolean;
}

export interface TestPipelineFlyoutForm {
  documents: string | Document[];
}

export const TestPipelineFlyout: React.FunctionComponent<Props> = ({
  onClose,
  activeTab,
  setActiveTab,
  processors,
}) => {
  const { services } = useKibana();
  const isMounted = useIsMounted();

  const {
    testPipelineData,
    testPipelineDataDispatch,
    updateTestOutputPerProcessor,
    fieldAccessPattern,
  } = useTestPipelineContext();

  const {
    config: { documents: cachedDocuments, verbose: cachedVerbose },
  } = testPipelineData;

  const { form } = useForm<TestPipelineFlyoutForm>({
    defaultValue: {
      documents: cachedDocuments || '',
    },
  });

  const [isRunningTest, setIsRunningTest] = useState<boolean>(false);
  const [testingError, setTestingError] = useState<any>(null);
  const [testOutput, setTestOutput] = useState<any>(undefined);

  const handleTestPipeline = useCallback(
    async (
      { documents, verbose }: TestPipelineConfig,
      updateProcessorOutput?: boolean
    ): Promise<{ isSuccessful: boolean }> => {
      const serializedProcessors = serialize({ pipeline: processors });

      setIsRunningTest(true);
      setTestingError(null);

      const { error, data: currentTestOutput } = await services.api.simulatePipeline({
        documents,
        verbose,
        pipeline: { ...serializedProcessors, field_access_pattern: fieldAccessPattern },
      });

      if (!isMounted.current) {
        return { isSuccessful: false };
      }

      setIsRunningTest(false);

      if (error) {
        setTestingError(error);

        // reset the per-processor output
        // this is needed in the scenario where the pipeline has already executed,
        // but you modified the sample documents and there was an error on re-execution
        testPipelineDataDispatch({
          type: 'updateOutputPerProcessor',
          payload: {
            isExecutingPipeline: false,
            testOutputPerProcessor: undefined,
          },
        });

        return { isSuccessful: false };
      }

      testPipelineDataDispatch({
        type: 'updateConfig',
        payload: {
          config: {
            documents,
            verbose,
          },
        },
      });

      // We sometimes need to manually refresh the per-processor output
      // e.g., when clicking the "Refresh output" button and there have been no state changes
      if (updateProcessorOutput) {
        updateTestOutputPerProcessor(documents, processors);
      }

      setTestOutput(currentTestOutput);

      services.notifications.toasts.addSuccess(
        i18n.translate('xpack.ingestPipelines.testPipelineFlyout.successNotificationText', {
          defaultMessage: 'Pipeline executed',
        }),
        {
          toastLifeTimeMs: 1000,
        }
      );

      return { isSuccessful: true };
    },
    [
      fieldAccessPattern,
      isMounted,
      processors,
      services.api,
      services.notifications.toasts,
      testPipelineDataDispatch,
      updateTestOutputPerProcessor,
    ]
  );

  const validateAndTestPipeline = async () => {
    const { isValid, data } = await form.submit();

    if (!isValid) {
      return;
    }

    const { documents } = data as { documents: Document[] };

    const { isSuccessful } = await handleTestPipeline({
      documents: documents!,
      verbose: cachedVerbose,
    });

    if (isSuccessful) {
      setActiveTab('output');
    }
  };

  const resetTestOutput = () => {
    testPipelineDataDispatch({
      type: 'reset',
    });
  };

  useEffect(() => {
    if (cachedDocuments && activeTab === 'output') {
      handleTestPipeline({ documents: cachedDocuments, verbose: cachedVerbose }, true);
    }
    // We only want to know on initial mount if
    // there are cached documents and we are on the output tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ViewComponent
      handleTestPipeline={handleTestPipeline}
      resetTestOutput={resetTestOutput}
      isRunningTest={isRunningTest}
      cachedVerbose={cachedVerbose}
      cachedDocuments={cachedDocuments}
      testOutput={testOutput}
      form={form}
      validateAndTestPipeline={validateAndTestPipeline}
      selectedTab={activeTab}
      setSelectedTab={setActiveTab}
      testingError={testingError}
      onClose={onClose}
    />
  );
};
