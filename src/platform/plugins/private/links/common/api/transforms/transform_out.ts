/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { toAsCodeTags } from '@kbn/as-code-shared-transforms';
import type { Reference } from '@kbn/content-management-utils';

import type { LinksApiState, LinksByValueState, StoredLinksState } from '../../../server';
import { transformOut as transformEmbeddableOut } from '../../embeddable/transforms/transform_out';

export function transformOut(
  linksSavedObjectAttributes: StoredLinksState,
  references: Reference[] = []
): LinksApiState {
  const state = transformEmbeddableOut(linksSavedObjectAttributes, references) as LinksByValueState; // `savedObject` is never the by-reference embeddable state
  const { tags } = toAsCodeTags(references);
  return { title: linksSavedObjectAttributes.title, ...state, tags };
}
