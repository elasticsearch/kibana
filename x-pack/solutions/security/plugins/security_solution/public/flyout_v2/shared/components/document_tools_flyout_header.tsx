/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, ReactNode } from 'react';
import React, { memo } from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { CellActionRenderer } from './cell_actions';
import { ToolsFlyoutHeader } from './tools_flyout_header';
import { useDocumentFlyoutTitle } from '../hooks/use_document_flyout_title';

export interface DocumentToolsFlyoutHeaderProps {
  /**
   * Title for the tool panel (e.g. "Correlations", "Investigation guide").
   */
  title: ReactNode;
  /**
   * Source document used to derive the context title button label, icon,
   * severity badge, timestamp, and the child flyout opened on click.
   */
  hit: DataTableRecord;
  /**
   * Cell action renderer forwarded to the child document flyout.
   */
  renderCellActions?: CellActionRenderer;
  /**
   * Callback invoked after alert mutations in the child document flyout.
   */
  onAlertUpdated?: () => void;
}

/**
 * Wrapper around the ToolsFlyoutHeader that uses the useDocumentFlyoutTitle hook to
 * compute all relevant values.
 * */
export const DocumentToolsFlyoutHeader: FC<DocumentToolsFlyoutHeaderProps> = memo(
  ({ title, hit, renderCellActions, onAlertUpdated }) => {
    const { label, iconType, onTitleClick, badge, timestamp } = useDocumentFlyoutTitle({
      hit,
      renderCellActions,
      onAlertUpdated,
    });

    return (
      <ToolsFlyoutHeader
        title={title}
        onTitleClick={onTitleClick}
        label={label}
        iconType={iconType}
        badge={badge}
        timestamp={timestamp}
      />
    );
  }
);

DocumentToolsFlyoutHeader.displayName = 'DocumentToolsFlyoutHeader';
