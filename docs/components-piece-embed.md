# ComponentsPiece embed snippet (smartcatalogue.uk + clubmadeira.uk)

**Repos:** SimonBarnett/a-search
**Locks:** FR-221 (#1226), FR-232 snippet shape (#1346)
**Sites:** smartcatalogue.uk (partners) and clubmadeira.uk (clubs) paste the
same template from their copy pages (FR-219 / FR-220).

## Snippet (no host)

```html
<div class="a-search-widget" data-widget-guid="{widgetGuid}" data-mode="{layout}"></div>
<script src="https://cdn.smartcatalogue.uk/a-search-widget.js" async></script>
```

- Do **not** put the shop or club host in the snippet.
- At runtime the loader reads `location.host` and `data-widget-guid`.
- `location.pathname` is diagnostics only (not the widget key).

## Self-config

See `shared/widgets/placement.js` and `widget/a-search-widget.js` (FR-221).
Parts paging stays FR-201.
