/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiAccordion,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { i18n } from '@kbn/i18n';
import { formatLocation } from '../../../../../../../common/utils/location_formatter';
import { monitorTypeRequiresPrivateLocations } from '../../../../../../../common/utils/monitor_location_support';
import type {
  EncryptedSyntheticsSavedMonitor,
  MonitorServiceLocation,
} from '../../../../../../../common/runtime_types';
import { ConfigKey } from '../../../../../../../common/runtime_types';
import { splitMonitorsForBulkEdit } from './bulk_edit_eligibility';
import { useGetUrlParams } from '../../../../hooks';
import { useLocations } from '../../../../hooks/use_locations';
import { fetchBulkUpdateMonitors } from '../../../../state';
import { kibanaService } from '../../../../../../utils/kibana_service';
import { LocationsComboBox } from '../../../monitor_add_edit/form/field_wrappers';

type BulkLocationsMode = 'add' | 'remove' | 'overwrite';

interface LocationOption {
  id: string;
  label: string;
  isServiceManaged: boolean;
}

// LocationsComboBox is typed as EuiComboBoxProps<unknown>, but the options we
// pass it also carry id/isServiceManaged, so its onChange hands those back too.
type LocationComboBoxOption = EuiComboBoxOptionOption<unknown> & LocationOption;

const sameIdSet = (a: MonitorServiceLocation[], b: MonitorServiceLocation[]) => {
  if (a.length !== b.length) {
    return false;
  }
  const bIds = new Set(b.map((loc) => loc.id));
  return a.every((loc) => bIds.has(loc.id));
};

// Public bulk-update carries forward private locations unless `private_locations`
// is explicit (even `[]`); split so overwrite/remove drop private as intended.
const toLocationsPatch = (nextLocations: MonitorServiceLocation[]) => ({
  [ConfigKey.LOCATIONS]: nextLocations.filter((loc) => loc.isServiceManaged),
  private_locations: nextLocations.filter((loc) => !loc.isServiceManaged).map((loc) => loc.id),
});

