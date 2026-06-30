/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export const LENS_LAYER_SUFFIX = `indexpattern-datasource-layer-`;
/**
 * Reference name prefix used by the XY visualization for the data view of a
 * by-value annotation layer. This must match the prefix produced by the Lens
 * XY persistence logic (`xy-visualization-layer-<layerId>`); otherwise the
 * runtime cannot resolve the annotation layer's data view and the panel fails
 * to render. See x-pack/.../lens/public/visualizations/xy/persistence.ts.
 */
export const LENS_XY_ANNOTATION_LAYER_SUFFIX = `xy-visualization-layer-`;
export const LENS_DEFAULT_TIME_FIELD = '@timestamp';
export const INDEX_PATTERN_ID = 'index-pattern';
