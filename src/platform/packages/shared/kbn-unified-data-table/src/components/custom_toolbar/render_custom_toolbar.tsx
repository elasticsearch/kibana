/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { EuiDataGridCustomToolbarProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, type UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';

export interface UnifiedDataTableRenderCustomToolbarProps {
  toolbarProps: EuiDataGridCustomToolbarProps;
  gridProps: {
    additionalControls?: React.ReactNode;
    inTableSearchControl?: React.ReactNode;
  };
}

export type UnifiedDataTableRenderCustomToolbar = (
  props: UnifiedDataTableRenderCustomToolbarProps
) => React.ReactElement;

interface RenderCustomToolbarProps extends UnifiedDataTableRenderCustomToolbarProps {
  saveToDashboardButton?: React.ReactElement;
  leftSide?: React.ReactElement;
  bottomSection?: React.ReactElement;
  wrap?: boolean;
}

export const internalRenderCustomToolbar = (
  props: RenderCustomToolbarProps
): React.ReactElement => {
  const {
    saveToDashboardButton,
    leftSide,
    bottomSection,
    wrap = true,
    toolbarProps: {
      hasRoomForGridControls,
      columnControl,
      columnSortingControl,
      fullScreenControl,
      keyboardShortcutsControl,
      displayControl,
    },
    gridProps: { additionalControls, inTableSearchControl },
  } = props;

  const buttons = hasRoomForGridControls ? (
    <>
      {leftSide && additionalControls ? (
        <EuiFlexItem grow={false}>
          <div>{additionalControls}</div>
        </EuiFlexItem>
      ) : null}
      {columnControl ? (
        <EuiFlexItem grow={false}>
          <div className="unifiedDataTableToolbarControlButton" css={styles.controlButton}>
            {columnControl}
          </div>
        </EuiFlexItem>
      ) : null}
      {columnSortingControl ? (
        <EuiFlexItem grow={false}>
          <div className="unifiedDataTableToolbarControlButton" css={styles.controlButton}>
            {columnSortingControl}
          </div>
        </EuiFlexItem>
      ) : null}
      {!leftSide && additionalControls ? (
        <EuiFlexItem grow={false}>
          <div>{additionalControls}</div>
        </EuiFlexItem>
      ) : null}
    </>
  ) : null;

  return (
    <>
      <EuiFlexGroup
        responsive={false}
        gutterSize="s"
        justifyContent="spaceBetween"
        alignItems="center"
        className="unifiedDataTableToolbar"
        css={styles.toolbar}
        data-test-subj="unifiedDataTableToolbar"
        wrap={wrap}
      >
        <EuiFlexItem grow={false}>
          {leftSide || (
            <EuiFlexGroup responsive={false} gutterSize="s" alignItems="center">
              {buttons}
            </EuiFlexGroup>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup responsive={false} gutterSize="s" alignItems="center">
            {Boolean(leftSide) && buttons}
            {Boolean(
              keyboardShortcutsControl ||
                displayControl ||
                fullScreenControl ||
                inTableSearchControl
            ) && (
              <EuiFlexItem grow={false}>
                <div className="unifiedDataTableToolbarControlGroup" css={styles.controlGroup}>
                  {Boolean(inTableSearchControl) && (
                    <div
                      className="unifiedDataTableToolbarControlIconButton"
                      css={styles.controlGroupIconButton}
                    >
                      {inTableSearchControl}
                    </div>
                  )}
                  {Boolean(keyboardShortcutsControl) && (
                    <div
                      className="unifiedDataTableToolbarControlIconButton"
                      css={styles.controlGroupIconButton}
                    >
                      {keyboardShortcutsControl}
                    </div>
                  )}
                  {Boolean(displayControl) && (
                    <div
                      className="unifiedDataTableToolbarControlIconButton"
                      css={styles.controlGroupIconButton}
                    >
                      {displayControl}
                    </div>
                  )}
                  {Boolean(fullScreenControl) && (
                    <div
                      className="unifiedDataTableToolbarControlIconButton"
                      css={styles.controlGroupIconButton}
                    >
                      {fullScreenControl}
                    </div>
                  )}
                  {Boolean(saveToDashboardButton) && (
                    <div
                      className="unifiedDataTableToolbarControlIconButton"
                      css={styles.controlGroupIconButton}
                    >
                      {saveToDashboardButton}
                    </div>
                  )}
                </div>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      {bottomSection ? (
        <div
          className="unifiedDataTableToolbarBottom"
          css={styles.toolbarBottom}
          data-test-subj="unifiedDataTableToolbarBottom"
        >
          {bottomSection}
        </div>
      ) : null}
    </>
  );
};

export const renderCustomToolbar: UnifiedDataTableRenderCustomToolbar = internalRenderCustomToolbar;

/**
 * Render custom element on the left side and all controls to the right
 */
export const getRenderCustomToolbarWithElements = ({
  saveToDashboardButton,
  leftSide,
  bottomSection,
  wrap = true,
}: {
  saveToDashboardButton?: React.ReactElement;
  leftSide?: React.ReactElement;
  bottomSection?: React.ReactElement;
  wrap?: boolean;
}): UnifiedDataTableRenderCustomToolbar => {
  const reservedSpace = <></>;
  return (props) =>
    internalRenderCustomToolbar({
      ...props,
      leftSide: leftSide || reservedSpace,
      bottomSection,
      saveToDashboardButton,
      wrap,
    });
};

export const styles = {
  toolbar: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: `${euiTheme.size.s} ${euiTheme.size.s} ${euiTheme.size.xs}`,
    }),
  controlButton: ({ euiTheme }: UseEuiTheme) =>
    euiTheme
      ? css({
          '.euiDataGridToolbarControl': {
            blockSize: euiTheme.size.xl,
            border: `${euiTheme.border.width.thin} solid ${euiTheme.colors.backgroundBaseFormsControlDisabled}`,
            borderRadius: euiTheme.border.radius.small,

            // making the icons larger than the default size
            '& svg': {
              inlineSize: euiTheme.size.base,
              blockSize: euiTheme.size.base,
            },
          },
        })
      : // required for unit tests to pass
        undefined,
  controlGroup: ({ euiTheme }: UseEuiTheme) =>
    euiTheme
      ? css({
          position: 'relative',
          overflow: 'hidden',
          borderRadius: euiTheme.border.radius.small,
          display: 'inline-flex',
          alignItems: 'stretch',
          flexDirection: 'row',

          '&::after': {
            content: '""',
            position: 'absolute',
            inset: 0,
            border: `${euiTheme.border.width.thin} solid ${euiTheme.colors.borderBasePlain}`,
            borderRadius: 'inherit',
            pointerEvents: 'none',
          },

          '& .unifiedDataTableToolbarControlIconButton .euiDataGridToolbarControl': {
            borderRadius: 0,
            border: 'none',
          },

          '& .unifiedDataTableToolbarControlIconButton + .unifiedDataTableToolbarControlIconButton':
            {
              borderInlineStart: `${euiTheme.border.width.thin} solid ${euiTheme.colors.borderBasePlain}`,
            },

          '& .unifiedDataTableToolbarControlButton .euiDataGridToolbarControl': {
            borderRadius: 0,
            border: 'none',
          },

          '& .unifiedDataTableToolbarControlButton + .unifiedDataTableToolbarControlButton': {
            borderInlineStart: `${euiTheme.border.width.thin} solid ${euiTheme.colors.borderBasePlain}`,
            borderRadius: 0,
          },
        })
      : undefined,
  controlGroupIconButton: ({ euiTheme }: UseEuiTheme) =>
    css({
      '.euiToolTipAnchor .euiButtonIcon': {
        inlineSize: euiTheme.size.xl,
        blockSize: euiTheme.size.xl,
        borderRadius: 'inherit',

        // cancel default behavior
        '&:hover, &:active, &:focus': {
          background: 'transparent',
          animation: 'none !important',
          transform: 'none !important',
        },
      },
    }),
  toolbarBottom: css({
    position: 'relative', // for placing a loading indicator correctly
  }),
};
