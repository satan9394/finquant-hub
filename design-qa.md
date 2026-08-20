# Design QA — dashboard discovery and model dock

## Evidence

- Source visual truth: `C:\Users\Satanchen\.codex\attachments\9ab856b0-2014-4316-a333-1eaa500df0c5\image-1.png`
- Implementation: `http://127.0.0.1:5173/`
- Implementation screenshot: `E:\Code_file\Projects\finquant-hub\artifacts\design-qa\implementation-desktop-final.png`
- Mobile screenshots: `E:\Code_file\Projects\finquant-hub\artifacts\design-qa\implementation-mobile-final.png`, `E:\Code_file\Projects\finquant-hub\artifacts\design-qa\implementation-mobile-movers.png`
- Full comparison: `E:\Code_file\Projects\finquant-hub\artifacts\design-qa\comparison-side-by-side.png`
- Focused model comparison: `E:\Code_file\Projects\finquant-hub\artifacts\design-qa\comparison-model-dock.png`
- Desktop viewport: 2048 × 1016 CSS px. Mobile viewport: 390 × 844 CSS px.
- Source pixels: 2559 × 1264. Implementation pixels: 2033 × 1009. The source was bicubic-normalized to 2033 × 1009 before the side-by-side comparison; both comparison halves therefore use the same pixel dimensions and density.
- State: local Docker, local mode, light shell, dashboard route, empty portfolio/watchlist, real Tencent technology-pool snapshot because the EastMoney full-market endpoint was unavailable.

## Full-view comparison

The final screen retains the source hierarchy, light application shell, dark data-center surface, cyan grid treatment, four primary metrics, live table/map split, and A-share red-up/green-down semantics. The new market-discovery surface is intentionally added immediately below the existing overview and uses the same dark finance tokens, border rhythm, typography stack, and data provenance language.

The final sidebar is narrower than the source capture because it follows the current ProLayout shell at 220 px. This is an intentional product constraint rather than fidelity drift; menu labels remain readable and the redesigned model dock now stays within the sidebar boundary.

## Focused comparison

The focused comparison shows the source's horizontally overflowing model label/select/theme row against the final two-level model dock. The final dock keeps the selected model readable, truncates only provider metadata, separates utility controls, and opens the dropdown upward. Browser measurements confirm a 95.75 px interactive input width, a 172.61 px dock, dock right edge 195.60 px, and sidebar right edge 220.00 px.

## Required fidelity surfaces

- Fonts and typography: existing system/Chinese fallback stack retained; the model name has a clear primary weight, provider/model ID uses compact monospace metadata, and long values truncate without wrapping into controls.
- Spacing and layout rhythm: dashboard section gaps, dark-panel padding, metric grid, and 14 px radii remain consistent. Desktop has no horizontal overflow. Mobile uses a single-column discovery grid and a compact one-row header.
- Colors and visual tokens: the source cyan/navy dashboard palette is preserved. Gains are red and losses green per A-share convention. Cache/error states use Ant Design semantic alerts.
- Image quality and assets: no target raster illustration was replaced. The map continues to use the installed China GeoJSON with ECharts; all utility actions use the existing Ant Design icon family.
- Copy and content: the discovery copy tells users what to do next, names the active data scope, and distinguishes full-market EastMoney data from the Tencent/Tech_Stock_Monitor fallback without fabricating coverage.
- Accessibility and interaction: semantic region/heading labels, named refresh/add controls, disabled duplicate-add state, keyboard-selectable model control, and reduced-motion support remain present.

## Comparison history

1. P1 — sidebar actions overflowed the persistent navigation boundary.
   - Fix: grouped actions into a two-row sidebar footer and set the sidebar to 220 px.
   - Post-fix evidence: iteration-2 screenshot and measured dock right edge below sidebar right edge.
2. P1 — provider metadata reduced the model input to roughly 4 px.
   - Fix: changed the model content to vertical hierarchy; the selector now receives the full content width.
   - Post-fix evidence: final focused comparison and 95.75 px measured input width.
3. P1 — the bottom-mounted model dropdown opened below the viewport and was not operable.
   - Fix: set the Select placement to `topLeft`; DeepSeek Pro and DeepSeek Flash were switched and restored in the browser.
4. P2 — the desktop sidebar footer became a clipped two-row header at 390 px.
   - Fix: added a compact mobile action layout, hiding secondary metadata while keeping model, notification, and theme controls available.
   - Post-fix evidence: `implementation-mobile-final.png`; document scroll width 377 px at a 390 px viewport.
5. P1 — repeated upstream requests triggered EastMoney connection resets and empty discovery states.
   - Fix: added a 60-second snapshot cache, explicit stale-state labeling, browser-like provider headers, sequential tail requests, and a real Tencent quote fallback over the Tech_Stock_Monitor technology pool.
   - Post-fix evidence: six rendered discovery candidates, successful add/analyze/remove interaction, no warning state, and no browser console errors.

## Residual P3 polish

- The dashboard entry chunk remains large because ECharts and existing dashboard visualizations share one lazy route; a later bundle-only task could split the mover chart without changing the UX.
- The technology-pool fallback is intentionally narrower than a full A-share ranking. The UI states this explicitly; expanding the universe should be a separate data-product decision.

## Verification

- Primary interactions: refresh, add to watchlist, duplicate-add disabled state, open `/analysis/sz300476`, back navigation, remove test watchlist item, switch model to DeepSeek Pro, and restore DeepSeek Flash.
- Desktop and mobile responsive checks completed.
- Browser console errors/warnings: none in final state.
- Final Docker state: backend and frontend healthy on the local stack.

final result: passed
