# webhook rule type

This rule type will send an HTTP request to a server to evaluate the rule, 
returning the alerts to generate.

url supporting this webhook structure:

- https://kibana-webhook-alerting-rule-poc-2025.glitch.me/webhook-rules

source code for the webhook:

- https://glitch.com/edit/#!/kibana-webhook-alerting-rule-poc-2025

## create a rule in DevTools

```json
POST kbn:/api/alerting/rule
{
  "rule_type_id": ".webhook",
  "name": "webhook rule",
  "schedule": { "interval": "10s" },
  "params": {
    "url": "https://kibana-webhook-alerting-rule-poc-2025.glitch.me/webhook-rule",
    "method": "POST",
    "headers": {},
    "body": "{}"
  },
  "consumer": "alerts",
  "actions": []
}
```