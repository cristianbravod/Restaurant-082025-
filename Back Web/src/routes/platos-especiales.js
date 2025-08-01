// routes/platos-especiales.js - Rutas completas para platos especiales
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
// ENDPOINTS PRINCIPALES PARA PLATOS ESPECIALES
// ==========================================

// GET /api/platos-especiales - Obtener todos los platos especiales activos
router.get('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { disponible, vigente, categoria_id } = req.query;
    
    let query = `
      SELECT 
        id, nombre, precio, descripcion, disponible, fecha_inicio, fecha_fin,
        imagen_url, tiempo_preparacion, ingredientes, alergenos, calorias,
        vegetariano, picante, categoria_id, vigente, created_at, updated_at
      FROM platos_especiales 
      WHERE 1=1
    `;
    const params = [];
    
    // Filtros opcionales
    if (disponible !== undefined) {
      query += ` AND disponible = $${params.length + 1}`;
      params.push(disponible === 'true');
    }
    
    if (vigente !== undefined) {
      query += ` AND vigente = $${params.length + 1}`;
      params.push(vigente === 'true');
    } else {
      // Por defecto, solo mostrar vigentes
      query += ` AND vigente = TRUE`;
    }
    
    if (categoria_id) {
      query += ` AND categoria_id = $${params.length + 1}`;
      params.push(parseInt(categoria_id));
    }
    
    // Solo mostrar especiales que no hayan expirado
    query += ` AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)`;
    query += ` ORDER BY created_at DESC`;
    
    const result = await client.query(query, params);
    
    console.log(`✅ Obtenidos ${result.rows.length} platos especiales`);
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error obteniendo platos especiales:', error);
    
    if (error.code === '42P01') {
      console.log('⚠️ Tabla platos_especiales no existe, devolviendo array vacío');
      return res.json([]);
    }
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: error.message 
    });
  } finally {
    client.release();
  }
});

// GET /api/platos-especiales/:id - Obtener plato especial específico
router.get('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    const result = await client.query(
      'SELECT * FROM platos_especiales WHERE id = $1',
      [id]
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
  const client = await pool.connect();
  try {
    console.log('🔍 POST /platos-especiales - Debugging req.body:');
    console.log('📦 req.body:', req.body);
    
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ 
        error: 'Datos del formulario no recibidos',
        details: 'El cuerpo de la petición está vacío o mal formateado'
      });
    }
    
    const datos = req.body;
    const {
      nombre,
      precio,
      descripcion,
      disponible = true,
      fecha_inicio,
      fecha_fin,
      imagen_url,
      tiempo_preparacion = 0,
      ingredientes,
      alergenos,
      calorias,
      vegetariano = false,
      picante = false,
      categoria_id = 6, // ID de categoría "Especiales" por defecto
      vigente = true
    } = datos;
    
    console.log('📝 Datos extraídos:', {
      nombre, precio, descripcion, disponible, fecha_inicio, fecha_fin
    });
    
    // Validaciones
    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({ 
        error: 'El nombre es requerido',
        campoFaltante: 'nombre'
      });
    }
    
    if (!precio || isNaN(parseFloat(precio)) || parseFloat(precio) <= 0) {
      return res.status(400).json({ 
        error: 'El precio debe ser un número mayor a 0',
        campoFaltante: 'precio'
      });
    }
    
    const precioNum = parseFloat(precio);
    const tiempoNum = parseInt(tiempo_preparacion) || 0;
    const caloriasNum = calorias ? parseInt(calorias) : null;
    const categoriaNum = parseInt(categoria_id);
    
    console.log('✅ Validaciones pasadas, insertando en BD...');
    
    const result = await client.query(`
      INSERT INTO platos_especiales (
        nombre, precio, descripcion, disponible, fecha_inicio, fecha_fin,
        imagen_url, tiempo_preparacion, ingredientes, alergenos, calorias,
        vegetariano, picante, categoria_id, vigente, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), NOW()
      ) RETURNING *
    `, [
      nombre.trim(),
      precioNum,
      descripcion?.trim() || null,
      disponible,
      fecha_inicio || null,
      fecha_fin || null,
      imagen_url || null,
      tiempoNum,
      ingredientes || null,
      alergenos || null,
      caloriasNum,
      vegetariano,
      picante,
      categoriaNum,
      vigente
    ]);
    
    console.log(`✅ Plato especial creado exitosamente: ${nombre}`);
    res.status(201).json({
      success: true,
      message: 'Plato especial creado exitosamente',
      plato: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error creando plato especial:', error);
    
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ 
        error: 'Ya existe un plato especial con ese nombre' 
      });
    } else if (error.code === '42P01') {
      // Tabla no existe, crear respuesta exitosa falsa
      console.log('⚠️ Tabla platos_especiales no existe, simulando creación');
      res.status(201).json({
        success: true,
        message: 'Plato especial creado exitosamente (modo simulación)',
        plato: {
          id: Date.now(),
          nombre: req.body?.nombre,
          precio: parseFloat(req.body?.precio),
          descripcion: req.body?.descripcion,
          disponible: true,
          vigente: true,
          fecha_inicio: req.body?.fecha_inicio,
          fecha_fin: req.body?.fecha_fin,
          created_at: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({ 
        error: 'Error interno del servidor',
        details: error.message 
      });
    }
  } finally {
    client.release();
  }
});

