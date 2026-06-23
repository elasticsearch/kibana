/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiTitle,
  EuiButtonEmpty,
  EuiContextMenu,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useDispatch, useSelector } from 'react-redux';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import type { Space } from '@kbn/spaces-plugin/common';
import {
  selectOverviewPageState,
  setOverviewPageStateAction,
  updateManagementPageStateAction,
} from '../../../state';
import { useKibanaSpace } from '../../../../../hooks/use_kibana_space';

export const ShowAllSpaces: React.FC = () => {
  const { space } = useKibanaSpace();

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiTitle size="xxxs">
          <span>
            {i18n.translate('xpack.synthetics.showAllSpaces.spacesTextLabel', {
              defaultMessage: 'Spaces',
            })}
          </span>
        </EuiTitle>
      </EuiFlexItem>
      {space && (
        <EuiFlexItem>
          <SelectablePopover space={space} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

const SelectablePopover = ({ space }: { space: Space }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showFromAllSpacesVal, setShowFromAllSpacesVal] = useLocalStorage(
    'SyntheticsShowFromAllSpaces' + space.id,
    false
  );
  const dispatch = useDispatch();

  useEffect(() => {
    if (showFromAllSpacesVal !== undefined) {
      dispatch(
        setOverviewPageStateAction({
          showFromAllSpaces: showFromAllSpacesVal,
        })
      );
      dispatch(
        updateManagementPageStateAction({
          showFromAllSpaces: showFromAllSpacesVal,
        })
      );
    }
  }, [dispatch, showFromAllSpacesVal]);

  const { showFromAllSpaces } = useSelector(selectOverviewPageState);

  const updateState = (val: boolean) => {
    setShowFromAllSpacesVal(val);
    dispatch(
      setOverviewPageStateAction({
        showFromAllSpaces: val,
      })
    );
    dispatch(
      updateManagementPageStateAction({
        showFromAllSpaces: val,
      })
    );
    setIsPopoverOpen(false);
  };

  const button = (
    <EuiButtonEmpty
      data-test-subj="syntheticsClickMeToLoadAContextMenuButton"
      iconType="chevronSingleDown"
      iconSide="right"
      onClick={() => setIsPopoverOpen(!isPopoverOpen)}
      size="xs"
    >
      {showFromAllSpaces ? ALL_SPACES_LABEL : space.name || space.id}
    </EuiButtonEmpty>
  );
  return (
    <EuiPopover
      id="contextMenuSpaces"
      button={button}
      isOpen={isPopoverOpen}
      closePopover={() => setIsPopoverOpen(false)}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      aria-label={i18n.translate('xpack.synthetics.showAllSpaces.popoverAriaLabel', {
        defaultMessage: 'Spaces menu',
      })}
    >
      <EuiContextMenu
        initialPanelId={0}
        panels={[
          {
            id: 0,
            title: SHOW_MONITORS_FROM,
            items: [
              {
                name: `${CURRENT_SPACE_LABEL} - ${space.name || space.id}`,
                onClick: () => {
                  updateState(false);
                },
                icon: showFromAllSpaces ? 'empty' : 'check',
              },
              {
                name: ALL_SPACES_LABEL,
                onClick: () => {
                  updateState(true);
                },
                icon: showFromAllSpaces ? 'check' : 'empty',
              },
            ],
          },
        ]}
      />
    </EuiPopover>
  );
};

const ALL_SPACES_LABEL = i18n.translate('xpack.synthetics.showAllSpaces.allSpacesLabel', {
  defaultMessage: 'All permitted spaces',
});

const CURRENT_SPACE_LABEL = i18n.translate('xpack.synthetics.showAllSpaces.currentSpaceLabel', {
  defaultMessage: 'Current space',
});

const SHOW_MONITORS_FROM = i18n.translate('xpack.synthetics.showAllSpaces.showMonitorsFrom', {
  defaultMessage: 'Show monitors from',
});
