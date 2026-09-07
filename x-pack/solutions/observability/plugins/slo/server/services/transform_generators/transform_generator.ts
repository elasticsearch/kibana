/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  MappingRuntimeFields,
  TransformPutTransformRequest,
} from '@elastic/elasticsearch/lib/api/types';
import type { DataView, DataViewsService } from '@kbn/data-views-plugin/common';
import { ALL_VALUE, timeslicesBudgetingMethodSchema } from '@kbn/slo-schema';
import type { TransformSettings } from '../../assets/transform_templates/slo_transform_template';
import type { SLODefinition } from '../../domain/models';
import { getSloProjectRouting } from '../utils';

export abstract class TransformGenerator {
  constructor(
    protected spaceId: string,
    protected dataViewService: DataViewsService,
    protected isServerless: boolean = false,
    protected isCpsAvailable: boolean = false
  ) {}

  public abstract getTransformParams(slo: SLODefinition): Promise<TransformPutTransformRequest>;

  protected getProjectRouting(slo: SLODefinition): string | undefined {
    return getSloProjectRouting(slo.settings, {
      isServerless: this.isServerless,
      isCpsAvailable: this.isCpsAvailable,
    });
  }

  public buildCommonRuntimeMappings(dataView?: DataView): MappingRuntimeFields {
    return dataView?.getRuntimeMappings?.() ?? {};
  }

  public buildDescription(slo: SLODefinition): string {
    const prefix = 'Rolled-up SLI data for SLO: ';
    const suffix = ` [id: ${slo.id}, revision: ${slo.revision}]`;
    const maxNameLen = 1000 - prefix.length - suffix.length;
    const name = slo.name.length > maxNameLen ? slo.name.slice(0, maxNameLen) : slo.name;
    return `${prefix}${name}${suffix}`;
  }

  public buildCommonGroupBy(
    slo: SLODefinition,
    sourceIndexTimestampField: string | undefined = '@timestamp',
    extraGroupByFields = {}
  ) {
    let fixedInterval = '1m';
    if (timeslicesBudgetingMethodSchema.is(slo.budgetingMethod)) {
      fixedInterval = slo.objective.timesliceWindow!.format();
    }

    const groups = [slo.groupBy].flat().filter((group) => !!group);

    const groupings =
      !groups.includes(ALL_VALUE) && groups.length
        ? groups.reduce((acc, field) => {
            return {
              ...acc,
              [`slo.groupings.${field}`]: {
                terms: {
                  field,
                },
              },
            };
          }, {})
        : {};

    return {
      ...groupings,
      ...extraGroupByFields,
      // @timestamp field defined in the destination index
      '@timestamp': {
        date_histogram: {
          field: sourceIndexTimestampField, // timestamp field defined in the source index
          fixed_interval: fixedInterval,
        },
      },
    };
  }

  public async getIndicatorDataView(dataViewId?: string): Promise<DataView | undefined> {
    let dataView: DataView | undefined;
    if (dataViewId) {
      try {
        dataView = await this.dataViewService.get(dataViewId);
      } catch (e) {
        // If the data view is not found, we will continue without it
      }
    }
    return dataView;
  }

  public buildSettings(
    slo: SLODefinition,
    sourceIndexTimestampField: string | undefined = '@timestamp'
  ): TransformSettings {
    return {
      frequency: slo.settings.frequency.format(),
      sync_delay: slo.settings.syncDelay.format(),
      // 8.17: use settings.syncField if truthy or default to sourceIndexTimestampField which is the indicator timestampField
      sync_field: !!slo.settings.syncField ? slo.settings.syncField : sourceIndexTimestampField,
    };
  }
}
