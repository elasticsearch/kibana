/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChatCompletionTokenCount } from '@kbn/inference-common';
import type { BaseFeature } from '../feature';
import type { GeneratedSignificantEventQuery } from '../api/significant_events';
import {
  SignificantEventsWorkflowStatus,
  type SignificantEventsWorkflowStatusResult,
} from '../workflows';

/** Summary of the features identification step of a completed onboarding run. */
export interface KIsOnboardingFeaturesResult {
  skipped: boolean;
  discovered: BaseFeature[];
  connectorUsed: string;
  tokensUsed: ChatCompletionTokenCount;
}

/** Summary of the queries generation step of a completed onboarding run. */
export interface KIsOnboardingQueriesResult {
  skipped: boolean;
  persisted: GeneratedSignificantEventQuery[];
  connectorUsed: string;
  tokensUsed: ChatCompletionTokenCount;
}

export interface KIsOnboardingResult {
  features: KIsOnboardingFeaturesResult;
  queries: KIsOnboardingQueriesResult;
}

export type KIsOnboardingStatusResult = SignificantEventsWorkflowStatusResult<KIsOnboardingResult>;

export enum KIsOnboardingStep {
  FeaturesIdentification = 'features_identification',
  QueriesGeneration = 'queries_generation',
}

/** Statuses that indicate the onboarding pipeline is still active (running or pending cancel). */
export const KIS_ONBOARDING_IN_PROGRESS_STATUSES: ReadonlySet<SignificantEventsWorkflowStatus> =
  new Set([
    SignificantEventsWorkflowStatus.InProgress,
    SignificantEventsWorkflowStatus.BeingCanceled,
  ]);
