/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { dynamic } from '@kbn/shared-ux-utility';
import { createKibanaReactContext } from '@kbn/kibana-react-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { ObservabilityLogsAiInsightFeatureRenderDeps } from '@kbn/discover-shared-plugin/public';
import type { ObservabilityAgentBuilderPluginStartDependencies } from '../../types';
import type { ErrorSampleAiInsightProps } from './error_sample_ai_insight';
import type { LogAiInsightProps, LogAiInsightDocument } from './log_ai_insight';
import type { AlertAskAiAssistantButtonProps } from './alert_ask_ai_assistant_button';

const queryClient = new QueryClient();

export type { ErrorSampleAiInsightProps } from './error_sample_ai_insight';
export type { LogAiInsightProps, LogAiInsightDocument } from './log_ai_insight';
export type { AlertAskAiAssistantButtonProps } from './alert_ask_ai_assistant_button';

const AlertAskAiAssistantButtonLazy = dynamic(() =>
  import('./alert_ask_ai_assistant_button').then((m) => ({
    default: m.AlertAskAiAssistantButton,
  }))
);

const ErrorSampleAiInsightLazy = dynamic(() =>
  import('./error_sample_ai_insight').then((m) => ({ default: m.ErrorSampleAiInsight }))
);

const LogAiInsightLazy = dynamic(() =>
  import('./log_ai_insight').then((m) => ({ default: m.LogAiInsight }))
);

export function createErrorSampleAIInsight(
  core: CoreStart,
  plugins: ObservabilityAgentBuilderPluginStartDependencies
) {
  const { Provider: KibanaReactContextProvider } = createKibanaReactContext({
    ...core,
    ...plugins,
  });

  return (props: ErrorSampleAiInsightProps) => (
    <QueryClientProvider client={queryClient}>
      <KibanaReactContextProvider>
        <ErrorSampleAiInsightLazy {...props} />
      </KibanaReactContextProvider>
    </QueryClientProvider>
  );
}

export function createLogAIInsight(
  core: CoreStart,
  plugins: ObservabilityAgentBuilderPluginStartDependencies
) {
  const { Provider: KibanaReactContextProvider } = createKibanaReactContext({
    ...core,
    ...plugins,
  });

  return (props: LogAiInsightProps) => (
    <QueryClientProvider client={queryClient}>
      <KibanaReactContextProvider>
        <LogAiInsightLazy {...props} />
      </KibanaReactContextProvider>
    </QueryClientProvider>
  );
}

export function createAlertAskAiAssistantButton(
  core: CoreStart,
  plugins: ObservabilityAgentBuilderPluginStartDependencies
) {
  const { Provider: KibanaReactContextProvider } = createKibanaReactContext({
    ...core,
    ...plugins,
  });

  return (props: AlertAskAiAssistantButtonProps) => (
    <QueryClientProvider client={queryClient}>
      <KibanaReactContextProvider>
        <AlertAskAiAssistantButtonLazy {...props} />
      </KibanaReactContextProvider>
    </QueryClientProvider>
  );
}

export const createLogsAIInsightRenderer =
  (LogAIInsightRender: ReturnType<typeof createLogAIInsight>) =>
  ({ doc }: ObservabilityLogsAiInsightFeatureRenderDeps) => {
    const mappedDoc = useMemo<LogAiInsightDocument>(
      () => ({
        fields: Object.entries(doc.flattened).map(([field, value]) => ({
          field,
          value: Array.isArray(value) ? value : [value],
        })),
      }),
      [doc]
    );

    return <LogAIInsightRender key={doc.id} doc={mappedDoc} />;
  };
