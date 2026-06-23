/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { cloneDeep } from 'lodash';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { distinctUntilChanged, map } from 'rxjs';

import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexItem,
  EuiInlineEditTitle,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';

import { useGridLayoutContext } from '../use_grid_layout_context';
import type { CollapsibleSection } from './types';

export const GridSectionTitle = React.memo(
  ({
    readOnly,
    sectionId,
    editTitleOpen,
    setEditTitleOpen,
    collapseButtonRef,
    toggleIsCollapsed,
  }: {
    readOnly: boolean;
    sectionId: string;
    editTitleOpen: boolean;
    setEditTitleOpen: (value: boolean) => void;
    collapseButtonRef: React.MutableRefObject<HTMLButtonElement | null>;
    toggleIsCollapsed: () => void;
  }) => {
    const { gridLayoutStateManager } = useGridLayoutContext();

    const inputRef = useRef<HTMLInputElement | null>(null);
    /**
     * This element should never be rendered for "main" sections, so casting to CollapsibleSection
     * is safe; however, if this somehow **did** happen for a main section, we would fall back to
     * an empty string for the title (which should be fine)
     */
    const currentSection = gridLayoutStateManager.gridLayout$.value[sectionId] as
      | CollapsibleSection
      | undefined;
    const [sectionTitle, setSectionTitle] = useState<string>(currentSection?.title ?? '');

    useEffect(() => {
      /**
       * This subscription ensures that this component will re-render when the title changes
       */
      const titleSubscription = gridLayoutStateManager.gridLayout$
        .pipe(
          map((gridLayout) => {
            const section = gridLayout[sectionId];
            if (!section || section.isMainSection) return ''; // main sections cannot have titles
            return section.title;
          }),
          distinctUntilChanged()
        )
        .subscribe((title) => {
          setSectionTitle(title);
        });

      return () => {
        titleSubscription.unsubscribe();
      };
    }, [sectionId, gridLayoutStateManager]);

    useEffect(() => {
      /**
       * Set focus on title input when edit mode is open
       */
      if (editTitleOpen && inputRef.current) {
        inputRef.current.focus();
      }
    }, [editTitleOpen]);

    const updateTitle = useCallback(
      (title: string) => {
        const newLayout = cloneDeep(gridLayoutStateManager.gridLayout$.getValue());
        const section = newLayout[sectionId];
        if (section.isMainSection) return; // main sections cannot have titles
        section.title = title;
        gridLayoutStateManager.gridLayout$.next(newLayout);
        setEditTitleOpen(false);
      },
      [sectionId, setEditTitleOpen, gridLayoutStateManager.gridLayout$]
    );

    const handleKeyDown = useCallback(
      /** Prevents default drag from firing on key down and forces toggle instead */
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          toggleIsCollapsed();
        }
      },
      [toggleIsCollapsed]
    );

    return (
      <>
        <EuiFlexItem grow={false} css={styles.titleButton}>
          <EuiButtonEmpty
            buttonRef={collapseButtonRef}
            color="text"
            aria-label={i18n.translate('kbnGridLayout.section.toggleCollapse', {
              defaultMessage: 'Toggle collapse',
            })}
            iconType="chevronSingleDown"
            onKeyDown={handleKeyDown}
            size="m"
            id={`kbnGridSectionTitle-${sectionId}`}
            aria-controls={`kbnGridSectionHeader-${sectionId}`}
            aria-expanded={!currentSection?.isCollapsed}
            data-test-subj={`kbnGridSectionTitle-${sectionId}`}
            textProps={false}
            className={'kbnGridSectionTitle--button'}
            flush="both"
          >
            {editTitleOpen ? null : (
              <EuiTitle size="xs" css={styles.mediumFontWeight}>
                <h2>{sectionTitle}</h2>
              </EuiTitle>
            )}
          </EuiButtonEmpty>
        </EuiFlexItem>
        {!readOnly && editTitleOpen ? (
          <EuiFlexItem grow={true} css={styles.editTitleInput}>
            {/* @ts-ignore - EUI typing issue that will be resolved with https://github.com/elastic/eui/pull/8307 */}
            <EuiInlineEditTitle
              data-no-drag
              size="xs"
              heading="h2"
              defaultValue={sectionTitle}
              onSave={updateTitle}
              onCancel={() => setEditTitleOpen(false)}
              startWithEditOpen
              editModeProps={{
                inputProps: {
                  inputRef,
                  css: styles.mediumFontWeight,
                },
              }}
              inputAriaLabel={i18n.translate('kbnGridLayout.section.editTitleAriaLabel', {
                defaultMessage: 'Edit section title',
              })}
              data-test-subj={`kbnGridSectionTitle-${sectionId}--editor`}
            />
          </EuiFlexItem>
        ) : (
          <>
            {!readOnly && (
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate('kbnGridLayout.section.editTitleAriaLabel', {
                    defaultMessage: 'Edit section title',
                  })}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    data-no-drag
                    iconType="pencil"
                    onClick={() => setEditTitleOpen(true)}
                    color="text"
                    aria-label={i18n.translate('kbnGridLayout.section.editTitleAriaLabel', {
                      defaultMessage: 'Edit section title',
                    })}
                    data-test-subj={`kbnGridSectionTitle-${sectionId}--edit`}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            )}
          </>
        )}
      </>
    );
  }
);

const styles = {
  titleButton: ({ euiTheme }: UseEuiTheme) =>
    css({
      minWidth: 0,
      button: {
        '&:focus': {
          backgroundColor: 'unset',
        },
        h2: {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
        svg: {
          transition: `transform ${euiTheme.animation.fast} ease`,
          transform: 'rotate(0deg)',
          '.kbnGridSectionHeader--collapsed &': {
            transform: 'rotate(-90deg) !important',
          },
        },
      },
    }),
  editTitleInput: css({
    // if field-sizing is supported, grow width to text; otherwise, fill available space
    '@supports (field-sizing: content)': {
      minWidth: 0,
      '.euiFlexItem:has(input)': {
        flexGrow: 0,
        maxWidth: 'calc(100% - 80px)', // don't extend past parent
      },
      input: {
        fieldSizing: 'content',
      },
    },
  }),
  mediumFontWeight: ({ euiTheme }: UseEuiTheme) => css`
    font-weight: ${euiTheme.font.weight.medium} !important;
  `,
};

GridSectionTitle.displayName = 'GridSectionTitle';
