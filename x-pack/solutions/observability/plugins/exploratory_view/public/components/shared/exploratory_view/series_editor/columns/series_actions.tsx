/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback } from 'react';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
  EuiContextMenuPanel,
  EuiContextMenuItem,
  EuiPopover,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useSeriesStorage } from '../../hooks/use_series_storage';
import type { SeriesConfig, SeriesUrl } from '../../types';
import { useDiscoverLink } from '../../hooks/use_discover_link';
import { useAppDataViewContext } from '../../hooks/use_app_data_view';

interface Props {
  seriesId: number;
  series: SeriesUrl;
  seriesConfig?: SeriesConfig;
  onEditClick?: () => void;
}

export function SeriesActions({ seriesId, series, seriesConfig, onEditClick }: Props) {
  const { setSeries, removeSeries, allSeries } = useSeriesStorage();
  const [isPopoverOpen, setPopover] = useState(false);

  const { href: discoverHref } = useDiscoverLink({ series, seriesConfig });

  const { dataViews } = useAppDataViewContext();

  const dataView = dataViews?.[series.dataType];
  const deleteDisabled = seriesId === 0 && allSeries.length > 1;

  const copySeries = () => {
    let copySeriesId: string = `${series.name}-copy`;
    if (allSeries.find(({ name }) => name === copySeriesId)) {
      copySeriesId = copySeriesId + allSeries.length;
    }
    setSeries(allSeries.length, { ...series, name: copySeriesId, breakdown: undefined });
    closePopover();
  };

  const toggleSeries = () => {
    if (series.hidden) {
      setSeries(seriesId, { ...series, hidden: undefined });
    } else {
      setSeries(seriesId, { ...series, hidden: true });
    }
    closePopover();
  };

  const closePopover = useCallback(() => {
    setPopover(false);
  }, [setPopover]);

  const onRemoveSeriesClick = useCallback(() => {
    removeSeries(seriesId);
    closePopover();
  }, [removeSeries, seriesId, closePopover]);

  const changePopoverVisibility = useCallback(() => {
    setPopover(!isPopoverOpen);
  }, [setPopover, isPopoverOpen]);

  const popoverButton = (
    <EuiToolTip content={POPOVER_BUTTON_LABEL} disableScreenReaderOutput>
      <EuiButtonIcon
        data-test-subj="exploratoryViewSeriesActionsButton"
        iconType="boxesVertical"
        onClick={changePopoverVisibility}
        color="text"
        aria-label={POPOVER_BUTTON_LABEL}
      />
    </EuiToolTip>
  );

  return (
    <EuiFlexGroup alignItems="center" gutterSize="none" justifyContent="flexEnd" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiToolTip content={EDIT_SERIES_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="pencil"
            color="text"
            aria-label={EDIT_SERIES_LABEL}
            size="s"
            onClick={onEditClick}
            data-test-subj={`editSeries${seriesId}`}
          />
        </EuiToolTip>
      </EuiFlexItem>

      <EuiFlexItem grow={false}>
        <EuiPopover
          aria-label={i18n.translate('xpack.exploratoryView.seriesActions.popoverAriaLabel', {
            defaultMessage: 'Series actions',
          })}
          button={popoverButton}
          isOpen={isPopoverOpen}
          closePopover={closePopover}
          panelPaddingSize="none"
          anchorPosition="downLeft"
        >
          <EuiContextMenuPanel
            aria-label={ACTIONS_CONTEXT_MENU_LABEL}
            items={[
              <EuiContextMenuItem
                key="viewSampleDocuments"
                icon="discoverApp"
                href={discoverHref}
                aria-label={VIEW_SAMPLE_DOCUMENTS_LABEL}
                disabled={!series.dataType || !series.selectedMetricField || !dataView}
                target="_blank"
              >
                {VIEW_SAMPLE_DOCUMENTS_LABEL}
              </EuiContextMenuItem>,
              <EuiContextMenuItem
                key="hideSeries"
                icon={series.hidden ? 'eye' : 'eyeSlash'}
                onClick={toggleSeries}
                aria-label={series.hidden ? SHOW_SERIES_LABEL : HIDE_SERIES_LABEL}
              >
                {series.hidden ? SHOW_SERIES_LABEL : HIDE_SERIES_LABEL}
              </EuiContextMenuItem>,
              <EuiContextMenuItem
                key="copySeries"
                icon="copy"
                onClick={copySeries}
                aria-label={COPY_SERIES_LABEL}
              >
                {COPY_SERIES_LABEL}
              </EuiContextMenuItem>,
              <EuiContextMenuItem
                key="deleteSeries"
                icon="trash"
                onClick={onRemoveSeriesClick}
                aria-label={DELETE_SERIES_LABEL}
                disabled={deleteDisabled}
                toolTipContent={deleteDisabled ? DELETE_SERIES_TOOLTIP_LABEL : ''}
              >
                {DELETE_SERIES_LABEL}
              </EuiContextMenuItem>,
            ]}
          />
        </EuiPopover>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

const EDIT_SERIES_LABEL = i18n.translate('xpack.exploratoryView.seriesEditor.edit', {
  defaultMessage: 'Edit series',
});

const HIDE_SERIES_LABEL = i18n.translate('xpack.exploratoryView.seriesEditor.hide', {
  defaultMessage: 'Hide series',
});

const SHOW_SERIES_LABEL = i18n.translate('xpack.exploratoryView.seriesEditor.show', {
  defaultMessage: 'Show series',
});

const COPY_SERIES_LABEL = i18n.translate('xpack.exploratoryView.seriesEditor.clone', {
  defaultMessage: 'Duplicate series',
});

const DELETE_SERIES_LABEL = i18n.translate(
  'xpack.exploratoryView.expView.seriesEditor.removeSeries',
  {
    defaultMessage: 'Remove series',
  }
);

const DELETE_SERIES_TOOLTIP_LABEL = i18n.translate(
  'xpack.exploratoryView.expView.seriesEditor.removeSeriesDisabled',
  {
    defaultMessage:
      'Main series cannot be removed. Please remove all series below before you can remove this.',
  }
);

const VIEW_SAMPLE_DOCUMENTS_LABEL = i18n.translate(
  'xpack.exploratoryView.seriesEditor.sampleDocuments',
  {
    defaultMessage: 'View transaction in Discover',
  }
);

const POPOVER_BUTTON_LABEL = i18n.translate(
  'xpack.exploratoryView.seriesEditor.popoverButtonLabel',
  {
    defaultMessage: 'View series actions',
  }
);

const ACTIONS_CONTEXT_MENU_LABEL = i18n.translate(
  'xpack.exploratoryView.seriesEditor.actionsAriaContextLabel',
  {
    defaultMessage: 'Series actions list',
  }
);
