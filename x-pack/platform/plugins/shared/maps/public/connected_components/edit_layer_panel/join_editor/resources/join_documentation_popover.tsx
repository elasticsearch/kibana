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

export function JoinDocumentationPopover() {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <EuiPopover
      id="joinHelpPopover"
      anchorPosition="leftCenter"
      button={
        <EuiToolTip content="Join documentation" disableScreenReaderOutput>
          <EuiButtonIcon
            onClick={() => {
              setIsPopoverOpen(!isPopoverOpen);
            }}
            iconType="documentation"
            aria-label="Join documentation"
          />
        </EuiToolTip>
      }
      isOpen={isPopoverOpen}
      closePopover={() => {
        setIsPopoverOpen(false);
      }}
      repositionOnScroll
      ownFocus
      aria-label={i18n.translate(
        'xpack.maps.layerPanel.joinEditor.joinDocumentationPopoverAriaLabel',
        {
          defaultMessage: 'Join documentation',
        }
      )}
    >
      <EuiPopoverTitle>
        <FormattedMessage id="xpack.maps.layerPanel.joinEditor.title" defaultMessage="Joins" />
      </EuiPopoverTitle>
      <div>
        <EuiText size="s" style={{ maxWidth: '36em' }}>
          <p>
            <FormattedMessage
              id="xpack.maps.joinDocs.intro"
              defaultMessage="Joins add metrics to layer features for data driven styling and tooltip content."
            />{' '}
            <i>
              <FormattedMessage
                id="xpack.maps.joinDocs.noMatches"
                defaultMessage="Layer features that do have a matches are not visible on the map."
              />
            </i>
          </p>
          <dl>
            <dt>
              <FormattedMessage id="xpack.maps.joinDocs.termJoinTitle" defaultMessage="Term join" />
            </dt>
            <dd>
              <p>
                <FormattedMessage
                  id="xpack.maps.joinDocs.termsJoinIntro"
                  defaultMessage="A term join uses a shared key to combine layer features with metrics from an Elasticsearch terms aggregation."
                />
              </p>
              <EuiLink
                href={getDocLinks().links.maps.termJoinsExample}
                target="_blank"
                external={true}
              >
                <FormattedMessage
                  id="xpack.maps.joinDocs.linkLabel"
                  defaultMessage="Term join example"
                />
              </EuiLink>
            </dd>

            <dt>
              <FormattedMessage
                id="xpack.maps.joinDocs.spatialJoinTitle"
                defaultMessage="Spatial join"
              />
            </dt>
            <dd>
              <p>
                <FormattedMessage
                  id="xpack.maps.joinDocs.spatialJoinIntro"
                  defaultMessage="A spatial join uses a geospatial relationship to combine layer features with metrics from an Elasticsearch geo query filters aggregation."
                />
              </p>
            </dd>
          </dl>
        </EuiText>
      </div>
    </EuiPopover>
  );
}
