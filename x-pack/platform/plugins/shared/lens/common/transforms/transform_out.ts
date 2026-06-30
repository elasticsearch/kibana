/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { LensSerializedState } from '@kbn/lens-common';
import { transformTimeRangeOut, transformTitlesOut } from '@kbn/presentation-publishing';
import { LENS_UNKNOWN_VIS, type LensByValueSerializedState } from '@kbn/lens-common';
import { LENS_ITEM_VERSION_V2 } from '@kbn/lens-common/content_management/constants';
import type { LensAttributes, LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import type { DrilldownTransforms } from '@kbn/embeddable-plugin/common';
import { flow } from 'lodash';
import { transformToV1LensItemAttributes } from '../content_management/v1';
import { transformToV2LensItemAttributes } from '../content_management/v2';
import { injectLensReferences } from '../references';
import type {
  LensByRefTransformOutResult,
  LensByValueTransformOutResult,
  LensTransformOut,
} from './types';
import { findLensReference } from './utils';
import { isLensAttributesV0, isLensAttributesV1 } from '../content_management/utils';
import { stripInheritedContext } from './helpers';

/**
 * Transform from Lens Stored State to Lens API format
 */
export const getTransformOut = (
  builder: LensConfigBuilder,
  transformDrilldownsOut: DrilldownTransforms['transformOut'],
  isDashboardAppRequest: boolean
): LensTransformOut => {
  return function transformOut(storedState, panelReferences) {
    const transformsFlow = flow(
      transformTitlesOut<LensSerializedState>,
      transformTimeRangeOut<LensSerializedState>,
      (state: LensSerializedState) => transformDrilldownsOut(state, panelReferences),
      stripInheritedContext
    );

    const { attributes, ...state } = transformsFlow(storedState);

    const savedObjectRef = findLensReference(panelReferences);

    if (savedObjectRef) {
      return {
        ...state,
        ref_id: savedObjectRef.id,
      } satisfies LensByRefTransformOutResult;
    }

    const migratedAttributes = migrateAttributes(attributes);
    const injectedState = injectLensReferences(
      {
        ...state,
        attributes: migratedAttributes,
      },
      panelReferences
    );

    if (isDashboardAppRequest && !builder.isEnabled) {
      return injectedState as LensByValueTransformOutResult;
    }

    // Use the reference-injected attributes (not `migratedAttributes`) so the
    // resolved/remapped panel references win over the chart's embedded ones.
    // When a dashboard is copied to another space, SO import remaps the panel
    // `index-pattern` references; `toAPIFormat` reads data view ids from the
    // attributes' references, so it must see the remapped ids. Otherwise the
    // panel keeps the original (wrong-space) data view id and fails to render.
    // See https://github.com/elastic/kibana/issues/268821.
    const injectedAttributes = injectedState.attributes ?? migratedAttributes;

    const chartType = builder.getType(injectedAttributes);
    // should be filtered out my unmapped panel check
    if (!builder.isSupported(chartType)) {
      throw new Error(`Lens "${chartType}" chart type is not supported`);
    }

    const {
      title: _, // ignore attributes title
      description: __, // ignore attributes description
      ...apiConfig
    } = builder.toAPIFormat({
      ...injectedAttributes,
      visualizationType: injectedAttributes.visualizationType ?? LENS_UNKNOWN_VIS,
    });

    return {
      ...state,
      ...apiConfig,
    } satisfies LensByValueTransformOutResult;
  };
};

/**
 * Handles transforming old lens SO in dashboard to v1 Lens SO
 */
export function migrateAttributes(
  attributes: LensByValueSerializedState['attributes']
): LensAttributes {
  if (!attributes) {
    throw new Error('Why are attributes undefined?');
  }

  const { visualizationType } = attributes;

  if (!visualizationType) {
    throw new Error('Missing visualizationType');
  }

  const newAttributes = { ...attributes, visualizationType };
  if (isLensAttributesV0(newAttributes) || isLensAttributesV1(newAttributes)) {
    const v1Attributes = transformToV1LensItemAttributes(newAttributes);
    const v2Attributes = transformToV2LensItemAttributes({ ...v1Attributes, visualizationType });
    return {
      ...attributes,
      ...v2Attributes,
      version: LENS_ITEM_VERSION_V2 as LensAttributes['version'],
    };
  }

  return newAttributes as LensAttributes;
}
