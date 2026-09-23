const bcrypt = require('bcryptjs');
const db = require('../config/db');

const addDays = (days) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const plans = [
  ['ONE_DAY', 'One Day Pass', 'membership', 1000.00, 1, 'Daily'],
  ['REGULAR_MONTHLY', 'Regular Monthly', 'membership', 1599.00, 30, 'Monthly'],
  ['NON_MEMBER_MONTHLY', 'Non-Member Monthly', 'membership', 2399.00, 30, 'Monthly'],
  ['STUDENT_PROMO', 'Student Monthly Promo', 'membership', 1299.00, 30, 'Monthly'],
  ['YEARLY', 'Annual Membership', 'membership', 20000.00, 365, 'Yearly'],
  ['COACHING_MEMBER_1', '1x Coaching Session (Member)', 'coaching', 399.00, 1, 'Daily'],
  ['COACHING_NON_MEMBER_1', '1x Coaching Session (Non-Member)', 'coaching', 799.00, 1, 'Daily'],
  ['COACHING_MEMBER_12', '12x Coaching Package (Member)', 'coaching', 3999.00, 30, 'Monthly'],
  ['COACHING_NON_MEMBER_12', '12x Coaching Package (Non-Member)', 'coaching', 7999.00, 30, 'Monthly']
];

const coaches = [];

const inventory = [
  ['Premium Yoga Mat', 'Accessories', 18, 6, 1299.00],
  ['Adjustable Dumbbell Set', 'Strength', 8, 4, 8999.00],
  ['Resistance Band Kit', 'Recovery', 25, 8, 1499.00],
  ['Foam Roller Bundle', 'Recovery', 12, 5, 999.00],
  ['Kettlebell Pair', 'Strength', 6, 3, 4999.00]
];

