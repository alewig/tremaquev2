# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Shopify theme (WIG variant of Dawn v15.3.0) for Tremaque, a Brazilian e-commerce store. It is a **zero-build theme** — no npm, webpack, or transpilation step. Files are served directly by Shopify.

## Shopify CLI Commands

```bash
# Start local development (sync to store)
shopify theme dev

# Push changes to store
shopify theme push

# Pull latest from store
shopify theme pull

# Check theme for errors
shopify theme check
```

There is no `package.json`, no lint command, and no test runner.

## Architecture

### File Organization

| Directory | Purpose |
|-----------|---------|
| `assets/` | JS, CSS, SVGs, images — all served flat, no subdirectories |
| `sections/` | Liquid section files (with paired JSON schema) |
| `snippets/` | Reusable Liquid partials |
| `layout/` | `theme.liquid` (main shell), `password.liquid` |
| `config/` | `settings_schema.json` (theme customizer UI), `settings_data.json` |
| `templates/` | JSON templates mapping sections to page types |
| `locales/` | Translation JSON files (EN default, PT, ES, FR, DE, etc.) |

### JavaScript Architecture

JavaScript uses native **Web Components** (`customElements.define`) and a **pub/sub event bus** for cross-component communication. There is no bundler or module system — scripts are loaded via `<script>` tags in `theme.liquid`.

**Core files loaded globally:**
- `assets/pubsub.js` — Event bus (`publish`, `subscribe`)
- `assets/constants.js` — Shared event names and debounce timers
- `assets/global.js` — Base utilities, section rendering API wrappers
- `assets/component.js` — Base class with ref management and mutation observers

**Key event names** (from `constants.js`): `cartUpdate`, `quantityUpdate`, `variantChange`, `cartError`, `optionValueSelectionChange`

**Component pattern:**
```js
class MyComponent extends HTMLElement {
  connectedCallback() { /* init */ }
}
customElements.define('my-component', MyComponent);
```

### CSS Architecture

CSS files are paired with JS components using naming conventions:
- `component-*.css` — Reusable UI components (cart, menu, etc.)
- `section-*.css` — Section-specific styles
- `template-*.css` — Page-type styles
- `base.css` — Global base styles (~78KB)

CSS uses custom properties extensively. No preprocessor.

### Cart & Shipping Features

The theme has custom Brazilian e-commerce logic:
- **Frenet shipping integration** — shipping quote calculation in the cart (see `cart.js`, `cart-discount.js`, `cart-discount-cart.js`)
- **Cart shipping widget** — hydrated from live cart data via Shopify AJAX API
- Shipping calculator normalizes product dimensions for Frenet API

### Type Safety

`jsconfig.json` enables TypeScript checking on JS files:
- Target: ES2020
- Path alias: `@theme/*` → `assets/`
- Global types defined in `assets/global.d.ts` (`Shopify`, `Theme` interfaces)

### Shopify Section Rendering API

Components use Shopify's Section Rendering API to update parts of the page without full reload. Pattern: POST to `/?sections=section-id`, then swap innerHTML of target elements.

## Important Patterns

- **No `innerHTML` from untrusted sources** — XSS risk; always sanitize or use Liquid-rendered HTML
- **Debounce** cart/search updates using constants from `constants.js`
- **pub/sub** for decoupled communication between cart, product form, and variant picker
- Liquid templates use `render` tag (not `include`) for snippets
- Section schema JSON is embedded at the bottom of each `.liquid` section file
