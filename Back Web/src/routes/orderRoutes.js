const express = require('express');
const router = express.Router();
const orderController = require('../controllers/OrderController');
const authMiddleware = require('../middleware/auth');

// Rutas públicas (no requieren autenticación para demo)
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// Rutas de órdenes - Con autenticación opcional para facilitar pruebas
router.post('/ordenes/rapida', orderController.createQuickOrder);
router.get('/ordenes/activas', authMiddleware.optional, orderController.getActiveOrders);
router.get('/ordenes', authMiddleware.optional, orderController.getAllOrders);
router.get('/ordenes/:id', authMiddleware.optional, orderController.getOrderById);
router.get('/ordenes/mesa/:mesa', authMiddleware.optional, orderController.getOrdersByTable);

// Rutas que requieren autenticación
router.patch('/ordenes/:id/estado', authMiddleware.required, orderController.updateOrderStatus);
router.patch('/ordenes/:ordenId/items/:itemId/estado', authMiddleware.required, orderController.updateItemStatus);
router.post('/ordenes/:id/items', authMiddleware.required, orderController.addItemsToOrder);
router.post('/mesas/:mesa/cerrar', authMiddleware.required, orderController.closeTable);

module.exports = router;