/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Standalone type definitions for the `@kbn/ui-feedback` external package.
 *
 * Types are defined inline (not re-exported) so that declaration generation
 * does not pull in the full Kibana dependency graph. Build-time validation in
 * `type_validation.ts` ensures these stay in sync with the source types.
 *
 * @see {@link ./type_validation.ts} for the compatibility check.
 */

import type * as React from 'react';

interface I18nMessage {
  i18nId: string;
  defaultMessage: string;
}

/** A feedback question entry sourced from the feedback registry. */
export interface FeedbackRegistryEntry {
  id: string;
  order: number;
  question: string;
  label?: I18nMessage;
  placeholder?: I18nMessage;
  ariaLabel?: I18nMessage;
}

/** A single answered feedback question, submitted with telemetry. */
export interface FeedbackQuestion {
  id: string;
  question: string;
  answer: string;
}

/** The full feedback payload recorded in telemetry. */
export interface FeedbackSubmittedData {
  app_id: string;
  solution: string;
  allow_email_contact: boolean;
  url: string;
  user_email?: string;
  csat_score?: number;
  questions?: FeedbackQuestion[];
  organization_id?: string;
}

/** The subset of feedback data collected from the form. */
export type FeedbackFormData = Omit<FeedbackSubmittedData, 'solution' | 'organization_id'>;

/** Details about the app the feedback is being submitted from. */
interface AppDetails {
  title: string;
  id: string;
  url: string;
}

/** Props accepted by the `FeedbackTriggerButton` component. */
export interface FeedbackTriggerButtonProps {
  getQuestions: (appId: string) => Promise<FeedbackRegistryEntry[]>;
  getAppDetails: () => AppDetails;
  getCurrentUserEmail: () => Promise<string | undefined>;
  sendFeedback: (data: FeedbackFormData) => Promise<void>;
  showToast: (title: string, type: 'success' | 'error') => void;
  checkTelemetryOptIn: () => Promise<boolean>;
}

/** Props accepted by the `FeedbackContainer` component. */
export interface FeedbackContainerProps {
  getQuestions: (appId: string) => Promise<FeedbackRegistryEntry[]>;
  getAppDetails: () => AppDetails;
  getCurrentUserEmail: () => Promise<string | undefined>;
  sendFeedback: (data: FeedbackFormData) => Promise<void>;
  showToast: (title: string, type: 'success' | 'error') => void;
  hideFeedbackContainer: () => void;
}

/** Header feedback trigger button (compiled to a function declaration in `.d.ts`). */
export declare function FeedbackTriggerButton(props: FeedbackTriggerButtonProps): React.ReactNode;

/** Feedback form modal body (compiled to a function declaration in `.d.ts`). */
export declare function FeedbackContainer(props: FeedbackContainerProps): React.ReactNode;
