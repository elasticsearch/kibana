/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DASHBOARD_GRID_COLUMN_COUNT } from '@kbn/dashboard-plugin/public';
import { PlacementStrategy } from '@kbn/embeddable-plugin/public';

import type { LinksEmbeddableState } from '../../common';
import { LINKS_HORIZONTAL_LAYOUT } from '../../common/constants';
import type { LinksByValueState } from '../../server';
import { loadFromLibrary } from '../links_client/load_from_library';

export async function getPlacementHints(serializedState?: LinksEmbeddableState) {
  if (!serializedState) return {};

  let layout = LINKS_HORIZONTAL_LAYOUT;
  let numLinks = 1;
  try {
    const refId = (serializedState as { ref_id?: string }).ref_id;
    const linksState = refId
      ? await loadFromLibrary(refId)
      : (serializedState as LinksByValueState);
    if (linksState.layout) layout = linksState.layout;
    if (linksState.links) numLinks = linksState.links.length;
  } catch (error) {
    // ignore saved object load error and just use default values
  }
  const isHorizontal = layout === LINKS_HORIZONTAL_LAYOUT;
  const width = isHorizontal ? DASHBOARD_GRID_COLUMN_COUNT : 8;
  const height = isHorizontal ? 2 : numLinks * 3 + 4;
  return {
    width,
    height,
    strategy: PlacementStrategy.placeAtTop,
  };
}
