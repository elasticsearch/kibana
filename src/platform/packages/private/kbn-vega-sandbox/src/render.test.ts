/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { View } from 'vega';
import { renderVegaDescriptor } from './render';

describe('renderVegaDescriptor', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('finalizes the view and rethrows when runAsync fails', async () => {
    const finalize = jest.spyOn(View.prototype, 'finalize');
    jest.spyOn(View.prototype, 'runAsync').mockRejectedValue(new Error('run failed'));

    await expect(
      renderVegaDescriptor({
        container: document.createElement('div'),
        controls: document.createElement('div'),
        descriptor: {
          spec: { $schema: 'https://vega.github.io/schema/vega/v5.json', width: 1, height: 1 },
          renderer: 'svg',
          useHover: false,
          useResize: false,
          tooltips: false,
        },
      })
    ).rejects.toThrow('run failed');

    expect(finalize).toHaveBeenCalled();
  });
});
