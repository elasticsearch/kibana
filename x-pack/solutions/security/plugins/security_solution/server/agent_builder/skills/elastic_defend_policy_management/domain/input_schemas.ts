/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';

export const POLICY_PATH_MAX_LENGTH = 256;

export const policyIdentifierInputSchema = z.string().trim().min(1);

export const policyPathInputSchema = z.string().trim().min(1).max(POLICY_PATH_MAX_LENGTH);
