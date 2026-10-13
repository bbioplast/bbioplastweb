# B&B Bioplast Tech

Thai industrial automation website and quotation-first commerce system.

## Run and validate
Requires Node.js 24. Run `npm start`, `npm run check`, and `npm test`.
Local storage defaults to `data/commerce.sqlite`. Use a separate DATA_DIR for testing.

## Production
Railway uses one replica with a persistent volume mounted at /data. Set DATA_DIR=/data, NODE_ENV=production, PUBLIC_ORIGIN to the exact HTTPS site origin, and ADMIN_EMAIL to the designated owner. The server refuses production startup without a Railway volume. /health checks the database.

For first setup, generate a cryptographically random 32-byte token, set ADMIN_SETUP_HASH to its SHA-256 hex digest and ADMIN_SETUP_EXPIRES to an expiry timestamp in milliseconds. Give the owner /admin#setup=<token> privately. The owner creates their own password; setup is disabled permanently once an admin exists. Never commit the raw token or database. Use Railway volume backups and keep downloaded exports private. JSON exports contain business data but are not full database restore files.

## Workflow
- /shop: select products or specify a custom model, submit a quotation request and retain the private tracking link.
- /admin: manage products, categories, stock, quotation prices/expiry, order fulfilment, tracking, and data export.
- /quote#<token>: customer checks prices and confirms an order. Stock is reserved atomically on confirmation and restored on cancellation before shipping.
- Admins manually share tracking links through their own LINE/email. Creating a new link invalidates the previous one.
- No automated email, payment gateway, tax invoice, or payment reconciliation is configured. State tax and payment terms explicitly in each quotation.

Initial catalog: 14 real categories and one verified model, Suction Pad 10C-1N. Prices and stock remain unspecified until entered by the owner. Other models can be requested as custom items. Marketing content on the home page is sourced separately from bbioplast.com; see CONTENT-SOURCES.md.

## Popular products
In `/admin`, edit a product and enable “แสดงในสินค้ายอดนิยม”. Active selected products appear on the home page (up to four, sorted by name) and in the `/shop?popular=1` filter. Cards link directly to the matching SKU in the quotation flow. Selection is curated by staff, not calculated from sales. No products are selected automatically; the home section stays hidden until a product is selected. The additive SQLite migration defaults existing products to unselected and preserves catalog, stock and quotations.

## Security and checks
Passwords use salted scrypt; session tokens and customer links are stored hashed. Admin mutations require a session, same-origin request and CSRF token. Quotation acceptance checks expiry/version and inventory in a database transaction. Tests cover authentication, authorization, idempotency, price tampering, stock reservations/cancellation and persistence across restart.

## Blog
`/blog` lists published articles and `/blog/:slug` opens an article. In `/admin`, use “บทความ / Blog” to write, preview, edit, publish, revert to draft, or archive posts. Archived posts are recoverable by changing their status. Posts live in the existing persistent SQLite database and are included in admin JSON exports. There are no seeded production articles.

The editor supports plain text, # / ## / ### headings, paragraph breaks and - bullet lists. Raw HTML is escaped. Cover images use HTTPS URLs. Slugs use lowercase ASCII letters, digits and hyphens; leaving one blank creates a stable generated URL. Changing a slug does not redirect its previous URL. Drafts and archived posts are not available through public endpoints. Version checks prevent stale edits; admin writes require the existing session, same-origin and CSRF protection.
## Bulk product import

Use “นำเข้าสินค้า CSV” in the existing Products & stock view. Download a CSV or Excel template, fill it, choose create-only or update-by-SKU mode, preview, and confirm. Supports UTF-8 CSV (comma/semicolon/tab) and .xlsx with one visible populated worksheet. Maximum 5 MB and 5,000 products; Excel formulas are rejected. Format SKU as text to preserve leading zeros. Required headers: sku, name, category. Optional headers: description, image, price, stock, active, popular. Category accepts an existing category ID or an unambiguous category name; the modal lists both. Delete the example product row before importing.

Price is in THB with up to two decimals; it is stored using the existing integer satang format. Stock replaces the existing available (unreserved) count, rather than adding to it. Booleans accept true/false, yes/no, or 1/0. For new products, blank price/stock mean quotation/on-demand, active defaults to true and popular to false. In update mode, blank cells preserve existing values. Use ขอราคา/null to clear price, ตามสั่ง/null to clear stock, and - to clear description/image. SKU matching and duplicate checks ignore case; an existing product retains its ID and SKU spelling.

Preview does not write products. Any invalid row blocks the whole batch, with row-specific errors and a downloadable CSV report. Confirmation writes in a single SQLite transaction; changes to product versions or stock after preview cause a conflict without partial writes. Preview tokens belong to the logged-in admin, expire after 10 minutes, and do not survive a service restart. CSV/XLSX parsing runs in a bounded worker. Templates, preview and confirmation require existing admin authentication; mutations retain same-origin and CSRF checks. No database schema changes are needed. Templates and import use ExcelJS 4.4.0, with its uuid dependency overridden to a patched CommonJS-compatible release; versions are locked in package-lock.json.
