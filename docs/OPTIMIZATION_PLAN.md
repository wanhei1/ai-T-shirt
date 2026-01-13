# Canvas & Store Optimization Plan

## Goals
- Replace rectangular design canvas with the provided T-shirt SVG silhouette plus a centered dashed print area that clips overflowing content.
- Persist full garment canvas state (front/back, print area, snapshots) into orders and a new all-designs table; keep preview and shop views consistent.
- Add a homepage showcase and shop improvements so users can browse and order designs stored in the all-designs table.

## Scope & Acceptance Criteria
1) **Editor canvas redesign**
- Use the supplied SVG path as the shirt outline background; keep aspect ratio responsive.
- Add a centered dashed print area with `overflow: hidden`; any element overflow is visually clipped.
- Define shared canvas meta (e.g., `width`, `height`, `printArea { x, y, width, height }`, `backgroundColor`) and reuse between editor/preview.
- Element dragging/resizing/rotation is constrained to the print area bounds.
- Saving to localStorage includes `canvas` meta and front/back elements.

2) **Preview & ordering persistence**
- Preview renders the same shirt outline + clipped print area for both front/back.
- When placing an order from preview: generate front/back snapshots (data URLs) based on design data; send `publishToAll: true`, `canvas: { frontSnapshot, backSnapshot, meta }`, and `design` payload to backend.
- Order submission still works when snapshots are absent (fallback to JSON only).

3) **Database & API changes**
- Extend `orders` table with `canvas_front TEXT`, `canvas_back TEXT`, `canvas_meta JSONB`, `source_all_id INTEGER`.
- Create `all_designs` table to mirror design storage for the mall: `id`, `user_id`, `source_order_id`, `selections JSONB`, `design JSONB`, `canvas_front TEXT`, `canvas_back TEXT`, `canvas_meta JSONB`, timestamps.
- /api/orders accepts extra fields: `publishToAll` (default true), `sourceAllId` (when ordering from shop), and `canvas` (snapshots + meta).
- Order creation: always insert into `orders`; when `publishToAll` is true, also insert into `all_designs` (link back to the order) and return the created all-design id.
- Gallery endpoints (/api/gallery, /api/gallery/:id) read from `all_designs` instead of `orders`.

4) **Homepage showcase**
- Add a signed-in user "My Designs" section showing front snapshots from their orders; clicking opens a detail view with front/back.
- Implement horizontal auto-scrolling (infinite loop style) of the design cards; graceful fallback if user has no orders.
- Keep an explicit "商城" (Shop) entry button.

5) **Shop experience**
- Shop list/detail uses data from `all_designs`, preferring `canvas_front`/`canvas_back` snapshots; fall back to first image element when missing.
- Shop purchase calls /api/orders with `publishToAll: false` and `sourceAllId` set to the selected all-design id; resulting order appears in the user’s orders list.
- "Customize same" continues to load `design` data into the editor.

6) **Data contract (frontend → backend)**
- Standard order payload:
  ```json
  {
    "total": 0,
    "items": [/* raw elements array */],
    "selections": {},
    "design": {
      "selections": {},
      "elements": [],
      "sides": { "front": [], "back": [] },
      "canvas": { "width": 0, "height": 0, "printArea": { "x": 0, "y": 0, "width": 0, "height": 0 }, "backgroundColor": "#fff", "snapshots": { "front": "data:image/png...", "back": "data:image/png..." } }
    },
    "canvas": { "frontSnapshot": "...", "backSnapshot": "...", "meta": { /* same as design.canvas minus snapshots */ } },
    "publishToAll": true,
    "sourceAllId": null,
    "shipping_info": {}
  }
  ```
- Backend responses include `order` plus optional `{ allDesignId }` when inserted into `all_designs`.

7) **Testing checklist**
- Editor: drag/resize/rotate stays inside dashed print area; overflow is clipped; zoom still works.
- Preview: front/back toggles; snapshots generated; order submits successfully when logged in.
- DB: tables/columns created on startup without breaking existing data.
- Gallery/Shop: lists come from `all_designs`; detail purchase inserts only into `orders`; preview purchase inserts into both tables.
- Homepage: authenticated user sees auto-scrolling designs or empty state; shop entry navigates correctly.
