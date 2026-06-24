/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * BUILD-TIME TYPE VALIDATION
 *
 * Ensures the duplicated types in `packaging/react/types.ts` remain compatible
 * with the source types. Compiled during packaging builds via
 * `packaging/tsconfig.json` with `--noEmit`.
 *
 * - Imports types from BOTH source and packaged locations.
 * - TypeScript will fail the build if types diverge incompatibly.
 *
 * @see {@link ../tsconfig.json} for the build configuration.
 * @see {@link ./types.ts} for the standalone type definitions.
 */

// Source types.
import type {
  FeedbackTriggerButtonProps as SourceTriggerButtonProps,
  FeedbackContainerProps as SourceContainerProps,
} from '../../src';
import type {
  FeedbackRegistryEntry as SourceFeedbackRegistryEntry,
  FeedbackQuestion as SourceFeedbackQuestion,
  FeedbackSubmittedData as SourceFeedbackSubmittedData,
  FeedbackFormData as SourceFeedbackFormData,
} from '../../src/types';

// Packaged types.
import type {
  FeedbackTriggerButtonProps as PackagedTriggerButtonProps,
  FeedbackContainerProps as PackagedContainerProps,
  FeedbackRegistryEntry as PackagedFeedbackRegistryEntry,
  FeedbackQuestion as PackagedFeedbackQuestion,
  FeedbackSubmittedData as PackagedFeedbackSubmittedData,
  FeedbackFormData as PackagedFeedbackFormData,
} from './types';

// Structural types: packaged must be compatible with source.
const _registryEntry: PackagedFeedbackRegistryEntry = {} as SourceFeedbackRegistryEntry;
const _question: PackagedFeedbackQuestion = {} as SourceFeedbackQuestion;
const _submittedData: PackagedFeedbackSubmittedData = {} as SourceFeedbackSubmittedData;
const _formData: PackagedFeedbackFormData = {} as SourceFeedbackFormData;
const _triggerButtonProps: PackagedTriggerButtonProps = {} as SourceTriggerButtonProps;
const _containerProps: PackagedContainerProps = {} as SourceContainerProps;

void _registryEntry;
void _question;
void _submittedData;
void _formData;
void _triggerButtonProps;
void _containerProps;

export const TYPE_VALIDATION_PASSED = true;
