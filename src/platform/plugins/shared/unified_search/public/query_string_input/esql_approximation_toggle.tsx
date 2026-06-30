/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useState } from 'react';
import {
  EuiButtonIcon,
  EuiFlexItem,
  EuiFlexGroup,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiPopover,
  EuiSwitch,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { IUnifiedSearchPluginServices } from '../types';

const POPOVER_WIDTH = 320;

const getLabels = (
  disabled: boolean | undefined,
  useApproximation: boolean,
  additionalText?: string
) => {
  if (disabled) {
    const ariaLabel = i18n.translate('unifiedSearch.esqlApproximationToggle.unavailable', {
      defaultMessage: 'Fast mode unavailable',
    });
    return {
      tooltipContent: (
        <>
          <strong>{ariaLabel}</strong>
          {additionalText && (
            <>
              <br />
              <br />
              {additionalText}
            </>
          )}
        </>
      ),
      ariaLabel,
      switchLabel: i18n.translate('unifiedSearch.esqlApproximationToggle.switch.off', {
        defaultMessage: 'OFF',
      }),
    };
  }

  if (useApproximation) {
    return {
      tooltipContent: i18n.translate('unifiedSearch.esqlApproximationToggle.button.tooltip.on', {
        defaultMessage: 'Fast mode: ON',
      }),
      ariaLabel: i18n.translate('unifiedSearch.esqlApproximationToggle.button.ariaLabel.on', {
        defaultMessage: 'Fast mode: ON',
      }),
      switchLabel: i18n.translate('unifiedSearch.esqlApproximationToggle.switch.on', {
        defaultMessage: 'ON',
      }),
    };
  }

  return {
    tooltipContent: i18n.translate('unifiedSearch.esqlApproximationToggle.button.tooltip.off', {
      defaultMessage: 'Fast mode: OFF',
    }),
    ariaLabel: i18n.translate('unifiedSearch.esqlApproximationToggle.button.ariaLabel.off', {
      defaultMessage: 'Fast mode: OFF',
    }),
    switchLabel: i18n.translate('unifiedSearch.esqlApproximationToggle.switch.off', {
      defaultMessage: 'OFF',
    }),
  };
};

interface EsqlApproximationToggleProps {
  useApproximation: boolean;
  onChange: (useApproximation: boolean) => void;
  additionalText?: string;
  disabled?: boolean;
}

export const EsqlApproximationToggle = ({
  useApproximation,
  onChange,
  additionalText,
  disabled,
}: EsqlApproximationToggleProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const { euiTheme } = useEuiTheme();
  const { services } = useKibana<IUnifiedSearchPluginServices>();
  const learnMoreUrl = services.docLinks.links.query.queryESQLApproximateResults;

  const { tooltipContent, ariaLabel, switchLabel } = getLabels(
    disabled,
    useApproximation,
    additionalText
  );

  return (
    <EuiFlexItem grow={false}>
      <EuiPopover
        button={
          <EuiToolTip content={tooltipContent} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="bolt"
              aria-label={ariaLabel}
              size="s"
              color={useApproximation ? 'success' : 'text'}
              display="base"
              disabled={disabled}
              data-test-subj="esqlApproximationToggleButton"
              onClick={() => setIsPopoverOpen((open) => !open)}
            />
          </EuiToolTip>
        }
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelPaddingSize="m"
        panelStyle={{ width: POPOVER_WIDTH }}
        anchorPosition="downRight"
        aria-label={i18n.translate('unifiedSearch.esqlApproximationToggle.popover.ariaLabel', {
          defaultMessage: 'Fast mode options',
        })}
      >
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexItem>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="bolt" size="m" aria-hidden={true} />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">
                      {i18n.translate('unifiedSearch.esqlApproximationToggle.fastMode.label', {
                        defaultMessage: 'Fast mode',
                      })}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSwitch
                  label={switchLabel}
                  checked={useApproximation}
                  onChange={(e) => onChange(e.target.checked)}
                  data-test-subj="esqlApproximationToggleSwitch"
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
          <EuiHorizontalRule margin="s" />
          <EuiFlexItem>
            <EuiText size="s">
              <FormattedMessage
                id="unifiedSearch.esqlApproximationToggle.description"
                defaultMessage="Get faster results by using approximation on large datasets. This is especially useful for exploring trends, or similar cases where you don't need exact results. {learnMore}"
                values={{
                  learnMore: (
                    <EuiLink href={learnMoreUrl} target="_blank" external>
                      {i18n.translate('unifiedSearch.esqlApproximationToggle.learnMore', {
                        defaultMessage: 'Learn more',
                      })}
                    </EuiLink>
                  ),
                }}
              />
            </EuiText>
          </EuiFlexItem>
          {additionalText && (
            <EuiFlexItem>
              <EuiText size="xs" color="subdued" css={{ paddingTop: euiTheme.size.s }}>
                {additionalText}
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPopover>
    </EuiFlexItem>
  );
};
