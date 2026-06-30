/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiDragDropContext,
  EuiDraggable,
  EuiDroppable,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiSplitPanel,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
  euiDragDropReorder,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { NO_DEFAULT_MODEL } from '../../../common/constants';
import { useRegisteredFeatures } from '../../hooks/use_registered_features';
import { getConnectorIcon } from '../../utils/connector_display';
import type { InferenceFeatureResponse as InferenceFeatureConfig } from '../../../common/types';
import { useConnectors } from '../../hooks/use_connectors';
import type { EndpointDeprecationInfo } from '../../types';
import { ModelStatusBadge } from '../model_status/model_status_badge';
import { AddModelPopover } from './add_model_popover';
import { CopyToModal } from './copy_to_modal';
import { DisableRecommendedModelsModal } from './disable_recommended_models_modal';
import { ResetDefaultsModal } from './reset_defaults_modal';
import { EndpointIdTextLabel, MinWidthZeroContainer, SubFeatureCardFlexItem } from './styles';

const COLLAPSED_COUNT = 5;

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

interface SubFeatureCardProps {
  featureId: string;
  feature: InferenceFeatureConfig;
  endpointIds: string[];
  effectiveRecommendedEndpoints: string[];
  onEndpointsChange: (featureId: string, newEndpointIds: string[]) => void;
  invalidEndpointIds: Set<string>;
  deprecatedEndpointsMap: Map<string, EndpointDeprecationInfo>;
  hasSavedObject: boolean;
  isFeatureDirty: boolean;
  globalDefaultId: string;
  canManage?: boolean;
}

