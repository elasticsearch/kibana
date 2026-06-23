/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import styled from 'styled-components';
import { pick } from 'lodash/fp';
import React, { useCallback, useMemo, useState } from 'react';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiContextMenu,
  EuiText,
  EuiPopover,
  EuiIcon,
} from '@elastic/eui';
import { v4 as uuidv4 } from 'uuid';
import { useDispatch } from 'react-redux';

import type { BrowserFields } from '../../../../common/containers/source';
import { DataProviderTypeEnum, TimelineTypeEnum } from '../../../../../common/api/timeline';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { StatefulEditDataProvider } from '../../edit_data_provider';
import { addContentToTimeline, getDisplayValue } from './helpers';
import { timelineSelectors } from '../../../store';
import { ADD_FIELD_LABEL, ADD_TEMPLATE_FIELD_LABEL } from './translations';
import type { OnDataProviderEdited } from '../events';

interface AddDataProviderPopoverProps {
  browserFields: BrowserFields;
  timelineId: string;
}

const AddFieldPopoverContainer = styled.div`
  min-width: 350px;
`;

const AddDataProviderPopoverComponent: React.FC<AddDataProviderPopoverProps> = ({
  browserFields,
  timelineId,
}) => {
  const dispatch = useDispatch();
  const [isAddFilterPopoverOpen, setIsAddFilterPopoverOpen] = useState(false);
  const getTimeline = useMemo(() => timelineSelectors.getTimelineByIdSelector(), []);
  const { dataProviders, timelineType } = useDeepEqualSelector((state) =>
    pick(['dataProviders', 'timelineType'], getTimeline(state, timelineId))
  );

  const togglePopoverState = useCallback(
    () => setIsAddFilterPopoverOpen(!isAddFilterPopoverOpen),
    [setIsAddFilterPopoverOpen, isAddFilterPopoverOpen]
  );

  const handleClosePopover = useCallback(
    () => setIsAddFilterPopoverOpen(false),
    [setIsAddFilterPopoverOpen]
  );

  const handleDataProviderEdited = useCallback<OnDataProviderEdited>(
    ({ andProviderId, excluded, field, id, operator, providerId, value, type }) => {
      addContentToTimeline({
        dataProviders,
        destination: {
          droppableId: `droppableId.timelineProviders.${timelineId}.group.${dataProviders.length}`,
          index: 0,
        },
        dispatch,
        onAddedToTimeline: handleClosePopover,
        providerToAdd: {
          id: providerId,
          name: field,
          enabled: true,
          excluded,
          kqlQuery: '',
          type,
          queryMatch: {
            displayField: undefined,
            displayValue: getDisplayValue(value),
            field,
            value,
            operator,
          },
          and: [],
        },
        timelineId,
      });
    },
    [dataProviders, timelineId, dispatch, handleClosePopover]
  );

  const panels = useMemo(
    () => [
      {
        id: 0,
        width: 400,
        items: [
          {
            name: ADD_FIELD_LABEL,
            icon: <EuiIcon type="plusCircle" size="m" aria-hidden={true} />,
            panel: 1,
          },
          timelineType === TimelineTypeEnum.template
            ? {
                disabled: timelineType !== TimelineTypeEnum.template,
                name: ADD_TEMPLATE_FIELD_LABEL,
                icon: <EuiIcon type="text" size="m" aria-hidden={true} />,
                panel: 2,
              }
            : null,
        ].filter((item) => item !== null) as EuiContextMenuPanelItemDescriptor[],
      },
      {
        id: 1,
        title: ADD_FIELD_LABEL,
        width: 400,
        content: (
          <StatefulEditDataProvider
            browserFields={browserFields}
            field=""
            isExcluded={false}
            onDataProviderEdited={handleDataProviderEdited}
            operator=":"
            timelineId={timelineId}
            value=""
            type={DataProviderTypeEnum.default}
            providerId={`${timelineId}-${uuidv4()}`}
          />
        ),
      },
      {
        id: 2,
        title: ADD_TEMPLATE_FIELD_LABEL,
        width: 400,
        content: (
          <StatefulEditDataProvider
            browserFields={browserFields}
            field=""
            isExcluded={false}
            onDataProviderEdited={handleDataProviderEdited}
            operator=":"
            timelineId={timelineId}
            value=""
            type={DataProviderTypeEnum.template}
            providerId={`${timelineId}-${uuidv4()}`}
          />
        ),
      },
    ],
    [browserFields, handleDataProviderEdited, timelineId, timelineType]
  );

  const button = useMemo(() => {
    if (timelineType === TimelineTypeEnum.template) {
      return (
        <EuiButton
          size="s"
          onClick={togglePopoverState}
          data-test-subj="addField"
          iconType="chevronSingleDown"
          fill
          iconSide="right"
        >
          <EuiText size="s">{ADD_FIELD_LABEL}</EuiText>
        </EuiButton>
      );
    }

    return (
      <EuiButtonEmpty
        size="s"
        onClick={togglePopoverState}
        data-test-subj="addField"
        iconSide="right"
      >
        <EuiText size="s">{`+ ${ADD_FIELD_LABEL}`}</EuiText>
      </EuiButtonEmpty>
    );
  }, [togglePopoverState, timelineType]);

  const content = useMemo(() => {
    if (timelineType === TimelineTypeEnum.template) {
      return <EuiContextMenu initialPanelId={0} panels={panels} />;
    }

    return (
      <StatefulEditDataProvider
        browserFields={browserFields}
        field=""
        isExcluded={false}
        onDataProviderEdited={handleDataProviderEdited}
        operator=":"
        timelineId={timelineId}
        value=""
        type={DataProviderTypeEnum.default}
        providerId={`${timelineId}-${uuidv4()}`}
      />
    );
  }, [browserFields, handleDataProviderEdited, panels, timelineId, timelineType]);

  return (
    <EuiPopover
      id="addFieldsPopover"
      button={button}
      isOpen={isAddFilterPopoverOpen}
      closePopover={handleClosePopover}
      anchorPosition="downLeft"
      panelPaddingSize="none"
      repositionOnScroll
    >
      <AddFieldPopoverContainer>{content}</AddFieldPopoverContainer>
    </EuiPopover>
  );
};

AddDataProviderPopoverComponent.displayName = 'AddDataProviderPopoverComponent';

export const AddDataProviderPopover = React.memo(AddDataProviderPopoverComponent);

AddDataProviderPopover.displayName = 'AddDataProviderPopover';
