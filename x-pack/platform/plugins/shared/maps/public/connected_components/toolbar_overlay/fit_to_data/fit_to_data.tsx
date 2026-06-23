/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import classNames from 'classnames';
import { EuiButtonIcon, EuiPanel, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export interface Props {
  autoFitToDataBounds: boolean;
  fitToBounds: () => void;
}

export function FitToData(props: Props) {
  const label = i18n.translate('xpack.maps.fitToData.label', {
    defaultMessage: 'Fit to data bounds',
  });
  let title = label;
  if (props.autoFitToDataBounds) {
    title =
      `${title}. ` +
      i18n.translate('xpack.maps.fitToData.autoFitToDataBounds', {
        defaultMessage:
          'Map setting "auto fit map to data bounds" enabled, map will automatically pan and zoom to show the data bounds.',
      });
  }
  return (
    <EuiPanel paddingSize="none" className="mapToolbarOverlay__button">
      <EuiToolTip
        content={title}
        disableScreenReaderOutput
        anchorClassName={classNames({
          'mapToolbarOverlay__buttonIcon-empty': !props.autoFitToDataBounds,
        })}
      >
        <EuiButtonIcon
          size="s"
          onClick={props.fitToBounds}
          data-test-subj="fitToData"
          iconType="maximize"
          aria-label={label}
          color="text"
          display={props.autoFitToDataBounds ? 'fill' : 'empty'}
        />
      </EuiToolTip>
    </EuiPanel>
  );
}
