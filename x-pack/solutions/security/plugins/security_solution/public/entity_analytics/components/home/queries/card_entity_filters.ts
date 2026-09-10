/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { SignalCardId } from '../facelift/v5/data';

/**
 * Maps a signal card selection to an entity-latest DSL filter for the entities
 * table. Add one case per tile as each tile's query is implemented.
 *
 * Tiles based on LOOKUP JOIN (entitiesWithAlerts, entitiesWithAnomalies)
 * return null because their predicates cannot be expressed in entity-latest DSL alone
 * without re-running the join. This is a POC limitation — the table shows all entities
 * when these tiles are selected.
 *
 * Tiles 3 & 4 (riskMovers, newlyHighCritical) are stubs pending risk score history
 * query implementation.
 */
export const getCardEntityFilter = (cardId: SignalCardId): QueryDslQueryContainer | null => {
  switch (cardId) {
    case 'entitiesWithAlerts':
    case 'entitiesWithAnomalies':
    case 'riskMovers':
    case 'newlyHighCritical':
    case 'watchlisted':
    case 'newEntity':
    default:
      return null;
  }
};