const members = [
  { id: 'LM-1001', name: 'Alicia Reyes', email: 'alicia.reyes@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-120), expiry_date: addDays(6), payment_status: 'Paid' },
  { id: 'LM-1002', name: 'Luis Mendoza', email: 'luis.mendoza@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-88), expiry_date: addDays(2), payment_status: 'Paid' },
  { id: 'LM-1003', name: 'Carmen Santos', email: 'carmen.santos@liftmode.ph', plan_id: 'STUDENT_PROMO', joined_date: addDays(-60), expiry_date: addDays(-2), payment_status: 'Paid' },
  { id: 'LM-1004', name: 'Nathan Lee', email: 'nathan.lee@liftmode.ph', plan_id: 'NON_MEMBER_MONTHLY', joined_date: addDays(-46), expiry_date: addDays(15), payment_status: 'Paid' },
  { id: 'LM-1005', name: 'Jessa Villanueva', email: 'jessa.villanueva@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-35), expiry_date: addDays(21), payment_status: 'Paid' },
  { id: 'LM-1006', name: 'Miguel Tan', email: 'miguel.tan@liftmode.ph', plan_id: 'YEARLY', joined_date: addDays(-260), expiry_date: addDays(55), payment_status: 'Paid' },
  { id: 'LM-1007', name: 'Renee Bautista', email: 'renee.bautista@liftmode.ph', plan_id: 'STUDENT_PROMO', joined_date: addDays(-24), expiry_date: addDays(4), payment_status: 'Paid' },
  { id: 'LM-1008', name: 'Jasper Ocampo', email: 'jasper.ocampo@liftmode.ph', plan_id: 'ONE_DAY', joined_date: addDays(-1), expiry_date: addDays(0), payment_status: 'Paid' },
  { id: 'LM-1009', name: 'Kristine Dela Cruz', email: 'kristine.delacruz@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-102), expiry_date: addDays(30), payment_status: 'Paid' },
  { id: 'LM-1010', name: 'Andre Garcia', email: 'andre.garcia@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-128), expiry_date: addDays(-11), payment_status: 'Pending' },
  { id: 'LM-1011', name: 'Mika Soriano', email: 'mika.soriano@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-75), expiry_date: addDays(11), payment_status: 'Paid' },
  { id: 'LM-1012', name: 'Ethan Lim', email: 'ethan.lim@liftmode.ph', plan_id: 'NON_MEMBER_MONTHLY', joined_date: addDays(-14), expiry_date: addDays(17), payment_status: 'Paid' },
  { id: 'LM-1013', name: 'Patricia Gomez', email: 'patricia.gomez@liftmode.ph', plan_id: 'YEARLY', joined_date: addDays(-300), expiry_date: addDays(120), payment_status: 'Paid' },
  { id: 'LM-1014', name: 'Kevin Ramos', email: 'kevin.ramos@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-52), expiry_date: addDays(-7), payment_status: 'Pending' },
  { id: 'LM-1015', name: 'Nina Aguilar', email: 'nina.aguilar@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-67), expiry_date: addDays(9), payment_status: 'Paid' },
  { id: 'LM-1016', name: 'Bryan Co', email: 'bryan.co@liftmode.ph', plan_id: 'REGULAR_MONTHLY', joined_date: addDays(-200), expiry_date: addDays(90), payment_status: 'Paid' }
];

const membershipRenewals = [
  ['LM-1001', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(36)],
  ['LM-1002', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(32)],
  ['LM-1003', 'STUDENT_PROMO', 1299.00, 'Paid', addDays(30)],
  ['LM-1004', 'NON_MEMBER_MONTHLY', 2399.00, 'Paid', addDays(45)],
  ['LM-1005', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(51)],
  ['LM-1006', 'YEARLY', 20000.00, 'Paid', addDays(365)],
  ['LM-1007', 'STUDENT_PROMO', 1299.00, 'Paid', addDays(30)],
  ['LM-1008', 'ONE_DAY', 1000.00, 'Paid', addDays(1)],
  ['LM-1009', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(30)],
  ['LM-1010', 'REGULAR_MONTHLY', 1599.00, 'Pending', addDays(30)],
  ['LM-1011', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(30)],
  ['LM-1012', 'NON_MEMBER_MONTHLY', 2399.00, 'Paid', addDays(30)],
  ['LM-1013', 'YEARLY', 20000.00, 'Paid', addDays(365)],
  ['LM-1014', 'REGULAR_MONTHLY', 1599.00, 'Pending', addDays(30)],
  ['LM-1015', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(30)],
  ['LM-1016', 'REGULAR_MONTHLY', 1599.00, 'Paid', addDays(30)]
];

const sales = [
  [1, 2, 1299.00, 2598.00, addDays(-18)],
  [2, 1, 8999.00, 8999.00, addDays(-9)],
  [3, 4, 1499.00, 5996.00, addDays(-12)],
  [4, 3, 999.00, 2997.00, addDays(-5)],
  [5, 2, 4999.00, 9998.00, addDays(-3)],
  [2, 1, 8999.00, 8999.00, addDays(-2)],
  [1, 3, 1299.00, 3897.00, addDays(-1)]
];

const main = async () => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query('SET FOREIGN_KEY_CHECKS = 0');
    await connection.query('TRUNCATE TABLE product_sales');
    await connection.query('TRUNCATE TABLE renewal_logs');
    await connection.query('TRUNCATE TABLE members');
    await connection.query('TRUNCATE TABLE coaches');
    await connection.query('TRUNCATE TABLE inventory_items');
    await connection.query('TRUNCATE TABLE plans');
    await connection.query('TRUNCATE TABLE users');
    await connection.query('SET FOREIGN_KEY_CHECKS = 1');

    await connection.query(
      'INSERT INTO plans (plan_id, plan_name, category, price, duration_days, duration_type) VALUES ?',
      [plans]
    );

    if (coaches.length) {
      await connection.query(
        'INSERT INTO coaches (coach_id, name, specialty, shift, status) VALUES ?',
        [coaches]
      );
    }

    const inventoryValues = inventory;
    const [inventoryResult] = await connection.query(
      'INSERT INTO inventory_items (name, category, quantity, reorder_level, selling_price) VALUES ?',
      [inventoryValues]
    );

    const memberRows = members.map(({ id, name, email, plan_id, joined_date, expiry_date, payment_status }) => [
      id, name, email, plan_id, joined_date, expiry_date,
      new Date(expiry_date) <= new Date() ? 'Expired' : 'Active',
      payment_status
    ]);
    await connection.query(
      'INSERT INTO members (member_id, name, email, plan_id, joined_date, expiry_date, status, payment_status) VALUES ?',
      [memberRows]
    );

    const renewalRows = membershipRenewals.map(([member_id, plan_id, amount_paid, payment_status, new_expiry_date]) => [member_id, plan_id, amount_paid, payment_status, new_expiry_date]);
    await connection.query(
      'INSERT INTO renewal_logs (member_id, plan_id, amount_paid, payment_status, new_expiry_date) VALUES ?',
      [renewalRows]
    );

    const adminHash = bcrypt.hashSync('admin123', 12);
    const staffHash = bcrypt.hashSync('staff123', 12);

    await connection.query(
      'INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?)',
      ['admin@iron.com', adminHash, 'System Administrator', 'admin', 'Active']
    );

    await connection.query(
      'INSERT INTO users (email, password_hash, full_name, role, status) VALUES (?, ?, ?, ?, ?)',
      ['manager@liftmode.ph', staffHash, 'Liam Santos', 'staff', 'Active']
    );

    const insertedSales = sales.map(([item_id, quantity, unit_price, total_amount, sold_at]) => [item_id, quantity, unit_price, total_amount, sold_at]);
    await connection.query(
      'INSERT INTO product_sales (item_id, quantity, unit_price, total_amount, sold_at) VALUES ?',
      [insertedSales]
    );

    await connection.commit();

    console.log('REAL_DATA_RESEED_COMPLETED');
    console.log('PLANS:', plans.length);
    console.log('COACHES:', coaches.length);
    console.log('MEMBERS:', members.length);
    console.log('INVENTORY_ITEMS:', inventory.length);
    console.log('RENEWAL_LOGS:', renewalRows.length);
    console.log('SALES:', sales.length);
    console.log('ADMIN_USER: admin@iron.com / admin123');
    console.log('STAFF_USER: manager@liftmode.ph / staff123');
    console.log('INVENTORY_FIRST_ID:', inventoryResult.insertId || 'n/a');
  } catch (error) {
    await connection.rollback();
    console.error('SEEDING_FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    connection.release();
    process.exit(0);
  }
};

main();
