/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const FLOW_BIAS_PROMPT = `

### Flow Bias

#### How to identify Flow Bias tests:

- Flow Bias tests can be extracted from test conditions "com.q1labs.semsources.cre.tests.FlowBiasTest"

#### Currently Elastic does not have a way to handle Flow Bias. Don't include it in Flattened detection logic but make sure to include this reasoning in the notes at the end of the description.

`;