export const SubFeatureCard: React.FC<SubFeatureCardProps> = ({
  featureId,
  feature,
  endpointIds,
  effectiveRecommendedEndpoints,
  onEndpointsChange,
  invalidEndpointIds,
  deprecatedEndpointsMap,
  hasSavedObject,
  isFeatureDirty,
  globalDefaultId,
  canManage = true,
}) => {
  const { data: connectors = [] } = useConnectors();
  const { features: registeredFeatures } = useRegisteredFeatures();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [isDisableModalOpen, setIsDisableModalOpen] = useState(false);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [listWidth, setListWidth] = useState<number | undefined>(undefined);
  // Sticky session flag: the editable list is seeded with the recommended endpoints, so without this
  // the toggle would snap back to ON immediately after the user confirms "Turn off recommended defaults".
  const [hasOptedIntoCustomMode, setHasOptedIntoCustomMode] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { isTechPreview, isBeta } = feature;

  const useRecommendedDefaults = useMemo(
    () => !hasOptedIntoCustomMode && arraysEqual(endpointIds, effectiveRecommendedEndpoints),
    [hasOptedIntoCustomMode, endpointIds, effectiveRecommendedEndpoints]
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setListWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [useRecommendedDefaults]);

  const endpointDisplayMap = useMemo(
    () =>
      new Map(
        connectors.map((connector) => [
          connector.connectorId,
          {
            icon: getConnectorIcon(connector),
            label: connector.name,
          },
        ])
      ),
    [connectors]
  );

  const hasOtherSubFeatures = registeredFeatures.some(
    (f) => f.featureId !== featureId && f.parentFeatureId !== undefined
  );

  const hasOverflow = endpointIds.length > COLLAPSED_COUNT;
  const visibleEndpoints = isExpanded ? endpointIds : endpointIds.slice(0, COLLAPSED_COUNT);
  const hiddenCount = endpointIds.length - COLLAPSED_COUNT;
  const canAddMore =
    !feature.maxNumberOfEndpoints || endpointIds.length < feature.maxNumberOfEndpoints;

  const showGlobalDefaultRow = !hasSavedObject && globalDefaultId !== NO_DEFAULT_MODEL;
  const { icon: globalDefaultIcon = 'compute', label: globalDefaultLabel = globalDefaultId } =
    endpointDisplayMap.get(globalDefaultId) ?? {};
  const globalDefaultDeprecationInfo =
    !hasSavedObject && globalDefaultId !== NO_DEFAULT_MODEL
      ? deprecatedEndpointsMap.get(globalDefaultId)
      : undefined;

  const handleRemove = useCallback(
    (index: number) => {
      onEndpointsChange(
        featureId,
        endpointIds.filter((_, i) => i !== index)
      );
    },
    [endpointIds, featureId, onEndpointsChange]
  );

  const handleAdd = useCallback(
    (endpointId: string) => {
      onEndpointsChange(featureId, [...endpointIds, endpointId]);
    },
    [endpointIds, featureId, onEndpointsChange]
  );

  const handleDragEnd = useCallback(
    ({
      source,
      destination,
    }: {
      source: { index: number };
      destination?: { index: number } | null;
    }) => {
      if (destination && source.index !== destination.index) {
        onEndpointsChange(
          featureId,
          euiDragDropReorder(endpointIds, source.index, destination.index)
        );
      }
    },
    [endpointIds, featureId, onEndpointsChange]
  );

  const handleCopyApply = useCallback(
    (selectedFeatureIds: string[]) => {
      for (const targetId of selectedFeatureIds) {
        onEndpointsChange(targetId, [...endpointIds]);
      }
    },
    [endpointIds, onEndpointsChange]
  );

  const handleToggleRecommendedDefaults = useCallback(
    (checked: boolean) => {
      if (checked) {
        if (!useRecommendedDefaults) {
          setIsResetModalOpen(true);
        }
        return;
      }
      setIsDisableModalOpen(true);
    },
    [useRecommendedDefaults]
  );

  const confirmResetToDefaults = useCallback(() => {
    setHasOptedIntoCustomMode(false);
    onEndpointsChange(featureId, [...effectiveRecommendedEndpoints]);
    setIsResetModalOpen(false);
  }, [featureId, effectiveRecommendedEndpoints, onEndpointsChange]);

  const confirmDisableRecommendedDefaults = useCallback(() => {
    setHasOptedIntoCustomMode(true);
    onEndpointsChange(featureId, [...effectiveRecommendedEndpoints]);
    setIsDisableModalOpen(false);
  }, [featureId, effectiveRecommendedEndpoints, onEndpointsChange]);

  const showAddModelPopover = canManage && (!hasOverflow || isExpanded) && canAddMore;
  const showCopyToButton = canManage && (!hasOverflow || isExpanded) && hasOtherSubFeatures;

  return (
    <>
      <EuiFlexGroup
        data-test-subj={`subFeatureCard-${featureId}`}
        gutterSize="l"
        alignItems="baseline"
        wrap
      >
        <EuiFlexItem css={SubFeatureCardFlexItem}>
          <EuiFlexGroup responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h4>{feature.featureName}</h4>
              </EuiTitle>
            </EuiFlexItem>
            {(isTechPreview || isBeta) && (
              <EuiFlexItem grow={false}>
                <EuiBadgeGroup>
                  {isTechPreview && (
                    <EuiBadge>
                      {i18n.translate('xpack.searchInferenceEndpoints.settings.techPreview', {
                        defaultMessage: 'Technical Preview',
                      })}
                    </EuiBadge>
                  )}
                  {isBeta && (
                    <EuiBadge>
                      {i18n.translate('xpack.searchInferenceEndpoints.settings.betaBadge', {
                        defaultMessage: 'Beta',
                      })}
                    </EuiBadge>
                  )}
                </EuiBadgeGroup>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
          <EuiSpacer size="s" />
          <EuiText size="s" color="subdued">
            <p>{feature.featureDescription}</p>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiSwitch
            data-test-subj={`useRecommendedDefaultsToggle-${featureId}`}
            label={i18n.translate(
              'xpack.searchInferenceEndpoints.settings.useRecommendedDefaults.label',
              { defaultMessage: 'Use recommended defaults' }
            )}
            checked={useRecommendedDefaults}
            onChange={(e) => handleToggleRecommendedDefaults(e.target.checked)}
            disabled={!canManage}
          />
        </EuiFlexItem>

        <EuiFlexItem css={SubFeatureCardFlexItem}>
          <EuiPanel paddingSize="s" hasBorder={false} hasShadow={false}>
            <EuiText size="xs" color="subdued">
              <strong>
                {i18n.translate('xpack.searchInferenceEndpoints.settings.assignedModels', {
                  defaultMessage: 'Assigned models',
                })}
              </strong>
            </EuiText>
            <EuiSpacer size="s" />

            {useRecommendedDefaults ? (
              <RecommendedEndpointsList
                featureId={featureId}
                endpointIds={endpointIds}
                endpointDisplayMap={endpointDisplayMap}
                invalidEndpointIds={invalidEndpointIds}
                deprecatedEndpointsMap={deprecatedEndpointsMap}
                globalDefaultRow={
                  showGlobalDefaultRow && globalDefaultId
                    ? {
                        icon: globalDefaultIcon,
                        label: globalDefaultLabel,
                        showBadge: !isFeatureDirty,
                        globalDefaultId,
                        deprecationInfo: globalDefaultDeprecationInfo,
                      }
                    : undefined
                }
              />
            ) : (
              <EuiDragDropContext onDragEnd={handleDragEnd}>
                <div ref={listRef}>
                  <EuiSplitPanel.Outer hasBorder>
                    {showGlobalDefaultRow && globalDefaultId && (
                      <GlobalDefaultLockedRow
                        featureId={featureId}
                        icon={globalDefaultIcon}
                        label={globalDefaultLabel}
                        showBadge={!isFeatureDirty}
                        globalDefaultId={globalDefaultId}
                        deprecationInfo={globalDefaultDeprecationInfo}
                      />
                    )}
                    <EuiDroppable droppableId={`assigned-models-${featureId}`} spacing="none">
                      {visibleEndpoints.map((endpointId, index) => (
                        <EuiDraggable
                          key={endpointId}
                          index={index}
                          draggableId={endpointId}
                          customDragHandle
                          hasInteractiveChildren
                        >
                          {(provided) => {
                            const { icon = 'compute', label = endpointId } =
                              endpointDisplayMap.get(endpointId) ?? {};
                            const isInvalid = invalidEndpointIds.has(endpointId);
                            const deprecationInfo = deprecatedEndpointsMap.get(endpointId);
                            return (
                              <div>
                                <EuiSplitPanel.Inner
                                  paddingSize="s"
                                  data-test-subj={`endpoint-row-${endpointId}`}
                                >
                                  <EuiFlexGroup alignItems="center" gutterSize="s">
                                    {canManage && (
                                      <EuiFlexItem grow={false}>
                                        <EuiPanel
                                          color="transparent"
                                          paddingSize="none"
                                          {...provided.dragHandleProps}
                                          aria-label={i18n.translate(
                                            'xpack.searchInferenceEndpoints.settings.dragHandle',
                                            { defaultMessage: 'Drag to reorder' }
                                          )}
                                        >
                                          <EuiIcon
                                            type="grab"
                                            size="s"
                                            color="subdued"
                                            aria-hidden
                                          />
                                        </EuiPanel>
                                      </EuiFlexItem>
                                    )}
                                    <EuiFlexItem grow={false}>
                                      {isInvalid ? (
                                        <EuiIconTip
                                          type="warning"
                                          size="m"
                                          color="warning"
                                          content={i18n.translate(
                                            'xpack.searchInferenceEndpoints.settings.endpointUnavailable',
                                            {
                                              defaultMessage:
                                                'This inference endpoint is no longer available',
                                            }
                                          )}
                                          aria-label={i18n.translate(
                                            'xpack.searchInferenceEndpoints.settings.endpointUnavailable.ariaLabel',
                                            {
                                              defaultMessage:
                                                'Inference endpoint {label} is no longer available',
                                              values: { label },
                                            }
                                          )}
                                        />
                                      ) : (
                                        <EuiIcon type={icon} size="m" aria-hidden />
                                      )}
                                    </EuiFlexItem>
                                    <EuiFlexItem grow css={MinWidthZeroContainer}>
                                      <EuiToolTip title={label} content={endpointId} position="top">
                                        <EuiText size="s" tabIndex={0} css={EndpointIdTextLabel}>
                                          <span>{label}</span>
                                        </EuiText>
                                      </EuiToolTip>
                                    </EuiFlexItem>
                                    {deprecationInfo && (
                                      <ModelStatusBadge
                                        id={endpointId}
                                        status={deprecationInfo.status}
                                        metadata={deprecationInfo.metadata}
                                      />
                                    )}
                                    {canManage && (
                                      <EuiFlexItem grow={false}>
                                        <EuiToolTip
                                          content={i18n.translate(
                                            'xpack.searchInferenceEndpoints.settings.removeModel',
                                            {
                                              defaultMessage: 'Remove model',
                                            }
                                          )}
                                          disableScreenReaderOutput
                                        >
                                          <EuiButtonIcon
                                            iconType="cross"
                                            aria-label={i18n.translate(
                                              'xpack.searchInferenceEndpoints.settings.removeModel',
                                              {
                                                defaultMessage: 'Remove model',
                                              }
                                            )}
                                            size="s"
                                            color="text"
                                            onClick={() => handleRemove(index)}
                                            isDisabled={endpointIds.length <= 1}
                                            data-test-subj={`remove-endpoint-${endpointId}`}
                                          />
                                        </EuiToolTip>
                                      </EuiFlexItem>
                                    )}
                                  </EuiFlexGroup>
                                </EuiSplitPanel.Inner>
                                {index !== visibleEndpoints.length - 1 && (
                                  <EuiHorizontalRule margin="none" />
                                )}
                              </div>
                            );
                          }}
                        </EuiDraggable>
                      ))}
                    </EuiDroppable>
                  </EuiSplitPanel.Outer>
                </div>
              </EuiDragDropContext>
            )}

            {!useRecommendedDefaults && (
              <>
                <EuiSpacer size="xs" />
                <EuiFlexGroup alignItems="center" gutterSize="m" wrap>
                  {hasOverflow && !isExpanded && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        iconType="arrowDown"
                        size="s"
                        onClick={() => setIsExpanded(true)}
                        data-test-subj={`show-more-${featureId}`}
                        color="text"
                      >
                        {i18n.translate('xpack.searchInferenceEndpoints.settings.showMore', {
                          defaultMessage: 'Show {count} more',
                          values: { count: hiddenCount },
                        })}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                  {showAddModelPopover && (
                    <EuiFlexItem grow={false}>
                      <AddModelPopover
                        existingEndpointIds={endpointIds}
                        onAdd={handleAdd}
                        taskType={feature.taskType}
                        panelWidth={listWidth}
                      />
                    </EuiFlexItem>
                  )}
                  {showCopyToButton && (
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        iconType="copy"
                        size="s"
                        color="text"
                        onClick={() => setIsCopyModalOpen(true)}
                        data-test-subj={`copy-to-${featureId}`}
                      >
                        {i18n.translate('xpack.searchInferenceEndpoints.settings.copyTo.button', {
                          defaultMessage: 'Copy to',
                        })}
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </>
            )}
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isCopyModalOpen && (
        <CopyToModal
          sourceFeatureName={feature.featureName}
          currentFeatureId={featureId}
          taskType={feature.taskType}
          onApply={handleCopyApply}
          onClose={() => setIsCopyModalOpen(false)}
        />
      )}
      {isDisableModalOpen && (
        <DisableRecommendedModelsModal
          onConfirm={confirmDisableRecommendedDefaults}
          onCancel={() => setIsDisableModalOpen(false)}
        />
      )}
      {isResetModalOpen && (
        <ResetDefaultsModal
          onConfirm={confirmResetToDefaults}
          onCancel={() => setIsResetModalOpen(false)}
        />
      )}
    </>
  );
};

interface GlobalDefaultLockedRowProps {
  featureId: string;
  icon: string;
  label: string;
  showBadge: boolean;
  globalDefaultId: string;
  deprecationInfo?: EndpointDeprecationInfo;
}

const GlobalDefaultLockedRow: React.FC<GlobalDefaultLockedRowProps> = ({
  featureId,
  icon,
  label,
  showBadge,
  globalDefaultId,
  deprecationInfo,
}) => (
  <>
    <EuiSplitPanel.Inner paddingSize="s" data-test-subj={`global-default-row-${featureId}`}>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiPanel color="transparent" paddingSize="none">
            <EuiIcon type="lock" size="s" color="subdued" aria-hidden />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiIcon type={icon} size="m" aria-hidden />
        </EuiFlexItem>
        <EuiFlexItem grow css={MinWidthZeroContainer}>
          <EuiToolTip title={label} content={globalDefaultId} position="top">
            <EuiText size="s" color="subdued" tabIndex={0} css={EndpointIdTextLabel}>
              <span>{label}</span>
            </EuiText>
          </EuiToolTip>
        </EuiFlexItem>
        {showBadge && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow" data-test-subj={`global-default-badge-${featureId}`}>
              {i18n.translate('xpack.searchInferenceEndpoints.settings.globalDefaultBadge', {
                defaultMessage: 'Global default',
              })}
            </EuiBadge>
          </EuiFlexItem>
        )}
        {deprecationInfo && (
          <EuiFlexItem grow={false}>
            <ModelStatusBadge
              id={globalDefaultId}
              status={deprecationInfo.status}
              metadata={deprecationInfo.metadata}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiSplitPanel.Inner>
    <EuiHorizontalRule margin="none" />
  </>
);

interface RecommendedEndpointsListProps {
  featureId: string;
  endpointIds: string[];
  endpointDisplayMap: Map<string, { icon: string; label: string }>;
  invalidEndpointIds: Set<string>;
  deprecatedEndpointsMap: Map<string, EndpointDeprecationInfo>;
  globalDefaultRow?: {
    icon: string;
    label: string;
    showBadge: boolean;
    globalDefaultId: string;
    deprecationInfo?: EndpointDeprecationInfo;
  };
}

const RecommendedEndpointsList: React.FC<RecommendedEndpointsListProps> = ({
  featureId,
  endpointIds,
  endpointDisplayMap,
  invalidEndpointIds,
  deprecatedEndpointsMap,
  globalDefaultRow,
}) => {
  return (
    <EuiSplitPanel.Outer hasBorder>
      {globalDefaultRow && (
        <GlobalDefaultLockedRow
          featureId={featureId}
          icon={globalDefaultRow.icon}
          label={globalDefaultRow.label}
          showBadge={globalDefaultRow.showBadge}
          globalDefaultId={globalDefaultRow.globalDefaultId}
          deprecationInfo={globalDefaultRow.deprecationInfo}
        />
      )}
      {endpointIds.map((endpointId, index) => {
        const { icon = 'compute', label = endpointId } = endpointDisplayMap.get(endpointId) ?? {};
        const isInvalid = invalidEndpointIds.has(endpointId);
        const deprecationInfo = deprecatedEndpointsMap.get(endpointId);
        return (
          <div key={endpointId}>
            <EuiSplitPanel.Inner paddingSize="s" data-test-subj={`endpoint-row-${endpointId}`}>
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItem grow={false}>
                  {isInvalid ? (
                    <EuiIconTip
                      type="warning"
                      size="m"
                      color="warning"
                      content={i18n.translate(
                        'xpack.searchInferenceEndpoints.settings.endpointUnavailable',
                        { defaultMessage: 'This inference endpoint is no longer available' }
                      )}
                    />
                  ) : (
                    <EuiIcon type={icon} size="m" color="subdued" aria-hidden />
                  )}
                </EuiFlexItem>
                <EuiFlexItem grow css={MinWidthZeroContainer}>
                  <EuiText size="s" color="subdued">
                    <span>{label}</span>
                  </EuiText>
                </EuiFlexItem>
                {deprecationInfo && (
                  <ModelStatusBadge
                    id={endpointId}
                    status={deprecationInfo.status}
                    metadata={deprecationInfo.metadata}
                  />
                )}
              </EuiFlexGroup>
            </EuiSplitPanel.Inner>
            {index !== endpointIds.length - 1 && <EuiHorizontalRule margin="none" />}
          </div>
        );
      })}
    </EuiSplitPanel.Outer>
  );
};
