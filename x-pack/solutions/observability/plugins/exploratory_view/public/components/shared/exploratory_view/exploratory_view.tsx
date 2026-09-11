/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import styled from '@emotion/styled';
import {
  EuiButtonEmpty,
  EuiPageSection,
  EuiResizableContainer,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import type { PanelDirection } from '@elastic/eui/src/components/resizable_container/types';
import { AppHeader } from '@kbn/app-header';
import type { TypedLensByValueInput } from '@kbn/lens-plugin/public';
import { useKibana } from './hooks/use_kibana';
import { useSeriesStorage } from './hooks/use_series_storage';
import { useLensAttributes } from './hooks/use_lens_attributes';
import { useAppDataViewContext } from './hooks/use_app_data_view';
import { SeriesViews } from './views/series_views';
import { LensEmbeddable } from './lens_embeddable';
import { EmptyView } from './components/empty_view';
import { useExpViewTimeRange } from './hooks/use_time_range';
import { useExploratoryView } from './contexts/exploratory_view_config';
import { AddToCaseAction } from './header/add_to_case_action';
import { EmbedModal } from './header/embed_action';
import { LastUpdated } from './header/last_updated';
import { RefreshButton } from './header/refresh_button';
import { useExploratoryViewAppHeaderMenu } from './header/use_exploratory_view_app_header_menu';

export type PanelId = 'seriesPanel' | 'chartPanel';

export const PAGE_TITLE = i18n.translate('xpack.exploratoryView.expView.heading.label', {
  defaultMessage: 'Explore data',
});

export function ExploratoryView({
  saveAttributes,
}: {
  saveAttributes?: (attr: TypedLensByValueInput['attributes'] | null) => void;
}) {
  const {
    services: { lens, isDev },
  } = useKibana();
  const seriesBuilderRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [height, setHeight] = useState<string>('100vh');

  const { isEditMode } = useExploratoryView();

  const [lensAttributes, setLensAttributes] = useState<TypedLensByValueInput['attributes'] | null>(
    null
  );

  const { loadDataView, loading } = useAppDataViewContext();

  const { firstSeries, allSeries, lastRefresh, reportType, setChartTimeRangeContext } =
    useSeriesStorage();

  const lensAttributesT = useLensAttributes();
  const timeRange = useExpViewTimeRange();

  const setHeightOffset = () => {
    if (seriesBuilderRef?.current && wrapperRef.current) {
      const headerOffset = wrapperRef.current.getBoundingClientRect().top;
      setHeight(`calc(100vh - ${headerOffset + 40}px)`);
    }
  };

  useEffect(() => {
    allSeries.forEach((seriesT) => {
      loadDataView({
        dataType: seriesT.dataType,
      });
    });
  }, [allSeries, loadDataView]);

  useEffect(() => {
    setLensAttributes(lensAttributesT);
    if (saveAttributes) {
      saveAttributes(lensAttributesT);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(lensAttributesT ?? {}), lastRefresh]);

  useEffect(() => {
    setHeightOffset();
  });

  const collapseFn = useRef<(id: PanelId, direction: PanelDirection) => void>();

  const [hiddenPanel, setHiddenPanel] = useState('');

  const onCollapse = (panelId: string) => {
    setHiddenPanel((prevState) => (panelId === prevState ? '' : panelId));
  };

  const onChange = (panelId: PanelId) => {
    onCollapse(panelId);
    if (collapseFn.current) {
      collapseFn.current(panelId, panelId === 'seriesPanel' ? 'right' : 'left');
    }
  };

  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [isEmbedOpen, setIsEmbedOpen] = useState(false);
  const [isCasesOpen, setIsCasesOpen] = useState(false);

  const canUseEditor = Boolean(lens?.canUseEditor());
  const hasLensAttributes = lensAttributes !== null;

  const onSave = useCallback(() => {
    if (hasLensAttributes) {
      setIsSaveOpen(true);
    }
  }, [hasLensAttributes]);

  const onOpenInLens = useCallback(() => {
    if (lensAttributes) {
      lens.navigateToPrefilledEditor(
        {
          id: '',
          time_range: timeRange,
          attributes: lensAttributes,
        },
        {
          openInNewTab: true,
        }
      );
    }
  }, [lens, lensAttributes, timeRange]);

  const onAddToCase = useCallback(() => {
    if (hasLensAttributes && timeRange) {
      setIsCasesOpen(true);
    }
  }, [hasLensAttributes, timeRange]);

  const onEmbed = useCallback(() => {
    if (hasLensAttributes) {
      setIsEmbedOpen(true);
    }
  }, [hasLensAttributes]);

  const menu = useExploratoryViewAppHeaderMenu({
    canUseEditor,
    hasLensAttributes,
    hasTimeRange: Boolean(timeRange),
    isDev: Boolean(isDev),
    onSave,
    onOpenInLens,
    onAddToCase,
    onEmbed,
  });

  const LensSaveModalComponent = lens?.SaveModalComponent;

  return (
    <>
      <AppHeader title={PAGE_TITLE} menu={menu} />
      {timeRange && (
        <AddToCaseAction
          autoOpen={isCasesOpen}
          setAutoOpen={setIsCasesOpen}
          lensAttributes={lensAttributes}
          timeRange={timeRange}
        />
      )}
      <EmbedModal isOpen={isEmbedOpen} onClose={() => setIsEmbedOpen(false)} />
      {isSaveOpen && lensAttributes && LensSaveModalComponent && (
        <LensSaveModalComponent
          initialInput={{ attributes: lensAttributes }}
          onClose={() => setIsSaveOpen(false)}
          onSave={() => {}}
        />
      )}
      {lens ? (
        <EuiPageSection paddingSize="l" restrictWidth={false}>
          <EuiFlexGroup justifyContent="flexEnd" alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>
              <LastUpdated />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <RefreshButton />
            </EuiFlexItem>
          </EuiFlexGroup>
          <LensWrapper ref={wrapperRef} height={height}>
            <ResizableContainer direction="vertical" onToggleCollapsed={onCollapse}>
              {(EuiResizablePanel, _EuiResizableButton, { togglePanel }) => {
                collapseFn.current = (id, direction) => togglePanel?.(id, { direction });

                return (
                  <>
                    <EuiFlexGroup alignItems="center" gutterSize="none">
                      <EuiFlexItem grow={false}>
                        <EuiButtonEmpty
                          data-test-subj="o11yExploratoryViewButton"
                          size="xs"
                          {...(hiddenPanel === 'chartPanel'
                            ? { iconType: 'chevronSingleRight' }
                            : { iconType: 'chevronSingleDown' })}
                          onClick={() => onChange('chartPanel')}
                        >
                          {hiddenPanel === 'chartPanel' ? SHOW_CHART_LABEL : HIDE_CHART_LABEL}
                        </EuiButtonEmpty>
                      </EuiFlexItem>
                    </EuiFlexGroup>

                    <EuiResizablePanel
                      initialSize={isEditMode ? 40 : 60}
                      minSize={'30%'}
                      mode={'collapsible'}
                      id="chartPanel"
                      paddingSize="s"
                    >
                      {lensAttributes ? (
                        <LensEmbeddable
                          setChartTimeRangeContext={setChartTimeRangeContext}
                          lensAttributes={lensAttributes}
                        />
                      ) : (
                        <EmptyView series={firstSeries} loading={loading} reportType={reportType} />
                      )}
                    </EuiResizablePanel>

                    <EuiResizablePanel
                      initialSize={isEditMode ? 60 : 40}
                      minSize="10%"
                      mode={'main'}
                      id="seriesPanel"
                      color="subdued"
                      className="paddingTopSmall"
                    >
                      <SeriesViews
                        seriesBuilderRef={seriesBuilderRef}
                        onSeriesPanelCollapse={onChange}
                      />
                    </EuiResizablePanel>
                  </>
                );
              }}
            </ResizableContainer>
            {hiddenPanel === 'seriesPanel' && (
              <ShowPreview onClick={() => onChange('seriesPanel')} iconType="chevronSingleUp">
                {PREVIEW_LABEL}
              </ShowPreview>
            )}
          </LensWrapper>
        </EuiPageSection>
      ) : (
        <EuiPageSection paddingSize="l" restrictWidth={false}>
          <EuiTitle>
            <h2>{LENS_NOT_AVAILABLE}</h2>
          </EuiTitle>
        </EuiPageSection>
      )}
    </>
  );
}
const LensWrapper = styled.div<{ height: string }>`
  min-height: 400px;
  height: ${(props) => props.height};

  &&& > div {
    height: 100%;
  }
`;

const ResizableContainer = styled(EuiResizableContainer)`
  height: 100%;
  &&& .paddingTopSmall {
    padding-top: 8px;
  }
  #chartPanel {
    > .euiPanel {
      padding-bottom: 0;
      padding-top: 0;
    }
    .expExpressionRenderer__expression {
      padding-bottom: 0 !important;
      padding-top: 0 !important;
    }
  }
`;

const ShowPreview = styled(EuiButtonEmpty)`
  position: absolute;
  bottom: 34px;
`;

const PREVIEW_LABEL = i18n.translate('xpack.exploratoryView.preview', {
  defaultMessage: 'Preview',
});

const HIDE_CHART_LABEL = i18n.translate('xpack.exploratoryView.hideChart', {
  defaultMessage: 'Hide chart',
});

const SHOW_CHART_LABEL = i18n.translate('xpack.exploratoryView.showChart', {
  defaultMessage: 'Show chart',
});

const LENS_NOT_AVAILABLE = i18n.translate('xpack.exploratoryView.lensDisabled', {
  defaultMessage: 'Lens app is not available, please enable Lens to use exploratory view.',
});
