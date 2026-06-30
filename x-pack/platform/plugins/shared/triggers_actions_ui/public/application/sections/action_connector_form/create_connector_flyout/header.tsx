/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import type { IconType } from '@elastic/eui';
import {
  EuiBadge,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiFlyoutHeader,
  EuiSpacer,
  EuiBetaBadge,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { TECH_PREVIEW_DESCRIPTION, TECH_PREVIEW_LABEL } from '../../translations';

interface Props {
  icon?: IconType | null;
  actionTypeName?: string | null;
  actionTypeMessage?: string | null;
  compatibility?: string[] | null;
  isExperimental?: boolean;
}

const FlyoutHeaderComponent: React.FC<Props> = ({
  icon,
  actionTypeName,
  actionTypeMessage,
  compatibility,
  isExperimental,
}) => {
  return (
    <EuiFlyoutHeader hasBorder data-test-subj="create-connector-flyout-header">
      <EuiFlexGroup gutterSize="m" alignItems="center">
        {icon ? (
          <EuiFlexItem grow={false} data-test-subj="create-connector-flyout-header-icon">
            <EuiIcon type={icon} size="xl" aria-hidden={true} />
          </EuiFlexItem>
        ) : null}
        <EuiFlexItem grow={false}>
          {actionTypeName && actionTypeMessage ? (
            <>
              <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiTitle size="s">
                    <h3 id="flyoutTitle">
                      <FormattedMessage
                        defaultMessage="{actionTypeName}"
                        id="xpack.triggersActionsUI.sections.addConnectorForm.flyoutTitle"
                        values={{
                          actionTypeName,
                        }}
                      />
                    </h3>
                  </EuiTitle>
                </EuiFlexItem>
                {actionTypeName && isExperimental && (
                  <EuiFlexItem grow={false}>
                    <EuiBetaBadge
                      label={TECH_PREVIEW_LABEL}
                      tooltipContent={TECH_PREVIEW_DESCRIPTION}
                    />
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiText size="s" color="subdued">
                {actionTypeMessage}
              </EuiText>
              {compatibility && compatibility.length > 0 && (
                <>
                  <EuiSpacer size="m" />
                  <EuiFlexGroup
                    data-test-subj="create-connector-flyout-header-compatibility"
                    wrap
                    responsive={false}
                    gutterSize="xs"
                    alignItems="center"
                  >
                    <EuiText size="s">
                      <p>
                        <FormattedMessage
                          id="xpack.triggersActionsUI.sections.addConnectorForm.flyoutHeaderCompatibility"
                          defaultMessage="Compatibility:"
                        />{' '}
                      </p>
                    </EuiText>
                    {compatibility.map((compatibilityItem: string) => (
                      <EuiFlexItem grow={false} key={compatibilityItem}>
                        <EuiBadge color="default">{compatibilityItem}</EuiBadge>
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                </>
              )}
            </>
          ) : (
            <EuiTitle size="s">
              <h3 id="selectConnectorFlyoutTitle">
                <FormattedMessage
                  defaultMessage="Select a connector"
                  id="xpack.triggersActionsUI.sections.addConnectorForm.selectConnectorFlyoutTitle"
                />
              </h3>
            </EuiTitle>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiFlyoutHeader>
  );
};

export const FlyoutHeader: React.NamedExoticComponent<Props> = memo(FlyoutHeaderComponent);
