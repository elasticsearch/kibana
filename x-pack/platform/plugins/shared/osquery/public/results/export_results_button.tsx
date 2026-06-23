/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { EuiButtonEmpty, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { Filter } from '@kbn/es-query';

import { useIsExperimentalFeatureEnabled } from '../common/experimental_features_context';
import { useExportResults } from './use_export_results';
import { ExportResultsModal } from './export_results_modal';
import { EXPORT_NO_DATA_TOOLTIP } from './translations';
import type { ExportFormat } from './use_export_results';

interface ExportResultsButtonProps {
  actionId: string;
  isLive?: boolean;
  liveQueryId?: string;
  scheduleId?: string;
  executionCount?: number;
  kuery?: string;
  activeFilters?: Filter[];
  /** Total under the active KQL/filters; used when "Only export filtered results" is checked. */
  filteredTotal?: number;
  /** Unfiltered total; used when the user opts out of "Only export filtered results". */
  total?: number;
}

const ExportResultsButtonComponent: React.FC<ExportResultsButtonProps> = ({
  actionId,
  isLive = true,
  liveQueryId,
  scheduleId,
  executionCount,
  kuery,
  activeFilters,
  filteredTotal,
  total,
}) => {
  const isExportEnabled = useIsExperimentalFeatureEnabled('exportResults');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const hasActiveFilters = !!(kuery || (activeFilters && activeFilters.length > 0));

  const esFilters = useMemo(
    () => (activeFilters && activeFilters.length > 0 ? activeFilters : undefined),
    [activeFilters]
  );

  const { exportResults, isExporting } = useExportResults({
    actionId,
    isLive,
    liveQueryId,
    scheduleId,
    executionCount,
  });

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const handleExport = useCallback(
    (format: ExportFormat, options: { filtered: boolean }) => {
      closeModal();
      exportResults(format, options.filtered ? { kuery, esFilters } : undefined);
    },
    [closeModal, exportResults, kuery, esFilters]
  );

  if (!isExportEnabled) {
    return null;
  }

  const isEmpty = total === 0;
  const isInitialLoading = total === undefined;

  const button = (
    <EuiButtonEmpty
      size="m"
      iconType="exportAction"
      onClick={openModal}
      isLoading={isExporting || isInitialLoading}
      isDisabled={isEmpty}
      data-test-subj="osqueryExportResultsButton"
    >
      {i18n.translate('xpack.osquery.exportResults.buttonLabel', {
        defaultMessage: 'Export results',
      })}
    </EuiButtonEmpty>
  );

  return (
    <>
      {isEmpty ? <EuiToolTip content={EXPORT_NO_DATA_TOOLTIP}>{button}</EuiToolTip> : button}

      {isModalOpen && (
        <ExportResultsModal
          onClose={closeModal}
          onExport={handleExport}
          isExporting={isExporting}
          hasActiveFilters={hasActiveFilters}
          filteredTotal={filteredTotal}
          total={total}
        />
      )}
    </>
  );
};

export const ExportResultsButton = React.memo(ExportResultsButtonComponent);
