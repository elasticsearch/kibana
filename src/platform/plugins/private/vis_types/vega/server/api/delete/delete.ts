/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContext } from '@kbn/core/server';
import { VEGA_SAVED_OBJECT_TYPE } from '../../../common/constants';

export const deleteItem = async (requestCtx: RequestHandlerContext, id: string): Promise<void> => {
  const { core } = await requestCtx.resolve(['core']);
  await core.savedObjects.client.delete(VEGA_SAVED_OBJECT_TYPE, id);
};
