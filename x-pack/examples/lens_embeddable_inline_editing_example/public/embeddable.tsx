/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type {
  TypedLensByValueInput,
  InlineEditLensEmbeddableContext,
} from '@kbn/lens-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { i18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiPanel,
  EuiButtonIcon,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import type { LensConfigBuilder } from '@kbn/lens-embeddable-utils';
import type { StartDependencies } from './plugin';
import { getConfigOptions } from './utils';

export const LensChart = (props: {
  configBuilder: LensConfigBuilder;
  plugins: StartDependencies;
  defaultDataView: DataView;
  isESQL?: boolean;
  container?: HTMLElement | null;
  isActive?: boolean;
  setPanelActive?: (panelNum: number | null) => void;
  setIsinlineEditingVisible?: (flag: boolean) => void;
  onApplyCb?: () => void;
  onCancelCb?: () => void;
}) => {
  const ref = useRef(false);
  const [embeddableInput, setEmbeddableInput] = useState<TypedLensByValueInput | undefined>(
    undefined
  );
  const [lensLoadEvent, setLensLoadEvent] = useState<
    InlineEditLensEmbeddableContext['lensEvent'] | null
  >(null);

  const { config, options } = useMemo(() => {
    return getConfigOptions(props.defaultDataView, props.isESQL);
  }, [props.defaultDataView, props.isESQL]);

  useEffect(() => {
    ref.current = true;
    props.configBuilder.build(config, options).then((input) => {
      if (ref.current) {
        setEmbeddableInput(input as TypedLensByValueInput);
      }
    });
    return () => {
      ref.current = false;
    };
  }, [config, props.configBuilder, options, props.plugins.dataViews]);

  const onLoad = useCallback(
    (
      isLoading: boolean,
      adapters: InlineEditLensEmbeddableContext['lensEvent']['adapters'] | undefined,
      dataLoading$?: InlineEditLensEmbeddableContext['lensEvent']['dataLoading$']
    ) => {
      const adapterTables = adapters?.tables?.tables;
      if (adapterTables && !isLoading) {
        setLensLoadEvent({
          adapters,
          dataLoading$,
        });
      }
    },
    []
  );

  const triggerOptions: InlineEditLensEmbeddableContext | undefined = useMemo(() => {
    if (lensLoadEvent && embeddableInput?.attributes) {
      return {
        attributes: embeddableInput?.attributes,
        lensEvent: lensLoadEvent,
        onUpdate: (newAttributes: TypedLensByValueInput['attributes']) => {
          if (embeddableInput) {
            const newInput = {
              ...embeddableInput,
              attributes: newAttributes,
            };
            setEmbeddableInput(newInput);
          }
        },
        onApply: () => {
          'optional onApply callback!';
          props.onApplyCb?.();
          props.setPanelActive?.(null);
        },
        onCancel: () => {
          'optional onCancel callback!';
          props.onCancelCb?.();
          props.setPanelActive?.(null);
        },
        container: props.container,
      };
    }
  }, [embeddableInput, lensLoadEvent, props]);
  const LensComponent = props.plugins.lens.EmbeddableComponent;

  const editChartLabel = i18n.translate('lensChart.editButton.ariaLabel', {
    defaultMessage: 'Edit chart',
  });

  return (
    <EuiPanel
      hasBorder={!props.container}
      hasShadow={false}
      css={css`
        opacity: ${props.isActive ? '1' : '0.25'};
        pointer-events: ${props.isActive ? 'all' : 'none'};
      `}
    >
      <EuiTitle
        size="xs"
        css={css`
          text-align: center;
        `}
      >
        <h3>
          {props.isESQL
            ? '#1: Inline editing of an ES|QL chart.'
            : '#2: Inline editing of a dataview chart.'}
        </h3>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGroup direction="column" gutterSize="none">
        <EuiFlexItem
          grow={false}
          css={css`
            align-self: flex-end;
          `}
        >
          <EuiToolTip content={editChartLabel} disableScreenReaderOutput>
            <EuiButtonIcon
              size="xs"
              iconType="pencil"
              aria-label={editChartLabel}
              onClick={() => {
                props?.setPanelActive?.(props.isESQL ? 1 : 2);
                if (triggerOptions) {
                  props.plugins.uiActions.executeTriggerActions(
                    'IN_APP_EMBEDDABLE_EDIT_TRIGGER',
                    triggerOptions
                  );
                  props?.setIsinlineEditingVisible?.(true);
                }
              }}
            />
          </EuiToolTip>
        </EuiFlexItem>
        <EuiFlexItem>
          {embeddableInput && (
            <LensComponent style={{ height: 500 }} {...embeddableInput} onLoad={onLoad} />
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
