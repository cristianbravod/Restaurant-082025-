// routes/platos-especiales.js - ORDEN CORREGIDO DE RUTAS

const express = require('express');
const { Pool } = require('pg');
const router = express.Router();
const config = require('../config/database');

const pool = new Pool(config);

// ✅ MIDDLEWARE PARA DEBUGGING
router.use((req, res, next) => {
  console.log(`⭐ Platos Especiales Request: ${req.method} ${req.originalUrl}`);
  console.log('📋 Headers:', req.headers);
  console.log('📦 Body:', req.body);
  next();
});

// ==========================================
// IMPORTANTE: RUTAS ESPECÍFICAS PRIMERO, DINÁMICAS AL FINAL
// ==========================================

// ✅ 1. RUTAS ESPECÍFICAS (van PRIMERO)

// GET /api/platos-especiales - Obtener todos los platos especiales vigentes
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('📋 Obteniendo platos especiales vigentes...');
    
    const query = `
      SELECT 
        id, nombre, precio, descripcion, disponible, fecha_inicio, fecha_fin,
        imagen_url, imagen_thumbnail, imagen_medium, imagen_large,
        imagen_filename, imagen_metadata, imagen,
        tiempo_preparacion, ingredientes, alergenos, calorias,
        vegetariano, picante, categoria_id, vigente, created_at, updated_at
      FROM platos_especiales 
      WHERE vigente = TRUE
      ORDER BY created_at DESC
    `;
    
    const result = await client.query(query);
    
    console.log(`✅ Obtenidos ${result.rows.length} platos especiales vigentes`);
    
    result.rows.forEach((plato, index) => {
      console.log(`  ${index + 1}. ${plato.nombre} (ID: ${plato.id})`);
    });
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error obteniendo platos especiales:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// GET /api/platos-especiales/health - Health check
router.get('/health', async (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Endpoints de platos especiales funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

// GET /api/platos-especiales/test-vigentes - MOVER AQUÍ (ANTES de /:id)
router.get('/test-vigentes', async (req, res) => {
  const client = await pool.connect();
  try {
    console.log('🔍 TEST-VIGENTES: Obteniendo platos vigentes...');
    
    const result = await client.query(
      'SELECT * FROM platos_especiales WHERE vigente = $1 ORDER BY created_at DESC',
      [true]
    );
    
    res.json({
      success: true,
      total: result.rows.length,
      platos: result.rows,
      query: 'SELECT * FROM platos_especiales WHERE vigente = true',
      message: `Se encontraron ${result.rows.length} platos vigentes`
    });
    
  } catch (error) {
    console.error('❌ Error en test-vigentes:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  } finally {
    client.release();
  }
});

// GET /api/platos-especiales/debug-all - Ver TODOS los platos
router.get('/debug-all', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT 
        id, nombre, precio, descripcion, disponible, vigente,
        fecha_inicio, fecha_fin, imagen_url, created_at, updated_at
      FROM platos_especiales 
      ORDER BY created_at DESC
    `);
    
    console.log('🔍 DEBUG - Todos los platos especiales en BD:');
    result.rows.forEach(plato => {
      console.log(`  📄 ID: ${plato.id}, Nombre: ${plato.nombre}, Vigente: ${plato.vigente}, Disponible: ${plato.disponible}`);
    });
    
    res.json({
      success: true,
      total: result.rows.length,
      platos: result.rows
    });
    
  } catch (error) {
    console.error('❌ Error debug:', error);
    res.status(500).json({ error: error.message });
  } finally {
    client.release();
  }
});

// GET /api/platos-especiales/disponibles - Solo los disponibles
router.get('/disponibles', async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT * FROM platos_especiales 
      WHERE disponible = TRUE 
        AND vigente = TRUE
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY created_at DESC
    `);
    
    console.log(`✅ Obtenidos ${result.rows.length} platos especiales disponibles`);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error obteniendo platos disponibles:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// POST /api/platos-especiales/debug-body - Debug endpoint
router.post('/debug-body', (req, res) => {
  console.log('⭐ DEBUG ENDPOINT PLATOS ESPECIALES:');
  console.log('📦 req.body:', req.body);
  console.log('📊 typeof req.body:', typeof req.body);
  console.log('📋 req.headers:', req.headers);
  
  res.json({
    success: true,
    message: 'Debug endpoint platos especiales',
    data: {
      body: req.body,
      bodyType: typeof req.body,
      headers: req.headers,
      method: req.method,
      url: req.url,
      timestamp: new Date().toISOString()
    }
  });
});

// GET /api/platos-especiales/categoria/:categoria_id - Por categoría
router.get('/categoria/:categoria_id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { categoria_id } = req.params;
    
    const result = await client.query(`
      SELECT * FROM platos_especiales 
      WHERE categoria_id = $1 
        AND vigente = TRUE 
        AND disponible = TRUE
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY created_at DESC
    `, [categoria_id]);
    
    console.log(`✅ Obtenidos ${result.rows.length} platos especiales de categoría ${categoria_id}`);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error obteniendo platos por categoría:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// ✅ 2. RUTAS DINÁMICAS (van AL FINAL)

// GET /api/platos-especiales/:id - AHORA VA DESPUÉS DE LAS RUTAS ESPECÍFICAS
router.get('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    // Validar que el ID sea numérico
    if (isNaN(id)) {
      return res.status(400).json({ 
        error: 'ID inválido, debe ser un número' 
      });
    }
    
    const result = await client.query(
      'SELECT * FROM platos_especiales WHERE id = $1',
      [parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Plato especial no encontrado' 
      });
    }
    
    console.log(`✅ Plato especial obtenido: ${result.rows[0].nombre}`);
    res.json(result.rows[0]);
    
  } catch (error) {
    console.error('❌ Error obteniendo plato especial:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// POST /api/platos-especiales - Crear nuevo plato especial
router.post('/', async (req, res) => {
  // ... código existente ...
});

// PUT /api/platos-especiales/:id - Actualizar plato especial
router.put('/:id', async (req, res) => {
  // ... código existente ...
});

// PATCH /api/platos-especiales/:id/disponibilidad - Cambiar solo disponibilidad
router.patch('/:id/disponibilidad', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { disponible } = req.body;
    
    console.log(`🔄 Cambiando disponibilidad del plato ${id} a ${disponible}`);
    
    if (disponible === undefined) {
      return res.status(400).json({ 
        error: 'El campo disponible es requerido' 
      });
    }
    
    // ✅ IMPORTANTE: Solo actualizar disponible, NO tocar vigente ni otros campos
    const result = await client.query(`
      UPDATE platos_especiales 
      SET 
        disponible = $1, 
        updated_at = NOW()
      WHERE id = $2 AND vigente = TRUE
      RETURNING *
    `, [disponible, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Plato especial no encontrado o no vigente'
      });
    }
    
    console.log(`✅ Disponibilidad actualizada: ${result.rows[0].nombre} -> disponible: ${disponible}`);
    
    res.json({
      success: true,
      message: 'Disponibilidad actualizada correctamente',
      plato: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error cambiando disponibilidad:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// DELETE /api/platos-especiales/:id - Borrado lógico
router.delete('/:id', async (req, res) => {
  // ... código existente ...
});

module.exports = router;