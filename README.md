# Gearhouse Parts & Inventory

A private shop-management web app for vehicle spare parts. The same code runs on a desktop with folder-backed records or on Vercel with MongoDB Atlas.

## Run it on this desktop

1. Install Node.js 20 or newer.
2. In this folder, run `npm install` once.
3. Run `npm run setup` once. It creates a private `.env` file and prints an admin password. Save the password; you can also open `.env` in VS Code.
4. Run `npm start` and open `http://localhost:3000` for the customer shop, or `http://localhost:3000/admin.html` for the password-protected shop workspace.

Keep the terminal open while using the app. By default, live records are saved to `data/gearhouse.json` in this project folder, which is readable in VS Code. The `.env` and `data/` files are excluded from Git. Backups and CSV exports are available in Settings.

### Optional local MongoDB

Install MongoDB Community Server, start `mongod`, and set `MONGODB_URI=mongodb://127.0.0.1:27017` in `.env`. The database name defaults to `gearhouse`. The app uses MongoDB whenever `MONGODB_URI` is set; otherwise it uses the JSON file above.

## What works

- Inventory with SKU, category, brand, vehicle fitment, cost and selling price, quantity, reorder point, shelf location, notes, and archive/restore.
- Stock receipts, returns, write-offs, and corrections with a movement history.
- Counter sales with customer details, payment method, discount, tax, stock deduction, numbered receipts, printing, and sale voids that reverse stock.
- Customer purchase history, low-stock alerts, and a browseable in-stock catalog.
- CSV exports and full JSON backup/restore.
- Admin sign-in, private session cookies, and sample data for reviewing the workflows.
- Public customer catalog with search, categories, a basket, and pickup requests. Requests are saved for admin follow-up and do not reserve stock or count as paid sales.
- Admin customer-orders view to call customers, confirm fitment, and update pickup-request status.

## Vercel deployment

Vercel functions are stateless, so a hosted deployment uses MongoDB Atlas rather than the local JSON file. Set these Production environment variables in the Vercel project:

- `ADMIN_PASSWORD`: a private password of at least 12 characters. Enter this yourself in Vercel; do not commit it.
- `ADMIN_EMAIL`: the one Google account permitted to use Google sign-in.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: OAuth credentials from a Google Cloud web application. The authorized redirect URI must be `https://gearhouse-parts-admin.vercel.app/api/auth/google/callback`.
- Google sign-in appears after these values are configured. It checks Google's verified email against `ADMIN_EMAIL`; the existing admin password remains as a fallback.
- `SESSION_SECRET`: a random secret of at least 32 characters.
- `MONGODB_URI`: the Atlas connection string for the `gearhouse` database.
- `MONGODB_DB`: `gearhouse`.

The Vercel project and Atlas cluster are prepared for deployment. Atlas currently allows connections from any source IP (`0.0.0.0/0`) because Vercel Static IPs are unavailable on the current plan and cost extra. The database still requires its dedicated app credentials. The local JSON file remains on this computer and is separate from the Atlas data used by the hosted app.

