/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';

export const SyntheticsParamsReadonlyCodec = z.looseObject({
  id: z.string(),
  key: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  namespaces: z.array(z.string()).optional(),
});

export const SyntheticsParamsReadonlyCodecList = z.array(SyntheticsParamsReadonlyCodec);

export const SyntheticsParamsCodec = SyntheticsParamsReadonlyCodec.extend({
  value: z.string(),
});

export const DeleteParamsResponseCodec = z.looseObject({
  id: z.string(),
  deleted: z.boolean(),
  error: z.string().optional(),
});

export const SyntheticsParamRequestCodec = z.looseObject({
  key: z.string(),
  value: z.string(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  share_across_spaces: z.boolean().optional(),
});
