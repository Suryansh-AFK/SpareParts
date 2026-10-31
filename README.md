# Spare Parts Shop Manager

A portfolio demo for a vehicle spare-parts shop. It includes a customer catalog and an admin workspace for inventory, stock movements, counter sales, receipts, and customer pickup requests.

> **Demo only:** Fresh installs automatically load fictional parts and example transactions so the workflows are ready to explore. Use fake customer and business information in this public demo project.

## Run the demo on your computer

1. Install Node.js 20 or newer.
2. Open this folder in a terminal and run `npm install`.
3. Run `npm run setup`. This creates a local `.env` file and prints an admin password.
4. Run `npm start`.
5. Open:
   - Customer catalog: `http://localhost:3000`
   - Admin workspace: `http://localhost:3000/admin.html`

The terminal must stay open while using the demo. By default, records are stored locally in `data/gearhouse.json`. You can inspect that file in VS Code. Settings includes backup and CSV export tools. The private `.env` and `data/` folder are excluded from Git.

Optional: use a local MongoDB Community Server by setting `MONGODB_URI=mongodb://127.0.0.1:27017` in your local `.env`. The database name defaults to `gearhouse`.

## Demo workflows

- Search and browse the public parts catalog, add items to a basket, and submit a pickup request.
- Add and edit parts with SKU, category, brand, vehicle fitment, cost, price, quantity, reorder level, and shelf location.
- Receive stock, record returns and write-offs, correct counts, and review the movement history.
- Create counter sales with customer details, payment method, discount, tax, numbered receipts, and stock deduction.
- Print receipts, review customer purchase history, and void a sale to reverse its stock movement.
- Review low-stock alerts and pickup requests; export CSV reports and JSON backups.

The included sample catalog contains fictional products such as filters, brake pads, bulbs, coolant, and drive belts. Sample sales and movements are labeled as examples and can be removed from Settings.

## Technology

- Node.js server and vanilla JavaScript, HTML, and CSS
- Local JSON file storage by default
- Optional MongoDB storage for local development

This repository is a source-code showcase. It does not host a live demo website by itself; run the project locally using the steps above.
