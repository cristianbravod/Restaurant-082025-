// ===================================================================
// 3. MODIFICACIONES A LOS COMPONENTES EXISTENTES
// ===================================================================

// hooks/useImageUpload.js - Hook personalizado para manejo de imágenes
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageService } from '../services/ImageService';

export const useImageUpload = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageUrls, setImageUrls] = useState(null);

  const requestPermissions = useCallback(async () => {
    try {
      const [cameraResult, mediaResult] = await Promise.all([
        ImagePicker.requestCameraPermissionsAsync(),
        ImagePicker.requestMediaLibraryPermissionsAsync()
      ]);
      
      return cameraResult.status === 'granted' && mediaResult.status === 'granted';
    } catch (error) {
      console.error('❌ Error solicitando permisos:', error);
      return false;
    }
  }, []);

  const processImageUpload = useCallback(async (imageUri, metadata = {}) => {
    try {
      setUploadingImage(true);
      console.log('📤 Procesando imagen:', imageUri);

      const result = await ImageService.processImage(imageUri, metadata);
      
      if (result.success) {
        setSelectedImage(result.defaultUrl);
        setImageUrls(result.urls);
        setImageError(false);
        
        Alert.alert('✅ Éxito', result.message);
        
        return {
          success: true,
          imageUrl: result.defaultUrl,
          webUrl: result.webUrl,
          thumbnailUrl: result.thumbnailUrl,
          fileName: result.fileName,
          urls: result.urls
        };
      } else {
        setSelectedImage(result.defaultUrl);
        setImageError(true);
        
        if (result.warning) {
          Alert.alert('⚠️ Advertencia', result.warning);
        } else {
          Alert.alert('❌ Error', result.message || 'No se pudo procesar la imagen');
        }
        
        return {
          success: false,
          imageUrl: result.defaultUrl,
          error: result.error
        };
      }
    } catch (error) {
      console.error('❌ Error en upload:', error);
      setImageError(true);
      Alert.alert('❌ Error', 'Error procesando la imagen');
      
      return {
        success: false,
        error: error.message
      };
    } finally {
      setUploadingImage(false);
    }
  }, []);

  const takePhoto = useCallback(async (metadata = {}) => {
    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        Alert.alert('Permisos requeridos', 'Se necesitan permisos de cámara y galería.');
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        return await processImageUpload(result.assets[0].uri, metadata);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error tomando foto:', error);
      Alert.alert('❌ Error', 'No se pudo tomar la foto');
      return null;
    }
  }, [processImageUpload, requestPermissions]);

  const selectFromGallery = useCallback(async (metadata = {}) => {
    try {
      const hasPermissions = await requestPermissions();
      if (!hasPermissions) {
        Alert.alert('Permisos requeridos', 'Se necesitan permisos de galería.');
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: false,
      });

      if (!result.canceled && result.assets?.[0]) {
        return await processImageUpload(result.assets[0].uri, metadata);
      }
      
      return null;
    } catch (error) {
      console.error('❌ Error seleccionando imagen:', error);
      Alert.alert('❌ Error', 'No se pudo seleccionar la imagen');
      return null;
    }
  }, [processImageUpload, requestPermissions]);

  const showImageOptions = useCallback((metadata = {}) => {
    const options = [
      { text: 'Cancelar', style: 'cancel' },
      { text: '📷 Tomar Foto', onPress: () => takePhoto(metadata) },
      { text: '🖼️ Galería', onPress: () => selectFromGallery(metadata) }
    ];

    if (selectedImage) {
      options.push({ 
        text: '🗑️ Eliminar', 
        onPress: clearImage, 
        style: 'destructive' 
      });
    }

    Alert.alert('Imagen del Producto', 'Selecciona una opción:', options);
  }, [selectedImage, takePhoto, selectFromGallery]);

  const clearImage = useCallback(() => {
    setSelectedImage(null);
    setImageUrls(null);
    setImageError(false);
  }, []);

  const setImageFromUrl = useCallback((url) => {
    setSelectedImage(url);
    setImageError(false);
  }, []);

  return {
    selectedImage,
    uploadingImage,
    imageError,
    imageUrls,
    takePhoto,
    selectFromGallery,
    showImageOptions,
    clearImage,
    setImageFromUrl,
    processImageUpload
  };
};

