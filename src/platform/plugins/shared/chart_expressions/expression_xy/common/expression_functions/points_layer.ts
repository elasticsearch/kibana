/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import { LayerTypes, POINTS_LAYER } from '../constants';
import type { PointsLayerFn } from '../types';

export const pointsLayerFunction: PointsLayerFn = {
  name: POINTS_LAYER,
  aliases: [],
  type: POINTS_LAYER,
  help: i18n.translate('expressionXY.pointsLayer.help', {
    defaultMessage:
      'Configures a points overlay layer on an XY chart. The query must return @timestamp and the column named by yAccessor.',
  }),
  inputTypes: ['datatable', 'null'],
  args: {
    layerId: {
      types: ['string'],
      required: true,
      help: i18n.translate('expressionXY.pointsLayer.layerId.help', {
        defaultMessage: 'Unique identifier for the layer',
      }),
    },
    query: {
      types: ['string'],
      required: true,
      help: i18n.translate('expressionXY.pointsLayer.query.help', {
        defaultMessage:
          'ES|QL query string that fetches the points data. Must return @timestamp and the column named by yAccessor.',
      }),
    },
    yAccessor: {
      types: ['string'],
      required: true,
      help: i18n.translate('expressionXY.pointsLayer.yAccessor.help', {
        defaultMessage: 'Name of the column in the query result that holds the Y-axis value.',
      }),
    },
  },
  fn(input, args) {
    return {
      type: POINTS_LAYER,
      ...args,
      layerType: LayerTypes.POINTS,
      table: input ?? undefined,
    };
  },
};
