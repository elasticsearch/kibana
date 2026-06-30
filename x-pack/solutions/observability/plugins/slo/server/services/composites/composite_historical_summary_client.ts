/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type {
  FetchCompositeHistoricalSummaryParams,
  FetchCompositeHistoricalSummaryResponse,
  FetchHistoricalSummaryParams,
  FetchHistoricalSummaryResponse,
  HistoricalSummaryResponse,
} from '@kbn/slo-schema';
import { ALL_VALUE } from '@kbn/slo-schema';
import { computeWeightedSli, NO_DATA } from '../../domain/services';
import type { CompositeSLODefinition, SLODefinition } from '../../domain/models';
import { toRichRollingTimeWindow } from '../../domain/models';
import type { CompositeSLORepository } from './composite_slo_repository';
import type { SLODefinitionRepository } from '../slo_definition_repository';
import { HistoricalSummaryClient } from '../historical_summary_client';

export interface HistoricalSummaryProvider {
  fetch(params: FetchHistoricalSummaryParams): Promise<FetchHistoricalSummaryResponse>;
}

export class CompositeHistoricalSummaryClient {
  private historicalSummaryProvider: HistoricalSummaryProvider;

  constructor(
    esClient: ElasticsearchClient,
    private compositeSloRepository: CompositeSLORepository,
    private sloDefinitionRepository: SLODefinitionRepository,
    spaceId: string,
    historicalSummaryProvider?: HistoricalSummaryProvider
  ) {
    this.historicalSummaryProvider =
      historicalSummaryProvider ?? new HistoricalSummaryClient(esClient, spaceId);
  }

  async fetch(
    params: FetchCompositeHistoricalSummaryParams
  ): Promise<FetchCompositeHistoricalSummaryResponse> {
    const compositeDefinitions = await this.compositeSloRepository.findAllByIds(params.list);

    const allMemberSloIds = [
      ...new Set(compositeDefinitions.flatMap((comp) => comp.members.map((m) => m.sloId))),
    ];
    const memberDefinitions = await this.sloDefinitionRepository.findAllByIds(allMemberSloIds);
    const memberDefMap = new Map(memberDefinitions.map((slo) => [slo.id, slo]));

    const results = await Promise.all(
      compositeDefinitions.map(async (composite) => {
        const memberHistoricalData = await this.fetchMemberHistoricalData(composite, memberDefMap);
        const data = this.computeWeightedHistorical(composite, memberHistoricalData);
        return { compositeId: composite.id, data };
      })
    );

    return results;
  }

  private async fetchMemberHistoricalData(
    composite: CompositeSLODefinition,
    memberDefMap: Map<string, SLODefinition>
  ) {
    const activeMembers = composite.members.filter((m) => memberDefMap.has(m.sloId));
    if (activeMembers.length === 0) return [];

    const richTimeWindow = toRichRollingTimeWindow(composite.timeWindow);

    const list = activeMembers.map((member) => {
      const slo = memberDefMap.get(member.sloId)!;
      return {
        sloId: slo.id,
        instanceId: member.instanceId ?? ALL_VALUE,
        timeWindow: richTimeWindow,
        budgetingMethod: slo.budgetingMethod,
        groupBy: slo.groupBy,
        revision: slo.revision,
        objective: slo.objective,
      };
    });

    const historicalData = await this.historicalSummaryProvider.fetch({ list });

    return activeMembers.map((member, idx) => ({
      member,
      data: historicalData[idx]?.data ?? [],
    }));
  }

  private computeWeightedHistorical(
    composite: CompositeSLODefinition,
    memberHistoricalData: Array<{
      member: { sloId: string; weight: number; instanceId?: string };
      data: HistoricalSummaryResponse[];
    }>
  ): HistoricalSummaryResponse[] {
    if (memberHistoricalData.length === 0) return [];

    const dateSet = new Set<string>();
    for (const { data } of memberHistoricalData) {
      for (const point of data) {
        dateSet.add(point.date);
      }
    }
    const sortedDates = [...dateSet].sort();

    const memberDataByDate = memberHistoricalData.map(({ member, data }) => {
      const byDate = new Map(data.map((d) => [d.date, d]));
      return { member, byDate };
    });

    return sortedDates.map((date) => {
      const dataPoints = memberDataByDate.map(({ member, byDate }) => {
        const point = byDate.get(date);
        const sliValue =
          !point || point.status === 'NO_DATA' || point.sliValue === NO_DATA
            ? NO_DATA
            : point.sliValue;
        return { weight: member.weight, sliValue };
      });

      const { sliValue, errorBudget, status } = computeWeightedSli(dataPoints, composite.objective);

      return { date, sliValue, errorBudget, status };
    });
  }
}
