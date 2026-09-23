const db = require('./db');
const bcrypt = require('bcryptjs');

const hasColumn = async (tableName, columnName) => {
  const [rows] = await db.query(`
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    LIMIT 1
  `, [tableName, columnName]);

  return rows.length > 0;
};

const addColumnIfMissing = async (tableName, columnName, definition) => {
  if (!(await hasColumn(tableName, columnName))) {
    await db.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`);
    console.log(`// DATABASE_MIGRATION_ADDED_${tableName.toUpperCase()}_${columnName.toUpperCase()}`);
  }
};

const ensureCoreTables = async () => {
  await db.query(`
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
      UNIQUE KEY uq_plans_name (plan_name)
    ) ENGINE=InnoDB
  `);
  await db.query(`
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
      CONSTRAINT fk_members_plan FOREIGN KEY (plan_id) REFERENCES plans (plan_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS coaches (
      coach_id VARCHAR(30) NOT NULL,
      name VARCHAR(150) NOT NULL,
      specialty VARCHAR(150) NOT NULL,
      shift VARCHAR(80) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'Active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (coach_id)
    ) ENGINE=InnoDB
  `);
  await db.query(`
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
      CONSTRAINT fk_logs_member FOREIGN KEY (member_id) REFERENCES members (member_id) ON DELETE RESTRICT,
      CONSTRAINT fk_logs_plan FOREIGN KEY (plan_id) REFERENCES plans (plan_id) ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);
};

const ensureInventoryTable = async () => {
  await db.query(`
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
    ) ENGINE=InnoDB
  `);
};

const ensureProductSalesTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_sales (
      sale_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      item_id BIGINT UNSIGNED NOT NULL,
      quantity INT UNSIGNED NOT NULL,
      unit_price DECIMAL(10, 2) NOT NULL,
      total_amount DECIMAL(10, 2) NOT NULL,
      sold_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (sale_id),
      KEY idx_product_sales_item_date (item_id, sold_at),
      KEY idx_product_sales_date (sold_at),
      CONSTRAINT fk_product_sales_item FOREIGN KEY (item_id) REFERENCES inventory_items (item_id) ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE=InnoDB
  `);
};

const ensureUsersTable = async () => {
  await db.query(`
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
    ) ENGINE=InnoDB
  `);

  const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@iron.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const [rows] = await db.query('SELECT user_id FROM users WHERE email = ? LIMIT 1', [adminEmail]);
  if (!rows.length) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await db.query(
      'INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?)',
      [adminEmail, passwordHash, 'System Administrator', 'admin', 'Active']
    );
    console.warn(`// DEFAULT_ADMIN_CREATED_${adminEmail}_CHANGE_PASSWORD_IMMEDIATELY`);
  }
};

const ensureDatabaseSchema = async () => {
  await ensureCoreTables();
  await addColumnIfMissing('members', 'email', 'VARCHAR(255) NULL AFTER `name`');
  await addColumnIfMissing('renewal_logs', 'voided_at', 'TIMESTAMP NULL AFTER `new_expiry_date`');
  await addColumnIfMissing('renewal_logs', 'void_reason', 'VARCHAR(255) NULL AFTER `voided_at`');
  await ensureInventoryTable();
  await addColumnIfMissing('inventory_items', 'selling_price', 'DECIMAL(10, 2) NOT NULL DEFAULT 0.00 AFTER `reorder_level`');
  await ensureProductSalesTable();
  await addColumnIfMissing('product_sales', 'voided_at', 'TIMESTAMP NULL AFTER `sold_at`');
  await addColumnIfMissing('product_sales', 'void_reason', 'VARCHAR(255) NULL AFTER `voided_at`');
  await ensureUsersTable();
  console.log('// DATABASE_SCHEMA_READY');
};

module.exports = { ensureDatabaseSchema };
