/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  EuiButtonGroup,
  EuiButtonIcon,
  EuiComboBox,
  EuiExpression,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLink,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { debounce } from 'lodash';
import React, { useCallback, useMemo, useState } from 'react';
import type { IErrorObject } from '@kbn/triggers-actions-ui-plugin/public';
import type { InventoryItemType } from '@kbn/metrics-data-access-plugin/common';
import { useBoolean } from '@kbn/react-hooks';
import { HOST_METRICS_DOC_HREF } from '../../../common/visualizations';
import { useMetricsDataViewContext } from '../../../containers/metrics_source';
import { getCustomMetricLabel } from '../../../../common/formatters/get_custom_metric_label';
import type {
  SnapshotCustomAggregation,
  SnapshotCustomMetricInput,
} from '../../../../common/http_api/snapshot_api';
import {
  SnapshotCustomAggregationRT,
  SnapshotCustomMetricInputRT,
  SNAPSHOT_CUSTOM_AGGREGATIONS,
} from '../../../../common/http_api/snapshot_api';
import { AGGREGATION_LABELS } from '../../../../common/snapshot_metric_i18n';
interface Props {
  metric?: { value: string; text: string };
  metrics: Array<{ value: string; text: string }>;
  nodeType: InventoryItemType;
  errors: IErrorObject;
  onChange: (metric?: string) => void;
  onChangeCustom: (customMetric?: SnapshotCustomMetricInput) => void;
  customMetric?: SnapshotCustomMetricInput;
  popupPosition?:
    | 'upCenter'
    | 'upLeft'
    | 'upRight'
    | 'downCenter'
    | 'downLeft'
    | 'downRight'
    | 'leftCenter'
    | 'leftUp'
    | 'leftDown'
    | 'rightCenter'
    | 'rightUp'
    | 'rightDown';
}

type V2MetricType = 'txV2' | 'rxV2' | 'cpuV2';

const V2ToLegacyMapping: Record<V2MetricType, string> = {
  txV2: 'tx',
  rxV2: 'rx',
  cpuV2: 'cpu',
};

const aggregationOptions = SNAPSHOT_CUSTOM_AGGREGATIONS.map((k) => ({
  text: AGGREGATION_LABELS[k],
  value: k,
}));

const firstFieldOption = {
  text: i18n.translate('xpack.infra.metrics.alertFlyout.expression.metric.selectFieldLabel', {
    defaultMessage: 'Select a metric',
  }),
  value: '',
};

