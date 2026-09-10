/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import type { MappingEditorValue } from './mapping_editor';
import { MappingEditor, emptyMappingEditorValue, DataType } from './mapping_editor';

const meta: Meta<typeof MappingEditor> = {
  component: MappingEditor,
  title: 'data_federation/MappingEditor',
};

export default meta;
type Story = StoryObj<typeof MappingEditor>;

const PopulatedStory = () => {
  const [value, setValue] = React.useState<MappingEditorValue>(() => ({
    ...emptyMappingEditorValue(),
    dynamic: false,
    fields: [
      {
        id: '0',
        name: '@timestamp',
        path: 'event_time',
        type: DataType.DATETIME,
        format: 'yyyy-MM-dd HH:mm:ss',
      },
      {
        id: '1',
        name: 'request_id',
        path: '',
        type: DataType.KEYWORD,
        format: '',
      },
      {
        id: '2',
        name: 'status_code',
        path: '',
        type: DataType.INTEGER,
        format: '',
      },
    ],
    idPath: 'request_id',
  }));

  return <MappingEditor value={value} onChange={setValue} />;
};

const EmptyStory = () => {
  const [value, setValue] = React.useState<MappingEditorValue>(() => emptyMappingEditorValue());
  return <MappingEditor value={value} onChange={setValue} />;
};

export const Empty: Story = {
  render: () => {
    return <EmptyStory />;
  },
};

export const Populated: Story = {
  render: () => {
    return <PopulatedStory />;
  },
};
