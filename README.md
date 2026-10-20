# AKASH Drinking Water: full-stack ordering website

React frontend, Node.js + Express backend, MySQL database. Built from your `inndex.html`
(same look, same flow: order → address → payment, plus the Owner Portal), but everything
is now stored in MySQL instead of the browser, and the owner can edit the whole website.

## What you get

**Customers**
- Order 1 can or bulk packs, enter a delivery address (remembered on their device)
- Pay by **UPI** (QR code + "Open UPI app"), **Cash on delivery**, **Card/netbanking (Razorpay, optional)**, or a **free can with loyalty points**
- 5 points per can, 100 points = ₹40 off (all of this is editable)

**Owner Portal** (button on the front page, passcode login)
- *Overview*: today's cans and money, empty cans to collect (Call / Received), add phone orders, confirm delivery, mark payment received, cancel, delete
- *Tie-ups*: Exam Center, Garage, Worknox, plus any new ones you add, each with a date / cans / empty log
- *Expenses*: petrol, food, maintenance, salary, rent, electricity, can purchase, other, with a month picker and totals per category
- *Profit & loss*: month-by-month table for any year, yearly total, an "All years" table, and an expense breakdown per month. **Save** records a month or a year in the database.
- *Site editor*: change brand name, logo emoji, headings, quote, button text, colour, packs and prices (add / hide / delete packs), which payment methods are on, UPI ID, support phone, loyalty rules, and the owner passcode. Changes show on the website immediately.

## Setup (about 5 minutes)

Needs **Node.js 18+** and **MySQL 8** (or MariaDB 10.5+).

```bash
# 1. install everything
npm run install:all

# 2. configure
cp server/.env.example server/.env
#    open server/.env and set DB_PASSWORD, JWT_SECRET and ADMIN_PASSCODE

# 3. create the database, tables and starter content (safe to run again)
npm run db:setup

# 4. run it
npm run build
npm start          # open http://localhost:5000
```

Developing? Run `npm run dev:server` and `npm run dev:client` in two terminals and open
http://localhost:5173 (the client forwards `/api` to the server).

Log in to the Owner Portal with the `ADMIN_PASSCODE` from your `.env`, then change it in
*Site editor → Owner passcode*.

## How profit and loss is worked out

- **Revenue** = orders that are *paid* in that month (UPI/online/cash/points, COD once delivered, credit once you mark it paid).
- **Credit still due** is shown separately and is not counted as revenue until it is paid.
- Cancelled orders are left out.
- **Profit / loss** = revenue - expenses. A negative result is shown in red as a loss.
- Months use Indian time (`DB_TIMEZONE=+05:30` in `.env`).
- Reports always show live numbers. **Save** stores a snapshot in `pnl_reports`; if you later change an
  order or expense, the row shows *Changed since saved* and you can save again.

**Upgrading an older copy:** run `npm run db:setup` once (it only adds the new table), then `npm run build`.

## Turning on card / netbanking payments (optional)

1. Create a Razorpay account and copy your Key ID and Key Secret.
2. Put them in `server/.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`, restart the server.
3. In the Site editor tick **Card / netbanking (Razorpay)** and save.

Use Razorpay's *test* keys first. The payment is verified on the server with a signature check
before an order is marked paid.

## How UPI payments work

UPI has no automatic confirmation without a payment gateway. The customer pays, taps
"I've paid - place order", and the order appears in your Overview as **Payment pending**.
Check your bank/UPI app, then tap **Payment received**. COD orders become paid when you
tap **Confirm delivery**.

## Database (for your DBMS report)

| Table | Purpose |
|---|---|
| `settings` | editable website text, colours, UPI ID, loyalty rules (key / value) |
| `products` | packs: name, cans per pack, price, heading, position, visible |
| `customers` | phone (unique), name, address, loyalty points |
| `orders` | one row per order: totals, payment method + status, delivery status, empties returned |
| `order_items` | lines of an order (pack name and price are copied so old orders never change) |
| `partners`, `partner_logs` | tie-ups and their supply logs (one-to-many) |
| `expenses` | business expenses (category, amount, note, date) |
| `pnl_reports` | saved monthly / yearly profit & loss (revenue, credit due, expenses, profit, orders, cans); one row per period |
| `admins` | owner passcode (bcrypt hash) |

Relationships: `customers 1—* orders 1—* order_items *—1 products`, `partners 1—* partner_logs`.
Order creation, delivery and cancellation use **transactions** with row locks (`SELECT … FOR UPDATE`),
so points can never be spent twice.

## Security notes

- Prices and discounts are calculated on the server; the browser cannot change them.
- The owner passcode is stored hashed; owner API calls need a signed token (8 hours); login is rate-limited.
- All SQL uses parameters.
- Customers are identified by mobile number only (no OTP), so anyone who knows a number could use that
  customer's points. Fine for a local delivery business; add OTP login before using it at larger scale.
- Run behind HTTPS when you put it online (UPI links and payments need it).

## Project layout

```
database/schema.sql      tables
server/src/              Express API (routes/, orderService.js, seed.js)
client/src/              React app (components/Storefront.jsx, Owner*.jsx)
```
