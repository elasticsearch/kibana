/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import 'jest-styled-components';

import { createFleetTestRendererMock } from '../../../../../../mock';

import { PackageListGrid } from '.';

function renderPackageListGrid() {
  const renderer = createFleetTestRendererMock();

  const utils = renderer.render(
    <PackageListGrid
      list={[]}
      categories={[]}
      searchTerm=""
      setSearchTerm={() => {}}
      selectedCategory=""
      setCategory={() => {}}
      setUrlandReplaceHistory={() => {}}
      setUrlandPushHistory={() => {}}
      showControls={true}
      showSearchTools={false}
    />
  );

  return { utils };
}

describe('PackageListGrid', () => {
  it('only applies sticky styling to the controls sidebar on medium+ screens', () => {
    const { utils } = renderPackageListGrid();

    const sidebar = utils.getByTestId('epmList.controlsSideColumn');

    // Sticky only kicks in at the medium breakpoint so the filters scroll
    // normally (off the page) on mobile.
    expect(sidebar).toHaveStyleRule('position', 'sticky', {
      media: '(min-width: 768px)',
    });
    expect(sidebar).not.toHaveStyleRule('position', 'sticky');
  });
});
