-- Danbhels Gym database setup
-- Run this file with MySQL 8+.

CREATE DATABASE IF NOT EXISTS danbhels_gym
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE danbhels_gym;

CREATE TABLE IF NOT EXISTS plans (
  plan_id VARCHAR(100) NOT NULL,
  plan_name VARCHAR(150) NOT NULL,
  category VARCHAR(30) NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  duration_days INT UNSIGNED NOT NULL DEFAULT 30,
  duration_type VARCHAR(20) NOT NULL DEFAULT 'Monthly',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (plan_id),
  UNIQUE KEY uq_plans_name (plan_name),
  KEY idx_plans_category (category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS members (
  member_id VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NULL,
  plan_id VARCHAR(100) NOT NULL,
  joined_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'Paid',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (member_id),
  KEY idx_members_plan (plan_id),
  KEY idx_members_expiry (expiry_date),
  CONSTRAINT fk_members_plan
    FOREIGN KEY (plan_id) REFERENCES plans (plan_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS coaches (
  coach_id VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  specialty VARCHAR(150) NOT NULL,
  shift VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (coach_id),
  KEY idx_coaches_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory_items (
  item_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Equipment',
  quantity INT UNSIGNED NOT NULL DEFAULT 0,
  reorder_level INT UNSIGNED NOT NULL DEFAULT 0,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (item_id),
  KEY idx_inventory_category (category),
  KEY idx_inventory_low_stock (quantity, reorder_level)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_sales (
  sale_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  item_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TIMESTAMP NULL,
  void_reason VARCHAR(255) NULL,
  PRIMARY KEY (sale_id),
  KEY idx_product_sales_item_date (item_id, sold_at),
  KEY idx_product_sales_date (sold_at),
  CONSTRAINT fk_product_sales_item FOREIGN KEY (item_id) REFERENCES inventory_items (item_id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS renewal_logs (
  transaction_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  member_id VARCHAR(30) NOT NULL,
  plan_id VARCHAR(100) NOT NULL,
  amount_paid DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'Paid',
  new_expiry_date DATE NOT NULL,
  renewal_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TIMESTAMP NULL,
  void_reason VARCHAR(255) NULL,
  PRIMARY KEY (transaction_id),
  KEY idx_logs_member_date (member_id, renewal_date),
  KEY idx_logs_plan (plan_id),
  KEY idx_logs_payment_date (payment_status, renewal_date),
  CONSTRAINT fk_logs_member
    FOREIGN KEY (member_id) REFERENCES members (member_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_logs_plan
    FOREIGN KEY (plan_id) REFERENCES plans (plan_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'staff',
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  last_login TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

-- Starter plans. INSERT IGNORE keeps this script safe to run more than once.
INSERT IGNORE INTO plans
  (plan_id, plan_name, category, price, duration_days, duration_type)
VALUES
  ('ONE_DAY', 'ONE DAY', 'membership', 1000.00, 1, 'Daily'),
  ('REGULAR_MONTHLY', 'Regular Member Monthly', 'membership', 1599.00, 30, 'Monthly'),
  ('NON_MEMBER_MONTHLY', 'Non-Member Monthly', 'membership', 2399.00, 30, 'Monthly'),
  ('STUDENT_PROMO', 'Student Monthly Promo', 'membership', 1299.00, 30, 'Monthly'),
  ('YEARLY', 'YEARLY', 'membership', 20000.00, 365, 'Yearly'),
  ('COACHING_MEMBER_1', '1x Coaching Session (Member)', 'coaching', 399.00, 1, 'Daily'),
  ('COACHING_NON_MEMBER_1', '1x Coaching Session (Non-Member)', 'coaching', 799.00, 1, 'Daily'),
  ('COACHING_MEMBER_12', '12x Coaching Program (Member)', 'coaching', 3999.00, 30, 'Monthly'),
  ('COACHING_NON_MEMBER_12', '12x Coaching Program (Non-Member)', 'coaching', 7999.00, 30, 'Monthly');

-- Optional starter coach records can be added through the frontend.
