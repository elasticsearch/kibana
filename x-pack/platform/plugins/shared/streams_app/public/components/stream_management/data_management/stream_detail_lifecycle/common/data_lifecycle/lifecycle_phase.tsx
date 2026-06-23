/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiBadge,
  EuiButton,
  EuiButtonIcon,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiPopoverFooter,
  EuiPopoverTitle,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { capitalize } from 'lodash';
import {
  FrozenDefaultRepositoryRequiredCallout,
  FrozenEnterpriseRequiredCallout,
  usePhaseColors,
} from '@kbn/data-lifecycle-phases';
import { formatBytes } from '../../helpers/format_bytes';
import { LifecyclePhaseButton } from './lifecycle_phase_button';
import { isZeroAge } from '../../../../../../util/format_size_units';

interface BaseLifecyclePhaseProps {
  color?: string;
  description?: string;
  docsCount?: number;
  isReadOnly?: boolean;
  showEnterpriseCallout?: boolean;
  onUpgradeEnterprise?: () => void;
  showDefaultRepositoryCallout?: boolean;
  onCreateDefaultRepository?: () => void;
  onRefreshDefaultRepository?: () => void;
  isRefreshingDefaultRepository?: boolean;
  label: string;
  minAge?: string;
  onClick?: () => void;
  searchableSnapshot?: string;
  size?: string;
  sizeInBytes?: number;
  testSubjPrefix?: string;
  showActions?: boolean;
  onRemovePhase?: (phaseName: string) => void;
  onEditPhase?: (phaseName: string) => void;
  isBeingEdited?: boolean;
  canManageLifecycle: boolean;
  isRemoveDisabled?: boolean;
  removeDisabledReason?: string;
  isEditLifecycleFlyoutOpen?: boolean;
}

interface DeleteLifecyclePhaseProps extends BaseLifecyclePhaseProps {
  isDelete: true;
}

interface StandardLifecyclePhaseProps extends BaseLifecyclePhaseProps {
  color: string;
  isDelete?: false;
}

export type LifecyclePhaseProps = DeleteLifecyclePhaseProps | StandardLifecyclePhaseProps;

