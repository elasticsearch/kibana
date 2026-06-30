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

  // A defined panel-level title (including an explicit empty string) always wins over the
  // attributes title.
  it.each(['Panel title', ''])(
    'should use the panel title "%s" and ignore the attributes title',
    (title) => {
      const builder = new LensConfigBuilder(undefined, true);
      const transformOut = getTransformOut(builder, transformDrilldownsOut, false);

      const storedState: LensByValueSerializedState = {
        title,
        attributes: {
          ...simpleMetricAttributes,
          title: 'Attributes title', // ignored: the panel defines its own title
        },
        references: [],
      };

      const result = transformOut(storedState, []);

      expect(result.title).toEqual(title);
    }
  );

  // When the panel has no title (key absent or `undefined`), fall back to the attributes
  // title so legacy by-value panels keep their title through the apiFormat round-trip.
  // See https://github.com/elastic/kibana/issues/268821
  it('falls back to the attributes title when the panel title is undefined', () => {
    const builder = new LensConfigBuilder(undefined, true);
    const transformOut = getTransformOut(builder, transformDrilldownsOut, false);

    const storedState: LensByValueSerializedState = {
      title: undefined,
      attributes: {
        ...simpleMetricAttributes,
        title: 'Attributes title',
      },
      references: [],
    };

    const result = transformOut(storedState, []);

    expect(result.title).toEqual('Attributes title');
  });

  // Regression coverage for https://github.com/elastic/kibana/issues/268821.
  // Legacy by-value dashboard panels were persisted with the title only inside
  // `attributes` and no panel-level `title` key at all. The apiFormat round-trip must
  // keep that title (the non-apiFormat path renders it via `defaultTitle$`).
  it('falls back to the attributes title for legacy by-value panels with no panel title key', () => {
    const builder = new LensConfigBuilder(undefined, true);
    const transformOut = getTransformOut(builder, transformDrilldownsOut, true);

    const storedState = {
      // NOTE: intentionally no top-level `title` key (legacy shape).
      attributes: {
        ...simpleMetricAttributes,
        title: 'Attributes title',
      },
      references: [],
    } as LensByValueSerializedState;

    const result = transformOut(storedState, []);

    expect(result.title).toEqual('Attributes title');
  });
});
