-- Deliberately "legacy migration" style schema:
-- inconsistent naming, no FK-friendly names, mixed conventions.
-- This is intentional: it's what makes the self-healing loop actually
-- have something to heal. A perfectly clean schema never fails.

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  cust_id       INTEGER PRIMARY KEY,
  full_name     TEXT NOT NULL,
  email_addr    TEXT NOT NULL,
  signup_dt     TEXT NOT NULL,   -- stored as 'YYYY-MM-DD'
  region_code   TEXT
);

CREATE TABLE products (
  prod_id       INTEGER PRIMARY KEY,
  prod_name     TEXT NOT NULL,
  category      TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL  -- price stored in CENTS, not dollars
);

CREATE TABLE orders (
  order_id      INTEGER PRIMARY KEY,
  cust_id       INTEGER NOT NULL REFERENCES customers(cust_id),
  order_dt      TEXT NOT NULL,   -- 'YYYY-MM-DD'
  status        TEXT NOT NULL    -- 'pending' | 'shipped' | 'cancelled'
);

CREATE TABLE order_items (
  item_id       INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(order_id),
  prod_id       INTEGER NOT NULL REFERENCES products(prod_id),
  qty           INTEGER NOT NULL
);

INSERT INTO customers (cust_id, full_name, email_addr, signup_dt, region_code) VALUES
  (1, 'Ariana Cole',   'ariana@example.com', '2023-01-15', 'NA'),
  (2, 'Devon Patel',   'devon@example.com',  '2023-03-02', 'EU'),
  (3, 'Marta Ibanez',  'marta@example.com',  '2023-06-21', 'EU'),
  (4, 'Yusuf Karim',   'yusuf@example.com',  '2024-02-10', 'APAC'),
  (5, 'Grace Lin',     'grace@example.com',  '2024-05-30', 'NA');

INSERT INTO products (prod_id, prod_name, category, unit_price_cents) VALUES
  (1, 'Wireless Mouse',       'Accessories', 1999),
  (2, 'Mechanical Keyboard',  'Accessories', 8999),
  (3, '27in Monitor',         'Displays',    24999),
  (4, 'USB-C Dock',           'Accessories', 5499),
  (5, 'Webcam 1080p',         'Accessories', 3999);

INSERT INTO orders (order_id, cust_id, order_dt, status) VALUES
  (1, 1, '2024-01-05', 'shipped'),
  (2, 1, '2024-03-11', 'shipped'),
  (3, 2, '2024-04-01', 'cancelled'),
  (4, 3, '2024-04-15', 'shipped'),
  (5, 4, '2024-06-02', 'pending'),
  (6, 5, '2024-07-19', 'shipped'),
  (7, 5, '2024-08-01', 'shipped');

INSERT INTO order_items (item_id, order_id, prod_id, qty) VALUES
  (1, 1, 1, 2),
  (2, 1, 2, 1),
  (3, 2, 3, 1),
  (4, 3, 4, 1),
  (5, 4, 5, 3),
  (6, 5, 1, 1),
  (7, 6, 3, 2),
  (8, 7, 2, 1),
  (9, 7, 5, 1);
