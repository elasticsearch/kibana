/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export { MARKDOWN_EMBEDDABLE_TYPE } from '../common/constants';

export {
  type MarkdownByReferenceState,
  type MarkdownByValueState,
  markdownByValueStateSchema,
  markdownEmbeddableSchema,
  type MarkdownEmbeddableState,
} from './embeddable/schemas';

export type {
  MarkdownCreateRequestBody,
  MarkdownCreateResponseBody,
  MarkdownReadResponseBody,
  MarkdownUpdateResponseBody,
} from './api';

export const plugin = async () => {
  const { MarkdownPlugin } = await import('./plugin');
  return new MarkdownPlugin();
};
