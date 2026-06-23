/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { css } from '@emotion/css';
import {
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCode,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  EuiLink,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import * as i18n from './translations';
import type { UploadedLookups } from '../../types';
import { MigrationSource } from '../../../../types';

const scrollPanelCss = css`
  max-height: 200px;
  overflow-y: auto;
`;

interface MissingLookupsListProps {
  migrationSource?: MigrationSource;
  missingLookups: string[];
  uploadedLookups: UploadedLookups;
  omitLookup: (lookupsName: string) => void;
  onCopied: () => void;
}
export const MissingLookupsList = React.memo<MissingLookupsListProps>(
  ({
    migrationSource = MigrationSource.SPLUNK,
    missingLookups,
    uploadedLookups,
    omitLookup,
    onCopied,
  }) => {
    const { euiTheme } = useEuiTheme();
    return (
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiText size="s">
            {migrationSource === MigrationSource.QRADAR ? (
              i18n.REFERENCE_SETS_QRADAR_APP
            ) : migrationSource === MigrationSource.SENTINEL ? (
              <FormattedMessage
                id="xpack.securitySolution.siemMigrations.common.dataInputFlyout.lookups.missingWatchlistsList.sentinelAppSection"
                defaultMessage="Below are the watchlists found in your rules. Export them from Microsoft Sentinel and upload here. Exported Watchlist must be in <armlink>ARM Resource format</armlink>. CSV content should be included in the <code>rawContent</code> property of the watchlist."
                values={{
                  armlink: (child) => (
                    <EuiLink
                      href="https://learn.microsoft.com/en-us/azure/templates/microsoft.securityinsights/watchlists?pivots=deployment-language-arm-template#resource-format-1"
                      target="_blank"
                    >
                      {child}
                    </EuiLink>
                  ),
                  code: (child) => <EuiCode>{child}</EuiCode>,
                }}
              />
            ) : (
              <FormattedMessage
                id="xpack.securitySolution.siemMigrations.common.dataInputFlyout.lookups.copyExportQuery.splunk.description"
                defaultMessage="Log in to your Splunk admin account, go to the {app}, download the following lookups individually and upload them below. You can also omit lookups that are empty or not needed, and they will be ignored in the translation."
                values={{ app: <b>{i18n.LOOKUPS_SPLUNK_APP}</b> }}
              />
            )}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel hasShadow={false} hasBorder className={scrollPanelCss}>
            <EuiFlexGroup direction="column" gutterSize="s">
              {missingLookups.map((lookupName) => {
                const isOmitted = uploadedLookups[lookupName] === '';
                return (
                  <EuiFlexItem key={lookupName}>
                    <EuiFlexGroup
                      direction="row"
                      gutterSize="s"
                      alignItems="center"
                      justifyContent="flexStart"
                    >
                      <EuiFlexItem grow={false}>
                        {uploadedLookups[lookupName] != null ? (
                          <EuiIcon
                            type="checkCircleFill"
                            color={euiTheme.colors.success}
                            aria-hidden={true}
                          />
                        ) : (
                          <EuiIcon type="dot" aria-hidden={true} />
                        )}
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiText
                          size="s"
                          style={isOmitted ? { textDecoration: 'line-through' } : {}}
                        >
                          {lookupName}
                        </EuiText>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiCopy textToCopy={lookupName}>
                          {(copy) => (
                            <CopyLookupNameButton
                              lookupName={lookupName}
                              onCopied={onCopied}
                              copy={copy}
                              migrationSource={migrationSource}
                            />
                          )}
                        </EuiCopy>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <OmitLookupButton
                          lookupName={lookupName}
                          omitLookup={omitLookup}
                          isDisabled={isOmitted}
                          migrationSource={migrationSource}
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                );
              })}
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);
MissingLookupsList.displayName = 'MissingLookupsList';

interface CopyLookupNameButtonProps {
  lookupName: string;
  onCopied: () => void;
  copy: () => void;
  migrationSource: MigrationSource;
}

interface ConfigSetting {
  tooltip: string;
  label: string;
}

const CONFIGS: Record<MigrationSource, ConfigSetting> = {
  [MigrationSource.SPLUNK]: {
    tooltip: i18n.COPY_LOOKUP_NAME_TOOLTIP,
    label: i18n.CLEAR_EMPTY_LOOKUP_TOOLTIP,
  },
  [MigrationSource.QRADAR]: {
    tooltip: i18n.COPY_REFERENCE_SET_NAME_TOOLTIP,
    label: i18n.CLEAR_EMPTY_REFERENCE_SET_TOOLTIP,
  },
  [MigrationSource.SENTINEL]: {
    tooltip: i18n.COPY_WATCHLIST_NAME_TOOLTIP,
    label: i18n.CLEAR_EMPTY_WATCHLIST_TOOLTIP,
  },
};
const CopyLookupNameButton = React.memo<CopyLookupNameButtonProps>(
  ({ lookupName, onCopied, copy, migrationSource }) => {
    const onClick = useCallback(() => {
      copy();
      onCopied();
    }, [copy, onCopied]);

    const testId =
      migrationSource === MigrationSource.QRADAR ? 'referenceSetNameCopy' : 'lookupNameCopy';
    return (
      <EuiToolTip content={CONFIGS[migrationSource].tooltip} disableScreenReaderOutput>
        <EuiButtonIcon
          onClick={onClick}
          iconType="copy"
          color="text"
          aria-label={`${CONFIGS[migrationSource].tooltip} ${lookupName}`}
          data-test-subj={testId}
        />
      </EuiToolTip>
    );
  }
);
CopyLookupNameButton.displayName = 'CopyLookupNameButton';

interface OmitLookupButtonProps {
  lookupName: string;
  omitLookup: (lookupName: string) => void;
  isDisabled: boolean;
  migrationSource: MigrationSource;
}
const OmitLookupButton = React.memo<OmitLookupButtonProps>(
  ({ lookupName, omitLookup, isDisabled: isDisabledDefault, migrationSource }) => {
    const [isDisabled, setIsDisabled] = useState(isDisabledDefault);
    const onClick = useCallback(() => {
      setIsDisabled(true);
      omitLookup(lookupName);
    }, [omitLookup, lookupName]);
    const testId =
      migrationSource === MigrationSource.QRADAR ? 'referenceSetNameClear' : 'lookupNameClear';

    const button = useMemo(
      () => (
        <EuiToolTip content={CONFIGS[migrationSource].label} disableScreenReaderOutput>
          <EuiButtonIcon
            onClick={onClick}
            iconType="cross"
            color="text"
            aria-label={CONFIGS[migrationSource].label}
            data-test-subj={testId}
            isDisabled={isDisabled}
          />
        </EuiToolTip>
      ),
      [onClick, migrationSource, testId, isDisabled]
    );
    if (isDisabled) {
      return button;
    }
    return <EuiToolTip content={CONFIGS[migrationSource].label}>{button}</EuiToolTip>;
  }
);
OmitLookupButton.displayName = 'OmitLookupButton';
