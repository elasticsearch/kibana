/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod/v4';

export const InstallFormFieldTypeSchema = z.union([
  z.literal('text'),
  z.literal('textarea'),
  z.literal('connector'),
  z.literal('select'),
  z.literal('boolean'),
  z.literal('number'),
]);

export const InstallFormFieldOptionSchema = z
  .object({
    value: z.string().min(1).max(1024),
    label: z.string().min(1).max(1024),
  })
  .strict();

export const InstallFormFieldSchema = z
  .object({
    name: z.string().min(1).max(1024),
    label: z.string().min(1).max(1024).optional(),
    description: z.string().min(1).max(4096).optional(),
    inputType: InstallFormFieldTypeSchema,
    required: z.boolean().optional(),
    connectorType: z.string().min(1).max(256).optional(),
    options: z.array(InstallFormFieldOptionSchema).max(100).optional(),
    default: z.union([z.string().max(1024), z.number(), z.boolean()]).optional(),
  })
  .strict();

export const InstallFormSchema = z
  .object({
    form: z.array(InstallFormFieldSchema).max(100),
  })
  .strict();
