/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ListStreamDetail } from '@kbn/streams-plugin/server/routes/internal/streams/crud/route';
import { Streams, streamMatchesIndexPatterns } from '@kbn/streams-schema';
import {
  KIsOnboardingStep,
  SignificantEventsWorkflowStatus,
  KIS_ONBOARDING_IN_PROGRESS_STATUSES,
  type SignificantEventsWorkflowStatusResult,
  SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID,
  SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID,
} from '@kbn/significant-events-schema';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useInferenceFeatureConnectors } from '../../../../../hooks/significant_events/use_inference_feature_connectors';
import { useIndexPatternsConfig } from '../../../../../hooks/use_index_patterns_config';
import type { ScheduleOnboardingOptions } from '../../../../../hooks/use_onboarding_api';
import { useBulkOnboarding } from '../../hooks/use_bulk_onboarding';
import { useFetchStreams } from '../../hooks/use_fetch_streams';
import type { OnboardingConfig } from '../shared/types';

interface ConnectorState {
  resolvedConnectorId: string | undefined;
  loading: boolean;
}

interface KiGenerationContextValue {
  filteredStreams: ListStreamDetail[] | undefined;
  isStreamsLoading: boolean;
  isInitialGenerationStatusLoading: boolean;
  generatingStreamNames: string[];
  isGenerating: boolean;
  isScheduling: boolean;
  streamStatusMap: Record<string, SignificantEventsWorkflowStatusResult>;
  onboardingConfig: OnboardingConfig;
  setOnboardingConfig: (config: OnboardingConfig) => void;
  featuresConnectors: ConnectorState;
  queriesConnectors: ConnectorState;
  bulkOnboardAll: (streamNames: string[]) => Promise<string[]>;
  bulkOnboardFeaturesOnly: (streamNames: string[]) => Promise<string[]>;
  bulkOnboardQueriesOnly: (streamNames: string[]) => Promise<string[]>;
  bulkScheduleOnboarding: (
    streamNames: string[],
    options?: ScheduleOnboardingOptions
  ) => Promise<string[]>;
  cancelOnboarding: (streamName: string) => Promise<void>;
}

const KiGenerationReactContext = createContext<KiGenerationContextValue | null>(null);

interface KiGenerationProviderProps {
  children: React.ReactNode;
  onCompleted?: () => void;
  onFailed?: (error: string) => void;
}

