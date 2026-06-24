/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentType, ReactNode } from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import type { XOR } from '../../../../../../common/utility_types';

/**
 * Optional renderer for entity table values that wraps the value in a link
 * (e.g., a v2 flyout link). Receives the field name and value, and may render `children`
 * as the visible content.
 */
export type EntityTableLinkRenderer = ComponentType<{
  field: string;
  value: string;
  children?: ReactNode;
}>;

export type EntityTableRow<T extends BasicEntityData> = XOR<
  {
    label: string;
    /**
     * The field name. It is used for displaying CellActions.
     */
    field: string;
    /**
     * It extracts field value(s) from the data. Can be a single string or array (ES fields vary).
     * Normalized to string[] when passed to DefaultFieldRenderer.
     */
    getValues: (data: T) => string | string[] | null | undefined;
    /**
     * It allows the customization of the rendered field.
     * The element is still rendered inside `DefaultFieldRenderer` getting `CellActions` and `MoreContainer` capabilities.
     */
    renderField?: (value: string) => JSX.Element;
    /**
     * It hides the row when `isVisible` returns false.
     */
    isVisible?: (data: T) => boolean;
  },
  {
    label: string;
    /**
     * It takes complete control over the rendering.
     * `getValues` and `renderField` are not called when this property is used.
     */
    render: (data: T) => JSX.Element;
    /**
     * It hides the row when `isVisible` returns false.
     */
    isVisible?: (data: T) => boolean;
  }
>;

export type EntityTableColumns<T extends BasicEntityData> = Array<
  EuiBasicTableColumn<EntityTableRow<T>>
>;
export type EntityTableRows<T extends BasicEntityData> = Array<EntityTableRow<T>>;

export interface BasicEntityData {
  isLoading: boolean;
  /**
   * Canonical Entity Store id (`entity.id`) for preview links and flyout context when available.
   */
  entityId?: string;
}
