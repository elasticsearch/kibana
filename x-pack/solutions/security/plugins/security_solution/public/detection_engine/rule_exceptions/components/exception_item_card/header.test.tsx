/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { mount } from 'enzyme';
import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';

import * as i18n from './translations';
import { ExceptionItemCardHeader } from './header';
import { TestProviders } from '../../../../common/mock';

describe('ExceptionItemCardHeader', () => {
  it('it renders item name', () => {
    const wrapper = mount(
      <TestProviders>
        <ExceptionItemCardHeader
          item={getExceptionListItemSchemaMock()}
          dataTestSubj="exceptionItemHeader"
          actions={[
            {
              key: 'edit',
              icon: 'pencil',
              label: i18n.EXCEPTION_ITEM_EDIT_BUTTON,
              onClick: jest.fn(),
            },
            {
              key: 'delete',
              icon: 'trash',
              label: i18n.EXCEPTION_ITEM_DELETE_BUTTON,
              onClick: jest.fn(),
            },
          ]}
        />
      </TestProviders>
    );

    expect(wrapper.find('[data-test-subj="exceptionItemHeader-title"]').at(0).text()).toEqual(
      'some name'
    );
  });

  it('it displays actions', () => {
    const handleEdit = jest.fn();
    const handleDelete = jest.fn();
    const wrapper = mount(
      <TestProviders>
        <ExceptionItemCardHeader
          actions={[
            {
              key: 'edit',
              icon: 'pencil',
              label: i18n.EXCEPTION_ITEM_EDIT_BUTTON,
              onClick: handleEdit,
            },
            {
              key: 'delete',
              icon: 'trash',
              label: i18n.EXCEPTION_ITEM_DELETE_BUTTON,
              onClick: handleDelete,
            },
          ]}
          item={getExceptionListItemSchemaMock()}
          dataTestSubj="exceptionItemHeader"
        />
      </TestProviders>
    );

    // click on popover
    wrapper
      .find('button[data-test-subj="exceptionItemHeader-actionButton"]')
      .at(0)
      .simulate('click');

    wrapper.find('button[data-test-subj="exceptionItemHeader-actionItem-edit"]').simulate('click');
    expect(handleEdit).toHaveBeenCalled();

    wrapper
      .find('button[data-test-subj="exceptionItemHeader-actionItem-delete"]')
      .simulate('click');
    expect(handleDelete).toHaveBeenCalled();
  });

  it('it disables actions if disableActions is true', () => {
    const handleEdit = jest.fn();
    const handleDelete = jest.fn();
    const wrapper = mount(
      <TestProviders>
        <ExceptionItemCardHeader
          actions={[
            {
              key: 'edit',
              icon: 'pencil',
              label: i18n.EXCEPTION_ITEM_EDIT_BUTTON,
              onClick: handleEdit,
            },
            {
              key: 'delete',
              icon: 'trash',
              label: i18n.EXCEPTION_ITEM_DELETE_BUTTON,
              onClick: handleDelete,
            },
          ]}
          item={getExceptionListItemSchemaMock()}
          disableActions
          dataTestSubj="exceptionItemHeader"
        />
      </TestProviders>
    );

    expect(
      wrapper.find('button[data-test-subj="exceptionItemHeader-actionButton"]').at(0).props()
        .disabled
    ).toBeTruthy();
  });
});
