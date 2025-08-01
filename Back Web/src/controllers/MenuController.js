// src/controllers/MenuController.js - Versión con UNION de tablas
const { Pool } = require('pg');
const config = require('../config/database');

const pool = new Pool(config);

class MenuController {
  // Obtener categorías
  async getCategories(req, res) {
    try {
      const result = await pool.query('SELECT * FROM categorias WHERE activo = true ORDER BY nombre');
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting categories:', error);
      res.status(500).json({ message: 'Error retrieving categories', error: error.message });
    }
  }

  // ✅ NUEVO: Obtener menú COMPLETO con UNION de ambas tablas
  async getMenu(req, res) {
    try {
      const { categoria_id, vegetariano, picante } = req.query;
      
      // Query con UNION para obtener productos de ambas tablas
      let query = `
        SELECT 
          m.id,
          m.nombre,
          m.precio,
          m.categoria_id,
          m.descripcion,
          m.disponible,
          m.vegetariano,
          m.picante,
          m.imagen,
          m.ingredientes,
          m.tiempo_preparacion,
          c.nombre as categoria_nombre,
          false as es_especial,
          m.created_at,
          m.updated_at
        FROM menu_items m 
        JOIN categorias c ON m.categoria_id = c.id 
        WHERE m.disponible = true AND c.activo = true
        
        UNION ALL
        
        SELECT 
          pe.id,
          pe.nombre,
          pe.precio,
          pe.categoria_id,
          pe.descripcion,
          pe.disponible,
          pe.vegetariano,
          pe.picante,
          pe.imagen,
          pe.ingredientes,
          pe.tiempo_preparacion,
          c.nombre as categoria_nombre,
          true as es_especial,
          pe.created_at,
          pe.updated_at
        FROM platos_especiales pe 
        JOIN categorias c ON pe.categoria_id = c.id 
        WHERE pe.disponible = true AND c.activo = true
      `;
      
      const params = [];
      let paramCount = 0;

      // Filtros adicionales
      if (categoria_id) {
        paramCount++;
        // Aplicar filtro a ambas partes del UNION
        query = query.replace(
          'WHERE m.disponible = true AND c.activo = true',
          `WHERE m.disponible = true AND c.activo = true AND m.categoria_id = $${paramCount}`
        ).replace(
          'WHERE pe.disponible = true AND c.activo = true',
          `WHERE pe.disponible = true AND c.activo = true AND pe.categoria_id = $${paramCount}`
        );
        params.push(categoria_id);
      }

      if (vegetariano === 'true') {
        query = query.replace(
          'WHERE m.disponible = true',
          'WHERE m.disponible = true AND m.vegetariano = true'
        ).replace(
          'WHERE pe.disponible = true',
          'WHERE pe.disponible = true AND pe.vegetariano = true'
        );
      }

      if (picante === 'true') {
        query = query.replace(
          'AND c.activo = true',
          'AND c.activo = true AND m.picante = true'
        ).replace(
          'AND c.activo = true',
          'AND c.activo = true AND pe.picante = true'
        );
      }

      // Ordenar por categoría y nombre
      query += ' ORDER BY categoria_nombre, nombre';

      console.log('🔍 Query ejecutada:', query);
      console.log('🔍 Parámetros:', params);

      const result = await pool.query(query, params);
      
      console.log(`✅ Productos encontrados: ${result.rows.length}`);
      console.log('📊 Productos por categoría:');
      
      // Agrupar por categoría para logging
      const categorias = {};
      result.rows.forEach(item => {
        const cat = item.categoria_nombre;
        if (!categorias[cat]) categorias[cat] = [];
        categorias[cat].push(item.nombre);
      });
      
      Object.keys(categorias).forEach(cat => {
        console.log(`   📁 ${cat}: ${categorias[cat].length} items`);
        console.log(`      Items: ${categorias[cat].join(', ')}`);
      });

      res.json(result.rows);
    } catch (error) {
      console.error('❌ Error getting menu:', error);
      res.status(500).json({ message: 'Error retrieving menu', error: error.message });
    }
  }

