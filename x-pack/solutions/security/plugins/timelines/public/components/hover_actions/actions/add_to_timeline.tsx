/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import type { EuiContextMenuItem, EuiButtonEmpty } from '@elastic/eui';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import type { DraggableId } from '@hello-pangea/dnd';
import { isEmpty } from 'lodash';

import { useDispatch } from 'react-redux';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { TimelinesStartServices } from '../../..';
import { TimelineId } from '../../../store/timeline';
import { addProviderToTimeline } from '../../../store/timeline/actions';
import { stopPropagationAndPreventDefault } from '../../../../common/utils/accessibility';
import type { DataProvider } from '../../../../common/types';
import { TooltipWithKeyboardShortcut } from '../../tooltip_with_keyboard_shortcut';
import { getAdditionalScreenReaderOnlyContext } from '../utils';
import { useAddToTimeline } from '../../../hooks/use_add_to_timeline';
import type { HoverActionComponentProps } from './types';
import { useAppToasts } from '../../../hooks/use_app_toasts';
import * as i18n from './translations';

export const ADD_TO_TIMELINE_KEYBOARD_SHORTCUT = 'a';

export interface UseGetHandleStartDragToTimelineArgs {
  field: string;
  draggableId: DraggableId | undefined;
}

const useGetHandleStartDragToTimeline = ({
  field,
  draggableId,
}: UseGetHandleStartDragToTimelineArgs): (() => void) => {
  const { startDragToTimeline } = useAddToTimeline({
    draggableId,
    fieldName: field,
  });

  const handleStartDragToTimeline = useCallback(() => {
    startDragToTimeline();
  }, [startDragToTimeline]);

  return handleStartDragToTimeline;
};

export interface SuccessMessageProps {
  children: React.ReactChild;
}
export const AddSuccessMessage = (props: SuccessMessageProps) => {
  return (
    <span className="eui-textBreakWord" data-test-subj="add-to-timeline-toast-success">
      {props.children}
    </span>
  );
};

export interface AddToTimelineButtonProps extends HoverActionComponentProps {
  /** `Component` is only used with `EuiDataGrid`; the grid keeps a reference to `Component` for show / hide functionality */
  Component?: typeof EuiButtonEmpty | typeof EuiButtonIcon | typeof EuiContextMenuItem;
  draggableId?: DraggableId;
  dataProvider?: DataProvider[] | DataProvider;
  timelineType?: string;
  startServices: TimelinesStartServices;
}

const AddToTimelineButton: React.FC<AddToTimelineButtonProps> = React.memo(
  ({
    Component,
    dataProvider,
    defaultFocusedButtonRef,
    draggableId,
    field,
    keyboardEvent,
    ownFocus,
    onClick,
    showTooltip = false,
    value,
    timelineType = 'default',
    startServices,
  }) => {
    const dispatch = useDispatch();
    const { addSuccess } = useAppToasts();
    const startDragToTimeline = useGetHandleStartDragToTimeline({ draggableId, field });

    const handleStartDragToTimeline = useCallback(() => {
      if (draggableId != null) {
        startDragToTimeline();
      } else if (!isEmpty(dataProvider)) {
        const addDataProvider = Array.isArray(dataProvider) ? dataProvider : [dataProvider];
        addDataProvider.forEach((provider) => {
          if (provider) {
            dispatch(
              addProviderToTimeline({
                id: TimelineId.active,
                dataProvider: provider,
              })
            );
            addSuccess({
              title: toMountPoint(
                <AddSuccessMessage>
                  {i18n.ADDED_TO_TIMELINE_OR_TEMPLATE_MESSAGE(
                    provider.name,
                    timelineType === 'default'
                  )}
                </AddSuccessMessage>,
                startServices
              ),
            });
          }
        });
      }

      if (onClick != null) {
        onClick();
      }
    }, [
      addSuccess,
      dataProvider,
      dispatch,
      draggableId,
      onClick,
      startDragToTimeline,
      timelineType,
      startServices,
    ]);

    useEffect(() => {
      if (!ownFocus) {
        return;
      }
      if (keyboardEvent?.key === ADD_TO_TIMELINE_KEYBOARD_SHORTCUT) {
        stopPropagationAndPreventDefault(keyboardEvent);
        handleStartDragToTimeline();
      }
    }, [handleStartDragToTimeline, keyboardEvent, ownFocus]);

    const button = useMemo(
      () =>
        Component ? (
          <Component
            aria-label={i18n.ADD_TO_TIMELINE}
            buttonRef={defaultFocusedButtonRef}
            data-test-subj="add-to-timeline"
            icon="timeline"
            iconType="timeline"
            onClick={handleStartDragToTimeline}
            title={i18n.ADD_TO_TIMELINE}
          >
            {i18n.ADD_TO_TIMELINE}
          </Component>
        ) : (
          <EuiToolTip content={i18n.ADD_TO_TIMELINE} disableScreenReaderOutput>
            <EuiButtonIcon
              aria-label={i18n.ADD_TO_TIMELINE}
              buttonRef={defaultFocusedButtonRef}
              className="timelines__hoverActionButton"
              data-test-subj="add-to-timeline"
              iconSize="s"
              iconType="timeline"
              onClick={handleStartDragToTimeline}
            />
          </EuiToolTip>
        ),
      [Component, defaultFocusedButtonRef, handleStartDragToTimeline]
    );

    return showTooltip ? (
      <EuiToolTip
        content={
          <TooltipWithKeyboardShortcut
            additionalScreenReaderOnlyContext={getAdditionalScreenReaderOnlyContext({
              field,
              value,
            })}
            content={i18n.ADD_TO_TIMELINE}
            shortcut={ADD_TO_TIMELINE_KEYBOARD_SHORTCUT}
            showShortcut={ownFocus}
          />
        }
      >
        {button}
      </EuiToolTip>
    ) : (
      button
    );
  }
);

AddToTimelineButton.displayName = 'AddToTimelineButton';

// eslint-disable-next-line import/no-default-export
export { AddToTimelineButton as default };
