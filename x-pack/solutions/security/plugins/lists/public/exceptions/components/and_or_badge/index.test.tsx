/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mount } from 'enzyme';
import { EuiProvider } from '@elastic/eui';

import { AndOrBadge } from '.';

describe('AndOrBadge', () => {
  test('it renders top and bottom antenna bars when "includeAntennas" is true', () => {
    const wrapper = mount(
      <EuiProvider>
        <AndOrBadge includeAntennas type="and" />
      </EuiProvider>
    );

    expect(wrapper.find('[data-test-subj="and-or-badge"]').at(0).text()).toEqual('AND');
    expect(wrapper.find('[data-test-subj="andOrBadgeBarTop"]').exists()).toBeTruthy();
    expect(wrapper.find('[data-test-subj="andOrBadgeBarBottom"]').exists()).toBeTruthy();
  });

  test('it does not render top and bottom antenna bars when "includeAntennas" is false', () => {
    const wrapper = mount(
      <EuiProvider>
        <AndOrBadge type="or" />
      </EuiProvider>
    );

    expect(wrapper.find('[data-test-subj="and-or-badge"]').at(0).text()).toEqual('OR');
    expect(wrapper.find('[data-test-subj="andOrBadgeBarTop"]').exists()).toBeFalsy();
    expect(wrapper.find('[data-test-subj="andOrBadgeBarBottom"]').exists()).toBeFalsy();
  });

  test('it renders "and" when "type" is "and"', () => {
    const wrapper = mount(
      <EuiProvider>
        <AndOrBadge type="and" />
      </EuiProvider>
    );

    expect(wrapper.find('[data-test-subj="and-or-badge"]').at(0).text()).toEqual('AND');
  });

  test('it renders "or" when "type" is "or"', () => {
    const wrapper = mount(
      <EuiProvider>
        <AndOrBadge type="or" />
      </EuiProvider>
    );

    expect(wrapper.find('[data-test-subj="and-or-badge"]').at(0).text()).toEqual('OR');
  });
});
