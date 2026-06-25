/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import useAsync from 'react-use/lib/useAsync';
import { getEsqlDataView } from '@kbn/discover-utils';
import type { HttpStart } from '@kbn/core-http-browser';
import type { DataViewsContract, RuntimeField } from '@kbn/data-views-plugin/public';
import { useMemo } from 'react';
import type { SerializedFieldFormat } from '@kbn/field-formats-plugin/common';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/public';
import { buildEpisodesBaseQuery } from '../queries/episodes_query';
import * as i18n from './translations';
import { useSpaceId } from './use_space_id';

export interface UseAlertingEpisodesDataViewOptions {
  services: {
    dataViews: DataViewsContract;
    http: HttpStart;
    spaces: SpacesPluginStart;
  };
}

export interface KnownFieldOverrides {
  customLabel?: string;
  format?: Partial<SerializedFieldFormat>;
}

const knownFieldsOverrides: Record<string, KnownFieldOverrides> = {
  'rule.id': {
    customLabel: i18n.RULE_FIELD_LABEL,
  },
  'episode.status': {
    customLabel: i18n.STATUS_FIELD_LABEL,
  },
  severity: {
    customLabel: i18n.SEVERITY_FIELD_LABEL,
  },
};

const computedFields: Record<string, RuntimeField> = {
  duration: {
    type: 'long',
    customLabel: i18n.DURATION_FIELD_LABEL,
    format: {
      id: 'duration',
      params: {
        includeSpaceWithSuffix: true,
        inputFormat: 'milliseconds',
        outputFormat: 'humanizePrecise',
        outputPrecision: 0,
        useShortSuffix: true,
      },
    },
  },
  assignees: {
    type: 'keyword',
    script: { source: "emit('')" },
    customLabel: i18n.ASSIGNEES_FIELD_LABEL,
  },
};

/**
 * Creates an ad-hoc data view for the alerting episodes query, enriching
 * known fields with display names and value formats.
 */
export const useAlertingEpisodesDataView = ({ services }: UseAlertingEpisodesDataViewOptions) => {
  const spaceId = useSpaceId(services.spaces);
  const query = buildEpisodesBaseQuery(spaceId).print('basic');

  const dataViewAsync = useAsync(
    () => getEsqlDataView({ esql: query }, undefined, services),
    [query, services]
  );

  return useMemo(() => {
    const dataView = dataViewAsync.value;
    if (dataView) {
      dataView.fields.forEach((field) => {
        const knownFieldOverrides =
          knownFieldsOverrides[field.name as keyof typeof knownFieldsOverrides];
        if (knownFieldOverrides?.customLabel) {
          dataView.setFieldCustomLabel(field.name, knownFieldOverrides.customLabel);
        }
        if (knownFieldOverrides?.format) {
          dataView.setFieldFormat(field.name, knownFieldOverrides.format);
        }
      });
      Object.entries(computedFields).map(([name, overrides]) => {
        dataView.addRuntimeField(name, {
          ...overrides,
        });
      });
    }
    return dataView;
  }, [dataViewAsync.value]);
};
