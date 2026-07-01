/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const PACKET_RATE_PROMPT = `
### Packet Rate Tests

Whenever you encounter below test conditions, it indicates conditions based on packet rate.

- com.q1labs.semsources.cre.tests.PacketRate

### Example of Packet Rate Tests

\`\`\`
<test name="com.q1labs.semsources.cre.tests.PacketRate">
  <text>when the source packet rate is greater than 1000 packets/second</text>
</test>
\`\`\`

### How to resolve Packet Rate Tests

Packet rate has 2 components:

1. Actual packet rate (Number of packets/Total event duration in seconds)
2. Qradar Direction of the network event. QRadar can have 4 values for this :
  - source
  - destination
  - local
  - remote


QRadar Direction differs from ECS network.direction field. Below is a mapping of QRadar Direction to ECS fields:

| Qradar Direction | ECS network direction |
| --- | --- |
| source | network direction is either outbound/egress. Also, we need to consider source packets fields|
| destination | network direction is either inbound/ingress. Also, we need to consider destination packets fields.|
| local | network direction is internal. We need to consider total packets fields. |
| remote | network direction is external. We need to consider total packets fields. |

`;
