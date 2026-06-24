/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Definition of a feedback question entry in the feedback registry.
 */
export interface FeedbackRegistryEntry {
  /**
   * Unique identifier for the feedback entry.
   */
  id: string;
  /**
   * Sort order for displaying the feedback entry. The lower the number, the higher it appears in the UI.
   */
  order: number;
  /**
   * The question text to be submitted with telemetry.
   */
  question: string;
  /**
   * The question text which appears in the UI.
   */
  label?: {
    i18nId: string;
    defaultMessage: string;
  };
  /**
   * Optional placeholder to show in the UI.
   */
  placeholder?: {
    i18nId: string;
    defaultMessage: string;
  };
  /**
   * Optional aria-label.
   */
  ariaLabel?: {
    i18nId: string;
    defaultMessage: string;
  };
}

export interface FeedbackQuestion {
  id: string;
  question: string;
  answer: string;
}

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

export type FeedbackFormData = Omit<FeedbackSubmittedData, 'solution' | 'organization_id'>;
