const db = require('../config/db');

const normalizeItem = (body) => {
  const name = String(body.name || '').trim();
  const category = String(body.category || 'Equipment').trim();
  const quantity = Number(body.quantity);
  const reorderLevel = Number(body.reorder_level ?? body.reorderLevel);
  const sellingPrice = Number(body.selling_price ?? body.sellingPrice ?? 0);

  if (!name) return { error: 'ITEM_NAME_REQUIRED' };
  if (!Number.isInteger(quantity) || quantity < 0) return { error: 'QUANTITY_MUST_BE_NON_NEGATIVE_INTEGER' };
  if (!Number.isInteger(reorderLevel) || reorderLevel < 0) return { error: 'REORDER_LEVEL_MUST_BE_NON_NEGATIVE_INTEGER' };
  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) return { error: 'SELLING_PRICE_MUST_BE_NON_NEGATIVE' };

  return { name, category, quantity, reorderLevel, sellingPrice };
};

// @route GET /api/inventory
exports.getInventory = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        item_id AS id,
        name,
        category,
        quantity,
        reorder_level AS reorderLevel,
        selling_price AS sellingPrice,
        CASE WHEN quantity <= reorder_level THEN 1 ELSE 0 END AS lowStock,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM inventory_items
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (error) {
    console.error('INVENTORY_FETCH_ERROR:', error);
    res.status(500).json({ error: 'INVENTORY_FETCH_FAILED' });
  }
};

// @route POST /api/inventory
exports.createInventoryItem = async (req, res) => {
  const item = normalizeItem(req.body);
  if (item.error) return res.status(400).json({ error: item.error });

  try {
    const [result] = await db.query(`
      INSERT INTO inventory_items (name, category, quantity, reorder_level, selling_price)
      VALUES (?, ?, ?, ?, ?)
    `, [item.name, item.category, item.quantity, item.reorderLevel, item.sellingPrice]);

    res.status(201).json({
      message: 'INVENTORY_ITEM_CREATED',
      item: { id: result.insertId, name: item.name, category: item.category, quantity: item.quantity, reorderLevel: item.reorderLevel, sellingPrice: item.sellingPrice }
    });
  } catch (error) {
    console.error('INVENTORY_CREATE_ERROR:', error);
    res.status(500).json({ error: 'INVENTORY_CREATE_FAILED' });
  }
};

// @route PUT /api/inventory/:id
exports.updateInventoryItem = async (req, res) => {
  const item = normalizeItem(req.body);
  if (item.error) return res.status(400).json({ error: item.error });

  try {
    const [result] = await db.query(`
      UPDATE inventory_items
      SET name = ?, category = ?, quantity = ?, reorder_level = ?, selling_price = ?
      WHERE item_id = ?
    `, [item.name, item.category, item.quantity, item.reorderLevel, item.sellingPrice, req.params.id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: 'INVENTORY_ITEM_NOT_FOUND' });
    res.json({ message: 'INVENTORY_ITEM_UPDATED' });
  } catch (error) {
    console.error('INVENTORY_UPDATE_ERROR:', error);
    res.status(500).json({ error: 'INVENTORY_UPDATE_FAILED' });
  }
};

// @route POST /api/inventory/sales
exports.createInventorySale = async (req, res) => {
  const itemId = Number(req.body.item_id ?? req.body.itemId);
  const quantity = Number(req.body.quantity || 1);
  if (!Number.isInteger(itemId) || !Number.isInteger(quantity) || quantity < 1) {
    return res.status(400).json({ error: 'VALID_PRODUCT_SALE_REQUIRED' });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [items] = await connection.query('SELECT item_id, name, quantity, selling_price FROM inventory_items WHERE item_id = ? FOR UPDATE', [itemId]);
    const item = items[0];
    if (!item) {
      await connection.rollback();
      return res.status(404).json({ error: 'INVENTORY_ITEM_NOT_FOUND' });
    }
    if (item.quantity < quantity) {
      await connection.rollback();
      return res.status(400).json({ error: 'INSUFFICIENT_STOCK' });
    }

    const total = Number(item.selling_price) * quantity;
    await connection.query('UPDATE inventory_items SET quantity = quantity - ? WHERE item_id = ?', [quantity, itemId]);
    const [result] = await connection.query(
      'INSERT INTO product_sales (item_id, quantity, unit_price, total_amount) VALUES (?, ?, ?, ?)',
      [itemId, quantity, item.selling_price, total]
    );
    await connection.commit();
    res.status(201).json({ message: 'PRODUCT_SALE_RECORDED', sale: { id: result.insertId, itemId, name: item.name, quantity, unitPrice: item.selling_price, total } });
  } catch (error) {
    await connection.rollback();
    console.error('PRODUCT_SALE_ERROR:', error);
    res.status(500).json({ error: 'PRODUCT_SALE_FAILED' });
  } finally {
    connection.release();
  }
};

// @route GET /api/inventory/sales
exports.getInventorySales = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT s.sale_id AS id, i.name, s.quantity, s.unit_price AS unitPrice,
        s.total_amount AS total, s.sold_at AS soldAt
      FROM product_sales s
      JOIN inventory_items i ON i.item_id = s.item_id
      ORDER BY s.sale_id DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    console.error('PRODUCT_SALES_FETCH_ERROR:', error);
    res.status(500).json({ error: 'PRODUCT_SALES_FETCH_FAILED' });
  }
};

// @route DELETE /api/inventory/:id
exports.deleteInventoryItem = async (req, res) => {
  try {
    const [result] = await db.query('DELETE FROM inventory_items WHERE item_id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'INVENTORY_ITEM_NOT_FOUND' });
    res.json({ message: 'INVENTORY_ITEM_DELETED' });
  } catch (error) {
    console.error('INVENTORY_DELETE_ERROR:', error);
    res.status(500).json({ error: 'INVENTORY_DELETE_FAILED' });
  }
};
