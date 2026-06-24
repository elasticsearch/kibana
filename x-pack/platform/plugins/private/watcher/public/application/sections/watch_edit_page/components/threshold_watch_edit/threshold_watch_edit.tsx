/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import _ from 'lodash';
import React, { Fragment, useContext, useEffect, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiExpression,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiPageHeader,
  EuiPageSection,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { TIME_UNITS } from '../../../../../../common/constants';
import { serializeThresholdWatch } from '../../../../../../common/lib/serialization';
import type { Error as ServerError } from '../../../../components';
import { ErrableFormRow, SectionError } from '../../../../components';
import { fetchFields, getMatchingIndices, loadIndexPatterns } from '../../../../lib/api';
import { aggTypes } from '../../../../models/watch/agg_types';
import { groupByTypes } from '../../../../models/watch/group_by_types';
import { comparators } from '../../../../models/watch/comparators';
import { onWatchSave } from '../../watch_edit_actions';
import { WatchContext } from '../../watch_context';
import { WatchVisualization } from './watch_visualization';
import { WatchActionsPanel } from './threshold_watch_action_panel';
import { getTimeUnitLabel } from '../../../../lib/get_time_unit_label';
import { goToWatchList } from '../../../../lib/navigation';
import { RequestFlyout } from '../request_flyout';
import { useAppContext } from '../../../../app_context';

const styles = {
  watcherThresholdAlertAggFieldContainer: css`
    width: 300px;
  `,
  watcherThresholdInBetweenComparatorText: css`
    align-self: center;
  `,
};

const expressionFieldsWithValidation = [
  'aggField',
  'termSize',
  'termField',
  'threshold0',
  'threshold1',
  'timeWindowSize',
];

const expressionFields = [
  'aggType',
  'aggField',
  'termSize',
  'termField',
  'thresholdComparator',
  'timeWindowSize',
  'timeWindowUnit',
  'triggerIntervalSize',
  'triggerIntervalUnit',
  'threshold',
  'groupBy',
];

const expressionErrorMessage = i18n.translate(
  'xpack.watcher.thresholdWatchExpression.fixErrorInExpressionBelowValidationMessage',
  {
    defaultMessage: 'Expression contains errors.',
  }
);

const firstFieldOption = {
  text: i18n.translate('xpack.watcher.sections.watchEdit.titlePanel.timeFieldOptionLabel', {
    defaultMessage: 'Select a field',
  }),
  value: '',
};

const getTimeOptions = (unitSize: string) =>
  Object.entries(TIME_UNITS).map(([_key, value]) => {
    return {
      text: getTimeUnitLabel(value, unitSize),
      value,
    };
  });

const getFields = async (indices: string[]) => {
  return await fetchFields(indices);
};
const getTimeFieldOptions = (fields: any) => {
  const options = [firstFieldOption];

  fields.forEach((field: any) => {
    if (field.type === 'date') {
      options.push({
        text: field.name,
        value: field.name,
      });
    }
  });
  return options;
};
interface IOption {
  label: string;
  options: Array<{ value: string; label: string; key?: string }>;
}

const getIndexOptions = async (patternString: string, indexPatterns: string[]) => {
  const options: IOption[] = [];

  if (!patternString) {
    return options;
  }

  const matchingIndices = (await getMatchingIndices(patternString)) as string[];
  const matchingIndexPatterns = indexPatterns.filter((anIndexPattern) => {
    return anIndexPattern.includes(patternString);
  }) as string[];

  if (matchingIndices.length || matchingIndexPatterns.length) {
    const matchingOptions = _.uniq([...matchingIndices, ...matchingIndexPatterns]);

    options.push({
      label: i18n.translate(
        'xpack.watcher.sections.watchEdit.titlePanel.indicesAndIndexPatternsLabel',
        {
          defaultMessage: 'Based on your indices and index patterns',
        }
      ),
      options: matchingOptions
        .map((match) => {
          return {
            label: match,
            value: match,
          };
        })
        .sort((a, b) => String(a.label).localeCompare(b.label)),
    });
  }

  options.push({
    label: i18n.translate('xpack.watcher.sections.watchEdit.titlePanel.chooseLabel', {
      defaultMessage: 'Choose…',
    }),
    options: [
      {
        key: 'UNIQUE_CHOOSE_KEY',
        value: patternString,
        label: patternString,
      },
    ],
  });

  return options;
};

export const ThresholdWatchEdit = ({ pageTitle }: { pageTitle: string }) => {
  // hooks
  const { toasts } = useAppContext();
  const [indexPatterns, setIndexPatterns] = useState<any[]>([]);
  const [esFields, setEsFields] = useState([]);
  const [indexOptions, setIndexOptions] = useState<IOption[]>([]);
  const [timeFieldOptions, setTimeFieldOptions] = useState([firstFieldOption]);

  const [aggFieldPopoverOpen, setAggFieldPopoverOpen] = useState(false);
  const [groupByPopoverOpen, setGroupByPopoverOpen] = useState(false);
  const [watchThresholdPopoverOpen, setWatchThresholdPopoverOpen] = useState(false);
  const [watchDurationPopoverOpen, setWatchDurationPopoverOpen] = useState(false);
  const [aggTypePopoverOpen, setAggTypePopoverOpen] = useState(false);
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isIndiciesLoading, setIsIndiciesLoading] = useState<boolean>(false);
  const [isRequestVisible, setIsRequestVisible] = useState<boolean>(false);

  const aggTypePopoverTitleId = useGeneratedHtmlId({ prefix: 'aggTypePopoverTitle' });
  const aggFieldPopoverTitleId = useGeneratedHtmlId({ prefix: 'aggFieldPopoverTitle' });
  const groupByPopoverTitleId = useGeneratedHtmlId({ prefix: 'groupByPopoverTitle' });
  const watchThresholdPopoverTitleId = useGeneratedHtmlId({ prefix: 'watchThresholdPopoverTitle' });
  const watchDurationPopoverTitleId = useGeneratedHtmlId({ prefix: 'watchDurationPopoverTitle' });

  const { watch, setWatchProperty } = useContext(WatchContext);

  useEffect(() => {
    const getIndexPatterns = async () => {
      const { data: indexPatternTitles } = await loadIndexPatterns();
      setIndexPatterns(indexPatternTitles);
    };

    const loadData = async () => {
      if (watch.index && watch.index.length > 0) {
        const allEsFields = await getFields(watch.index);
        const timeFields = getTimeFieldOptions(allEsFields);
        setEsFields(allEsFields);
        setTimeFieldOptions(timeFields);
        setWatchProperty('timeFields', timeFields);
      }
      getIndexPatterns();
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { errors } = watch.validate();

  const hasErrors = !!Object.keys(errors).find((errorKey) => errors[errorKey].length >= 1);

  const actionErrors = watch.actions.reduce((acc: any, action: any) => {
    const actionValidationErrors = action.validate();
    acc[action.id] = actionValidationErrors;
    return acc;
  }, {});

  const hasActionErrors = !!Object.keys(actionErrors).find((actionError) => {
    return !!Object.keys(actionErrors[actionError]).find((actionErrorKey: string) => {
      return actionErrors[actionError][actionErrorKey].length >= 1;
    });
  });

  const hasExpressionErrors = !!Object.keys(errors).find(
    (errorKey) => expressionFieldsWithValidation.includes(errorKey) && errors[errorKey].length >= 1
  );

  const shouldShowThresholdExpression = watch.index && watch.index.length > 0 && watch.timeField;

  const andThresholdText = i18n.translate('xpack.watcher.sections.watchEdit.threshold.andLabel', {
    defaultMessage: 'AND',
  });

  const watchIntervalLabel = i18n.translate(
    'xpack.watcher.sections.watchEdit.titlePanel.watchIntervalLabel',
    { defaultMessage: 'Run watch every' }
  );

  // Users might edit the request for use outside of the Watcher app. If they do make changes to it,
  // we have no guarantee it will still be compatible with the threshold alert form, so we strip
  // the metadata to avoid potential conflicts.
  const requestPreviewWatchData = {
    ...watch.upstreamJson,
    includeMetadata: false,
  };

  return (
    <EuiPageSection restrictWidth style={{ width: '100%' }}>
      <EuiPageHeader
        pageTitle={<span data-test-subj="pageTitle">{pageTitle}</span>}
        description={watch.titleDescription}
        bottomBorder
      />

      <EuiSpacer size="l" />

      <EuiForm data-test-subj="thresholdWatchForm">
        {serverError && (
          <Fragment>
            <SectionError
              title={
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.json.saveWatchErrorTitle"
                  defaultMessage="Error saving watch"
                />
              }
              error={serverError}
            />
            <EuiSpacer />
          </Fragment>
        )}
        <ErrableFormRow
          id="watchName"
          label={
            <FormattedMessage
              id="xpack.watcher.sections.watchEdit.titlePanel.watchNameLabel"
              defaultMessage="Name"
            />
          }
          errorKey="name"
          isShowingErrors={hasErrors && watch.name !== undefined}
          errors={errors}
        >
          <EuiFieldText
            name="name"
            data-test-subj="nameInput"
            value={watch.name || ''}
            onChange={(e) => {
              setWatchProperty('name', e.target.value);
            }}
            onBlur={() => {
              if (!watch.name) {
                setWatchProperty('name', '');
              }
            }}
          />
        </ErrableFormRow>
        <EuiSpacer />
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem>
            <ErrableFormRow
              id="indexSelectSearchBox"
              fullWidth
              label={
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.titlePanel.indicesToQueryLabel"
                  defaultMessage="Indices to query"
                />
              }
              errorKey="index"
              isShowingErrors={hasErrors && watch.index !== undefined}
              errors={errors}
              helpText={
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.titlePanel.howToBroadenSearchQueryDescription"
                  defaultMessage="Use * to broaden your query."
                />
              }
            >
              <EuiComboBox
                fullWidth
                async
                isLoading={isIndiciesLoading}
                noSuggestions={!indexOptions.length}
                options={indexOptions}
                data-test-subj="indicesComboBox"
                aria-label={i18n.translate(
                  'xpack.watcher.sections.watchEdit.titlePanel.indicesToQueryAriaLabel',
                  { defaultMessage: 'Indices to query' }
                )}
                selectedOptions={(watch.index || []).map((anIndex: string) => {
                  return {
                    label: anIndex,
                    value: anIndex,
                  };
                })}
                onChange={async (selected: EuiComboBoxOptionOption[]) => {
                  setWatchProperty(
                    'index',
                    selected.map((aSelected) => aSelected.value)
                  );
                  const indices = selected.map((s) => s.value as string);

                  // reset time field and expression fields if indices are deleted
                  if (indices.length === 0) {
                    setTimeFieldOptions(getTimeFieldOptions([]));
                    setWatchProperty('timeFields', []);

                    expressionFields.forEach((expressionField) => {
                      setWatchProperty(expressionField, null);
                    });
                    return;
                  }
                  const currentEsFields = await getFields(indices);
                  const timeFields = getTimeFieldOptions(currentEsFields);

                  setEsFields(currentEsFields);
                  setWatchProperty('timeFields', timeFields);
                  setTimeFieldOptions(timeFields);
                }}
                onSearchChange={async (search) => {
                  setIsIndiciesLoading(true);
                  setIndexOptions(await getIndexOptions(search, indexPatterns));
                  setIsIndiciesLoading(false);
                }}
                onBlur={() => {
                  if (!watch.index) {
                    setWatchProperty('index', []);
                  }
                }}
              />
            </ErrableFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <ErrableFormRow
              id="timeField"
              fullWidth
              label={
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.titlePanel.timeFieldLabel"
                  defaultMessage="Time field"
                />
              }
              errorKey="timeField"
              isShowingErrors={hasErrors && watch.timeField !== undefined}
              errors={errors}
            >
              <EuiSelect
                options={timeFieldOptions}
                fullWidth
                name="watchTimeField"
                data-test-subj="watchTimeFieldSelect"
                value={watch.timeField}
                onChange={(e) => {
                  setWatchProperty('timeField', e.target.value);
                }}
                onBlur={() => {
                  if (watch.timeField === undefined) {
                    setWatchProperty('timeField', '');
                  }
                }}
                aria-label={i18n.translate(
                  'xpack.watcher.sections.watchEdit.titlePanel.timeFieldAriaLabel',
                  { defaultMessage: 'Time field' }
                )}
              />
            </ErrableFormRow>
          </EuiFlexItem>
          <EuiFlexItem>
            <ErrableFormRow
              id="watchInterval"
              fullWidth
              label={watchIntervalLabel}
              errorKey="triggerIntervalSize"
              isShowingErrors={hasErrors && watch.triggerIntervalSize !== undefined}
              errors={errors}
            >
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiFieldNumber
                    fullWidth
                    min={1}
                    value={watch.triggerIntervalSize}
                    data-test-subj="triggerIntervalSizeInput"
                    onChange={(e) => {
                      const { value } = e.target;
                      const triggerIntervalSize = value !== '' ? parseInt(value, 10) : value;
                      setWatchProperty('triggerIntervalSize', triggerIntervalSize);
                    }}
                    onBlur={(e) => {
                      if (watch.triggerIntervalSize === undefined) {
                        setWatchProperty('triggerIntervalSize', '');
                      }
                    }}
                    aria-label={watchIntervalLabel}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiSelect
                    fullWidth
                    value={watch.triggerIntervalUnit}
                    aria-label={i18n.translate(
                      'xpack.watcher.sections.watchEdit.titlePanel.durationAriaLabel',
                      {
                        defaultMessage: 'Duration time unit',
                      }
                    )}
                    onChange={(e) => {
                      setWatchProperty('triggerIntervalUnit', e.target.value);
                    }}
                    options={getTimeOptions(watch.triggerIntervalSize)}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </ErrableFormRow>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        {shouldShowThresholdExpression ? (
          <Fragment>
            <EuiTitle size="s">
              <h2 data-test-subj="watchConditionTitle">
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.watchConditionSectionTitle"
                  defaultMessage="Match the following condition"
                />
              </h2>
            </EuiTitle>
            <EuiSpacer size="m" />
            <EuiFlexGroup gutterSize="s">
              <EuiFlexItem grow={false}>
                <EuiPopover
                  id="aggTypePopover"
                  button={
                    <EuiExpression
                      description={i18n.translate(
                        'xpack.watcher.sections.watchEdit.threshold.whenLabel',
                        {
                          defaultMessage: 'when',
                        }
                      )}
                      value={aggTypes[watch.aggType].text}
                      isActive={aggTypePopoverOpen}
                      onClick={() => {
                        setAggTypePopoverOpen(true);
                      }}
                    />
                  }
                  isOpen={aggTypePopoverOpen}
                  closePopover={() => {
                    setAggTypePopoverOpen(false);
                  }}
                  ownFocus
                  anchorPosition="downLeft"
                  aria-labelledby={aggTypePopoverTitleId}
                >
                  <div>
                    <EuiPopoverTitle id={aggTypePopoverTitleId}>
                      {i18n.translate(
                        'xpack.watcher.sections.watchEdit.threshold.whenButtonLabel',
                        {
                          defaultMessage: 'when',
                        }
                      )}
                    </EuiPopoverTitle>
                    <EuiSelect
                      value={watch.aggType}
                      aria-label={i18n.translate(
                        'xpack.watcher.sections.watchEdit.threshold.aggTypeSelectAriaLabel',
                        {
                          defaultMessage: 'Aggregation type',
                        }
                      )}
                      onChange={(e) => {
                        setWatchProperty('aggType', e.target.value);
                        setAggTypePopoverOpen(false);
                      }}
                      options={Object.values(aggTypes).map(({ text, value }) => {
                        return {
                          text,
                          value,
                        };
                      })}
                    />
                  </div>
                </EuiPopover>
              </EuiFlexItem>
              {watch.aggType && aggTypes[watch.aggType].fieldRequired ? (
                <EuiFlexItem grow={false}>
                  <EuiPopover
                    id="aggFieldPopover"
                    button={
                      <EuiExpression
                        description={i18n.translate(
                          'xpack.watcher.sections.watchEdit.threshold.ofLabel',
                          {
                            defaultMessage: 'of',
                          }
                        )}
                        value={watch.aggField || firstFieldOption.text}
                        isActive={aggFieldPopoverOpen || !watch.aggField}
                        onClick={() => {
                          setAggFieldPopoverOpen(true);
                        }}
                        color={watch.aggField ? 'success' : 'danger'}
                      />
                    }
                    isOpen={aggFieldPopoverOpen}
                    closePopover={() => {
                      setAggFieldPopoverOpen(false);
                    }}
                    anchorPosition="downLeft"
                    aria-labelledby={aggFieldPopoverTitleId}
                  >
                    <div>
                      <EuiPopoverTitle id={aggFieldPopoverTitleId}>
                        {i18n.translate(
                          'xpack.watcher.sections.watchEdit.threshold.ofButtonLabel',
                          {
                            defaultMessage: 'of',
                          }
                        )}
                      </EuiPopoverTitle>
                      <EuiFlexGroup>
                        <EuiFlexItem
                          grow={false}
                          css={styles.watcherThresholdAlertAggFieldContainer}
                        >
                          <ErrableFormRow
                            errorKey="aggField"
                            isShowingErrors={hasErrors && watch.aggField !== undefined}
                            errors={errors}
                          >
                            <EuiComboBox
                              singleSelection={{ asPlainText: true }}
                              placeholder={firstFieldOption.text}
                              aria-label={i18n.translate(
                                'xpack.watcher.sections.watchEdit.threshold.aggFieldAriaLabel',
                                { defaultMessage: 'Aggregation field' }
                              )}
                              options={esFields.reduce((esFieldOptions: any[], field: any) => {
                                if (
                                  aggTypes[watch.aggType].validNormalizedTypes.includes(
                                    field.normalizedType
                                  )
                                ) {
                                  esFieldOptions.push({
                                    label: field.name,
                                  });
                                }
                                return esFieldOptions;
                              }, [])}
                              selectedOptions={watch.aggField ? [{ label: watch.aggField }] : []}
                              onChange={(selectedOptions) => {
                                setWatchProperty(
                                  'aggField',
                                  selectedOptions.length === 1
                                    ? selectedOptions[0].label
                                    : undefined
                                );
                                setAggFieldPopoverOpen(false);
                              }}
                            />
                          </ErrableFormRow>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </div>
                  </EuiPopover>
                </EuiFlexItem>
              ) : null}
              <EuiFlexItem grow={false}>
                <EuiPopover
                  id="groupByPopover"
                  button={
                    <EuiExpression
                      description={`${
                        groupByTypes[watch.groupBy].sizeRequired
                          ? i18n.translate(
                              'xpack.watcher.sections.watchEdit.threshold.groupedOverLabel',
                              {
                                defaultMessage: 'grouped over',
                              }
                            )
                          : i18n.translate('xpack.watcher.sections.watchEdit.threshold.overLabel', {
                              defaultMessage: 'over',
                            })
                      }`}
                      value={`${groupByTypes[watch.groupBy].text} ${
                        groupByTypes[watch.groupBy].sizeRequired
                          ? `${watch.termSize || ''} ${
                              watch.termField ? `'${watch.termField}'` : ''
                            }`
                          : ''
                      }`}
                      isActive={
                        groupByPopoverOpen ||
                        (watch.groupBy === 'top' && !(watch.termSize && watch.termField))
                      }
                      onClick={() => {
                        setGroupByPopoverOpen(true);
                      }}
                      color={
                        watch.groupBy === 'all' || (watch.termSize && watch.termField)
                          ? 'success'
                          : 'danger'
                      }
                    />
                  }
                  isOpen={groupByPopoverOpen}
                  closePopover={() => {
                    setGroupByPopoverOpen(false);
                  }}
                  ownFocus
                  anchorPosition="downLeft"
                  aria-labelledby={groupByPopoverTitleId}
                >
                  <div>
                    <EuiPopoverTitle id={groupByPopoverTitleId}>
                      {i18n.translate(
                        'xpack.watcher.sections.watchEdit.threshold.overButtonLabel',
                        {
                          defaultMessage: 'over',
                        }
                      )}
                    </EuiPopoverTitle>
                    <EuiFlexGroup>
                      <EuiFlexItem grow={false}>
                        <EuiSelect
                          value={watch.groupBy}
                          aria-label={i18n.translate(
                            'xpack.watcher.sections.watchEdit.threshold.groupBySelectAriaLabel',
                            {
                              defaultMessage: 'Group by',
                            }
                          )}
                          onChange={(e) => {
                            setWatchProperty('termSize', null);
                            setWatchProperty('termField', null);
                            setWatchProperty('groupBy', e.target.value);
                          }}
                          options={Object.values(groupByTypes).map(({ text, value }) => {
                            return {
                              text,
                              value,
                            };
                          })}
                        />
                      </EuiFlexItem>

                      {groupByTypes[watch.groupBy].sizeRequired ? (
                        <Fragment>
                          <EuiFlexItem grow={false}>
                            <ErrableFormRow
                              errorKey="termSize"
                              isShowingErrors={hasErrors}
                              errors={errors}
                            >
                              <EuiFieldNumber
                                value={watch.termSize}
                                onChange={(e) => {
                                  setWatchProperty('termSize', e.target.value);
                                }}
                                min={1}
                              />
                            </ErrableFormRow>
                          </EuiFlexItem>
                          <EuiFlexItem grow={false}>
                            <ErrableFormRow
                              errorKey="termField"
                              isShowingErrors={hasErrors && watch.termField !== undefined}
                              errors={errors}
                            >
                              <EuiSelect
                                value={watch.termField || ''}
                                aria-label={i18n.translate(
                                  'xpack.watcher.sections.watchEdit.threshold.termFieldAriaLabel',
                                  { defaultMessage: 'Group by field' }
                                )}
                                onChange={(e) => {
                                  setWatchProperty('termField', e.target.value);
                                }}
                                options={esFields.reduce(
                                  (options, field: any) => {
                                    if (
                                      groupByTypes[watch.groupBy].validNormalizedTypes.includes(
                                        field.normalizedType
                                      )
                                    ) {
                                      options.push({
                                        text: field.name,
                                        value: field.name,
                                      });
                                    }
                                    return options;
                                  },
                                  [firstFieldOption]
                                )}
                              />
                            </ErrableFormRow>
                          </EuiFlexItem>
                        </Fragment>
                      ) : null}
                    </EuiFlexGroup>
                  </div>
                </EuiPopover>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiPopover
                  id="watchThresholdPopover"
                  button={
                    <EuiExpression
                      data-test-subj="watchThresholdButton"
                      description={comparators[watch.thresholdComparator].text}
                      value={watch.threshold
                        .slice(0, comparators[watch.thresholdComparator].requiredValues)
                        .join(` ${andThresholdText} `)}
                      isActive={Boolean(
                        watchThresholdPopoverOpen ||
                          errors.threshold0.length ||
                          (errors.threshold1 && errors.threshold1.length)
                      )}
                      onClick={() => {
                        setWatchThresholdPopoverOpen(true);
                      }}
                      color={
                        errors.threshold0.length || (errors.threshold1 && errors.threshold1.length)
                          ? 'danger'
                          : 'success'
                      }
                    />
                  }
                  isOpen={watchThresholdPopoverOpen}
                  closePopover={() => {
                    setWatchThresholdPopoverOpen(false);
                  }}
                  ownFocus
                  anchorPosition="downLeft"
                  aria-labelledby={watchThresholdPopoverTitleId}
                >
                  <div>
                    <EuiPopoverTitle id={watchThresholdPopoverTitleId}>
                      {comparators[watch.thresholdComparator].text}
                    </EuiPopoverTitle>
                    <EuiFlexGroup>
                      <EuiFlexItem grow={false}>
                        <EuiSelect
                          value={watch.thresholdComparator}
                          aria-label={i18n.translate(
                            'xpack.watcher.sections.watchEdit.threshold.comparatorSelectAriaLabel',
                            {
                              defaultMessage: 'Comparator',
                            }
                          )}
                          onChange={(e) => {
                            setWatchProperty('thresholdComparator', e.target.value);
                          }}
                          options={Object.values(comparators).map(({ text, value }) => {
                            return { text, value };
                          })}
                        />
                      </EuiFlexItem>
                      {Array.from(Array(comparators[watch.thresholdComparator].requiredValues)).map(
                        (_notUsed, i) => {
                          return (
                            <Fragment key={`threshold${i}`}>
                              {i > 0 ? (
                                <EuiFlexItem
                                  grow={false}
                                  css={styles.watcherThresholdInBetweenComparatorText}
                                >
                                  <EuiText>{andThresholdText}</EuiText>
                                  {hasErrors && <EuiSpacer />}
                                </EuiFlexItem>
                              ) : null}
                              <EuiFlexItem grow={false}>
                                <ErrableFormRow
                                  errorKey={`threshold${i}`}
                                  isShowingErrors={hasErrors}
                                  errors={errors}
                                >
                                  <EuiFieldNumber
                                    data-test-subj="watchThresholdInput"
                                    value={watch.threshold[i] == null ? '' : watch.threshold[i]}
                                    min={0}
                                    step={0.1}
                                    onChange={(e) => {
                                      const { value } = e.target;
                                      const threshold = value !== '' ? parseFloat(value) : value;
                                      const newThreshold = [...watch.threshold];
                                      newThreshold[i] = threshold;
                                      setWatchProperty('threshold', newThreshold);
                                    }}
                                  />
                                </ErrableFormRow>
                              </EuiFlexItem>
                            </Fragment>
                          );
                        }
                      )}
                    </EuiFlexGroup>
                  </div>
                </EuiPopover>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiPopover
                  id="watchDurationPopover"
                  button={
                    <EuiExpression
                      description={i18n.translate(
                        'xpack.watcher.sections.watchEdit.threshold.forTheLastLabel',
                        {
                          defaultMessage: 'for the last',
                        }
                      )}
                      value={`${watch.timeWindowSize} ${getTimeUnitLabel(
                        watch.timeWindowUnit,
                        parseInt(watch.timeWindowSize, 10).toString()
                      )}`}
                      isActive={watchDurationPopoverOpen || !watch.timeWindowSize}
                      onClick={() => {
                        setWatchDurationPopoverOpen(true);
                      }}
                      color={watch.timeWindowSize ? 'success' : 'danger'}
                    />
                  }
                  isOpen={watchDurationPopoverOpen}
                  closePopover={() => {
                    setWatchDurationPopoverOpen(false);
                  }}
                  ownFocus
                  anchorPosition="downLeft"
                  aria-labelledby={watchDurationPopoverTitleId}
                >
                  <div>
                    <EuiPopoverTitle id={watchDurationPopoverTitleId}>
                      <FormattedMessage
                        id="xpack.watcher.sections.watchEdit.threshold.forTheLastButtonLabel"
                        defaultMessage="For the last"
                      />
                    </EuiPopoverTitle>
                    <EuiFlexGroup>
                      <EuiFlexItem grow={false}>
                        <ErrableFormRow
                          errorKey="timeWindowSize"
                          isShowingErrors={hasErrors}
                          errors={errors}
                        >
                          <EuiFieldNumber
                            min={1}
                            value={watch.timeWindowSize || ''}
                            onChange={(e) => {
                              const { value } = e.target;
                              const timeWindowSize = value !== '' ? parseInt(value, 10) : value;
                              setWatchProperty('timeWindowSize', timeWindowSize);
                            }}
                          />
                        </ErrableFormRow>
                      </EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiSelect
                          value={watch.timeWindowUnit}
                          aria-label={i18n.translate(
                            'xpack.watcher.sections.watchEdit.threshold.timeWindowUnitSelectAriaLabel',
                            {
                              defaultMessage: 'Time window unit',
                            }
                          )}
                          onChange={(e) => {
                            setWatchProperty('timeWindowUnit', e.target.value);
                          }}
                          options={getTimeOptions(watch.timeWindowSize)}
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </div>
                </EuiPopover>
              </EuiFlexItem>
            </EuiFlexGroup>
            {hasExpressionErrors ? (
              <Fragment>
                <EuiSpacer size="m" />
                <EuiText color="danger" size="s">
                  {expressionErrorMessage}
                </EuiText>
                <EuiSpacer size="m" />
              </Fragment>
            ) : null}
            {hasErrors ? null : (
              <Fragment>
                <WatchVisualization />
                <WatchActionsPanel actionErrors={actionErrors} />
              </Fragment>
            )}
            <EuiSpacer />
          </Fragment>
        ) : null}

        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="m" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  color="success"
                  data-test-subj="saveWatchButton"
                  type="submit"
                  iconType="check"
                  disabled={hasErrors || hasActionErrors}
                  isLoading={isSaving}
                  onClick={async () => {
                    setIsSaving(true);
                    const savedWatch = await onWatchSave(watch, toasts);
                    if (savedWatch && savedWatch.error) {
                      setIsSaving(false);
                      return setServerError(savedWatch.error);
                    }
                  }}
                >
                  {watch.isNew ? (
                    <FormattedMessage
                      id="xpack.watcher.sections.watchEdit.threshold.createButtonLabel"
                      defaultMessage="Create alert"
                    />
                  ) : (
                    <FormattedMessage
                      id="xpack.watcher.sections.watchEdit.threshold.saveButtonLabel"
                      defaultMessage="Save alert"
                    />
                  )}
                </EuiButton>
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={() => goToWatchList()}>
                  {i18n.translate('xpack.watcher.sections.watchEdit.threshold.cancelButtonLabel', {
                    defaultMessage: 'Cancel',
                  })}
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>

          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={() => setIsRequestVisible(!isRequestVisible)}>
              {isRequestVisible ? (
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.json.hideRequestButtonLabel"
                  defaultMessage="Hide request"
                />
              ) : (
                <FormattedMessage
                  id="xpack.watcher.sections.watchEdit.json.showRequestButtonLabel"
                  defaultMessage="Show request"
                />
              )}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiForm>

      {isRequestVisible ? (
        <RequestFlyout
          id={watch.id}
          payload={serializeThresholdWatch(requestPreviewWatchData)}
          close={() => setIsRequestVisible(false)}
        />
      ) : null}
    </EuiPageSection>
  );
};
