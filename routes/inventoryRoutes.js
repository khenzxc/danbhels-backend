const express = require('express');
const router = express.Router();
const { authenticate, requireRoles } = require('../middleware/auth');
const {
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  createInventorySale,
  getInventorySales
} = require('../controllers/inventoryController');

router.get('/', authenticate, requireRoles('admin', 'staff'), getInventory);
router.get('/sales', authenticate, requireRoles('admin', 'staff'), getInventorySales);
router.post('/', authenticate, requireRoles('admin', 'staff'), createInventoryItem);
router.post('/sales', authenticate, requireRoles('admin', 'staff'), createInventorySale);
router.put('/:id', authenticate, requireRoles('admin', 'staff'), updateInventoryItem);
router.patch('/:id', authenticate, requireRoles('admin', 'staff'), updateInventoryItem);
router.delete('/:id', authenticate, requireRoles('admin', 'staff'), deleteInventoryItem);

module.exports = router;