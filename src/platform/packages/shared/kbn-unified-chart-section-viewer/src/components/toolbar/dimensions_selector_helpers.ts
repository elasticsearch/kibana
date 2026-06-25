/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import type { SelectableEntry } from '@kbn/shared-ux-toolbar-selector';
import type { Dimension, ParsedMetricItem } from '../../types';

/**
 * A `SelectableEntry` carrying the `Dimension` it was built from. Keeping the
 * dimension on the option lets `handleChange` read it back without a reverse
 * lookup against `dimensions` + `localSelectedDimensions`.
 */
export type DimensionEntry = SelectableEntry & { dimension: Dimension };

interface BuildDimensionOptionParams {
  dimension: Dimension;
  isSelected: boolean;
  isDisabled: boolean;
  appendNode?: ReactNode;
}

/**
 * Builds the `DimensionEntry` rendered by the toolbar selector. Kept as a
 * helper so the hook's `options` memo stays focused on partitioning and
 * disabled-state derivation.
 */
export const buildDimensionOption = ({
  dimension,
  isSelected,
  isDisabled,
  appendNode,
}: BuildDimensionOptionParams): DimensionEntry => {
  const option: DimensionEntry = {
    value: dimension.name,
    label: dimension.name,
    checked: isSelected ? 'on' : undefined,
    disabled: isDisabled,
    key: dimension.name,
    dimension,
    'data-test-subj': `dimensionSelectorOption-${dimension.name}`,
  };
  if (appendNode) {
    option.append = appendNode;
  }
  return option;
};

interface OptionDisabledStateParams {
  singleSelection: boolean;
  isSelected: boolean;
  isAtMaxLimit: boolean;
}

/**
 * Determines if a dimension option should be disabled.
 * - In single-selection mode: never disabled
 * - Selected items: never disabled (can always deselect)
 * - Otherwise: disabled if not intersecting or at max limit
 */
export const getOptionDisabledState = ({
  singleSelection,
  isSelected,
  isAtMaxLimit,
}: OptionDisabledStateParams): boolean => {
  if (singleSelection) return false;
  if (isSelected) return false;
  return isAtMaxLimit;
};

/**
 * Returns the set of dimension names carried by at least one metric that
 * also carries every currently-selected dimension. Used by the picker to
 * optimistically hide options that, if selected, would produce an empty
 * grid — without waiting for the server round-trip.
 */
export const getApplicableDimensionNames = (
  metricItems: ParsedMetricItem[],
  selectedNames: readonly string[]
): Set<string> => {
  const carriesAllSelected = (item: ParsedMetricItem) => {
    const itemDimNames = new Set(item.dimensionFields.map((d) => d.name));
    return selectedNames.every((name) => itemDimNames.has(name));
  };
  return new Set(
    metricItems
      .filter(carriesAllSelected)
      .flatMap((item) => item.dimensionFields.map((d) => d.name))
  );
};

interface PartitionedDimensionsParams {
  dimensions: Dimension[];
  selectedDimensions: Dimension[];
  optimisticApplicableNames: Set<string> | null;
}

interface PartitionedDimensions {
  /** Selections not in the applicable set — always surfaced so the count badge matches the visible ticks. */
  orphanSelections: Dimension[];
  /** Applicable dimensions in their caller-provided order, narrowed by the optimistic filter when active. */
  applicableDimensions: Dimension[];
}

/**
 * Splits the picker's render list into orphaned selections (shown first,
 * alphabetically sorted) and applicable dimensions (caller order preserved).
 * Keeps the split pure so the component stays presentational.
 */
export const partitionDimensionsForRender = ({
  dimensions,
  selectedDimensions,
  optimisticApplicableNames,
}: PartitionedDimensionsParams): PartitionedDimensions => {
  const applicableNames = optimisticApplicableNames ?? new Set(dimensions.map((d) => d.name));

  const applicableDimensions =
    optimisticApplicableNames == null
      ? dimensions
      : dimensions.filter((dimension) => optimisticApplicableNames.has(dimension.name));

  const orphanSelections = selectedDimensions
    .filter((dimension) => !applicableNames.has(dimension.name))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return { orphanSelections, applicableDimensions };
};