export function KiGenerationProvider({
  children,
  onCompleted,
  onFailed,
}: KiGenerationProviderProps) {
  const [generatingStreams, setGeneratingStreams] = useState<Set<string>>(new Set());
  const [streamStatusMap, setStreamStatusMap] = useState<
    Record<string, SignificantEventsWorkflowStatusResult>
  >({});
  const initialStatusFetchDoneRef = useRef(false);
  // Dedup guard: filteredStreams gets a new array reference on every render
  // (due to the select transform), which re-fires the status-fetch effect.
  // This ref tracks already-enqueued names so only truly new streams trigger
  // network calls.
  const enqueuedStreamNamesRef = useRef<Set<string>>(new Set());

  const { indexPatterns } = useIndexPatternsConfig();

  const featuresConnectors = useInferenceFeatureConnectors(
    SIGNIFICANT_EVENTS_KI_EXTRACTION_INFERENCE_FEATURE_ID
  );
  const queriesConnectors = useInferenceFeatureConnectors(
    SIGNIFICANT_EVENTS_KI_QUERY_GENERATION_INFERENCE_FEATURE_ID
  );

  const [onboardingConfig, setOnboardingConfig] = useState<OnboardingConfig>({
    steps: [KIsOnboardingStep.FeaturesIdentification, KIsOnboardingStep.QueriesGeneration],
    connectors: {},
  });

  useEffect(() => {
    setOnboardingConfig((prev) => {
      const features = prev.connectors.features ?? featuresConnectors.resolvedConnectorId;
      const queries = prev.connectors.queries ?? queriesConnectors.resolvedConnectorId;
      if (features === prev.connectors.features && queries === prev.connectors.queries) {
        return prev;
      }
      return { ...prev, connectors: { features, queries } };
    });
  }, [featuresConnectors.resolvedConnectorId, queriesConnectors.resolvedConnectorId]);

  const streamsListFetch = useFetchStreams({
    select: (result) => ({
      ...result,
      // Query streams are always included; other stream types are filtered by index patterns.
      streams: result.streams.filter(
        (item) =>
          Streams.QueryStream.Definition.is(item.stream) ||
          streamMatchesIndexPatterns(item.stream.name, indexPatterns)
      ),
    }),
  });
  const filteredStreams = streamsListFetch.data?.streams;
  const isStreamsLoading = streamsListFetch.isLoading;

  // Adds streams discovered as InProgress (e.g. on initial status fetch after
  // page refresh) and removes streams that reach a terminal state. Callback
  // forwarding is gated on the initial-fetch flag so initial-load updates
  // don't trigger consumer side effects (like error toasts).
  const onStreamStatusUpdate = useCallback(
    (streamName: string, statusResult: SignificantEventsWorkflowStatusResult) => {
      setStreamStatusMap((current) => ({ ...current, [streamName]: statusResult }));

      const isInProgress = KIS_ONBOARDING_IN_PROGRESS_STATUSES.has(statusResult.status);

      setGeneratingStreams((current) => {
        const has = current.has(streamName);
        if (isInProgress === has) return current;
        const next = new Set(current);
        if (isInProgress) {
          next.add(streamName);
        } else {
          next.delete(streamName);
        }
        return next;
      });

      if (initialStatusFetchDoneRef.current) {
        if (statusResult.status === SignificantEventsWorkflowStatus.Failed) {
          onFailed?.(statusResult.error ?? 'Unknown error');
        }
        if (statusResult.status === SignificantEventsWorkflowStatus.Completed) {
          onCompleted?.();
        }
      }
    },
    [onCompleted, onFailed]
  );

  const bulkOnboarding = useBulkOnboarding({ onboardingConfig, onStreamStatusUpdate });
  const {
    onboardingStatusUpdateQueue,
    processStatusUpdateQueue,
    bulkOnboardAll: rawBulkOnboardAll,
    bulkOnboardFeaturesOnly: rawBulkOnboardFeaturesOnly,
    bulkOnboardQueriesOnly: rawBulkOnboardQueriesOnly,
    bulkScheduleOnboarding: rawBulkScheduleOnboarding,
  } = bulkOnboarding;

  useEffect(() => {
    if (!filteredStreams) return;

    let hasNew = false;
    filteredStreams.forEach((item) => {
      if (!enqueuedStreamNamesRef.current.has(item.stream.name)) {
        enqueuedStreamNamesRef.current.add(item.stream.name);
        onboardingStatusUpdateQueue.add(item.stream.name);
        hasNew = true;
      }
    });
    if (hasNew) {
      processStatusUpdateQueue().finally(() => {
        initialStatusFetchDoneRef.current = true;
      });
    }
  }, [filteredStreams, onboardingStatusUpdateQueue, processStatusUpdateQueue]);

  const isGenerating = generatingStreams.size > 0;
  const generatingStreamNames = useMemo(() => Array.from(generatingStreams), [generatingStreams]);

  // True until we've received at least one status result for every filtered
  // stream, so consumers can defer rendering empty/generating UI until the
  // generating set is known. Once false, stays false — transient refetches of
  // the streams list must not flash the loading panel again.
  const isInitialGenerationStatusLoading = useMemo(() => {
    if (initialStatusFetchDoneRef.current) return false;
    if (isStreamsLoading || !filteredStreams) return true;
    return filteredStreams.some((item) => !(item.stream.name in streamStatusMap));
  }, [isStreamsLoading, filteredStreams, streamStatusMap]);

  const withGeneratingTracking = useCallback(
    (action: (streamNames: string[]) => Promise<string[]>) =>
      async (streamNames: string[]): Promise<string[]> => {
        if (streamNames.length > 0) {
          setGeneratingStreams((current) => new Set([...current, ...streamNames]));
        }
        const succeeded = await action(streamNames);
        if (succeeded.length < streamNames.length) {
          const succeededSet = new Set(succeeded);
          const failed = streamNames.filter((s) => !succeededSet.has(s));
          setGeneratingStreams((current) => {
            const next = new Set(current);
            failed.forEach((s) => next.delete(s));
            return next;
          });
        }
        return succeeded;
      },
    []
  );

  const bulkOnboardAll = useMemo(
    () => withGeneratingTracking(rawBulkOnboardAll),
    [withGeneratingTracking, rawBulkOnboardAll]
  );
  const bulkOnboardFeaturesOnly = useMemo(
    () => withGeneratingTracking(rawBulkOnboardFeaturesOnly),
    [withGeneratingTracking, rawBulkOnboardFeaturesOnly]
  );
  const bulkOnboardQueriesOnly = useMemo(
    () => withGeneratingTracking(rawBulkOnboardQueriesOnly),
    [withGeneratingTracking, rawBulkOnboardQueriesOnly]
  );
  const bulkScheduleOnboarding = useCallback(
    (streamNames: string[], options?: ScheduleOnboardingOptions) =>
      withGeneratingTracking((names) => rawBulkScheduleOnboarding(names, options))(streamNames),
    [withGeneratingTracking, rawBulkScheduleOnboarding]
  );

  const value = useMemo<KiGenerationContextValue>(
    () => ({
      isScheduling: bulkOnboarding.isScheduling,
      cancelOnboarding: bulkOnboarding.cancelOnboarding,
      filteredStreams,
      isStreamsLoading,
      isInitialGenerationStatusLoading,
      generatingStreamNames,
      isGenerating,
      streamStatusMap,
      onboardingConfig,
      setOnboardingConfig,
      featuresConnectors,
      queriesConnectors,
      bulkOnboardAll,
      bulkOnboardFeaturesOnly,
      bulkOnboardQueriesOnly,
      bulkScheduleOnboarding,
    }),
    [
      bulkOnboarding.isScheduling,
      bulkOnboarding.cancelOnboarding,
      filteredStreams,
      isStreamsLoading,
      isInitialGenerationStatusLoading,
      generatingStreamNames,
      isGenerating,
      streamStatusMap,
      onboardingConfig,
      setOnboardingConfig,
      featuresConnectors,
      queriesConnectors,
      bulkOnboardAll,
      bulkOnboardFeaturesOnly,
      bulkOnboardQueriesOnly,
      bulkScheduleOnboarding,
    ]
  );

  return (
    <KiGenerationReactContext.Provider value={value}>{children}</KiGenerationReactContext.Provider>
  );
}

export function useKiGeneration(): KiGenerationContextValue {
  const context = useContext(KiGenerationReactContext);
  if (!context) {
    throw new Error('useKiGeneration must be used within KiGenerationProvider');
  }
  return context;
}
