/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Build-time type validation — causes build failure if types diverge.
import './type_validation';

export { FeedbackTriggerButton, FeedbackContainer } from '../../src';
export type { FeedbackTriggerButtonProps, FeedbackContainerProps } from '../../src';
export type {
  FeedbackRegistryEntry,
  FeedbackSubmittedData,
  FeedbackQuestion,
  FeedbackFormData,
} from '../../src/types';