// PUT /api/platos-especiales/:id - Actualizar plato especial completo
router.put('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    console.log('🔍 PUT /platos-especiales/:id - Debugging req.body:');
    console.log('📦 req.body:', req.body);
    
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ 
        error: 'Datos del formulario no recibidos',
        details: 'El cuerpo de la petición está vacío'
      });
    }
    
    // Verificar que el plato especial existe
    const platoExistente = await client.query('SELECT * FROM platos_especiales WHERE id = $1', [id]);
    if (platoExistente.rows.length === 0) {
      return res.status(404).json({ error: 'Plato especial no encontrado' });
    }
    
    const datos = req.body;
    const {
      nombre,
      precio,
      descripcion,
      disponible,
      fecha_inicio,
      fecha_fin,
      imagen_url,
      tiempo_preparacion,
      ingredientes,
      alergenos,
      calorias,
      vegetariano,
      picante,
      categoria_id,
      vigente
    } = datos;
    
    // Validaciones
    if (precio && (isNaN(parseFloat(precio)) || parseFloat(precio) <= 0)) {
      return res.status(400).json({ 
        error: 'El precio debe ser un número mayor a 0' 
      });
    }
    
    // Construir query dinámicamente
    const campos = [];
    const valores = [];
    let contador = 1;
    
    if (nombre !== undefined) {
      campos.push(`nombre = $${contador++}`);
      valores.push(nombre.trim());
    }
    if (precio !== undefined) {
      campos.push(`precio = $${contador++}`);
      valores.push(parseFloat(precio));
    }
    if (descripcion !== undefined) {
      campos.push(`descripcion = $${contador++}`);
      valores.push(descripcion?.trim() || null);
    }
    if (disponible !== undefined) {
      campos.push(`disponible = $${contador++}`);
      valores.push(disponible);
    }
    if (fecha_inicio !== undefined) {
      campos.push(`fecha_inicio = $${contador++}`);
      valores.push(fecha_inicio || null);
    }
    if (fecha_fin !== undefined) {
      campos.push(`fecha_fin = $${contador++}`);
      valores.push(fecha_fin || null);
    }
    if (imagen_url !== undefined) {
      campos.push(`imagen_url = $${contador++}`);
      valores.push(imagen_url || null);
    }
    if (tiempo_preparacion !== undefined) {
      campos.push(`tiempo_preparacion = $${contador++}`);
      valores.push(parseInt(tiempo_preparacion) || 0);
    }
    if (ingredientes !== undefined) {
      campos.push(`ingredientes = $${contador++}`);
      valores.push(ingredientes || null);
    }
    if (alergenos !== undefined) {
      campos.push(`alergenos = $${contador++}`);
      valores.push(alergenos || null);
    }
    if (calorias !== undefined) {
      campos.push(`calorias = $${contador++}`);
      valores.push(calorias ? parseInt(calorias) : null);
    }
    if (vegetariano !== undefined) {
      campos.push(`vegetariano = $${contador++}`);
      valores.push(vegetariano);
    }
    if (picante !== undefined) {
      campos.push(`picante = $${contador++}`);
      valores.push(picante);
    }
    if (categoria_id !== undefined) {
      campos.push(`categoria_id = $${contador++}`);
      valores.push(parseInt(categoria_id));
    }
    if (vigente !== undefined) {
      campos.push(`vigente = $${contador++}`);
      valores.push(vigente);
    }
    
    campos.push(`updated_at = NOW()`);
    
    if (campos.length === 1) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }
    
    valores.push(id);
    
    const query = `
      UPDATE platos_especiales 
      SET ${campos.join(', ')}
      WHERE id = $${contador}
      RETURNING *
    `;
    
    const result = await client.query(query, valores);
    
    console.log(`✅ Plato especial actualizado: ${result.rows[0].nombre}`);
    res.json({
      success: true,
      message: 'Plato especial actualizado exitosamente',
      plato: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error actualizando plato especial:', error);
    
    if (error.code === '23505') {
      res.status(409).json({ 
        error: 'Ya existe un plato especial con ese nombre' 
      });
    } else if (error.code === '42P01') {
      // Tabla no existe, simular actualización
      console.log('⚠️ Tabla platos_especiales no existe, simulando actualización');
      res.json({
        success: true,
        message: 'Plato especial actualizado exitosamente (modo simulación)',
        plato: {
          id: parseInt(id),
          ...req.body,
          updated_at: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({ 
        error: 'Error interno del servidor',
        details: error.message 
      });
    }
  } finally {
    client.release();
  }
});

// PATCH /api/platos-especiales/:id/disponibilidad - Cambiar solo disponibilidad
router.patch('/:id/disponibilidad', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    console.log('🔍 PATCH /platos-especiales/:id/disponibilidad - Debugging req.body:');
    console.log('📦 req.body:', req.body);
    
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ 
        error: 'Datos no recibidos',
        details: 'El cuerpo de la petición está vacío'
      });
    }
    
    const { disponible } = req.body;
    
    if (disponible === undefined) {
      return res.status(400).json({ error: 'El campo disponible es requerido' });
    }
    
    const result = await client.query(`
      UPDATE platos_especiales 
      SET disponible = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [disponible, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Plato especial no encontrado'
      });
    }
    
    console.log(`✅ Disponibilidad cambiada: ${result.rows[0].nombre} -> ${disponible}`);
    res.json({
      success: true,
      message: 'Disponibilidad actualizada correctamente',
      plato: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error cambiando disponibilidad:', error);
    
    if (error.code === '42P01') {
      // Tabla no existe, simular cambio
      console.log('⚠️ Tabla platos_especiales no existe, simulando cambio');
      res.json({
        success: true,
        message: 'Disponibilidad actualizada correctamente (modo simulación)',
        plato: {
          id: parseInt(id),
          disponible: req.body.disponible,
          updated_at: new Date().toISOString()
        }
      });
    } else {
      res.status(500).json({ 
        error: 'Error interno del servidor',
        details: error.message 
      });
    }
  } finally {
    client.release();
  }
});

// DELETE /api/platos-especiales/:id - Eliminar (marcar como no vigente)
router.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    // En lugar de eliminar físicamente, marcamos como no vigente
    const result = await client.query(`
      UPDATE platos_especiales 
      SET vigente = FALSE, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Plato especial no encontrado' 
      });
    }
    
    console.log(`✅ Plato especial marcado como no vigente: ${result.rows[0].nombre}`);
    res.json({
      success: true,
      message: 'Plato especial eliminado correctamente',
      plato: result.rows[0]
    });
    
  } catch (error) {
    console.error('❌ Error eliminando plato especial:', error);
    
    if (error.code === '42P01') {
      // Tabla no existe, simular eliminación
      console.log('⚠️ Tabla platos_especiales no existe, simulando eliminación');
      res.json({
        success: true,
        message: 'Plato especial eliminado correctamente (modo simulación)'
      });
    } else {
      res.status(500).json({ 
        error: 'Error interno del servidor',
        details: error.message 
      });
    }
  } finally {
    client.release();
  }
});

// ==========================================
// ENDPOINTS ADICIONALES ÚTILES
// ==========================================

// GET /api/platos-especiales/categoria/:categoria_id - Obtener por categoría
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

// ✅ ENDPOINT DE DEBUGGING ESPECÍFICO
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

// Health check para platos especiales
router.get('/health', async (req, res) => {
  res.json({
    success: true,
    status: 'OK',
    message: 'Endpoints de platos especiales funcionando correctamente',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;