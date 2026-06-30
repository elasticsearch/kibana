/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Reducer } from 'react';
import React, { useCallback, useContext, useReducer } from 'react';
import { i18n } from '@kbn/i18n';

import { useKibana } from '../../../../shared_imports';
import type { FieldAccessPattern } from '../../../../../common/types';
import type { DeserializedProcessorResult, DeserializeResult } from '../deserialize';
import { deserializeVerboseTestOutput } from '../deserialize';
import { serialize } from '../serialize';
import type { Document } from '../types';
import { useIsMounted } from '../use_is_mounted';

export interface TestPipelineData {
  config: {
    documents?: Document[];
    verbose?: boolean;
    selectedDocumentIndex: number;
  };
  testOutputPerProcessor?: DeserializedProcessorResult[];
  isExecutingPipeline?: boolean;
}

type Action =
  | {
      type: 'updateOutputPerProcessor';
      payload: {
        testOutputPerProcessor?: DeserializedProcessorResult[];
        isExecutingPipeline: boolean;
      };
    }
  | {
      type: 'updateConfig';
      payload: {
        config: {
          documents: Document[];
          verbose?: boolean;
        };
      };
    }
  | {
      type: 'updateActiveDocument';
      payload: Pick<TestPipelineData, 'config'>;
    }
  | {
      type: 'updateIsExecutingPipeline';
      payload: Pick<TestPipelineData, 'isExecutingPipeline'>;
    }
  | {
      type: 'reset';
    };

export interface TestPipelineContext {
  testPipelineData: TestPipelineData;
  testPipelineDataDispatch: (data: Action) => void;
  updateTestOutputPerProcessor: (
    documents: Document[] | undefined,
    processors: DeserializeResult
  ) => void;
  fieldAccessPattern?: FieldAccessPattern;
}

const DEFAULT_TEST_PIPELINE_CONTEXT = {
  testPipelineData: {
    config: {
      selectedDocumentIndex: 0,
    },
    isExecutingPipeline: false,
  },
  testPipelineDataDispatch: () => {},
  updateTestOutputPerProcessor: () => {},
};

const TestPipelineContext = React.createContext<TestPipelineContext>(DEFAULT_TEST_PIPELINE_CONTEXT);

export const useTestPipelineContext = () => {
  const ctx = useContext(TestPipelineContext);
  if (!ctx) {
    throw new Error(
      '"useTestPipelineContext" can only be called inside of TestPipelineContextProvider.Provider!'
    );
  }
  return ctx;
};

export const reducer: Reducer<TestPipelineData, Action> = (state, action) => {
  if (action.type === 'updateOutputPerProcessor') {
    return {
      ...state,
      testOutputPerProcessor: action.payload.testOutputPerProcessor,
      isExecutingPipeline: false,
    };
  }

  if (action.type === 'updateConfig') {
    return {
      ...action.payload,
      config: {
        ...action.payload.config,
        selectedDocumentIndex: state.config.selectedDocumentIndex,
      },
      testOutputPerProcessor: state.testOutputPerProcessor,
    };
  }

  if (action.type === 'updateActiveDocument') {
    return {
      ...state,
      config: {
        ...state.config,
        selectedDocumentIndex: action.payload.config.selectedDocumentIndex,
      },
    };
  }

  if (action.type === 'updateIsExecutingPipeline') {
    return {
      ...state,
      isExecutingPipeline: action.payload.isExecutingPipeline,
    };
  }

  if (action.type === 'reset') {
    return DEFAULT_TEST_PIPELINE_CONTEXT.testPipelineData;
  }

  return state;
};

export const TestPipelineContextProvider = ({
  children,
  fieldAccessPattern,
}: {
  children: React.ReactNode;
  fieldAccessPattern?: FieldAccessPattern;
}) => {
  const [state, dispatch] = useReducer(reducer, DEFAULT_TEST_PIPELINE_CONTEXT.testPipelineData);
  const { services } = useKibana();
  const isMounted = useIsMounted();

  const updateTestOutputPerProcessor = useCallback(
    async (documents: Document[] | undefined, processors: DeserializeResult) => {
      if (!documents) {
        return;
      }

      dispatch({
        type: 'updateIsExecutingPipeline',
        payload: {
          isExecutingPipeline: true,
        },
      });

      const serializedProcessorsWithTag = serialize({
        pipeline: { processors: processors.processors, onFailure: processors.onFailure },
        copyIdToTag: true,
      });

      const { data: verboseResults, error } = await services.api.simulatePipeline({
        documents,
        verbose: true,
        pipeline: { ...serializedProcessorsWithTag, field_access_pattern: fieldAccessPattern },
      });

      if (!isMounted.current) {
        return;
      }

      if (error) {
        dispatch({
          type: 'updateOutputPerProcessor',
          payload: {
            isExecutingPipeline: false,
            // reset the output if there is an error
            // this will result to the status changing to "inactive"
            testOutputPerProcessor: undefined,
          },
        });

        services.notifications.toasts.addError(error, {
          title: i18n.translate('xpack.ingestPipelines.testPipeline.errorNotificationText', {
            defaultMessage: 'Error executing pipeline',
          }),
        });

        return;
      }

      dispatch({
        type: 'updateOutputPerProcessor',
        payload: {
          testOutputPerProcessor: deserializeVerboseTestOutput(verboseResults),
          isExecutingPipeline: false,
        },
      });
    },
    [fieldAccessPattern, isMounted, services.api, services.notifications.toasts]
  );

  return (
    <TestPipelineContext.Provider
      value={{
        testPipelineData: state,
        testPipelineDataDispatch: dispatch,
        updateTestOutputPerProcessor,
        fieldAccessPattern,
      }}
    >
      {children}
    </TestPipelineContext.Provider>
  );
};
