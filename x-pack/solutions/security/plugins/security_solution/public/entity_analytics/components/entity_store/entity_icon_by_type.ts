/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import { EntityType } from '../../../../common/entity_analytics/types';

/**
 * Maps an entity type to its EUI icon.
 *
 * Kept as a standalone leaf module (rather than living in `./helpers`) so page-load-sensitive
 * code — e.g. the `security.entity` case attachment registered synchronously at plugin start —
 * can reuse it without pulling the entity-store sanitize/generated-schema graph that `./helpers`
 * imports into the page-load bundle.
 */
export const EntityIconByType: Record<EntityType, IconType> = {
  [EntityType.user]: 'user',
  [EntityType.host]: 'storage',
  [EntityType.service]: 'node',
  [EntityType.generic]: 'globe',
};
