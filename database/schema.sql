-- AKASH Drinking Water - MySQL schema
CREATE DATABASE IF NOT EXISTS akash_water CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE akash_water;

-- Editable website content (brand name, tagline, UPI id, loyalty rules ...)
CREATE TABLE IF NOT EXISTS settings (
  key_name   VARCHAR(60)  PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Sellable packs, e.g. "1 CAN" and "10 CAN"
CREATE TABLE IF NOT EXISTS products (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(80)   NOT NULL,
  cans       INT           NOT NULL CHECK (cans > 0),   -- cans in one unit of this pack
  price      DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  section    VARCHAR(40)   NOT NULL DEFAULT 'Order',    -- heading shown on the order page
  sort_order INT           NOT NULL DEFAULT 0,
  active     TINYINT(1)    NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS customers (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  phone      VARCHAR(15)  NOT NULL UNIQUE,
  name       VARCHAR(100) NOT NULL,
  address    VARCHAR(255),
  pincode    VARCHAR(10),
  points     INT          NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id                   INT AUTO_INCREMENT PRIMARY KEY,
  public_id            VARCHAR(12)   NOT NULL UNIQUE,   -- shown to people, e.g. A4821
  customer_id          INT           NULL,
  customer_name        VARCHAR(100)  NOT NULL,
  phone                VARCHAR(15)   NOT NULL,
  address              VARCHAR(255),
  pincode              VARCHAR(10),
  total_cans           INT           NOT NULL,
  subtotal             DECIMAL(10,2) NOT NULL,
  discount             DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount               DECIMAL(10,2) NOT NULL,
  payment_method       ENUM('UPI','COD','ONLINE','POINTS','CASH','CREDIT') NOT NULL,
  payment_status       ENUM('Pending','Paid','Credit') NOT NULL DEFAULT 'Pending',
  status               ENUM('Pending','Delivered','Cancelled') NOT NULL DEFAULT 'Pending',
  empty_returned       INT           NOT NULL DEFAULT 0,
  points_used          INT           NOT NULL DEFAULT 0,
  points_earned        INT           NOT NULL DEFAULT 0,
  points_awarded       TINYINT(1)    NOT NULL DEFAULT 0,
  source               ENUM('app','manual') NOT NULL DEFAULT 'app',
  gateway_order_id     VARCHAR(60),
  gateway_payment_id   VARCHAR(60),
  created_at           TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  INDEX idx_orders_created (created_at),
  INDEX idx_orders_phone (phone)
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT           NOT NULL,
  product_id   INT           NULL,
  product_name VARCHAR(80)   NOT NULL,   -- snapshot, so old orders survive edits
  unit_cans    INT           NOT NULL,
  unit_price   DECIMAL(10,2) NOT NULL,
  qty          INT           NOT NULL CHECK (qty > 0),
  CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders(id)   ON DELETE CASCADE,
  CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- Tie-up accounts such as the Exam Center, Garage and Worknox
CREATE TABLE IF NOT EXISTS partners (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(80)  NOT NULL,
  billing_note VARCHAR(80)  NOT NULL DEFAULT '',
  sort_order   INT          NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS partner_logs (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  partner_id     INT  NOT NULL,
  log_date       DATE NOT NULL,
  cans_supplied  INT  NOT NULL,
  empty_received INT  NOT NULL,
  CONSTRAINT fk_logs_partner FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expenses (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  category     VARCHAR(40)   NOT NULL,
  amount       DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  note         VARCHAR(160),
  expense_date DATE          NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  password_hash VARCHAR(100) NOT NULL
);

-- Saved profit & loss reports (one row per month or per year; saving again updates the row)
CREATE TABLE IF NOT EXISTS pnl_reports (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  period_type  ENUM('month','year') NOT NULL,
  period       VARCHAR(7)    NOT NULL,            -- '2026-10' or '2026'
  revenue      DECIMAL(12,2) NOT NULL,            -- paid orders
  credit_due   DECIMAL(12,2) NOT NULL DEFAULT 0,  -- credit orders not yet paid (not counted as revenue)
  expenses     DECIMAL(12,2) NOT NULL,
  profit       DECIMAL(12,2) NOT NULL,            -- revenue - expenses (negative = loss)
  orders       INT           NOT NULL DEFAULT 0,
  cans         INT           NOT NULL DEFAULT 0,  -- cans delivered
  saved_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pnl_period (period_type, period)
);
