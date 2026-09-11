/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSetup, CoreStart, Plugin } from '@kbn/core/server';

import type { ExpressionXyPluginSetup, ExpressionXyPluginStart } from './types';
import {
  xyVisFunction,
  legendConfigFunction,
  dataDecorationConfigFunction,
  xAxisConfigFunction,
  yAxisConfigFunction,
  referenceLineDecorationConfigFunction,
  axisExtentConfigFunction,
  annotationLayerFunction,
  referenceLineFunction,
  extendedDataLayerFunction,
  referenceLineLayerFunction,
  pointsLayerFunction,
  layeredXyVisFunction,
  extendedAnnotationLayerFunction,
} from '../common/expression_functions';
import type { SetupDeps } from './types';
import { eventAnnotationsResult } from '../common/expression_functions/event_annotations_result';

export class ExpressionXyPlugin
  implements Plugin<ExpressionXyPluginSetup, ExpressionXyPluginStart>
{
  public setup(core: CoreSetup, { expressions }: SetupDeps) {
    expressions.registerFunction(yAxisConfigFunction);
    expressions.registerFunction(dataDecorationConfigFunction);
    expressions.registerFunction(xAxisConfigFunction);
    expressions.registerFunction(referenceLineDecorationConfigFunction);
    expressions.registerFunction(legendConfigFunction);
    expressions.registerFunction(extendedDataLayerFunction);
    expressions.registerFunction(axisExtentConfigFunction);
    expressions.registerFunction(annotationLayerFunction);
    expressions.registerFunction(extendedAnnotationLayerFunction);
    expressions.registerFunction(eventAnnotationsResult);
    expressions.registerFunction(referenceLineFunction);
    expressions.registerFunction(referenceLineLayerFunction);
    expressions.registerFunction(pointsLayerFunction);
    expressions.registerFunction(xyVisFunction);
    expressions.registerFunction(layeredXyVisFunction);
  }

  public start(core: CoreStart) {}

  public stop() {}
}
