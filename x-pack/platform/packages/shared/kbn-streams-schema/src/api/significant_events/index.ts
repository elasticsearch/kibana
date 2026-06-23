/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChatCompletionTokenCount } from '@kbn/inference-common';
import { z } from '@kbn/zod/v4';
import {
  esqlQuerySchema,
  queryFeatureSchema,
  queryTypeSchema,
  type StreamQuery,
} from '../../queries';
import type { TaskStatus } from '../../tasks/types';
import type { Discovery } from '../../sig_events/discoveries';
import type { Detection } from '../../sig_events/detections';
import type { SigEvent } from '../../sig_events/events';

/**
 * SignificantEvents Get Response
 */
type ChangePointsType =
  | 'dip'
  | 'distribution_change'
  | 'non_stationary'
  | 'spike'
  | 'stationary'
  | 'step_change'
  | 'trend_change';

type ChangePointsValue = Partial<{
  p_value: number;
  r_value: number;
  change_point: number;
  trend: string;
}>;

interface SignificantEventOccurrence {
  date: string;
  count: number;
}

type SignificantEventsResponse = StreamQuery & {
  stream_name: string;
  occurrences: SignificantEventOccurrence[];
  change_points: {
    type: Partial<Record<ChangePointsType, ChangePointsValue>>;
  };
  rule_backed: boolean;
};

interface SignificantEventsGetResponse {
  significant_events: SignificantEventsResponse[];
  aggregated_occurrences: SignificantEventOccurrence[];
}

export const generatedSignificantEventQuerySchema = z.object({
  type: queryTypeSchema,
  title: z.string(),
  esql: esqlQuerySchema,
  severity_score: z.number().min(0).max(100),
  description: z.string(),
  evidence: z.array(z.string()).optional(),
  replaces: z.string().optional(),
  features: z.array(queryFeatureSchema),
});

type GeneratedSignificantEventQuery = z.infer<typeof generatedSignificantEventQuerySchema>;

interface SignificantEventsQueriesGenerationResult {
  queries: GeneratedSignificantEventQuery[];
  tokensUsed: Pick<ChatCompletionTokenCount, 'prompt' | 'completion'>;
}

type SignificantEventsQueriesGenerationTaskResult =
  | {
      status:
        | TaskStatus.NotStarted
        | TaskStatus.InProgress
        | TaskStatus.Stale
        | TaskStatus.BeingCanceled
        | TaskStatus.Canceled;
    }
  | {
      status: TaskStatus.Failed;
      error: string;
    }
  | ({
      status: TaskStatus.Completed | TaskStatus.Acknowledged;
    } & SignificantEventsQueriesGenerationResult);

interface LifecycleDetection {
  detection_id: string;
  rule_name?: string;
  stream_name?: string;
  change_point_type?: string;
  kind: Extract<Detection['kind'], 'detection' | 'quiet'>;
  '@timestamp': string;
}

interface EventLifecycleResponse {
  detections: LifecycleDetection[];
  discoveries: Discovery[];
  events: SigEvent[];
}

export type {
  SignificantEventsResponse,
  SignificantEventsGetResponse,
  GeneratedSignificantEventQuery,
  SignificantEventsQueriesGenerationResult,
  SignificantEventsQueriesGenerationTaskResult,
  LifecycleDetection,
  EventLifecycleResponse,
};
