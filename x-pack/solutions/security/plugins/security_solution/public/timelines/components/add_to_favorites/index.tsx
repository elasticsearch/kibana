/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { State } from '../../../common/store';
import { selectTimelineById } from '../../store/selectors';
import { timelineActions } from '../../store';
import { TimelineStatusEnum } from '../../../../common/api/timeline';
import { useUserPrivileges } from '../../../common/components/user_privileges';

const ADD_TO_FAVORITES = i18n.translate(
  'xpack.securitySolution.timeline.addToFavoriteButtonLabel',
  {
    defaultMessage: 'Add to favorites',
  }
);

const REMOVE_FROM_FAVORITES = i18n.translate(
  'xpack.securitySolution.timeline.removeFromFavoritesButtonLabel',
  {
    defaultMessage: 'Remove from favorites',
  }
);

interface AddToFavoritesButtonProps {
  /**
   * Id of the timeline to be displayed in the bottom bar and within the modal
   */
  timelineId: string;
}

/**
 * This component renders the add to favorites button for timeline.
 * It is used in the bottom bar as well as in the timeline modal's header.
 */
export const AddToFavoritesButton = React.memo<AddToFavoritesButtonProps>(({ timelineId }) => {
  const dispatch = useDispatch();
  const { isFavorite, status } = useSelector((state: State) =>
    selectTimelineById(state, timelineId)
  );
  const {
    timelinePrivileges: { crud: canWriteTimeline },
  } = useUserPrivileges();

  const isTimelineDraftOrImmutable = status !== TimelineStatusEnum.active;
  const isDisabled = !canWriteTimeline || isTimelineDraftOrImmutable;
  const label = isFavorite ? REMOVE_FROM_FAVORITES : ADD_TO_FAVORITES;

  const handleClick = useCallback(
    () => dispatch(timelineActions.updateIsFavorite({ id: timelineId, isFavorite: !isFavorite })),
    [dispatch, timelineId, isFavorite]
  );

  return (
    <EuiToolTip content={label} disableScreenReaderOutput>
      <EuiButtonIcon
        iconType={isFavorite ? 'starFill' : 'star'}
        isSelected={isFavorite}
        disabled={isDisabled}
        aria-label={label}
        data-test-subj={`timeline-favorite-${isFavorite ? 'filled' : 'empty'}-star`}
        onClick={handleClick}
      >
        {label}
      </EuiButtonIcon>
    </EuiToolTip>
  );
});

AddToFavoritesButton.displayName = 'AddToFavoritesButton';