export const LifecyclePhase = (props: LifecyclePhaseProps) => {
  const { euiTheme } = useEuiTheme();
  const phaseColors = usePhaseColors();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const popoverTitleId = useGeneratedHtmlId({
    prefix: `streamsLifecyclePhasePopoverTitle-${props.label}`,
  });

  const {
    color,
    description,
    docsCount,
    isReadOnly = false,
    showEnterpriseCallout = false,
    onUpgradeEnterprise,
    showDefaultRepositoryCallout = false,
    onCreateDefaultRepository,
    onRefreshDefaultRepository,
    isRefreshingDefaultRepository,
    label,
    minAge,
    onClick,
    searchableSnapshot,
    size,
    sizeInBytes,
    testSubjPrefix,
    showActions = false,
    onRemovePhase,
    onEditPhase,
    isBeingEdited = false,
    canManageLifecycle,
    isRemoveDisabled = false,
    removeDisabledReason,
    isEditLifecycleFlyoutOpen = false,
  } = props;
  const isDelete = props.isDelete === true;
  const prefix = testSubjPrefix ? `${testSubjPrefix}-` : '';

  const phaseColor = isDelete ? phaseColors.delete : color;
  const showWarningIcon =
    !isDelete &&
    label === 'frozen' &&
    ((showEnterpriseCallout && Boolean(onUpgradeEnterprise)) || showDefaultRepositoryCallout);

  const handleClick = () => {
    if (isEditLifecycleFlyoutOpen) {
      // When the flyout is open, navigate to this phase instead of showing the popover
      onEditPhase?.(label);
      return;
    }
    setIsPopoverOpen(!isPopoverOpen);
    onClick?.();
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };
  const showStoredSize = !isDelete && sizeInBytes !== undefined;
  const showDocumentCount = !isDelete && docsCount !== undefined;
  const showAgeBadge = minAge !== undefined && !isZeroAge(minAge);
  const showSearchableSnapshot =
    !isDelete &&
    ((label === 'cold' && searchableSnapshot !== undefined) ||
      (label === 'frozen' && (searchableSnapshot !== undefined || showDefaultRepositoryCallout)));
  const canShowReadOnlyRow = !isDelete && (label === 'hot' || label === 'warm' || label === 'cold');
  const readOnlyValue = isReadOnly
    ? i18n.translate('xpack.streams.streamDetailLifecycle.readOnlyEnabled', {
        defaultMessage: 'Enabled',
      })
    : i18n.translate('xpack.streams.streamDetailLifecycle.readOnlyDisabled', {
        defaultMessage: 'Disabled',
      });

  return (
    <EuiPopover
      button={
        <LifecyclePhaseButton
          euiTheme={euiTheme}
          isDelete={isDelete}
          isPopoverOpen={isPopoverOpen}
          isBeingEdited={isBeingEdited}
          label={label}
          onClick={handleClick}
          phaseColor={phaseColor}
          size={size}
          testSubjPrefix={testSubjPrefix}
          isEditLifecycleFlyoutOpen={isEditLifecycleFlyoutOpen}
          showWarningIcon={showWarningIcon}
        />
      }
      isOpen={isPopoverOpen && !isEditLifecycleFlyoutOpen}
      closePopover={closePopover}
      anchorPosition="upCenter"
      aria-labelledby={popoverTitleId}
      panelPaddingSize="none"
    >
      <EuiPopoverTitle
        id={popoverTitleId}
        data-test-subj={`${prefix}lifecyclePhase-${label}-popoverTitle`}
        paddingSize="m"
      >
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                {i18n.translate('xpack.streams.streamDetailLifecycle.phasePopoverTitleLabel', {
                  defaultMessage: '{phase} phase',
                  values: { phase: capitalize(label) },
                })}
              </EuiFlexItem>
              {showAgeBadge && (
                <EuiFlexItem grow={false}>
                  <EuiBadge data-test-subj={`${prefix}lifecyclePhase-${label}-ageBadge`}>
                    {minAge}
                  </EuiBadge>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
          {showActions && canManageLifecycle && (onEditPhase || onRemovePhase) && (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="s" responsive={false} alignItems="center">
                {onEditPhase && (
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      size="s"
                      minWidth={false}
                      aria-label={i18n.translate(
                        'xpack.streams.streamDetailLifecycle.editPhaseButton.ariaLabel',
                        {
                          defaultMessage: 'Edit {phase} phase',
                          values: { phase: label ?? '' },
                        }
                      )}
                      data-test-subj={`lifecyclePhase-${label}-editButton`}
                      onClick={() => {
                        closePopover();
                        onEditPhase(label ?? '');
                      }}
                    >
                      {i18n.translate('xpack.streams.streamDetailLifecycle.editPhaseButtonLabel', {
                        defaultMessage: 'Edit',
                      })}
                    </EuiButton>
                  </EuiFlexItem>
                )}

                {label !== 'hot' && onRemovePhase && (
                  <EuiFlexItem grow={false}>
                    {isRemoveDisabled && removeDisabledReason ? (
                      <EuiToolTip content={removeDisabledReason}>
                        <EuiButtonIcon
                          iconType="trash"
                          size="s"
                          display="base"
                          color="danger"
                          isDisabled
                          aria-label={i18n.translate(
                            'xpack.streams.streamDetailLifecycle.removePhaseButton.ariaLabel',
                            {
                              defaultMessage: 'Remove {phase} phase',
                              values: { phase: label ?? '' },
                            }
                          )}
                          data-test-subj={`lifecyclePhase-${label}-removeButton`}
                        />
                      </EuiToolTip>
                    ) : (
                      <EuiToolTip
                        content={i18n.translate(
                          'xpack.streams.streamDetailLifecycle.removePhaseButton.ariaLabel',
                          {
                            defaultMessage: 'Remove {phase} phase',
                            values: { phase: label ?? '' },
                          }
                        )}
                        disableScreenReaderOutput
                      >
                        <EuiButtonIcon
                          iconType="trash"
                          size="s"
                          display="base"
                          color="danger"
                          aria-label={i18n.translate(
                            'xpack.streams.streamDetailLifecycle.removePhaseButton.ariaLabel',
                            {
                              defaultMessage: 'Remove {phase} phase',
                              values: { phase: label ?? '' },
                            }
                          )}
                          data-test-subj={`lifecyclePhase-${label}-removeButton`}
                          onClick={() => {
                            closePopover();
                            onRemovePhase(label ?? '');
                          }}
                        />
                      </EuiToolTip>
                    )}
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPopoverTitle>
      <div
        style={{ width: '300px' }}
        data-test-subj={`${prefix}lifecyclePhase-${label}-popoverContent`}
      >
        {!isDelete && label === 'frozen' && showEnterpriseCallout && onUpgradeEnterprise && (
          <FrozenEnterpriseRequiredCallout
            onUpgradeEnterprise={onUpgradeEnterprise}
            calloutTestSubj={`${prefix}lifecyclePhase-${label}-enterpriseRequiredCallout`}
            upgradeButtonTestSubj={`${prefix}lifecyclePhase-${label}-upgradeEnterpriseButton`}
          />
        )}
        <div css={{ padding: euiTheme.size.m }}>
          <EuiText size="s" data-test-subj={`${prefix}lifecyclePhase-${label}-description`}>
            <p>{description}</p>
          </EuiText>
          <EuiSpacer size="s" />
          {(showStoredSize || showDocumentCount || canShowReadOnlyRow) && (
            <EuiFlexGrid columns={2} gutterSize="s">
              {showStoredSize && sizeInBytes !== undefined && (
                <>
                  <EuiFlexItem data-test-subj={`${prefix}lifecyclePhase-${label}-storedSize`}>
                    <EuiText size="s">
                      <strong>
                        {i18n.translate('xpack.streams.streamDetailLifecycle.storedSize', {
                          defaultMessage: 'Storage size',
                        })}
                      </strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText
                      size="s"
                      data-test-subj={`${prefix}lifecyclePhase-${label}-storedSizeValue`}
                    >
                      {formatBytes(sizeInBytes)}
                    </EuiText>
                  </EuiFlexItem>
                </>
              )}

              {showDocumentCount && docsCount !== undefined && (
                <>
                  <EuiFlexItem data-test-subj={`${prefix}lifecyclePhase-${label}-docsCount`}>
                    <EuiText size="s">
                      <strong>
                        {i18n.translate('xpack.streams.streamDetailLifecycle.documentCount', {
                          defaultMessage: 'Document count',
                        })}
                      </strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText
                      size="s"
                      data-test-subj={`${prefix}lifecyclePhase-${label}-docsCountValue`}
                    >
                      {docsCount.toLocaleString()}
                    </EuiText>
                  </EuiFlexItem>
                </>
              )}

              {canShowReadOnlyRow && (
                <>
                  <EuiFlexItem data-test-subj={`${prefix}lifecyclePhase-${label}-readOnly`}>
                    <EuiText size="s">
                      <strong>
                        {i18n.translate('xpack.streams.streamDetailLifecycle.readOnlyLabel', {
                          defaultMessage: 'Read-only',
                        })}
                      </strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiText
                      size="s"
                      data-test-subj={`${prefix}lifecyclePhase-${label}-readOnlyValue`}
                    >
                      {readOnlyValue}
                    </EuiText>
                  </EuiFlexItem>
                </>
              )}
            </EuiFlexGrid>
          )}
        </div>

        {showSearchableSnapshot && (
          <EuiPopoverFooter
            data-test-subj={`${prefix}lifecyclePhase-${label}-searchableSnapshot`}
            paddingSize="m"
          >
            <EuiText size="xs" color="subdued">
              <strong>
                {i18n.translate(
                  'xpack.streams.streamDetailLifecycle.searchableSnapshot.description',
                  {
                    defaultMessage: 'Searchable snapshot',
                  }
                )}
              </strong>
            </EuiText>
            <EuiSpacer size="s" />

            {label === 'frozen' && showDefaultRepositoryCallout ? (
              <FrozenDefaultRepositoryRequiredCallout
                onCreateDefaultRepository={onCreateDefaultRepository}
                onRefresh={onRefreshDefaultRepository}
                isRefreshing={isRefreshingDefaultRepository}
                calloutTestSubj={`${prefix}lifecyclePhase-${label}-defaultRepositoryRequiredCallout`}
                createButtonTestSubj={`${prefix}lifecyclePhase-${label}-createDefaultRepositoryButton`}
                refreshButtonTestSubj={`${prefix}lifecyclePhase-${label}-refreshDefaultRepositoryButton`}
              />
            ) : (
              <EuiFlexGrid columns={2} gutterSize="s">
                <EuiFlexItem>
                  <EuiText size="s">
                    <strong>
                      {i18n.translate(
                        'xpack.streams.streamDetailLifecycle.searchableSnapshot.snapshotRepository',
                        {
                          defaultMessage: 'Repository',
                        }
                      )}
                    </strong>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiText
                    size="s"
                    data-test-subj={`${prefix}lifecyclePhase-${label}-snapshotRepository`}
                  >
                    {searchableSnapshot}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGrid>
            )}
          </EuiPopoverFooter>
        )}
      </div>
    </EuiPopover>
  );
};
