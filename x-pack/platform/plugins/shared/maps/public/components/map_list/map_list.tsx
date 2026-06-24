/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import {
  ContentList,
  ContentListFooter,
  ContentListTable,
  ContentListToolbar,
} from '@kbn/content-list';

import { APP_NAME } from '../../../common/constants';

const { Column, Action } = ContentListTable;

const MapListComp = () => (
  <ContentList>
    <ContentListToolbar />
    <ContentListTable title={APP_NAME}>
      <Column.Name showDescription showTags />
      <Column.Actions>
        <Action.ContentEditor />
        <Action.Delete />
      </Column.Actions>
    </ContentListTable>
    <ContentListFooter />
  </ContentList>
);

export const MapList = memo(MapListComp);
