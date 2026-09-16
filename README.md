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

## Security and checks
Passwords use salted scrypt; session tokens and customer links are stored hashed. Admin mutations require a session, same-origin request and CSRF token. Quotation acceptance checks expiry/version and inventory in a database transaction. Tests cover authentication, authorization, idempotency, price tampering, stock reservations/cancellation and persistence across restart.
