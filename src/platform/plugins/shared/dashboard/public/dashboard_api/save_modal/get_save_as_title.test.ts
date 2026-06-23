/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { computeSaveAsTitle } from './get_save_as_title';

const FEW_PANELS_TITLE = 'few panels';

describe('computeSaveAsTitle', () => {
  it('suggests "(1)" when cloning the source dashboard', () => {
    expect(computeSaveAsTitle(FEW_PANELS_TITLE, [FEW_PANELS_TITLE])).toBe(
      `${FEW_PANELS_TITLE} (1)`
    );
  });

  it('suggests "(2)" when cloning an existing "(1)" copy', () => {
    expect(
      computeSaveAsTitle(`${FEW_PANELS_TITLE} (1)`, [FEW_PANELS_TITLE, `${FEW_PANELS_TITLE} (1)`])
    ).toBe(`${FEW_PANELS_TITLE} (2)`);
  });

  it('increments from the highest existing copy index', () => {
    expect(
      computeSaveAsTitle(`${FEW_PANELS_TITLE} (1)`, [
        FEW_PANELS_TITLE,
        `${FEW_PANELS_TITLE} (1)`,
        `${FEW_PANELS_TITLE} (20)`,
      ])
    ).toBe(`${FEW_PANELS_TITLE} (21)`);
  });

  it('uses the next count when the current title is not yet saved', () => {
    expect(computeSaveAsTitle(`${FEW_PANELS_TITLE} (3)`, [FEW_PANELS_TITLE])).toBe(
      `${FEW_PANELS_TITLE} (4)`
    );
  });
});
