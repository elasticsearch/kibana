/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import classNames from 'classnames';
import { cloneDeep } from 'lodash';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { distinctUntilChanged, filter, map, pairwise } from 'rxjs';

import { EuiToolTip, transparentize, type UseEuiTheme } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  euiCanAnimate,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';

import { useGridLayoutContext } from '../use_grid_layout_context';
import { useGridLayoutSectionEvents } from '../use_grid_layout_events';
import { deleteSection } from '../utils/section_management';
import { DeleteGridSectionModal } from './delete_grid_section_modal';
import { GridSectionTitle } from './grid_section_title';
import type { CollapsibleSection } from './types';
import type { UserInteractionEvent } from '../use_grid_layout_events/types';

export interface GridSectionHeaderProps {
  sectionId: string;
}

export const GridSectionHeader = React.memo(({ sectionId }: GridSectionHeaderProps) => {
  const collapseButtonRef = useRef<HTMLButtonElement | null>(null);

  const { gridLayoutStateManager } = useGridLayoutContext();
  const startDrag = useGridLayoutSectionEvents({ sectionId });
  const hasBeenDragged = useRef<boolean>(false);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [editTitleOpen, setEditTitleOpen] = useState<boolean>(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState<boolean>(false);
  const [readOnly, setReadOnly] = useState<boolean>(
    gridLayoutStateManager.accessMode$.getValue() === 'VIEW'
  );
  const [panelCount, setPanelCount] = useState<number>(
    Object.keys(gridLayoutStateManager.gridLayout$.getValue()[sectionId]?.panels ?? {}).length
  );

  useEffect(() => {
    return () => {
      // remove reference on unmount
      delete gridLayoutStateManager.headerRefs.current[sectionId];
    };
  }, [sectionId, gridLayoutStateManager]);

  /**
   * Callback for collapsing and/or expanding the section when the title button is clicked
   */
  const toggleIsCollapsed = useCallback(() => {
    const newLayout = cloneDeep(gridLayoutStateManager.gridLayout$.value);
    const section = newLayout[sectionId];
    if (section.isMainSection) return;

    section.isCollapsed = !section.isCollapsed;
    gridLayoutStateManager.gridLayout$.next(newLayout);

    const buttonRef = collapseButtonRef.current;
    if (!buttonRef) return;
    buttonRef.setAttribute('aria-expanded', `${!section.isCollapsed}`);
  }, [gridLayoutStateManager, sectionId]);

  const collapseSectionOnDrag = useCallback(() => {
    const section = gridLayoutStateManager.gridLayout$.getValue()[sectionId];
    if (!section || section.isMainSection) return; // main sections cannot be collapsed
    if (section.isCollapsed || panelCount === 0) return; // prevent collapsing if already collapsed or empty
    toggleIsCollapsed();
  }, [gridLayoutStateManager, sectionId, toggleIsCollapsed, panelCount]);

  const shouldIgnoreHeaderClick = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('[data-no-drag]'));
  };

  const handleSectionDragStart = useCallback(
    (e: UserInteractionEvent) => {
      if (shouldIgnoreHeaderClick(e.target)) return;
      startDrag(e);
    },
    [startDrag]
  );

  useEffect(() => {
    /**
     * This subscription is responsible for controlling whether or not the section title is
     * editable and hiding all other "edit mode" actions (delete section, move section, etc)
     */
    const accessModeSubscription = gridLayoutStateManager.accessMode$
      .pipe(distinctUntilChanged())
      .subscribe((accessMode) => {
        setReadOnly(accessMode === 'VIEW');
      });

    /**
     * This subscription is responsible for keeping the panel count in sync
     */
    const panelCountSubscription = gridLayoutStateManager.gridLayout$
      .pipe(
        map((layout) => Object.keys(layout[sectionId]?.panels ?? {}).length),
        distinctUntilChanged()
      )
      .subscribe((count) => {
        setPanelCount(count);
      });

    /**
     * Extracted drag state stream that maps the before and after of the activeSectionEvent$ stream to a more explicit "drag state"
     */
    const dragState$ = gridLayoutStateManager.activeSectionEvent$.pipe(
      pairwise(),
      map(([before, after]) => {
        if (!before && after) return { type: 'init', event: after };
        if (before && after) return { type: 'update', event: after };
        return { type: 'finish', event: before };
      }),
      filter(({ event }) => event?.id === sectionId)
    );

    /**
     * This subscription is responsible for handling the drag + drop styles for
     * re-ordering grid rows and also collapsing the section when the drag starts
     *  (if it isn't already collapsed) or toggling the collapsed state when
     * the drag finishes without any movement (i.e. a click)
     */

    const sectionInteractionSubscription = dragState$.subscribe(({ type, event }) => {
      const headerRef = gridLayoutStateManager.headerRefs.current[sectionId];
      if (!headerRef) return;

      const handleFirstDrag = () => {
        hasBeenDragged.current = true;
        setIsActive(true);
        collapseSectionOnDrag();

        const width = headerRef.getBoundingClientRect().width;
        headerRef.style.width = `${width}px`;
        headerRef.style.position = 'fixed';
        headerRef.style.top = `${event!.startingPosition.top}px`;
        headerRef.style.left = `${event!.startingPosition.left}px`;
      };

      const resetHeaderStyles = () => {
        headerRef.style.position = '';
        headerRef.style.width = '';
        headerRef.style.top = '';
        headerRef.style.left = '';
        headerRef.style.transform = '';
      };

      switch (type) {
        case 'init':
          hasBeenDragged.current = false;
          /**
           * we want active drag styles to be applied on keyboard drag from the start, whereas for mouse/touch
           * we only want to apply drag styles if there is actual movement(i.e., distinguish between click and drag)
           */
          if (event?.sensorType === 'keyboard') {
            handleFirstDrag();
          }
          break;
        case 'update':
          if (!hasBeenDragged.current) {
            handleFirstDrag();
          }
          headerRef.style.transform = `translate(${event!.translate.left}px, ${
            event!.translate.top
          }px)`;
          break;
        case 'finish':
          setIsActive(false);
          if (!hasBeenDragged.current) {
            // if no drag occurred, then this is a click event
            toggleIsCollapsed();
          }
          hasBeenDragged.current = false;
          resetHeaderStyles();
          break;
      }
    });

    /**
     * This subscription is responsible for setting the collapsed state class name
     */
    const collapsedStateSubscription = gridLayoutStateManager.gridLayout$
      .pipe(
        map((gridLayout) => {
          const row = gridLayout[sectionId];
          return row && (row.isMainSection || row.isCollapsed);
        })
      )
      .subscribe((collapsed) => {
        const headerRef = gridLayoutStateManager.headerRefs.current[sectionId];
        if (!headerRef) return;

        if (collapsed) {
          headerRef.classList.add('kbnGridSectionHeader--collapsed');
        } else {
          headerRef.classList.remove('kbnGridSectionHeader--collapsed');
        }
      });

    return () => {
      accessModeSubscription.unsubscribe();
      panelCountSubscription.unsubscribe();
      sectionInteractionSubscription.unsubscribe();
      collapsedStateSubscription.unsubscribe();
    };
  }, [gridLayoutStateManager, sectionId, toggleIsCollapsed, collapseSectionOnDrag]);

  const confirmDeleteSection = useCallback(() => {
    /**
     * Memoization of this callback does not need to be dependant on the React panel count
     * state, so just grab the panel count via gridLayoutStateManager instead
     */
    const count = Object.keys(
      gridLayoutStateManager.gridLayout$.getValue()[sectionId].panels
    ).length;
    if (!Boolean(count)) {
      const newLayout = deleteSection(gridLayoutStateManager.gridLayout$.getValue(), sectionId);
      gridLayoutStateManager.gridLayout$.next(newLayout);
    } else {
      setDeleteModalVisible(true);
    }
  }, [gridLayoutStateManager, sectionId]);

  return (
    <>
      <EuiFlexGroup
        gutterSize="xs"
        responsive={false}
        alignItems="center"
        id={`kbnGridSectionHeader-${sectionId}`}
        css={(theme) => styles.headerStyles(theme, sectionId, readOnly)}
        className={classNames('kbnGridSectionHeader', {
          'kbnGridSectionHeader--active': isActive,
          // sets the collapsed state on mount
          'kbnGridSectionHeader--collapsed': (
            gridLayoutStateManager.gridLayout$.getValue()[sectionId] as
              | CollapsibleSection
              | undefined
          )?.isCollapsed,
        })}
        data-test-subj={`kbnGridSectionHeader-${sectionId}`}
        ref={(element: HTMLDivElement | null) => {
          gridLayoutStateManager.headerRefs.current[sectionId] = element;
        }}
        onMouseDown={readOnly ? toggleIsCollapsed : handleSectionDragStart}
        onTouchStart={readOnly ? toggleIsCollapsed : handleSectionDragStart}
        onTouchEnd={(e) => {
          // prevents both `onMouseDown` and `onTouchStart` from firing during touch events
          if (!shouldIgnoreHeaderClick(e.target)) {
            if (e.cancelable) e.preventDefault();
            e.stopPropagation();
          }
        }}
      >
        <GridSectionTitle
          sectionId={sectionId}
          readOnly={readOnly || isActive}
          editTitleOpen={editTitleOpen}
          setEditTitleOpen={setEditTitleOpen}
          collapseButtonRef={collapseButtonRef}
          toggleIsCollapsed={toggleIsCollapsed}
        />
        {
          /**
           * Add actions at the end of the header section when the layout is editable + the section title
           * is not in edit mode
           */
          !editTitleOpen && (
            <>
              <EuiFlexItem
                grow={false}
                css={readOnly ? styles.visibleOnlyWhenCollapsed : undefined}
              >
                <EuiText
                  color="subdued"
                  size="s"
                  data-test-subj={`kbnGridSectionHeader-${sectionId}--panelCount`}
                  className={'kbnGridLayout--panelCount'}
                >
                  {i18n.translate('kbnGridLayout.section.panelCount', {
                    defaultMessage:
                      '({panelCount} {panelCount, plural, one {panel} other {panels}})',
                    values: {
                      panelCount,
                    },
                  })}
                </EuiText>
              </EuiFlexItem>
              {!readOnly && (
                <>
                  {!isActive && (
                    <EuiFlexItem grow={false} css={[styles.floatToRight]}>
                      <EuiToolTip
                        content={i18n.translate('kbnGridLayout.section.deleteSection', {
                          defaultMessage: 'Delete section',
                        })}
                        disableScreenReaderOutput
                      >
                        <EuiButtonIcon
                          data-no-drag
                          iconType="trash"
                          color="danger"
                          className="kbnGridLayout--deleteSectionIcon"
                          onClick={confirmDeleteSection}
                          aria-label={i18n.translate('kbnGridLayout.section.deleteSection', {
                            defaultMessage: 'Delete section',
                          })}
                        />
                      </EuiToolTip>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem
                    grow={false}
                    css={isActive && [styles.floatToRight]}
                    className="kbnGridSection--dragHandle"
                    role="button"
                    tabIndex={0}
                    onKeyDown={handleSectionDragStart}
                    aria-label={i18n.translate('kbnGridLayout.section.moveRow', {
                      defaultMessage: 'Move section',
                    })}
                    data-test-subj={`kbnGridSectionHeader-${sectionId}--dragHandle`}
                  >
                    <EuiIcon type="move" color="text" aria-hidden={true} />
                  </EuiFlexItem>
                </>
              )}
            </>
          )
        }
      </EuiFlexGroup>
      {deleteModalVisible && (
        <DeleteGridSectionModal
          sectionId={sectionId}
          setDeleteModalVisible={setDeleteModalVisible}
        />
      )}
    </>
  );
});

const styles = {
  visibleOnlyWhenCollapsed: css({
    display: 'none',
    '.kbnGridSectionHeader--collapsed &': {
      display: 'block',
    },
  }),
  floatToRight: css({
    marginLeft: 'auto',
  }),
  headerStyles: ({ euiTheme }: UseEuiTheme, sectionId: string, readOnly: boolean) =>
    css({
      gridColumnStart: 1,
      gridColumnEnd: -1,
      gridRowStart: `span 1`,
      gridRowEnd: `start-${sectionId}`,
      height: `${euiTheme.size.xl}`,
      touchAction: 'none', // prevents default scroll on drag behaviour on mobile
      ...(readOnly
        ? {
            cursor: 'pointer',
          }
        : {
            cursor: 'move',
            userSelect: 'none',
            '&:hover:not(.kbnGridSectionHeader--active)': {
              backgroundColor: `${transparentize(euiTheme.colors.vis.euiColorVis0, 0.1)}`,
            },
          }),
      '.kbnGridLayout--deleteSectionIcon': {
        marginLeft: euiTheme.size.xs,
      },
      '.kbnGridLayout--panelCount': {
        textWrapMode: 'nowrap', // prevent panel count from wrapping
      },
      '.kbnGridSection--dragHandle': {
        padding: euiTheme.size.xs,
        cursor: 'move',
      },

      // these styles hide the delete + move actions by default and only show them on hover
      [`.kbnGridLayout--deleteSectionIcon,
        .kbnGridSection--dragHandle`]: {
        opacity: '0',
        [`${euiCanAnimate}`]: {
          transition: `opacity ${euiTheme.animation.extraFast} ease-in`,
        },
      },
      [`&:hover .kbnGridLayout--deleteSectionIcon,
        &:hover .kbnGridSection--dragHandle,
        &:has(:focus-visible) .kbnGridLayout--deleteSectionIcon,
        &:has(:focus-visible) .kbnGridSection--dragHandle`]: {
        opacity: 1,
      },

      // these styles ensure that dragged sections are rendered **above** everything else + the move icon stays visible
      '&.kbnGridSectionHeader--active': {
        zIndex: euiTheme.levels.modal,
        pointerEvents: 'auto', // allow pointer events through so that cursor can change
        cursor: 'move',
        '.kbnGridSection--dragHandle': {
          opacity: 1,
        },
      },
    }),
};

GridSectionHeader.displayName = 'GridSectionHeader';
