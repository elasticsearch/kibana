/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * A column can fail to rank for two very different reasons, and the fix differs:
 *
 *  - **Judge noise**: judges disagree per cell by more than the models differ.
 *    Harmonising or ensembling judges helps.
 *  - **Rubric saturation**: judges agree almost perfectly, but the rubric puts
 *    nearly every model at the ceiling. No amount of rejudging helps; the rubric
 *    cannot express the differences being asked of it.
 *
 * Reporting "not rankable" without saying which one is actively misleading: it
 * invites a rejudge that cannot possibly work. This measures both.
 */

export interface SaturationInput {
  /** Score keyed by judge, for one (model, example, evaluator) cell. */
  cells: Array<{ modelId: string; cellKey: string; scoresByJudge: Record<string, number> }>;
  /** Highest score the rubric can award; scores at this value are saturated. */
  ceiling: number;
  /** How close to the ceiling still counts as saturated. */
  tolerance?: number;
}

export interface SaturationReport {
  cellCount: number;
  modelCount: number;
  judgeCount: number;
  /** Fraction of all (cell, judge) scores sitting at the ceiling. */
  ceilingShare: number;
  /** Models whose ensemble mean is within `tolerance` of the ceiling. */
  saturatedModels: number;
  /** Mean per-cell disagreement between judges (max - min). */
  judgeSpread: number;
  /** Spread of ensemble means across models (max - min). */
  modelSpread: number;
  /**
   * `saturation` when the rubric ceiling is the binding constraint,
   * `judge-noise` when disagreement exceeds the model differences,
   * `none` when the column can support a ranking.
   */
  limitingFactor: 'saturation' | 'judge-noise' | 'none';
  /** Plain-language statement of what would actually change the outcome. */
  verdict: string;
}

export function analyzeSaturation({
  cells,
  ceiling,
  tolerance = 0.02,
}: SaturationInput): SaturationReport {
  if (cells.length === 0) {
    throw new Error('analyzeSaturation requires at least one cell; refusing to report on nothing.');
  }

  const judges = [...new Set(cells.flatMap((c) => Object.keys(c.scoresByJudge)))];
  const scores = cells.flatMap((c) => Object.values(c.scoresByJudge));
  const atCeiling = scores.filter((s) => Math.abs(s - ceiling) <= Number.EPSILON).length;

  const spreads = cells.map((c) => {
    const v = Object.values(c.scoresByJudge);
    return Math.max(...v) - Math.min(...v);
  });
  const judgeSpread = mean(spreads);

  const byModel = new Map<string, number[]>();
  for (const cell of cells) {
    const ensemble = mean(Object.values(cell.scoresByJudge));
    byModel.set(cell.modelId, [...(byModel.get(cell.modelId) ?? []), ensemble]);
  }
  const modelMeans = [...byModel.values()].map(mean);
  const modelSpread = Math.max(...modelMeans) - Math.min(...modelMeans);
  const saturatedModels = modelMeans.filter((m) => m >= ceiling - tolerance).length;

  const saturatedShare = saturatedModels / byModel.size;
  // Saturation is judged first: when most models sit at the ceiling, the judges
  // can agree perfectly and the column still cannot rank.
  const limitingFactor: SaturationReport['limitingFactor'] =
    saturatedShare >= 0.5 ? 'saturation' : judgeSpread >= modelSpread ? 'judge-noise' : 'none';

  const verdict =
    limitingFactor === 'saturation'
      ? `${saturatedModels}/${byModel.size} models sit within ${tolerance} of the ${ceiling} ceiling ` +
        `while judges disagree by only ${judgeSpread.toFixed(
          3
        )} per cell. The rubric, not the judge, ` +
        `is the binding constraint -- rejudging cannot separate these models, and a harder or ` +
        `finer-grained rubric is the only thing that would.`
      : limitingFactor === 'judge-noise'
      ? `Judges disagree by ${judgeSpread.toFixed(3)} per cell against a model spread of ` +
        `${modelSpread.toFixed(3)}. Judge noise dominates the differences being measured, so ` +
        `harmonising or ensembling judges is what would make this column rankable.`
      : `Judge spread ${judgeSpread.toFixed(3)} is below the model spread ${modelSpread.toFixed(
          3
        )} ` + `and only ${saturatedModels}/${byModel.size} models are near the ceiling.`;

  return {
    cellCount: cells.length,
    modelCount: byModel.size,
    judgeCount: judges.length,
    ceilingShare: atCeiling / scores.length,
    saturatedModels,
    judgeSpread,
    modelSpread,
    limitingFactor,
    verdict,
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