// ===================================================================
// 4. COMPONENTE CARTA.JS MODIFICADO
// ===================================================================

// components/Carta.js - Versión actualizada con sistema de imágenes
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Image,
  Platform
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import { Ionicons } from "@expo/vector-icons";
import { useImageUpload } from "../hooks/useImageUpload";
import ApiService from "../services/ApiService";
import { useAuth } from "../contexts/AuthContext";

export default function Carta({ 
  menu, 
  setMenu, 
  categorias, 
  nuevoProducto, 
  setNuevoProducto, 
  setModoEdicion, 
  userRole 
}) {
  const { user } = useAuth();
  
  // Estados principales
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  
  // Hook personalizado para imágenes
  const {
    selectedImage,
    uploadingImage,
    imageError,
    imageUrls,
    showImageOptions,
    clearImage,
    setImageFromUrl
  } = useImageUpload();

  // Estados del formulario
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
    categoria: 'Entradas',
    descripcion: '',
    imagen: '',
    disponible: true,
    vegetariano: false,
    picante: false
  });

  const [formErrors, setFormErrors] = useState({});

  // Sincronizar imagen con formData
  useEffect(() => {
    if (selectedImage) {
      setFormData(prev => ({
        ...prev,
        imagen: imageUrls?.webUrl || selectedImage // Usar URL de alta calidad para la web
      }));
    }
  }, [selectedImage, imageUrls]);

  // Cargar datos de producto en edición
  useEffect(() => {
    if (nuevoProducto && nuevoProducto.id) {
      setFormData({
        nombre: nuevoProducto.nombre || '',
        precio: nuevoProducto.precio ? nuevoProducto.precio.toString() : '',
        categoria: nuevoProducto.categoria || 'Entradas',
        descripcion: nuevoProducto.descripcion || '',
        imagen: nuevoProducto.imagen || '',
        disponible: nuevoProducto.disponible !== false,
        vegetariano: nuevoProducto.vegetariano || false,
        picante: nuevoProducto.picante || false
      });
      setImageFromUrl(nuevoProducto.imagen || null);
    }
  }, [nuevoProducto, setImageFromUrl]);

  // Validación del formulario
  const validateForm = useCallback(() => {
    const errors = {};
    
    if (!formData.nombre.trim()) {
      errors.nombre = 'El nombre es requerido';
    } else if (formData.nombre.length < 2) {
      errors.nombre = 'El nombre debe tener al menos 2 caracteres';
    }
    
    const precio = parseFloat(formData.precio);
    if (!formData.precio || isNaN(precio) || precio <= 0) {
      errors.precio = 'El precio debe ser mayor a 0';
    }
    
    if (formData.descripcion.length > 500) {
      errors.descripcion = 'La descripción no puede exceder 500 caracteres';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // Agregar producto
  const agregarProducto = useCallback(async () => {
    if (!validateForm()) {
      Alert.alert('Error', 'Por favor corrige los errores en el formulario');
      return;
    }

    try {
      setLoading(true);
      setSyncStatus('Guardando producto...');

      const productoData = {
        ...formData,
        precio: parseFloat(formData.precio),
        imagen: imageUrls?.webUrl || selectedImage || formData.imagen,
        imagen_thumbnail: imageUrls?.thumbnailUrl,
        imagen_medium: imageUrls?.medium
      };

      let response;
      if (nuevoProducto?.id) {
        // Actualizar producto existente
        response = await ApiService.updateMenuItem(nuevoProducto.id, productoData);
        setSyncStatus('✅ Producto actualizado');
      } else {
        // Crear nuevo producto
        response = await ApiService.createMenuItem(productoData);
        setSyncStatus('✅ Producto agregado');
      }

      if (response.success) {
        // Actualizar lista local
        if (nuevoProducto?.id) {
          setMenu(prev => prev.map(item => 
            item.id === nuevoProducto.id ? { ...item, ...productoData } : item
          ));
        } else {
          setMenu(prev => [...prev, response.data]);
        }

        // Limpiar formulario
        setFormData({
          nombre: '',
          precio: '',
          categoria: 'Entradas',
          descripcion: '',
          imagen: '',
          disponible: true,
          vegetariano: false,
          picante: false
        });
        clearImage();
        setNuevoProducto(null);
        setModoEdicion(null);

        Alert.alert('✅ Éxito', nuevoProducto?.id ? 'Producto actualizado' : 'Producto agregado');
      }
    } catch (error) {
      console.error('❌ Error guardando producto:', error);
      setSyncStatus('❌ Error guardando');
      Alert.alert('❌ Error', 'No se pudo guardar el producto: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [formData, validateForm, imageUrls, selectedImage, nuevoProducto, setMenu, clearImage, setNuevoProducto, setModoEdicion]);

  // Eliminar producto
  const eliminarProducto = useCallback(async (producto) => {
    Alert.alert(
      'Confirmar eliminación',
      `¿Estás seguro de eliminar "${producto.nombre}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              setSyncStatus('Eliminando producto...');

              const response = await ApiService.deleteMenuItem(producto.id);
              
              if (response.success) {
                setMenu(prev => prev.filter(item => item.id !== producto.id));
                setSyncStatus('✅ Producto eliminado');
                Alert.alert('✅ Éxito', 'Producto eliminado correctamente');
              }
            } catch (error) {
              console.error('❌ Error eliminando producto:', error);
              setSyncStatus('❌ Error eliminando');
              Alert.alert('❌ Error', 'No se pudo eliminar el producto');
            } finally {
              setLoading(false);
              setTimeout(() => setSyncStatus(''), 3000);
            }
          }
        }
      ]
    );
  }, [setMenu]);

  // Editar producto
  const editarProducto = useCallback((producto) => {
    setNuevoProducto(producto);
    setModoEdicion(producto.id);
  }, [setNuevoProducto, setModoEdicion]);

  // Cancelar edición
  const cancelarEdicion = useCallback(() => {
    setFormData({
      nombre: '',
      precio: '',
      categoria: 'Entradas',
      descripcion: '',
      imagen: '',
      disponible: true,
      vegetariano: false,
      picante: false
    });
    clearImage();
    setNuevoProducto(null);
    setModoEdicion(null);
    setFormErrors({});
  }, [clearImage, setNuevoProducto, setModoEdicion]);

  // Refrescar datos
  const onRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      // Aquí puedes agregar lógica para refrescar desde el servidor
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Error refrescando:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Estado de sincronización */}
      {syncStatus ? (
        <View style={styles.syncStatus}>
          <Text style={styles.syncStatusText}>{syncStatus}</Text>
        </View>
      ) : null}

      {/* Formulario de producto */}
      <View style={styles.formContainer}>
        <Text style={styles.sectionTitle}>
          {nuevoProducto?.id ? '✏️ Editar Producto' : '➕ Agregar Producto'}
        </Text>

        {/* Nombre del producto */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Nombre del producto *</Text>
          <TextInput
            style={[styles.input, formErrors.nombre && styles.inputError]}
            placeholder="Ej: Tacos de Pastor"
            value={formData.nombre}
            onChangeText={(text) => setFormData(prev => ({...prev, nombre: text}))}
          />
          {formErrors.nombre && <Text style={styles.errorText}>{formErrors.nombre}</Text>}
        </View>

        {/* Precio */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Precio *</Text>
          <TextInput
            style={[styles.input, formErrors.precio && styles.inputError]}
            placeholder="0.00"
            value={formData.precio}
            onChangeText={(text) => setFormData(prev => ({...prev, precio: text}))}
            keyboardType="numeric"
          />
          {formErrors.precio && <Text style={styles.errorText}>{formErrors.precio}</Text>}
        </View>

        {/* Categoría */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Categoría</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={formData.categoria}
              onValueChange={(value) => setFormData(prev => ({...prev, categoria: value}))}
              style={styles.picker}
            >
              <Picker.Item label="Entradas" value="Entradas" />
              <Picker.Item label="Platos Principales" value="Platos Principales" />
              <Picker.Item label="Postres" value="Postres" />
              <Picker.Item label="Bebidas" value="Bebidas" />
              <Picker.Item label="Pizzas" value="Pizzas" />
            </Picker>
          </View>
        </View>

        {/* Imagen */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Imagen del producto</Text>
          <TouchableOpacity 
            style={styles.imageButton}
            onPress={() => showImageOptions({ categoria: formData.categoria, tipo: 'menu' })}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <>
                <Ionicons name="camera" size={24} color="#007AFF" />
                <Text style={styles.imageButtonText}>
                  {selectedImage ? 'Cambiar imagen' : 'Agregar imagen'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {selectedImage && (
            <View style={styles.imagePreview}>
              <Image 
                source={{ uri: selectedImage }} 
                style={styles.previewImage}
                onError={() => setImageError(true)}
              />
              {imageError && (
                <View style={styles.imageErrorOverlay}>
                  <Ionicons name="alert-circle" size={24} color="#FF3B30" />
                  <Text style={styles.imageErrorText}>Error cargando imagen</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Descripción */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Descripción</Text>
          <TextInput
            style={[styles.textArea, formErrors.descripcion && styles.inputError]}
            placeholder="Describe el producto..."
            value={formData.descripcion}
            onChangeText={(text) => setFormData(prev => ({...prev, descripcion: text}))}
            multiline
            numberOfLines={3}
          />
          {formErrors.descripcion && <Text style={styles.errorText}>{formErrors.descripcion}</Text>}
        </View>

        {/* Opciones avanzadas */}
        <TouchableOpacity 
          style={styles.advancedToggle}
          onPress={() => setShowAdvancedForm(!showAdvancedForm)}
        >
          <Text style={styles.advancedToggleText}>Opciones avanzadas</Text>
          <Ionicons 
            name={showAdvancedForm ? "chevron-up" : "chevron-down"} 
            size={20} 
            color="#007AFF" 
          />
        </TouchableOpacity>

        {showAdvancedForm && (
          <View style={styles.advancedForm}>
            {/* Disponible */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Disponible</Text>
              <Switch
                value={formData.disponible}
                onValueChange={(value) => setFormData(prev => ({...prev, disponible: value}))}
              />
            </View>

            {/* Vegetariano */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Vegetariano</Text>
              <Switch
                value={formData.vegetariano}
                onValueChange={(value) => setFormData(prev => ({...prev, vegetariano: value}))}
              />
            </View>

            {/* Picante */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Picante</Text>
              <Switch
                value={formData.picante}
                onValueChange={(value) => setFormData(prev => ({...prev, picante: value}))}
              />
            </View>
          </View>
        )}

        {/* Botones de acción */}
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, styles.saveButton]}
            onPress={agregarProducto}
            disabled={loading || uploadingImage}
          >
            {loading ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="white" />
                <Text style={styles.buttonText}>
                  {nuevoProducto?.id ? 'Actualizar' : 'Guardar'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {nuevoProducto?.id && (
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]}
              onPress={cancelarEdicion}
              disabled={loading}
            >
              <Ionicons name="close" size={20} color="#007AFF" />
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Lista de productos */}
      <View style={styles.menuContainer}>
        <Text style={styles.sectionTitle}>📋 Menú Actual</Text>
        
        {menu && menu.length > 0 ? (
          menu.map((producto) => (
            <View key={producto.id} style={styles.menuItem}>
              <View style={styles.menuItemHeader}>
                <View style={styles.menuItemInfo}>
                  <Text style={styles.menuItemName}>{producto.nombre}</Text>
                  <Text style={styles.menuItemPrice}>${producto.precio}</Text>
                  <Text style={styles.menuItemCategory}>{producto.categoria}</Text>
                </View>
                
                {producto.imagen && (
                  <Image 
                    source={{ uri: producto.imagen }} 
                    style={styles.menuItemImage}
                    defaultSource={require('../assets/placeholder.png')}
                  />
                )}
              </View>

              {producto.descripcion && (
                <Text style={styles.menuItemDescription}>{producto.descripcion}</Text>
              )}

              <View style={styles.menuItemTags}>
                {!producto.disponible && <Text style={styles.tagUnavailable}>No disponible</Text>}
                {producto.vegetariano && <Text style={styles.tagVegetarian}>🌱 Vegetariano</Text>}
                {producto.picante && <Text style={styles.tagSpicy}>🌶️ Picante</Text>}
              </View>

              {userRole === 'admin' && (
                <View style={styles.menuItemActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => editarProducto(producto)}
                  >
                    <Ionicons name="pencil" size={16} color="white" />
                    <Text style={styles.actionButtonText}>Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => eliminarProducto(producto)}
                  >
                    <Ionicons name="trash" size={16} color="white" />
                    <Text style={styles.actionButtonText}>Eliminar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="restaurant" size={48} color="#ccc" />
            <Text style={styles.emptyStateText}>No hay productos en el menú</Text>
            <Text style={styles.emptyStateSubtext}>Agrega tu primer producto arriba</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

// ===================================================================
// 5. COMPONENTE PLATO ESPECIAL MODIFICADO
// ===================================================================

// components/PlatoEspecial.js - Versión actualizada
import React, { useState, useEffect, useCallback } from "react";
import {
  View, 
  Text, 
  TextInput, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
  Image
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useImageUpload } from "../hooks/useImageUpload";
import ApiService from "../services/ApiService";
import { useAuth } from "../contexts/AuthContext";

export default function PlatoEspecial({ platosEspeciales = [], setPlatosEspeciales }) {
  const { user, userRole } = useAuth();
  
  // Estados principales
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [modoEdicion, setModoEdicion] = useState(null);
  
  // Hook personalizado para imágenes
  const {
    selectedImage,
    uploadingImage,
    imageError,
    imageUrls,
    showImageOptions,
    clearImage,
    setImageFromUrl
  } = useImageUpload();

  // Estados del formulario
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
    descripcion: '',
    disponible: true,
    vegetariano: false,
    picante: false,
    fecha_fin: '',
    tiempo_preparacion: ''
  });

  const [formErrors, setFormErrors] = useState({});

  // Función para normalizar precio
  const normalizarPrecio = useCallback((precio) => {
    if (precio === null || precio === undefined || precio === '') {
      return 0;
    }
    
    if (typeof precio === 'string') {
      const cleaned = precio.replace(/[^\d.,]/g, '').replace(',', '.');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? 0 : parsed;
    }
    
    if (typeof precio === 'number') {
      return isNaN(precio) ? 0 : precio;
    }
    
    return 0;
  }, []);

  // Sincronizar imagen con formData
  useEffect(() => {
    if (selectedImage && imageUrls) {
      setFormData(prev => ({
        ...prev,
        imagen_url: imageUrls.webUrl || selectedImage
      }));
    }
  }, [selectedImage, imageUrls]);

  // Validación del formulario
  const validateForm = useCallback(() => {
    const errors = {};
    
    if (!formData.nombre.trim()) {
      errors.nombre = 'El nombre es requerido';
    } else if (formData.nombre.length < 2) {
      errors.nombre = 'El nombre debe tener al menos 2 caracteres';
    }
    
    const precioNormalizado = normalizarPrecio(formData.precio);
    if (precioNormalizado <= 0) {
      errors.precio = 'El precio debe ser mayor a 0';
    } else if (precioNormalizado > 999999) {
      errors.precio = 'El precio es demasiado alto';
    }
    
    if (formData.descripcion.length > 500) {
      errors.descripcion = 'La descripción no puede exceder 500 caracteres';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData, normalizarPrecio]);

  // Guardar plato especial
  const guardarPlatoEspecial = useCallback(async () => {
    if (!validateForm()) {
      Alert.alert('Error', 'Por favor corrige los errores en el formulario');
      return;
    }

    try {
      setLoading(true);
      setSyncStatus('Guardando plato especial...');

      const platoData = {
        ...formData,
        precio: normalizarPrecio(formData.precio),
        imagen_url: imageUrls?.webUrl || selectedImage || '',
        imagen_thumbnail: imageUrls?.thumbnailUrl || '',
        imagen_medium: imageUrls?.medium || ''
      };

      let response;
      if (modoEdicion) {
        response = await ApiService.updatePlatoEspecial(modoEdicion, platoData);
        setSyncStatus('✅ Plato especial actualizado');
      } else {
        response = await ApiService.createPlatoEspecial(platoData);
        setSyncStatus('✅ Plato especial agregado');
      }

      if (response.success) {
        if (modoEdicion) {
          setPlatosEspeciales(prev => prev.map(item => 
            item.id === modoEdicion ? { ...item, ...platoData } : item
          ));
        } else {
          setPlatosEspeciales(prev => [...prev, response.data]);
        }

        // Limpiar formulario
        setFormData({
          nombre: '',
          precio: '',
          descripcion: '',
          disponible: true,
          vegetariano: false,
          picante: false,
          fecha_fin: '',
          tiempo_preparacion: ''
        });
        clearImage();
        setModoEdicion(null);

        Alert.alert('✅ Éxito', modoEdicion ? 'Plato especial actualizado' : 'Plato especial agregado');
      }
    } catch (error) {
      console.error('❌ Error guardando plato especial:', error);
      setSyncStatus('❌ Error guardando');
      Alert.alert('❌ Error', 'No se pudo guardar el plato especial: ' + error.message);
    } finally {
      setLoading(false);
      setTimeout(() => setSyncStatus(''), 3000);
    }
  }, [formData, validateForm, normalizarPrecio, imageUrls, selectedImage, modoEdicion, setPlatosEspeciales, clearImage]);

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => {}} />
      }
    >
      {/* Estado de sincronización */}
      {syncStatus ? (
        <View style={styles.syncStatus}>
          <Text style={styles.syncStatusText}>{syncStatus}</Text>
        </View>
      ) : null}

      {/* Formulario */}
      <View style={styles.formContainer}>
        <Text style={styles.sectionTitle}>
          {modoEdicion ? '✏️ Editar Plato Especial' : '⭐ Agregar Plato Especial'}
        </Text>

        {/* Imagen */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Imagen del plato especial</Text>
          <TouchableOpacity 
            style={styles.imageButton}
            onPress={() => showImageOptions({ categoria: 'platos_especiales', tipo: 'especial' })}
            disabled={uploadingImage}
          >
            {uploadingImage ? (
              <ActivityIndicator size="small" color="#007AFF" />
            ) : (
              <>
                <Ionicons name="camera" size={24} color="#007AFF" />
                <Text style={styles.imageButtonText}>
                  {selectedImage ? 'Cambiar imagen' : 'Agregar imagen'}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {selectedImage && (
            <View style={styles.imagePreview}>
              <Image 
                source={{ uri: selectedImage }} 
                style={styles.previewImage}
                onError={() => {}}
              />
              {imageError && (
                <View style={styles.imageErrorOverlay}>
                  <Ionicons name="alert-circle" size={24} color="#FF3B30" />
                  <Text style={styles.imageErrorText}>Error cargando imagen</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Resto del formulario... */}
        {/* (Continúa con los mismos campos que antes) */}
      </View>
    </ScrollView>
  );
}

// ===================================================================
// 6. CONFIGURACIÓN DEL SERVIDOR
// ===================================================================


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  syncStatus: {
    backgroundColor: '#007AFF',
    padding: 10,
    alignItems: 'center',
  },
  syncStatusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  formContainer: {
    backgroundColor: 'white',
    margin: 15,
    padding: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  inputGroup: {
    marginBottom: 15,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 5,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 5,
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  imageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    backgroundColor: '#f8f9ff',
  },
  imageButtonText: {
    color: '#007AFF',
    fontSize: 16,
    marginLeft: 8,
  },
  imagePreview: {
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  imageErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorText: {
    color: 'white',
    marginTop: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 20,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  saveButton: {
    backgroundColor: '#007AFF',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  cancelButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Más estilos...
});