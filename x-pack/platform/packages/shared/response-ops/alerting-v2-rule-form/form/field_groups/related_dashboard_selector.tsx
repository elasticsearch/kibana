/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiBadge,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { DASHBOARD_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import type { DashboardStart } from '@kbn/dashboard-plugin/public';
import { useDebounceFn } from '@kbn/react-hooks';
import { useController, useFormContext } from 'react-hook-form';
import { useRuleFormServices } from '../contexts';
import type { FormValues } from '../types';
import {
  resolveDashboardsByIds,
  searchRelatedDashboard,
  type MissingDashboard,
} from './search_related_dashboards';

const SEARCH_DEBOUNCE_MS = 300;

const haveSameDashboardIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  const rightIds = new Set(right);
  return left.every((id) => rightIds.has(id));
};

const RelatedDashboardsComboBox = ({
  dashboard,
  dashboardsFormData,
  onChange,
  onMissingChange,
  placeholder,
  labelId,
}: {
  dashboard: DashboardStart;
  dashboardsFormData: Array<{ id: string }>;
  onChange: (selectedOptions: Array<EuiComboBoxOptionOption<string>>) => void;
  onMissingChange: (missing: MissingDashboard[]) => void;
  placeholder: string;
  labelId: string;
}) => {
  const [dashboardOptions, setDashboardOptions] = useState<Array<EuiComboBoxOptionOption<string>>>(
    []
  );
  const [selectedDashboards, setSelectedDashboards] = useState<
    Array<EuiComboBoxOptionOption<string>>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const hasLoadedDashboardOptions = useRef(false);
  // Tracks the artifact ids we last resolved against so the effect doesn't re-fetch
  // when the form value's identity changes but the underlying id set does not.
  const resolvedIds = useRef<string[]>([]);

  useEffect(() => {
    let ignore = false;
    const loadSelectedDashboards = async () => {
      const dashboardIds = dashboardsFormData.map((entry) => entry.id);
      if (haveSameDashboardIds(dashboardIds, resolvedIds.current)) {
        return;
      }

      if (!dashboardIds.length) {
        resolvedIds.current = [];
        setSelectedDashboards([]);
        onMissingChange([]);
        return;
      }

      try {
        const { resolved, missing } = await resolveDashboardsByIds(dashboard, dashboardIds);
        if (ignore) {
          return;
        }
        resolvedIds.current = dashboardIds;
        setSelectedDashboards(resolved.map((entry) => ({ label: entry.title, value: entry.id })));
        onMissingChange(missing);
      } catch {
        if (ignore) {
          return;
        }
        // On a total fetch failure, surface every attachment as unavailable rather
        // than silently dropping them — the user can still see and remove them.
        // Leave `resolvedIds.current` unadvanced so a later render can retry instead
        // of permanently stranding the ids as unavailable after a transient error.
        setSelectedDashboards([]);
        onMissingChange(dashboardIds.map((id) => ({ id, notFound: false })));
      }
    };

    loadSelectedDashboards();
    return () => {
      ignore = true;
    };
  }, [dashboardsFormData, dashboard, onMissingChange]);

  const loadDashboards = useCallback(
    async (search?: string) => {
      setIsLoading(true);
      try {
        const dashboards = await searchRelatedDashboard(dashboard, { search: search?.trim() });
        setDashboardOptions(dashboards.map((entry) => ({ label: entry.title, value: entry.id })));
      } catch {
        setDashboardOptions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [dashboard]
  );
  const { run: debouncedLoadDashboards } = useDebounceFn(loadDashboards, {
    wait: SEARCH_DEBOUNCE_MS,
  });

  const handleSearchChange = useCallback(
    (search: string) => {
      if (!hasLoadedDashboardOptions.current) {
        hasLoadedDashboardOptions.current = true;
        loadDashboards();
        return;
      }
      debouncedLoadDashboards(search);
    },
    [debouncedLoadDashboards, loadDashboards]
  );

  const onSelectionChange = (selectedOptions: Array<EuiComboBoxOptionOption<string>>) => {
    setSelectedDashboards(selectedOptions);
    onChange(selectedOptions);
  };

  return (
    <EuiComboBox
      compressed
      async
      fullWidth
      isLoading={isLoading}
      options={dashboardOptions}
      selectedOptions={selectedDashboards}
      placeholder={placeholder}
      aria-labelledby={labelId}
      onChange={onSelectionChange}
      onFocus={() => handleSearchChange('')}
      onSearchChange={handleSearchChange}
      data-test-subj="dashboardsSelector"
    />
  );
};

const MissingDashboardsCallout = ({
  missing,
  onRemove,
}: {
  missing: MissingDashboard[];
  onRemove: (dashboardId: string) => void;
}) => (
  <>
    <EuiSpacer size="s" />
    <EuiCallOut
      color="warning"
      size="s"
      iconType="warning"
      data-test-subj="missingDashboardsCallout"
      title={i18n.translate('xpack.alertingV2.ruleForm.missingDashboardsCalloutTitle', {
        defaultMessage:
          '{count, plural, one {# linked dashboard is} other {# linked dashboards are}} unavailable',
        values: { count: missing.length },
      })}
    >
      <p>
        <FormattedMessage
          id="xpack.alertingV2.ruleForm.missingDashboardsCalloutBody"
          defaultMessage="These dashboards may have been deleted or are no longer accessible. Remove them to save a clean rule."
        />
      </p>
      <EuiFlexGroup direction="column" gutterSize="xs">
        {missing.map((missingDashboard) => (
          <EuiFlexItem key={missingDashboard.id} grow={false}>
            <EuiFlexGroup
              alignItems="center"
              gutterSize="s"
              responsive={false}
              data-test-subj={`missingDashboardArtifact-${missingDashboard.id}`}
            >
              <EuiFlexItem grow={false}>
                <EuiBadge color="warning" iconType="warning">
                  {missingDashboard.notFound
                    ? i18n.translate('xpack.alertingV2.ruleForm.missingDashboardDeletedBadge', {
                        defaultMessage: 'Dashboard deleted',
                      })
                    : i18n.translate('xpack.alertingV2.ruleForm.missingDashboardUnavailableBadge', {
                        defaultMessage: 'Dashboard unavailable',
                      })}
                </EuiBadge>
              </EuiFlexItem>
              <EuiFlexItem>
                <EuiText size="xs" color="subdued">
                  <FormattedMessage
                    id="xpack.alertingV2.ruleForm.missingDashboardUnknownLabel"
                    defaultMessage="Unknown dashboard"
                  />{' '}
                  <EuiCode>{missingDashboard.id}</EuiCode>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate(
                    'xpack.alertingV2.ruleForm.removeMissingDashboardAriaLabel',
                    {
                      defaultMessage: 'Remove unavailable dashboard {dashboardId}',
                      values: { dashboardId: missingDashboard.id },
                    }
                  )}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType="trash"
                    color="danger"
                    data-test-subj={`removeMissingDashboardButton-${missingDashboard.id}`}
                    aria-label={i18n.translate(
                      'xpack.alertingV2.ruleForm.removeMissingDashboardAriaLabel',
                      {
                        defaultMessage: 'Remove unavailable dashboard {dashboardId}',
                        values: { dashboardId: missingDashboard.id },
                      }
                    )}
                    onClick={() => onRemove(missingDashboard.id)}
                  />
                </EuiToolTip>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </EuiCallOut>
  </>
);

export const RelatedDashboardSelector: React.FC = () => {
  const { control } = useFormContext<FormValues>();
  const { dashboard } = useRuleFormServices();
  const relatedDashboardsLabelId = useGeneratedHtmlId({ prefix: 'relatedDashboardsLabel' });
  const [missingDashboards, setMissingDashboards] = useState<MissingDashboard[]>([]);
  const {
    field: { value: dashboardArtifacts = [], onChange },
  } = useController<FormValues, 'dashboardArtifacts'>({
    name: 'dashboardArtifacts',
    control,
  });

  const dashboardsFormData = useMemo(
    () => dashboardArtifacts.map((artifact) => ({ id: artifact.value })),
    [dashboardArtifacts]
  );

  const updateDashboardArtifacts = useCallback(
    (selectedOptions: Array<EuiComboBoxOptionOption<string>>) => {
      const missingIds = new Set(missingDashboards.map((entry) => entry.id));
      // Preserve unresolved (missing) artifacts — they are not represented in the
      // combo box, so rebuilding solely from the selection would silently drop them.
      const preservedMissingArtifacts = dashboardArtifacts.filter((artifact) =>
        missingIds.has(artifact.value)
      );

      const selectedArtifacts = selectedOptions.flatMap((selectedOption) => {
        const dashboardId = selectedOption.value;
        if (!dashboardId) {
          return [];
        }

        const existingArtifact = dashboardArtifacts.find(
          (artifact) => artifact.value === dashboardId
        );

        return [
          {
            id: existingArtifact?.id ?? '',
            type: DASHBOARD_ARTIFACT_TYPE,
            value: dashboardId,
          },
        ];
      });

      onChange([...selectedArtifacts, ...preservedMissingArtifacts]);
    },
    [dashboardArtifacts, missingDashboards, onChange]
  );

  const removeMissingArtifact = useCallback(
    (dashboardId: string) => {
      onChange(dashboardArtifacts.filter((artifact) => artifact.value !== dashboardId));
    },
    [dashboardArtifacts, onChange]
  );

  if (!dashboard) {
    // Compose Discover always provides the dashboard contract; this guard protects
    // consumers of the shared RuleFormServices type where dashboard is optional
    // (e.g. when the dashboard plugin is disabled).
    return null;
  }

  return (
    <>
      <EuiFormRow
        label={
          <span id={relatedDashboardsLabelId}>
            {i18n.translate('xpack.alertingV2.ruleForm.relatedDashboardsLabel', {
              defaultMessage: 'Related dashboards',
            })}
          </span>
        }
        fullWidth
        labelAppend={
          <EuiText size="xs">
            <FormattedMessage
              id="xpack.alertingV2.ruleForm.artifactFieldOptional"
              defaultMessage="optional"
            />
          </EuiText>
        }
      >
        <RelatedDashboardsComboBox
          dashboard={dashboard}
          dashboardsFormData={dashboardsFormData}
          onChange={updateDashboardArtifacts}
          onMissingChange={setMissingDashboards}
          labelId={relatedDashboardsLabelId}
          placeholder={i18n.translate('xpack.alertingV2.ruleForm.relatedDashboardsPlaceholder', {
            defaultMessage: 'Link related dashboards for investigation',
          })}
        />
      </EuiFormRow>
      {missingDashboards.length > 0 && (
        <MissingDashboardsCallout missing={missingDashboards} onRemove={removeMissingArtifact} />
      )}
    </>
  );
};
