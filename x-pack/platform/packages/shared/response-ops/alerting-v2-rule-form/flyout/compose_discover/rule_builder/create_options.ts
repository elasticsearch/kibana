/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { RULE_BUILDER_REGISTRY } from './registry';
import type { RuleBuilderCreateOption } from './types';

/** A builder's create-options card, carrying the type needed to open it. */
export interface RuleBuilderCreateOptionItem extends RuleBuilderCreateOption {
  type: string;
}

const LAST = Number.MAX_SAFE_INTEGER;

/**
 * Every registered builder as a create-options card, ordered for display.
 *
 * Callers render this rather than naming builders, so registering a builder is
 * all it takes to appear in the rule creation UI.
 */
export const getRuleBuilderCreateOptions = (): RuleBuilderCreateOptionItem[] =>
  Object.entries(RULE_BUILDER_REGISTRY)
    .map(([type, definition]) => ({ type, ...definition.createOption }))
    .sort((a, b) => (a.order ?? LAST) - (b.order ?? LAST) || a.title.localeCompare(b.title));
