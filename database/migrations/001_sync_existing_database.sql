-- Danbhels Gym migration for an existing database
-- Compatible with older MySQL Workbench/MySQL 5.7+ installations.
-- This migration preserves existing records.

USE danbhels_gym;

SET @add_email_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE members ADD COLUMN email VARCHAR(255) NULL AFTER name',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'members'
    AND COLUMN_NAME = 'email'
);
PREPARE add_email_statement FROM @add_email_sql;
EXECUTE add_email_statement;
DEALLOCATE PREPARE add_email_statement;

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

SET @add_selling_price_sql = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE inventory_items ADD COLUMN selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER reorder_level',
    'SELECT 1'
  )
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'inventory_items'
    AND COLUMN_NAME = 'selling_price'
);
PREPARE add_selling_price_statement FROM @add_selling_price_sql;
EXECUTE add_selling_price_statement;
DEALLOCATE PREPARE add_selling_price_statement;

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

-- Verify the migration after running it.
SELECT TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('members', 'plans', 'renewal_logs', 'coaches', 'inventory_items', 'product_sales', 'users')
ORDER BY TABLE_NAME;

SHOW COLUMNS FROM members;
SHOW COLUMNS FROM inventory_items;
