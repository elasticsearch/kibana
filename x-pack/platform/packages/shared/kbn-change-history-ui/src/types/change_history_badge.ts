/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import type { ChangeHistoryListItem } from './change_history_list_item';

export type ChangeHistoryBadgeRenderFn = (props: { item: ChangeHistoryListItem }) => ReactNode;
