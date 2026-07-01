/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  screen,
  fireEvent,
  within,
  waitFor,
  waitForElementToBeRemoved,
} from '@testing-library/react';

const addRolloverField = async (buttonTestSubj: string, field: string) => {
  fireEvent.click(screen.getByTestId(buttonTestSubj));
  const option = await screen.findByTestId(`rolloverAddField-${field}`);
  fireEvent.click(option);
  await waitFor(() => {
    expect(screen.queryByTestId(`rolloverAddField-${field}`)).not.toBeInTheDocument();
  });
};

const ensureRolloverField = async (
  inputTestSubj: string,
  buttonTestSubj: string,
  field: string
) => {
  if (!screen.queryByTestId(inputTestSubj)) {
    await addRolloverField(buttonTestSubj, field);
  }
};

const setValue = (inputTestSubj: string, value: string) => {
  const input = screen.getByTestId<HTMLInputElement>(inputTestSubj);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

const setUnits = async (unitTestSubj: string, units?: string) => {
  if (units) {
    const popover = screen.getByTestId(unitTestSubj);
    const filterButton = within(popover).getByTestId('show-filters-button');
    fireEvent.click(filterButton);

    const filterOption = await screen.findByTestId(`filter-option-${units}`);
    fireEvent.click(filterOption);
    await waitForElementToBeRemoved(filterOption);
  }
};

const setMaxPrimaryShardSize = async (value: string, units?: string) => {
  await ensureRolloverField(
    'hot-selectedMaxPrimaryShardSize',
    'rolloverAddTriggerButton',
    'max_primary_shard_size'
  );
  setValue('hot-selectedMaxPrimaryShardSize', value);
  await setUnits('hot-selectedMaxPrimaryShardSizeUnits', units);
};

const setMaxAge = async (value: string, units?: string) => {
  await ensureRolloverField('hot-selectedMaxAge', 'rolloverAddTriggerButton', 'max_age');
  setValue('hot-selectedMaxAge', value);
  await setUnits('hot-selectedMaxAgeUnits', units);
};

const setMaxPrimaryShardDocs = async (value: string) => {
  await ensureRolloverField(
    'hot-selectedMaxPrimaryShardDocs',
    'rolloverAddTriggerButton',
    'max_primary_shard_docs'
  );
  setValue('hot-selectedMaxPrimaryShardDocs', value);
};

const setMaxDocs = async (value: string) => {
  await ensureRolloverField('hot-selectedMaxDocuments', 'rolloverAddTriggerButton', 'max_docs');
  setValue('hot-selectedMaxDocuments', value);
};

const setMaxSize = async (value: string, units?: string) => {
  await ensureRolloverField('hot-selectedMaxSizeStored', 'rolloverAddTriggerButton', 'max_size');
  setValue('hot-selectedMaxSizeStored', value);
  await setUnits('hot-selectedMaxSizeStoredUnits', units);
};

const setMinPrimaryShardSize = async (value: string, units?: string) => {
  await ensureRolloverField(
    'hot-selectedMinPrimaryShardSize',
    'rolloverAddRestrictionButton',
    'min_primary_shard_size'
  );
  setValue('hot-selectedMinPrimaryShardSize', value);
  await setUnits('hot-selectedMinPrimaryShardSizeUnits', units);
};

const setMinAge = async (value: string, units?: string) => {
  await ensureRolloverField('hot-selectedMinAge', 'rolloverAddRestrictionButton', 'min_age');
  setValue('hot-selectedMinAge', value);
  await setUnits('hot-selectedMinAgeUnits', units);
};

const setMinPrimaryShardDocs = async (value: string) => {
  await ensureRolloverField(
    'hot-selectedMinPrimaryShardDocs',
    'rolloverAddRestrictionButton',
    'min_primary_shard_docs'
  );
  setValue('hot-selectedMinPrimaryShardDocs', value);
};

const setMinDocs = async (value: string) => {
  await ensureRolloverField('hot-selectedMinDocuments', 'rolloverAddRestrictionButton', 'min_docs');
  setValue('hot-selectedMinDocuments', value);
};

const setMinSize = async (value: string, units?: string) => {
  await ensureRolloverField(
    'hot-selectedMinSizeStored',
    'rolloverAddRestrictionButton',
    'min_size'
  );
  setValue('hot-selectedMinSizeStored', value);
  await setUnits('hot-selectedMinSizeStoredUnits', units);
};

export const createRolloverActions = () => {
  return {
    rollover: {
      toggle: () => fireEvent.click(screen.getByTestId('rolloverSwitch')),
      addTrigger: (field: string) => addRolloverField('rolloverAddTriggerButton', field),
      addRestriction: (field: string) => addRolloverField('rolloverAddRestrictionButton', field),
      restoreRecommendedDefaults: () =>
        fireEvent.click(screen.getByTestId('rolloverRestoreRecommendedDefaults')),
      setMaxPrimaryShardSize,
      setMaxPrimaryShardDocs,
      setMaxDocs,
      setMaxAge,
      setMaxSize,
      setMinPrimaryShardSize,
      setMinPrimaryShardDocs,
      setMinDocs,
      setMinAge,
      setMinSize,
      hasSettingRequiredCallout: (): boolean =>
        Boolean(screen.queryByTestId('rolloverSettingsRequired')),
    },
  };
};