export const BulkLocationsFlyout = ({
  monitors,
  onClose,
  reloadPage,
}: {
  monitors: EncryptedSyntheticsSavedMonitor[];
  onClose: () => void;
  reloadPage: () => void;
}) => {
  const [mode, setMode] = useState<BulkLocationsMode>('add');
  const [selectedLocations, setSelectedLocations] = useState<MonitorServiceLocation[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const { spaceId } = useGetUrlParams();
  const { locations, loading } = useLocations();
  const flyoutTitleId = useGeneratedHtmlId();
  const skippedAccordionId = useGeneratedHtmlId();

  const { eligibleMonitors, skippedMonitors } = useMemo(
    () => splitMonitorsForBulkEdit(monitors),
    [monitors]
  );

  const options = useMemo(
    () =>
      locations.map((location) => ({
        id: location.id,
        label: location.label,
        isServiceManaged: location.isServiceManaged || false,
      })),
    [locations]
  );

  // Selected combobox entries mapped back to their full available-location record
  // so the persisted payload keeps `geo`/`agentPolicyId`, matching the add/edit form.
  const formattedSelected = useMemo(() => {
    return selectedLocations
      .map((selected) => locations.find((loc) => loc.id === selected.id))
      .filter((loc): loc is (typeof locations)[number] => Boolean(loc))
      .map((loc) => formatLocation(loc) as MonitorServiceLocation);
  }, [selectedLocations, locations]);

  const { updates, emptiedCount, unchangedCount } = useMemo(() => {
    const selectedIds = new Set(formattedSelected.map((loc) => loc.id));
    let emptied = 0;
    let unchanged = 0;
    const result: Array<{ id: string; nextLocations: MonitorServiceLocation[] }> = [];

    for (const monitor of eligibleMonitors) {
      const current = (monitor[ConfigKey.LOCATIONS] ?? []) as MonitorServiceLocation[];
      let next: MonitorServiceLocation[];
      if (mode === 'add') {
        const currentIds = new Set(current.map((loc) => loc.id));
        next = [...current, ...formattedSelected.filter((loc) => !currentIds.has(loc.id))];
      } else if (mode === 'remove') {
        next = current.filter((loc) => !selectedIds.has(loc.id));
      } else {
        next = formattedSelected;
      }

      if (monitorTypeRequiresPrivateLocations(monitor[ConfigKey.MONITOR_TYPE])) {
        next = next.filter((loc) => !loc.isServiceManaged);
      }

      if (sameIdSet(current, next)) {
        unchanged += 1;
        continue;
      }
      // A monitor must always keep at least one location; skip any that would
      // be emptied and surface the count so the user understands the no-op.
      if (next.length === 0) {
        emptied += 1;
        continue;
      }
      result.push({ id: monitor[ConfigKey.CONFIG_ID], nextLocations: next });
    }
    return { updates: result, emptiedCount: emptied, unchangedCount: unchanged };
  }, [eligibleMonitors, mode, formattedSelected]);

  // A live, per-outcome breakdown so the user can see exactly what Save will do
  // before committing — bulk edits across a mixed selection are otherwise opaque.
  const hasSelection = formattedSelected.length > 0;
  const effectSummary = [
    getWillChangeSummary(updates.length),
    unchangedCount > 0 ? getUnchangedSummary(unchangedCount) : null,
    emptiedCount > 0 ? getSkippedSummary(emptiedCount) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const handleSave = useCallback(async () => {
    setIsUpdating(true);
    try {
      const { result } = await fetchBulkUpdateMonitors({
        updates: updates.map(({ id, nextLocations }) => ({
          id,
          attributes: toLocationsPatch(nextLocations),
        })),
        spaceId,
      });
      const failedCount = result.filter((entry) => !entry.updated).length;
      const updatedCount = result.length - failedCount;

      if (failedCount === 0) {
        kibanaService.toasts.addSuccess({
          title: getSuccessMessage(updatedCount),
          toastLifeTimeMs: 3000,
        });
      } else {
        kibanaService.toasts.addWarning({
          title: getPartialFailureMessage(updatedCount, failedCount),
          toastLifeTimeMs: 5000,
        });
      }
    } catch (e) {
      kibanaService.toasts.addDanger({
        title: FAILURE_MESSAGE,
        toastLifeTimeMs: 5000,
      });
    } finally {
      setIsUpdating(false);
      reloadPage();
      onClose();
    }
  }, [updates, spaceId, reloadPage, onClose]);

  const modeOptions = [
    { id: 'add' as const, label: ADD_LABEL },
    { id: 'remove' as const, label: REMOVE_LABEL },
    { id: 'overwrite' as const, label: OVERWRITE_LABEL },
  ];

  const saveDisabled = updates.length === 0 || selectedLocations.length === 0;

  return (
    <EuiFlyout
      ownFocus
      onClose={onClose}
      aria-labelledby={flyoutTitleId}
      data-test-subj="syntheticsBulkLocationsFlyout"
      size="s"
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id={flyoutTitleId}>{FLYOUT_TITLE}</h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiText size="s">
          <p>{getDescription(eligibleMonitors.length)}</p>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiFormRow label={MODE_LABEL} helpText={getModeHelp(mode)}>
          <EuiButtonGroup
            legend={MODE_LABEL}
            options={modeOptions}
            idSelected={mode}
            onChange={(id) => setMode(id as BulkLocationsMode)}
            isFullWidth
            data-test-subj="syntheticsBulkLocationsModeGroup"
          />
        </EuiFormRow>
        <EuiSpacer size="m" />
        <EuiFormRow label={SELECT_LOCATIONS_LABEL} fullWidth>
          <LocationsComboBox
            fullWidth
            isLoading={loading}
            options={options}
            selectedOptions={selectedLocations.map((loc) => ({
              id: loc.id,
              label: loc.label,
              isServiceManaged: loc.isServiceManaged ?? false,
            }))}
            onChange={(selected: Array<EuiComboBoxOptionOption<unknown>>) => {
              setSelectedLocations(
                (selected as LocationComboBoxOption[]).map(({ id, label, isServiceManaged }) => ({
                  id,
                  label,
                  isServiceManaged,
                }))
              );
            }}
            data-test-subj="syntheticsBulkLocationsComboBox"
          />
        </EuiFormRow>
        {hasSelection && (
          <>
            <EuiSpacer size="s" />
            <EuiText
              size="xs"
              color="subdued"
              data-test-subj="syntheticsBulkLocationsEffectSummary"
            >
              {effectSummary}
            </EuiText>
          </>
        )}
        {hasSelection && emptiedCount > 0 && (
          <>
            <EuiSpacer size="m" />
            <KbnWarningCallout
              announceOnMount={false}
              size="s"
              title={i18n.translate('xpack.synthetics.bulkLocationsFlyout.emptiedWarning', {
                defaultMessage:
                  '{count, plural, one {# monitor} other {# monitors}} would be left with no location and will be skipped. Every monitor must run in at least one location.',
                values: { count: emptiedCount },
              })}
            />
          </>
        )}
        {skippedMonitors.length > 0 && (
          <>
            <EuiSpacer size="m" />
            <KbnWarningCallout
              announceOnMount={false}
              title={i18n.translate('xpack.synthetics.bulkLocationsFlyout.skippedWarning.title', {
                defaultMessage:
                  '{count, plural, one {# monitor} other {# monitors}} will not be updated',
                values: { count: skippedMonitors.length },
              })}
              text={SKIPPED_DESCRIPTION}
            >
              <EuiAccordion id={skippedAccordionId} buttonContent={SHOW_SKIPPED_LABEL}>
                <EuiSpacer size="xs" />
                <EuiText size="s">
                  <ul>
                    {skippedMonitors.map(({ id, name }) => (
                      <li key={id}>{name}</li>
                    ))}
                  </ul>
                </EuiText>
              </EuiAccordion>
            </KbnWarningCallout>
          </>
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose} data-test-subj="syntheticsBulkLocationsCancel">
              {CANCEL_LABEL}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              onClick={handleSave}
              isLoading={isUpdating}
              isDisabled={saveDisabled}
              data-test-subj="syntheticsBulkLocationsSave"
            >
              {SAVE_LABEL}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};

const getModeHelp = (mode: BulkLocationsMode) => {
  switch (mode) {
    case 'add':
      return i18n.translate('xpack.synthetics.bulkLocationsFlyout.modeHelp.add', {
        defaultMessage: "Adds the selected locations to each monitor's existing locations.",
      });
    case 'remove':
      return i18n.translate('xpack.synthetics.bulkLocationsFlyout.modeHelp.remove', {
        defaultMessage:
          'Removes the selected locations from each monitor. Monitors left with no location are skipped.',
      });
    case 'overwrite':
    default:
      return i18n.translate('xpack.synthetics.bulkLocationsFlyout.modeHelp.overwrite', {
        defaultMessage: "Replaces each monitor's locations with the selected ones.",
      });
  }
};

const getWillChangeSummary = (count: number) =>
  i18n.translate('xpack.synthetics.bulkLocationsFlyout.summary.willChange', {
    defaultMessage: '{count, plural, one {# will change} other {# will change}}',
    values: { count },
  });

const getUnchangedSummary = (count: number) =>
  i18n.translate('xpack.synthetics.bulkLocationsFlyout.summary.unchanged', {
    defaultMessage: '{count, number} unchanged',
    values: { count },
  });

const getSkippedSummary = (count: number) =>
  i18n.translate('xpack.synthetics.bulkLocationsFlyout.summary.skipped', {
    defaultMessage: '{count, number} skipped',
    values: { count },
  });

const getDescription = (count: number) =>
  i18n.translate('xpack.synthetics.bulkLocationsFlyout.description', {
    defaultMessage:
      'Add, remove, or overwrite locations for {count, number} selected {count, plural, one {monitor} other {monitors}}.',
    values: { count },
  });

const getSuccessMessage = (count: number) =>
  i18n.translate('xpack.synthetics.bulkLocationsFlyout.success', {
    defaultMessage: 'Locations updated for {count, plural, one {# monitor} other {# monitors}}.',
    values: { count },
  });

const getPartialFailureMessage = (updatedCount: number, failedCount: number) =>
  i18n.translate('xpack.synthetics.bulkLocationsFlyout.partialFailure', {
    defaultMessage:
      '{updatedCount, number} updated, {failedCount, number} failed. Check that the failed monitors are editable and try again.',
    values: { updatedCount, failedCount },
  });

const FAILURE_MESSAGE = i18n.translate('xpack.synthetics.bulkLocationsFlyout.failure', {
  defaultMessage: 'Failed to update locations. Please try again later.',
});

const FLYOUT_TITLE = i18n.translate('xpack.synthetics.bulkLocationsFlyout.title', {
  defaultMessage: 'Edit locations',
});

const MODE_LABEL = i18n.translate('xpack.synthetics.bulkLocationsFlyout.modeLabel', {
  defaultMessage: 'Action',
});

const SELECT_LOCATIONS_LABEL = i18n.translate(
  'xpack.synthetics.bulkLocationsFlyout.selectLocationsLabel',
  {
    defaultMessage: 'Locations',
  }
);

const SKIPPED_DESCRIPTION = i18n.translate(
  'xpack.synthetics.bulkLocationsFlyout.skippedWarning.description',
  {
    defaultMessage:
      'Project and Terraform-managed monitors cannot be edited here. Update them from their source instead.',
  }
);

const SHOW_SKIPPED_LABEL = i18n.translate(
  'xpack.synthetics.bulkLocationsFlyout.skippedWarning.showIds',
  { defaultMessage: 'Show skipped monitors' }
);

const CANCEL_LABEL = i18n.translate('xpack.synthetics.bulkLocationsFlyout.cancel', {
  defaultMessage: 'Cancel',
});

const SAVE_LABEL = i18n.translate('xpack.synthetics.bulkLocationsFlyout.save', {
  defaultMessage: 'Save',
});

const ADD_LABEL = i18n.translate('xpack.synthetics.bulkLocationsFlyout.add', {
  defaultMessage: 'Add',
});

const REMOVE_LABEL = i18n.translate('xpack.synthetics.bulkLocationsFlyout.remove', {
  defaultMessage: 'Remove',
});

const OVERWRITE_LABEL = i18n.translate('xpack.synthetics.bulkLocationsFlyout.overwrite', {
  defaultMessage: 'Overwrite',
});
