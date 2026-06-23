/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonEmpty,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSkeletonText,
  EuiText,
  EuiPopover,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useParams } from 'react-router-dom';
import { useSelectedLocation } from '../monitor_details/hooks/use_selected_location';
import { useSyntheticsSettingsContext } from '../../contexts';
import { getTestRunDetailLink } from '../common/links/test_details_link';
import { useStepDetailLink } from './hooks/use_step_detail_page';
import { useJourneySteps } from '../monitor_details/hooks/use_journey_steps';
import { useDateFormat } from '../../../../hooks/use_date_format';
import { useGetUrlParams } from '../../hooks';
import { useUrlSpaceId } from '../../hooks/use_url_space_id';

export const StepRunDate = () => {
  return (
    <EuiDescriptionList
      listItems={[{ title: ERROR_DURATION, description: <StepPageNavigation /> }]}
    />
  );
};

const ERROR_DURATION = i18n.translate('xpack.synthetics.testDetails.date', {
  defaultMessage: 'Date',
});

export const StepPageNavigation = ({ testRunPage }: { testRunPage?: boolean }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const { data } = useJourneySteps();
  const formatter = useDateFormat();
  const { basePath } = useSyntheticsSettingsContext();
  const selectedLocation = useSelectedLocation();
  const spaceId = useUrlSpaceId();
  const { remoteName } = useGetUrlParams();
  const startedAt = formatter(data?.details?.timestamp);

  const { stepIndex, monitorId } = useParams<{ stepIndex: string; monitorId: string }>();

  let prevHref = useStepDetailLink({
    stepIndex,
    checkGroupId: data?.details?.previous?.checkGroup,
  });

  let nextHref = useStepDetailLink({
    stepIndex,
    checkGroupId: data?.details?.next?.checkGroup,
  });

  if (testRunPage) {
    if (data?.details?.previous?.checkGroup) {
      prevHref = getTestRunDetailLink({
        basePath,
        monitorId,
        locationId: selectedLocation?.id,
        checkGroup: data?.details?.previous?.checkGroup,
        spaceId,
        remoteName,
      });
    }
    if (data?.details?.next?.checkGroup) {
      nextHref = getTestRunDetailLink({
        basePath,
        monitorId,
        locationId: selectedLocation?.id,
        checkGroup: data?.details?.next?.checkGroup,
        spaceId,
        remoteName,
      });
    }
  }

  const startedAtWrapped = startedAt || <EuiSkeletonText lines={1} />;

  return (
    <EuiPopover
      closePopover={() => setIsPopoverOpen(false)}
      isOpen={isPopoverOpen}
      button={
        <EuiButtonEmpty
          data-test-subj="syntheticsStepPageNavigationButton"
          style={{ height: 20 }}
          onClick={() => setIsPopoverOpen((prev) => !prev)}
          iconType="chevronSingleDown"
          iconSide="right"
          flush="left"
        >
          {startedAtWrapped}
        </EuiButtonEmpty>
      }
      aria-label={i18n.translate('xpack.synthetics.stepPageNavigation.popoverAriaLabel', {
        defaultMessage: 'Check navigation menu',
      })}
    >
      <EuiFlexGroup alignItems="center" justifyContent="flexEnd" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            data-test-subj="syntheticsStepPageNavigationButton"
            href={prevHref}
            disabled={!prevHref}
            iconType="chevronSingleLeft"
            aria-label={PREVIOUS_CHECK_BUTTON_TEXT}
          >
            {PREVIOUS_CHECK_BUTTON_TEXT}
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiText
            size="s"
            className="eui-textNoWrap"
            aria-label={CURRENT_CHECK_ARIA_LABEL(startedAt)}
          >
            {startedAtWrapped}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            data-test-subj="syntheticsStepPageNavigationButton"
            href={nextHref}
            disabled={!nextHref}
            iconType="chevronSingleRight"
            iconSide="right"
            aria-label={NEXT_CHECK_BUTTON_TEXT}
          >
            {NEXT_CHECK_BUTTON_TEXT}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPopover>
  );
};

export const PREVIOUS_CHECK_BUTTON_TEXT = i18n.translate(
  'xpack.synthetics.synthetics.stepDetail.previousCheckButtonText',
  {
    defaultMessage: 'Previous check',
  }
);

export const NEXT_CHECK_BUTTON_TEXT = i18n.translate(
  'xpack.synthetics.synthetics.stepDetail.nextCheckButtonText',
  {
    defaultMessage: 'Next check',
  }
);

export const CURRENT_CHECK_ARIA_LABEL = (timestamp: string) =>
  i18n.translate('xpack.synthetics.synthetics.stepDetail.currentCheckAriaLabel', {
    defaultMessage: 'Current check: {timestamp}',
    values: {
      timestamp,
    },
  });