export const MetricExpression = ({
  metric,
  metrics,
  customMetric,
  errors,
  onChange,
  onChangeCustom,
  popupPosition,
  nodeType,
}: Props) => {
  const [popoverOpen, { toggle: togglePopover, off: closePopover }] = useBoolean(false);
  const popoverTitleId = useGeneratedHtmlId();
  const [customMetricTabOpen, setCustomMetricTabOpen] = useState(metric?.value === 'custom');
  const [selectedOption, setSelectedOption] = useState(metric?.value);
  const [fieldDisplayedCustomLabel, setFieldDisplayedCustomLabel] = useState(customMetric?.label);
  const { metricsView } = useMetricsDataViewContext();

  const fieldOptions = useMemo(
    () =>
      (metricsView?.fields ?? [])
        .filter((f) => f.aggregatable && f.type === 'number' && !(customMetric?.field === f.name))
        .map((f) => ({ label: f.name })),
    [metricsView?.fields, customMetric?.field]
  );

  const expressionDisplayValue = useMemo(() => {
    return customMetricTabOpen
      ? customMetric?.field && getCustomMetricLabel(customMetric)
      : metric?.text || firstFieldOption.text;
  }, [customMetricTabOpen, metric, customMetric]);

  const onChangeTab = useCallback(
    (id: string) => {
      if (id === 'metric-popover-custom') {
        setCustomMetricTabOpen(true);
        onChange('custom');
      } else {
        setCustomMetricTabOpen(false);
        onChange(selectedOption);
      }
    },
    [setCustomMetricTabOpen, onChange, selectedOption]
  );

  const onAggregationChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      const aggValue: SnapshotCustomAggregation = SnapshotCustomAggregationRT.is(value)
        ? value
        : 'avg';
      const newCustomMetric = {
        ...customMetric,
        aggregation: aggValue,
      };
      if (SnapshotCustomMetricInputRT.is(newCustomMetric)) onChangeCustom(newCustomMetric);
    },
    [customMetric, onChangeCustom]
  );

  const onFieldChange = useCallback(
    (selectedOptions: Array<{ label: string }>) => {
      const newCustomMetric = {
        ...customMetric,
        field: selectedOptions[0].label,
      };
      if (SnapshotCustomMetricInputRT.is(newCustomMetric)) onChangeCustom(newCustomMetric);
    },
    [customMetric, onChangeCustom]
  );

  const debouncedOnChangeCustom = debounce(onChangeCustom, 500);
  const onLabelChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFieldDisplayedCustomLabel(e.target.value);
      const newCustomMetric = {
        ...customMetric,
        label: e.target.value,
      };
      if (SnapshotCustomMetricInputRT.is(newCustomMetric)) debouncedOnChangeCustom(newCustomMetric);
    },
    [customMetric, debouncedOnChangeCustom]
  );

  const metricsToRemove: string[] = metrics
    .map((currentMetric) => {
      return V2ToLegacyMapping[currentMetric.value as V2MetricType];
    })
    .filter((m): m is string => !!m);

  const availableFieldsOptions = useMemo(
    () =>
      metrics
        .filter(
          (availableMetric) =>
            metric?.value === availableMetric.value ||
            !metricsToRemove.includes(availableMetric.value)
        )
        .map((m) => {
          return { label: m.text, value: m.value };
        }),
    [metric?.value, metrics, metricsToRemove]
  );

  return (
    <EuiPopover
      id="metricPopover"
      aria-labelledby={popoverTitleId}
      button={
        <EuiExpression
          description={i18n.translate(
            'xpack.infra.metrics.alertFlyout.expression.metric.whenLabel',
            {
              defaultMessage: 'When',
            }
          )}
          value={expressionDisplayValue}
          // @ts-expect-error upgrade typescript v5.1.6
          isActive={Boolean(popoverOpen || (errors.metric && errors.metric.length > 0))}
          onClick={togglePopover}
          color={errors.metric?.length ? 'danger' : 'success'}
        />
      }
      isOpen={popoverOpen}
      closePopover={closePopover}
      anchorPosition={popupPosition ?? 'downRight'}
      zIndex={8000}
    >
      <div style={{ width: 620 }} onBlur={closePopover}>
        <ClosablePopoverTitle onClose={closePopover} titleId={popoverTitleId}>
          <FormattedMessage
            id="xpack.infra.metrics.alertFlyout.expression.metric.popoverTitle"
            defaultMessage="Metric"
          />
        </ClosablePopoverTitle>
        <EuiButtonGroup
          isFullWidth
          buttonSize="compressed"
          legend="Metric type"
          options={[
            {
              id: 'metric-popover-default',
              label: 'Default metric',
            },
            {
              id: 'metric-popover-custom',
              label: 'Custom metric',
            },
          ]}
          idSelected={customMetricTabOpen ? 'metric-popover-custom' : 'metric-popover-default'}
          onChange={onChangeTab}
        />
        <EuiSpacer size="m" />
        {customMetricTabOpen ? (
          <>
            <EuiFormRow fullWidth>
              <EuiFlexGroup alignItems="center" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiSelect
                    aria-label={i18n.translate('xpack.infra.metricExpression.select.ariaLabel', {
                      defaultMessage: 'Select a field',
                    })}
                    data-test-subj="infraMetricExpressionSelect"
                    onChange={onAggregationChange}
                    value={customMetric?.aggregation || 'avg'}
                    options={aggregationOptions}
                    fullWidth
                  />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText color="subdued">
                    <span>
                      {i18n.translate('xpack.infra.waffle.customMetrics.of', {
                        defaultMessage: 'of',
                      })}
                    </span>
                  </EuiText>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiComboBox
                    aria-label={i18n.translate(
                      'xpack.infra.metricExpression.selectafieldComboBox.ariaLabel',
                      { defaultMessage: 'Select a field' }
                    )}
                    fullWidth
                    placeholder={i18n.translate(
                      'xpack.infra.waffle.customMetrics.fieldPlaceholder',
                      {
                        defaultMessage: 'Select a field',
                      }
                    )}
                    singleSelection={{ asPlainText: true }}
                    selectedOptions={customMetric?.field ? [{ label: customMetric.field }] : []}
                    options={fieldOptions}
                    onChange={onFieldChange}
                    isClearable={false}
                    // @ts-expect-error upgrade typescript v5.1.6
                    isInvalid={errors.metric.length > 0}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFormRow>
            <EuiFormRow
              label={i18n.translate('xpack.infra.waffle.alerting.customMetrics.labelLabel', {
                defaultMessage: 'Metric name (optional)',
              })}
              display="rowCompressed"
              fullWidth
              helpText={i18n.translate('xpack.infra.waffle.alerting.customMetrics.helpText', {
                defaultMessage:
                  'Choose a name to help identify your custom metric. Defaults to "<function> of <field name>".',
                ignoreTag: true,
              })}
            >
              <EuiFieldText
                data-test-subj="infraMetricExpressionFieldText"
                name="label"
                placeholder={i18n.translate('xpack.infra.waffle.customMetrics.labelPlaceholder', {
                  defaultMessage: 'Choose a name to appear in the "Metric" dropdown',
                })}
                value={fieldDisplayedCustomLabel}
                fullWidth
                onChange={onLabelChange}
              />
            </EuiFormRow>
          </>
        ) : (
          <EuiFormRow fullWidth>
            <EuiFlexGroup direction="column" gutterSize="s">
              {nodeType === 'host' && (
                <EuiFlexItem>
                  <EuiLink
                    data-test-subj="alertFlyoutHostMetricsDocumentationLink"
                    href={HOST_METRICS_DOC_HREF}
                    target="_blank"
                  >
                    {i18n.translate(
                      'xpack.infra.metrics.alertFlyout.expression.metric.whatAreTheseMetricsLink',
                      {
                        defaultMessage: 'What are these metrics?',
                      }
                    )}
                  </EuiLink>
                </EuiFlexItem>
              )}
              <EuiFlexItem className="actOf__metricContainer">
                <EuiComboBox
                  aria-label={i18n.translate('xpack.infra.metricExpression.comboBox.ariaLabel', {
                    defaultMessage: 'Select a metric',
                  })}
                  fullWidth
                  singleSelection={{ asPlainText: true }}
                  data-test-subj="availableFieldsOptionsComboBox"
                  // @ts-expect-error upgrade typescript v5.1.6
                  isInvalid={errors.metric.length > 0}
                  placeholder={firstFieldOption.text}
                  options={availableFieldsOptions}
                  noSuggestions={!availableFieldsOptions.length}
                  selectedOptions={
                    metric ? availableFieldsOptions.filter((a) => a.value === metric.value) : []
                  }
                  renderOption={(o: any) => o.label}
                  onChange={(selectedOptions) => {
                    if (selectedOptions.length > 0) {
                      onChange(selectedOptions[0].value);
                      setSelectedOption(selectedOptions[0].value);
                    } else {
                      onChange();
                    }
                  }}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFormRow>
        )}
      </div>
    </EuiPopover>
  );
};

interface ClosablePopoverTitleProps {
  children: JSX.Element;
  onClose: () => void;
  titleId?: string;
}

export const ClosablePopoverTitle = ({ children, onClose, titleId }: ClosablePopoverTitleProps) => {
  return (
    <EuiPopoverTitle>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem id={titleId}>{children}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate(
              'xpack.infra.metrics.expressionItems.components.closablePopoverTitle.closeLabel',
              {
                defaultMessage: 'Close',
              }
            )}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              data-test-subj="infraClosablePopoverTitleButton"
              iconType="cross"
              color="danger"
              aria-label={i18n.translate(
                'xpack.infra.metrics.expressionItems.components.closablePopoverTitle.closeLabel',
                {
                  defaultMessage: 'Close',
                }
              )}
              onClick={() => onClose()}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPopoverTitle>
  );
};
