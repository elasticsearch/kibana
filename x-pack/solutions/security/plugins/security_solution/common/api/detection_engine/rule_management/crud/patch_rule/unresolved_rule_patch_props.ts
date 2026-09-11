/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import { SharedPatchProps } from '../../../model/rule_schema';

/**
 * A rule patch with its type-independent (shared) props validated. The rule type is not
 * resolved yet, so type-specific fields are preserved as-is and validated once it is known.
 */
export const UnresolvedRulePatchProps = SharedPatchProps.loose();
export type UnresolvedRulePatchProps = z.infer<typeof UnresolvedRulePatchProps>;
