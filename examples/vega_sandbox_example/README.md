# Vega sandbox example

Start Kibana with `yarn start --run-examples`, open **Developer Examples → Vega sandbox**,
and click **Render**. The opaque iframe draws an inline Vega-Lite bar chart; hover a bar for a
tooltip. Inbound and
outbound protocol messages show in one comment list. Click **Render filter example**, then
click a bar. The spec posts `applyFilter` (`kibanaAddFilter`); this page filters the inline
data and sends a new `render`. It does not use Kibana Filter Manager. **Resize** toggles
the iframe height and posts `resize` (no outbound `rendered`). **Reset** reloads the iframe
and clears the log.
Each `render` includes a `renderId`; matching outbound `rendered` is the completion signal PNG
and PDF reporting wait on. The isolation probe should report an opaque origin
(`window.origin === 'null'`). This playground is not the production visTypeVega host.
