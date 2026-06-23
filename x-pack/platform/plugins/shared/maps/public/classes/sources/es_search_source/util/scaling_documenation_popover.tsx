/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButtonIcon,
  EuiLink,
  EuiPopover,
  EuiPopoverTitle,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getDocLinks } from '../../../../kibana_services';

interface Props {
  limitOptionLabel: string;
  clustersOptionLabel: string;
  maxResultWindow: string;
  mvtOptionLabel: string;
}

export function ScalingDocumenationPopover(props: Props) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <EuiPopover
      id="scalingHelpPopover"
      anchorPosition="leftCenter"
      button={
        <EuiToolTip content="Scaling documentation" disableScreenReaderOutput>
          <EuiButtonIcon
            onClick={() => {
              setIsPopoverOpen(!isPopoverOpen);
            }}
            iconType="documentation"
            aria-label="Scaling documentation"
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={() => {
        setIsPopoverOpen(false);
      }}
      repositionOnScroll
      ownFocus
      aria-label={i18n.translate('xpack.maps.scalingDocs.popoverAriaLabel', {
        defaultMessage: 'Scaling documentation',
      })}
    >
      <EuiPopoverTitle>
        <FormattedMessage id="xpack.maps.scalingDocs.title" defaultMessage="Scaling" />
      </EuiPopoverTitle>

      <div>
        <EuiText size="s" style={{ maxWidth: '36em' }}>
          <dl>
            <dt>{props.mvtOptionLabel} (Default)</dt>
            <dd>
              <p>
                <FormattedMessage
                  id="xpack.maps.scalingDocs.mvtDetails"
                  defaultMessage="Vector tiles partition your map into tiles, with each tile displaying features from the first {maxResultWindow} documents. Results exceeding {maxResultWindow} are not displayed in a tile. A bounding box indicates the area where data is incomplete."
                  values={{ maxResultWindow: props.maxResultWindow }}
                />
              </p>
              <p>
                <FormattedMessage
                  id="xpack.maps.scalingDocs.mvtUseCase"
                  defaultMessage="Use this option to display large data sets with the fastest loading times."
                />
              </p>
            </dd>

            <dt>{props.clustersOptionLabel}</dt>
            <dd>
              <p>
                <FormattedMessage
                  id="xpack.maps.scalingDocs.clustersDetails"
                  defaultMessage="Display clusters when results exceed {maxResultWindow} documents. Display documents when results are less then {maxResultWindow}."
                  values={{ maxResultWindow: props.maxResultWindow }}
                />
              </p>
              <p>
                <FormattedMessage
                  id="xpack.maps.scalingDocs.clustersUseCase"
                  defaultMessage="Use this option to display large data sets. "
                />
                <i>
                  <FormattedMessage
                    id="xpack.maps.scalingDocs.doesNotSupportJoins"
                    defaultMessage="Does not support joins."
                  />
                </i>
              </p>
            </dd>

            <dt>{props.limitOptionLabel}</dt>
            <dd>
              <p>
                <FormattedMessage
                  id="xpack.maps.scalingDocs.limitDetails"
                  defaultMessage="Display features from the first {maxResultWindow} documents."
                  values={{ maxResultWindow: props.maxResultWindow }}
                />
              </p>
              <FormattedMessage
                id="xpack.maps.scalingDocs.limitUseCases"
                defaultMessage="Use this option when you can not use vector tiles for the following reasons:"
              />
              <ul>
                <li>
                  <FormattedMessage
                    id="xpack.maps.scalingDocs.limitUseCase.formatLabels"
                    defaultMessage="Formatted labels"
                  />
                </li>
                <li>
                  <FormattedMessage
                    id="xpack.maps.scalingDocs.limitUseCase.multipleJoins"
                    defaultMessage="Spatial joins"
                  />
                </li>
                <li>
                  <FormattedMessage
                    id="xpack.maps.scalingDocs.limitUseCase.spatialJoins"
                    defaultMessage="Multiple term joins"
                  />
                </li>
                <li>
                  <FormattedMessage
                    id="xpack.maps.scalingDocs.limitUseCase.joinFieldsWithLayoutStyles"
                    defaultMessage="Data driven styling from join metrics with 'Label', 'Label size', icon 'Symbol size', and 'Symbol orientation' style properties"
                  />
                </li>
                <li>
                  <FormattedMessage
                    id="xpack.maps.scalingDocs.limitUseCase.scriptedFields"
                    defaultMessage="Data driven styling from scripted fields"
                  />
                </li>
              </ul>
            </dd>
          </dl>

          <p style={{ fontStyle: 'italic' }}>
            <FormattedMessage
              id="xpack.maps.scalingDocs.maxResultWindow"
              defaultMessage="{maxResultWindow} constraint provided by {link} index setting."
              values={{
                maxResultWindow: props.maxResultWindow,
                link: (
                  <EuiLink
                    href={getDocLinks().links.elasticsearch.dynamicIndexSettings}
                    target="_blank"
                    external={true}
                  >
                    max_result_window
                  </EuiLink>
                ),
              }}
            />
          </p>
        </EuiText>
      </div>
    </EuiPopover>
  );
}
