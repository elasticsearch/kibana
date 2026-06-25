/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Shared types for @kbn/evals-extensions
 *
 * NOTE: This package depends on @kbn/evals but @kbn/evals does NOT depend on this package.
 * Keep types that need to be shared with core @kbn/evals in @kbn/evals itself.
 *
 * Types here are specific to extension features and will be populated as features are added.
 */

/**
 * Placeholder type to ensure package builds.
 */
export interface ExtensionPlaceholder {
  version: string;
  description: string;
}
