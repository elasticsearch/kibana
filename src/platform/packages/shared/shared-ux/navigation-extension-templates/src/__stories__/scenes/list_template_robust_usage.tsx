/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { faker } from '@faker-js/faker';
import type { StoryObj } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import type { SerializableRecord } from '@kbn/utility-types';
import React from 'react';
import { ListTemplate } from '../../templates/list_template';

interface ListTemplateData extends SerializableRecord {
  id: string;
  label: string;
  href: string;
}

export const ListTemplateRobustUsage: StoryObj<typeof ListTemplate<ListTemplateData>> = {
  render: function ListTemplateWrapper(args) {
    return <ListTemplate {...args} />;
  },
  args: {
    data: Array.from({ length: 10 }, () => ({
      id: faker.string.uuid(),
      label: faker.lorem.word(),
      href: faker.internet.url(),
    })),
    config: {
      heading: 'List Template Robust Usage',
      supportAddItem: { enabled: true, onClick: action('addItemAction') },
      search: {
        enabled: true,
        placeholder: 'Search the list',
        noSearchResultsMessage: 'No items yet',
      },
      actions: [
        {
          id: 'delete',
          label: 'Delete',
          icon: 'trash',
          onClick: action('deleteAction'),
        },
        {
          id: 'edit',
          label: 'Edit',
          icon: 'pencil',
          onClick: action('editAction'),
        },
        {
          id: 'copy',
          label: 'Copy',
          icon: 'copy',
          onClick: action('copyAction'),
        },
      ],
    },
    context: {
      slotId: 'slotId',
      extensionId: 'extensionId',
      primaryItemId: 'primaryItemId',
      sectionId: 'sectionId',
      surface: 'sidePanel',
    },
  },
};

ListTemplateRobustUsage.parameters = { docs: { disable: true } };