  // ✅ NUEVO: Endpoint específico para web con estructura agrupada
  async getMenuForWeb(req, res) {
    try {
      console.log('🌐 Generando menú para web con estructura agrupada...');
      
      // Obtener todas las categorías activas
      const categoriesResult = await pool.query(
        'SELECT * FROM categorias WHERE activo = true ORDER BY nombre'
      );
      
      // Obtener todos los items con UNION
      const itemsResult = await pool.query(`
        SELECT 
          m.id,
          m.nombre,
          m.precio,
          m.categoria_id,
          m.descripcion,
          m.disponible,
          m.vegetariano,
          m.picante,
          m.imagen,
          m.ingredientes,
          m.tiempo_preparacion,
          c.nombre as categoria_nombre,
          false as es_especial,
          m.created_at,
          m.updated_at
        FROM menu_items m 
        JOIN categorias c ON m.categoria_id = c.id 
        WHERE m.disponible = true AND c.activo = true
        
        UNION ALL
        
        SELECT 
          pe.id,
          pe.nombre,
          pe.precio,
          pe.categoria_id,
          pe.descripcion,
          pe.disponible,
          pe.vegetariano,
          pe.picante,
          pe.imagen,
          pe.ingredientes,
          pe.tiempo_preparacion,
          c.nombre as categoria_nombre,
          true as es_especial,
          pe.created_at,
          pe.updated_at
        FROM platos_especiales pe 
        JOIN categorias c ON pe.categoria_id = c.id 
        WHERE pe.disponible = true AND c.activo = true
        
        ORDER BY categoria_nombre, nombre
      `);
      
      // Separar platos especiales de items normales
      const platosEspeciales = itemsResult.rows.filter(item => item.es_especial === true);
      const itemsNormales = itemsResult.rows.filter(item => item.es_especial !== true);
      
      // Agrupar items normales por categoría
      const categorias = categoriesResult.rows.map(categoria => {
        const items = itemsNormales.filter(item => item.categoria_id === categoria.id);
        return {
          id: categoria.id,
          nombre: categoria.nombre,
          items: items
        };
      }).filter(cat => cat.items.length > 0); // Solo categorías con items
      
      console.log('📊 Resultado web:');
      console.log(`   📁 ${categorias.length} categorías con items normales`);
      console.log(`   ⭐ ${platosEspeciales.length} platos especiales`);
      console.log(`   🍽️ ${itemsNormales.length} items normales total`);
      
      categorias.forEach(cat => {
        console.log(`   📁 ${cat.nombre}: ${cat.items.length} items`);
      });
      
      const response = {
        success: true,
        categorias: categorias,
        platos_especiales: platosEspeciales,
        restaurante: {
          // Aquí puedes agregar info del restaurante si la tienes en BD
          nombre: "Ooilo Taqueria",
          telefono: null,
          horarios: null,
          direccion: null
        },
        timestamp: new Date().toISOString(),
        total_items: itemsResult.rows.length,
        total_categorias: categorias.length,
        total_especiales: platosEspeciales.length
      };
      
      res.json(response);
      
    } catch (error) {
      console.error('❌ Error getting menu for web:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error retrieving menu for web', 
        error: error.message 
      });
    }
  }

  // Obtener item del menú (buscar en ambas tablas)
  async getMenuItem(req, res) {
    try {
      // Primero buscar en menu_items
      let result = await pool.query(
        `SELECT m.*, c.nombre as categoria_nombre, false as es_especial
         FROM menu_items m 
         JOIN categorias c ON m.categoria_id = c.id 
         WHERE m.id = $1`,
        [req.params.id]
      );
      
      // Si no se encuentra, buscar en platos_especiales
      if (result.rows.length === 0) {
        result = await pool.query(
          `SELECT pe.*, c.nombre as categoria_nombre, true as es_especial
           FROM platos_especiales pe 
           JOIN categorias c ON pe.categoria_id = c.id 
           WHERE pe.id = $1`,
          [req.params.id]
        );
      }
      
      if (result.rows.length === 0) {
        return res.status(404).json({ message: 'Menu item not found' });
      }
      
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Error getting menu item:', error);
      res.status(500).json({ message: 'Error retrieving menu item', error: error.message });
    }
  }

  // Obtener solo platos especiales
  async getSpecialItems(req, res) {
    try {
      const result = await pool.query(`
        SELECT pe.*, c.nombre as categoria_nombre, true as es_especial
        FROM platos_especiales pe 
        JOIN categorias c ON pe.categoria_id = c.id 
        WHERE pe.disponible = true AND c.activo = true
        ORDER BY pe.created_at DESC
      `);
      
      console.log(`⭐ Platos especiales encontrados: ${result.rows.length}`);
      res.json(result.rows);
    } catch (error) {
      console.error('Error getting special items:', error);
      res.status(500).json({ message: 'Error retrieving special items', error: error.message });
    }
  }

  // ✅ NUEVO: Endpoint de debug para verificar datos
  async debugMenu(req, res) {
    try {
      console.log('🔍 === DEBUG DEL MENÚ ===');
      
      // Verificar categorías
      const categorias = await pool.query('SELECT * FROM categorias ORDER BY nombre');
      console.log(`📁 Total categorías: ${categorias.rows.length}`);
      
      // Verificar menu_items
      const menuItems = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE disponible = true) as disponibles FROM menu_items');
      console.log(`🍽️ Menu items: ${menuItems.rows[0].disponibles}/${menuItems.rows[0].total} disponibles`);
      
      // Verificar platos_especiales
      const especiales = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE disponible = true) as disponibles FROM platos_especiales');
      console.log(`⭐ Platos especiales: ${especiales.rows[0].disponibles}/${especiales.rows[0].total} disponibles`);
      
      // Verificar productos por categoría
      const porCategoria = await pool.query(`
        SELECT 
          c.nombre as categoria,
          c.activo as categoria_activa,
          COUNT(CASE WHEN m.id IS NOT NULL THEN 1 END) as menu_items,
          COUNT(CASE WHEN pe.id IS NOT NULL THEN 1 END) as platos_especiales
        FROM categorias c
        LEFT JOIN menu_items m ON c.id = m.categoria_id AND m.disponible = true
        LEFT JOIN platos_especiales pe ON c.id = pe.categoria_id AND pe.disponible = true
        GROUP BY c.id, c.nombre, c.activo
        ORDER BY c.nombre
      `);
      
      console.log('📊 Productos por categoría:');
      porCategoria.rows.forEach(row => {
        console.log(`   📁 ${row.categoria} (activa: ${row.categoria_activa}): ${row.menu_items} normales + ${row.platos_especiales} especiales`);
      });
      
      // Buscar específicamente Tacos Al Pastor
      const tacosResult = await pool.query(`
        SELECT 'menu_items' as tabla, m.*, c.nombre as categoria_nombre
        FROM menu_items m 
        JOIN categorias c ON m.categoria_id = c.id
        WHERE m.nombre ILIKE '%tacos%pastor%'
        
        UNION ALL
        
        SELECT 'platos_especiales' as tabla, pe.*, c.nombre as categoria_nombre
        FROM platos_especiales pe 
        JOIN categorias c ON pe.categoria_id = c.id
        WHERE pe.nombre ILIKE '%tacos%pastor%'
      `);
      
      if (tacosResult.rows.length > 0) {
        console.log('🌮 Tacos Al Pastor encontrados:');
        tacosResult.rows.forEach(taco => {
          console.log(`   - Tabla: ${taco.tabla}`);
          console.log(`   - Nombre: ${taco.nombre}`);
          console.log(`   - Categoría: ${taco.categoria_nombre}`);
          console.log(`   - Disponible: ${taco.disponible}`);
          console.log(`   - ID: ${taco.id}`);
        });
      } else {
        console.log('🌮 ❌ Tacos Al Pastor NO encontrados');
      }
      
      res.json({
        success: true,
        debug: {
          categorias: categorias.rows,
          estadisticas: {
            total_categorias: categorias.rows.length,
            menu_items_disponibles: menuItems.rows[0].disponibles,
            platos_especiales_disponibles: especiales.rows[0].disponibles
          },
          por_categoria: porCategoria.rows,
          tacos_al_pastor: tacosResult.rows
        }
      });
      
    } catch (error) {
      console.error('❌ Error en debug:', error);
      res.status(500).json({ 
        success: false,
        message: 'Error en debug', 
        error: error.message 
      });
    }
  }

  // Métodos de admin (simplificados por ahora)
  async createCategory(req, res) {
    res.status(501).json({ message: 'Create category not implemented yet' });
  }

  async createMenuItem(req, res) {
    res.status(501).json({ message: 'Create menu item not implemented yet' });
  }

  async updateMenuItem(req, res) {
    res.status(501).json({ message: 'Update menu item not implemented yet' });
  }

  async deleteMenuItem(req, res) {
    res.status(501).json({ message: 'Delete menu item not implemented yet' });
  }

  async toggleAvailability(req, res) {
    res.status(501).json({ message: 'Toggle availability not implemented yet' });
  }

  async createSpecialItem(req, res) {
    res.status(501).json({ message: 'Create special item not implemented yet' });
  }
}

module.exports = new MenuController();