// backend/src/app.js - Aplicación Principal MVC CORREGIDA
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Importar rutas
const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/orders');
const reportRoutes = require('./routes/reports');
const tableRoutes = require('./routes/tables');
const uploadRoutes = require('./routes/upload'); // ✅ Asegúrate de que existe

// Importar middleware
const { errorHandler, requestLogger } = require('./middleware/errorHandler');

const app = express();

// Configuración CORS para desarrollo
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:19000', // Expo Metro Bundler
    'http://localhost:19001', // Expo DevTools
    'http://localhost:19006', // Expo Web
    process.env.EXPO_URL || 'http://192.168.1.100:19000',
    `http://${process.env.LOCAL_IP || '192.168.1.100'}:19000`,
    `exp://${process.env.LOCAL_IP || '192.168.1.100'}:19000`,
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// ✅ MIDDLEWARE GLOBAL (SIN DUPLICAR)
app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging en desarrollo
if (process.env.NODE_ENV === 'development') {
  app.use(requestLogger);
}

// ✅ SERVIR ARCHIVOS ESTÁTICOS (RUTA CORREGIDA)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Health check mejorado para uploads
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uploads: {
      endpoint: '/api/upload',
      maxSize: '10MB',
      formats: ['image/jpeg', 'image/png', 'image/webp'],
      staticPath: '/uploads'
    }
  });
});

// ✅ RUTAS DE LA API
app.use('/api/auth', authRoutes);
app.use('/api', menuRoutes);  // /api/menu, /api/categorias, etc.
app.use('/api/ordenes', orderRoutes);
app.use('/api/reportes', reportRoutes);
app.use('/api/mesas', tableRoutes);
app.use('/api/upload', uploadRoutes); // ✅ Ruta de upload

// Documentación básica de la API (actualizada)
app.get('/api', (req, res) => {
  res.json({
    message: 'Restaurant Management API',
    version: '2.0.0',
    endpoints: {
      auth: '/api/auth',
      menu: '/api/menu',
      categories: '/api/categorias',
      orders: '/api/ordenes',
      reports: '/api/reportes',
      tables: '/api/mesas',
      upload: '/api/upload', // ✅ Nuevo endpoint
      health: '/api/health'
    },
    documentation: '/api/docs' // Para futuro Swagger
  });
});

// ✅ MIDDLEWARE DE ERROR PARA UPLOADS
app.use((error, req, res, next) => {
  // Errores específicos de multer
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Archivo demasiado grande (máximo 10MB)',
      error: 'FILE_TOO_LARGE'
    });
  }
  
  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      message: 'Demasiados archivos (máximo 1)',
      error: 'TOO_MANY_FILES'
    });
  }
  
  if (error.message === 'Solo se permiten archivos de imagen') {
    return res.status(400).json({
      success: false,
      message: 'Tipo de archivo no permitido. Solo imágenes.',
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  // Pasar al siguiente middleware de error
  next(error);
});

// Manejo de rutas no encontradas (actualizado)
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      '/api/health', 
      '/api/menu', 
      '/api/ordenes', 
      '/api/auth',
      '/api/upload' // ✅ Incluir nueva ruta
    ]
  });
});

// ✅ MIDDLEWARE DE MANEJO DE ERRORES (debe ir al final)
app.use(errorHandler);

module.exports = app;