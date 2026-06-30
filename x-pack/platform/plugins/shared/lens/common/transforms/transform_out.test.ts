/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import type { LensByValueSerializedState } from '@kbn/lens-common';

import { simpleMetricAttributes } from '@kbn/lens-embeddable-utils/config_builder/tests/metric/lens_state_config.mock';
import { getTransformOut } from './transform_out';

describe('getTransformOut', () => {
  const transformDrilldownsOut = jest.fn(<T extends { drilldowns?: unknown }>(state: T) => state);

  it.each(['panel title', '', undefined])(
    'should use panel title for "%s" and ignore attributes title',
    (title) => {
      const builder = new LensConfigBuilder(undefined, true);
      const transformOut = getTransformOut(builder, transformDrilldownsOut, false);

      const storedState: LensByValueSerializedState = {
        title,
        attributes: {
          ...simpleMetricAttributes,
          title: 'attributes title', // always ignored
        },
        references: [],
      };

      const result = transformOut(storedState, []);

      expect(result.title).toEqual(title);
    }
  );

  // Regression test for https://github.com/elastic/kibana/issues/268821
  // When a dashboard is copied to another space, SO import remaps the panel's
  // index-pattern references to the new space's data view ids. The apiFormat
  // output must reflect the remapped ids (taken from `panelReferences`), not the
  // chart's original embedded references; otherwise the copied panel points at
  // the wrong-space data view and fails to render.
  it('uses remapped panel references for the apiFormat data view id', () => {
    const builder = new LensConfigBuilder(undefined, true);
    const transformOut = getTransformOut(builder, transformDrilldownsOut, true);

    const originalReference = simpleMetricAttributes.references[0];
    const remappedDataViewId = 'remapped-data-view-id';

    const storedState: LensByValueSerializedState = {
      title: 'Metric',
      attributes: {
        ...simpleMetricAttributes,
      },
      references: [],
    };

    const result = transformOut(storedState, [
      // Same reference name, remapped id (as produced by copy-to-space).
      { ...originalReference, id: remappedDataViewId },
    ]) as { data_source?: { type: string; ref_id?: string } };

    expect(result.data_source).toEqual(expect.objectContaining({ ref_id: remappedDataViewId }));
  });
});
