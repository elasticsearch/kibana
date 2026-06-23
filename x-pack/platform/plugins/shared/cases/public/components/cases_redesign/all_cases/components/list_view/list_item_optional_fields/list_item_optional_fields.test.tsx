/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CustomFieldTypes } from '../../../../../../../common/types/domain';
import { renderWithTestingProviders } from '../../../../../../common/mock';
import { basicCase } from '../../../../../../containers/mock';
import { ListItemOptionalFields } from './list_item_optional_fields';
import * as i18n from '../../../translations';

const buildExtendedFields = (count: number): Record<string, string> =>
  Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`field_${index}_as_keyword`, `value-${index}`])
  );

describe('ListItemOptionalFields', () => {
  it('returns null when no fields are checked', () => {
    const { container } = renderWithTestingProviders(
      <ListItemOptionalFields
        theCase={basicCase}
        selectedFields={[{ field: 'tags', name: i18n.TAGS, isChecked: false }]}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders field content when fields are checked', () => {
    renderWithTestingProviders(
      <ListItemOptionalFields
        theCase={{ ...basicCase, tags: ['coke', 'pepsi'] }}
        selectedFields={[{ field: 'tags', name: i18n.TAGS, isChecked: true }]}
      />
    );

    expect(screen.getByTestId('cases-list-item-optional-fields')).toBeInTheDocument();
    expect(screen.getByTestId('cases-list-item-field-tags')).toHaveTextContent('Tags: coke, pepsi');
  });

  it('renders custom field values when checked', () => {
    renderWithTestingProviders(
      <ListItemOptionalFields
        theCase={{
          ...basicCase,
          customFields: [{ key: 'priority', value: 'high', type: CustomFieldTypes.TEXT }],
        }}
        selectedFields={[{ field: 'priority', name: 'Priority', isChecked: true }]}
      />
    );

    expect(screen.getByTestId('cases-list-item-field-priority')).toHaveTextContent(
      'Priority: high'
    );
  });

  it('renders extended fields as a count with a tooltip listing field labels', async () => {
    renderWithTestingProviders(
      <ListItemOptionalFields
        theCase={{
          ...basicCase,
          extendedFields: {
            summary_as_keyword: 'hello',
            effort_as_integer: '3',
          },
          extendedFieldsLabels: {
            summary_as_keyword: 'Summary',
            effort_as_integer: 'Effort',
          },
        }}
        selectedFields={[{ field: 'extendedFields', name: i18n.EXTENDED_FIELDS, isChecked: true }]}
      />
    );

    const extendedFields = screen.getByTestId('cases-list-item-field-extended-fields');
    expect(extendedFields).toHaveTextContent('Extended fields: 2');
    expect(
      screen.getByTestId('cases-list-item-field-extended-fields-tooltip-anchor')
    ).toHaveTextContent('2');
    expect(extendedFields).not.toHaveTextContent('hello');
    expect(extendedFields).not.toHaveTextContent('Summary:');

    await userEvent.hover(
      screen.getByTestId('cases-list-item-field-extended-fields-tooltip-anchor')
    );

    expect(await screen.findByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Effort')).toBeInTheDocument();
  });

  it('shows the total count and lists all field labels in the tooltip when there are many extended fields', async () => {
    renderWithTestingProviders(
      <ListItemOptionalFields
        theCase={{
          ...basicCase,
          extendedFields: buildExtendedFields(7),
        }}
        selectedFields={[{ field: 'extendedFields', name: i18n.EXTENDED_FIELDS, isChecked: true }]}
      />
    );

    const extendedFields = screen.getByTestId('cases-list-item-field-extended-fields');
    expect(extendedFields).toHaveTextContent('Extended fields: 7');
    expect(
      screen.getByTestId('cases-list-item-field-extended-fields-tooltip-anchor')
    ).toHaveTextContent('7');
    expect(extendedFields).not.toHaveTextContent('value-0');
    expect(
      screen.queryByTestId('cases-list-item-field-extended-fields-more')
    ).not.toBeInTheDocument();

    await userEvent.hover(
      screen.getByTestId('cases-list-item-field-extended-fields-tooltip-anchor')
    );

    expect(await screen.findByText('Field 0')).toBeInTheDocument();
    expect(screen.getByText('Field 6')).toBeInTheDocument();
    expect(screen.queryByText('value-0')).not.toBeInTheDocument();
  });
});
