// components/PlatoEspecial.js - VERSIÓN CORREGIDA CON MANEJO DE IMÁGENES FUNCIONANDO
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
  Platform,
  Keyboard,
  StatusBar
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { sizes, IconSizes, ThemeUtils } from '../utils/theme';

// ✅ IMPORTACIÓN SEGURA DE SAFE AREA
let useSafeAreaInsets;
try {
  const SafeAreaContext = require('react-native-safe-area-context');
  useSafeAreaInsets = SafeAreaContext.useSafeAreaInsets;
} catch (error) {
  console.log('⚠️ SafeAreaContext no disponible, usando fallback');
  useSafeAreaInsets = () => ({ top: 0, bottom: 0, left: 0, right: 0 });
}

import ApiService from "../services/ApiService";
import { ImageService } from "../services/ImageService";
import { useAuth } from "../contexts/AuthContext";

export default function PlatoEspecial({ platosEspeciales = [], setPlatosEspeciales }) {
  const { user, userRole } = useAuth();
  
  // ✅ USO SEGURO DE SAFE AREA
  let insets = { top: 0, bottom: 0, left: 0, right: 0 };
  try {
    if (useSafeAreaInsets) {
      insets = useSafeAreaInsets();
    }
  } catch (error) {
    console.log('⚠️ Error usando useSafeAreaInsets, usando valores por defecto');
  }
  
  // Estados principales
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [modoEdicion, setModoEdicion] = useState(null);
  
  // Estados para manejo de endpoints faltantes
  const [endpointDisponible, setEndpointDisponible] = useState(true);
  const [modoFallback, setModoFallback] = useState(false);
  const [errorConexion, setErrorConexion] = useState(null);

  // ✅ ESTADOS PARA MANEJO DE IMÁGENES MEJORADOS - COPIADOS DE CARTA.JS
  const [selectedImage, setSelectedImage] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [imageUploadResult, setImageUploadResult] = useState(null);
  // ✅ NUEVO: Estados para manejar imagen existente al editar
  const [existingImageUrl, setExistingImageUrl] = useState(null);
  const [hasNewImage, setHasNewImage] = useState(false);

  // Estados del formulario
  const [showAdvancedForm, setShowAdvancedForm] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    precio: '',
    descripcion: '',
    disponible: true,
    vegetariano: false,
    picante: false,
    fecha_fin: '',
    imagen_url: ''
  });

  // Estados para validación del formulario
  const [formErrors, setFormErrors] = useState({});
  const [isFormValid, setIsFormValid] = useState(false);

  // ✅ FUNCIÓN CRÍTICA PARA NORMALIZAR PRECIOS
  const normalizarPrecio = useCallback((precio) => {
    console.log('🔍 DEBUG - Precio recibido:', precio, 'tipo:', typeof precio);
    
    if (typeof precio === 'number' && !isNaN(precio) && precio > 0) {
      console.log('✅ Precio ya es número válido:', precio);
      return precio;
    }
    
    if (typeof precio === 'string' && precio.trim() !== '') {
      const cleaned = precio.replace(/[^\d.,]/g, '').replace(',', '.');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed) && parsed > 0) {
        console.log('✅ Precio string parseado:', parsed);
        return parsed;
      }
    }
    
    console.log('⚠️ Precio inválido, usando 0');
    return 0;
  }, []);

  // ✅ FORMATEAR PRECIO PARA MOSTRAR
  const formatearPrecio = useCallback((precio) => {
    const numeroLimpio = normalizarPrecio(precio);
    if (numeroLimpio === 0) return '$0';
    
    try {
      if (Platform.OS === 'android') {
        const numeroFormateado = numeroLimpio.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return `$${numeroFormateado}`;
      } else {
        return numeroLimpio.toLocaleString('es-CO', {
          style: 'currency',
          currency: 'COP',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0
        });
      }
    } catch (error) {
      const numeroRedondeado = Math.round(numeroLimpio);
      return `$${numeroRedondeado.toLocaleString()}`;
    }
  }, [normalizarPrecio]);

  // ✅ VALIDACIÓN DEL FORMULARIO
  const validarFormulario = useCallback(() => {
    const errores = {};
    
    if (!formData.nombre.trim()) {
      errores.nombre = 'El nombre es obligatorio';
    }
    
    const precioNormalizado = normalizarPrecio(formData.precio);
    if (precioNormalizado <= 0) {
      errores.precio = 'El precio debe ser mayor a 0';
    }
    
    if (!formData.descripcion.trim()) {
      errores.descripcion = 'La descripción es obligatoria';
    }
    
    setFormErrors(errores);
    setIsFormValid(Object.keys(errores).length === 0);
    
    return Object.keys(errores).length === 0;
  }, [formData, normalizarPrecio]);

  // Validar formulario cuando cambian los datos
  useEffect(() => {
    validarFormulario();
  }, [formData, validarFormulario]);

  // ✅ SELECCIONAR IMAGEN - CORREGIDA COMO EN CARTA.JS
  const seleccionarImagen = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos necesarios',
          'Para seleccionar imágenes necesitamos acceso a tu galería.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        console.log('🖼️ Nueva imagen seleccionada:', result.assets[0].uri);
        setSelectedImage(result.assets[0]);
        setHasNewImage(true); // ✅ MARCAR QUE HAY NUEVA IMAGEN
        setImageError(false);
        
        // ✅ ACTUALIZAR FORM DATA CON LA NUEVA IMAGEN
        setFormData(prev => ({
          ...prev,
          imagen_url: result.assets[0].uri
        }));
      }
    } catch (error) {
      console.error('Error seleccionando imagen:', error);
      Alert.alert('Error', 'No se pudo seleccionar la imagen');
    }
  };

  // ✅ SUBIR IMAGEN - MEJORADA COMO EN CARTA.JS
  const subirImagen = async () => {
    if (!selectedImage) return null;

    try {
      setUploadingImage(true);
      setImageUploadProgress(0);

      console.log('📤 Subiendo imagen al servidor...');
      const result = await ImageService.uploadImage(selectedImage.uri, {
        onProgress: (progress) => setImageUploadProgress(progress)
      });

      setImageUploadResult(result);
      console.log('✅ Resultado de la subida:', result);
      
      return result.url || result.defaultUrl || selectedImage.uri;
    } catch (error) {
      console.error('Error subiendo imagen:', error);
      setImageError(true);
      Alert.alert('Error', 'No se pudo subir la imagen');
      return selectedImage.uri; // ✅ FALLBACK A URI LOCAL
    } finally {
      setUploadingImage(false);
    }
  };

  // ✅ CREAR PLATO ESPECIAL - CORREGIDA
  const crearPlatoEspecial = async () => {
    if (!validarFormulario()) {
      Alert.alert('Error', 'Por favor corrige los errores en el formulario');
      return;
    }

    try {
      setLoading(true);
      
      // Subir imagen si existe
      let imagenUrl = formData.imagen_url;
      if (selectedImage && hasNewImage) {
        console.log('📤 Subiendo nueva imagen para crear plato especial...');
        imagenUrl = await subirImagen();
        if (!imagenUrl) return; // Error subiendo imagen
      }

      const nuevoPlato = {
        ...formData,
        precio: normalizarPrecio(formData.precio),
        imagen_url: imagenUrl,
        imagen: imagenUrl // ✅ AGREGAR CAMPO IMAGEN TAMBIÉN
      };

      console.log('🍽️ Creando plato especial:', nuevoPlato);

      if (endpointDisponible) {
        const response = await ApiService.createPlatoEspecial(nuevoPlato);
        
        // ✅ ASEGURAR QUE LA RESPUESTA INCLUYA LA IMAGEN
        const platoCompleto = {
          ...response,
          imagen_url: imagenUrl,
          imagen: imagenUrl
        };
        
        setPlatosEspeciales(prev => [...prev, platoCompleto]);
        setSyncStatus('✅ Plato especial creado exitosamente');
      } else {
        // Modo fallback
        const platoConId = {
          ...nuevoPlato,
          id: Date.now(),
          createdAt: new Date().toISOString(),
          _pendingSync: true
        };
        setPlatosEspeciales(prev => [...prev, platoConId]);
        setSyncStatus('📱 Plato guardado localmente (se sincronizará cuando haya conexión)');
        setPendingChanges(prev => prev + 1);
      }

      // ✅ LIMPIAR FORMULARIO CORRECTAMENTE
      limpiarFormulario();

    } catch (error) {
      console.error('❌ Error creando plato especial:', error);
      setErrorConexion(error.message);
      Alert.alert('Error', 'No se pudo crear el plato especial');
    } finally {
      setLoading(false);
      setTimeout(() => setSyncStatus(''), 3000);
    }
  };

  // ✅ ACTUALIZAR PLATO ESPECIAL - COMPLETAMENTE CORREGIDA
  const actualizarPlatoEspecial = async () => {
    if (!validarFormulario() || !modoEdicion) return;

    try {
      setLoading(true);
      setSyncStatus('🔄 Actualizando plato especial...');
      
      let imagenUrl = existingImageUrl || formData.imagen_url;
      
      // ✅ SOLO SUBIR SI HAY UNA NUEVA IMAGEN SELECCIONADA
      if (selectedImage && hasNewImage) {
        console.log('📤 Subiendo nueva imagen para actualizar plato especial...');
        const nuevaImagenUrl = await subirImagen();
        if (nuevaImagenUrl) {
          imagenUrl = nuevaImagenUrl;
          console.log('✅ Nueva imagen subida:', imagenUrl);
        }
      }

      const platoActualizado = {
        ...formData,
        id: modoEdicion,
        precio: normalizarPrecio(formData.precio),
        imagen_url: imagenUrl || null,
        imagen: imagenUrl || null // ✅ AGREGAR CAMPO IMAGEN TAMBIÉN
      };

      console.log('✏️ Actualizando plato especial con datos:', platoActualizado);

      if (endpointDisponible) {
        const response = await ApiService.updatePlatoEspecial(modoEdicion, platoActualizado);
        
        // ✅ ASEGURAR QUE LA RESPUESTA INCLUYA LA IMAGEN ACTUALIZADA
        const platoCompleto = {
          ...response,
          imagen_url: imagenUrl,
          imagen: imagenUrl
        };
        
        setPlatosEspeciales(prev => 
          prev.map(plato => plato.id === modoEdicion ? platoCompleto : plato)
        );
        setSyncStatus('✅ Plato especial actualizado exitosamente');
        console.log('✅ Plato especial actualizado en el estado:', platoCompleto);
      } else {
        platoActualizado._pendingSync = true;
        
        setPlatosEspeciales(prev => 
          prev.map(plato => plato.id === modoEdicion ? platoActualizado : plato)
        );
        setSyncStatus('📱 Cambios guardados localmente');
        setPendingChanges(prev => prev + 1);
      }

      // ✅ LIMPIAR FORMULARIO CORRECTAMENTE
      limpiarFormulario();

    } catch (error) {
      console.error('❌ Error actualizando plato especial:', error);
      setSyncStatus('❌ Error actualizando plato especial');
      Alert.alert('Error', 'No se pudo actualizar el plato especial');
    } finally {
      setLoading(false);
      setTimeout(() => setSyncStatus(''), 3000);
    }
  };

  // ✅ ELIMINAR PLATO ESPECIAL
  // ✅ ELIMINAR PLATO ESPECIAL (BORRADO LÓGICO)
  const eliminarPlatoEspecial = async (id) => {
    Alert.alert(
      'Confirmar eliminación',
      '¿Estás seguro de que quieres eliminar este plato especial?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              
              if (endpointDisponible) {
                // El backend ahora hace un borrado lógico (vigente = false)
                await ApiService.deletePlatoEspecial(id);
                
                // Remover del estado local
                setPlatosEspeciales(prev => prev.filter(plato => plato.id !== id));
                setSyncStatus('✅ Plato especial eliminado exitosamente');
              } else {
                // Modo offline: marcar como no vigente localmente
                setPlatosEspeciales(prev => prev.map(plato => 
                  plato.id === id 
                    ? { ...plato, vigente: false, _pendingSync: true }
                    : plato
                ).filter(plato => plato.vigente !== false));
                
                setSyncStatus('📱 Eliminación guardada localmente');
                setPendingChanges(prev => prev + 1);
              }
              
              console.log('✅ Plato especial eliminado (borrado lógico)');
            } catch (error) {
              console.error('❌ Error eliminando plato especial:', error);
              Alert.alert(
                'Error', 
                'No se pudo eliminar el plato especial. Por favor, intenta nuevamente.'
              );
            } finally {
              setLoading(false);
              setTimeout(() => setSyncStatus(''), 3000);
            }
          }
        }
      ]
    );
  };

  // ✅ EDITAR PLATO ESPECIAL - COMPLETAMENTE CORREGIDA
  const editarPlatoEspecial = (plato) => {
    if (!plato || typeof plato !== 'object') return;
    
    console.log('✏️ Editando plato especial:', plato);
    
    // ✅ CONFIGURAR DATOS DEL FORMULARIO
    setFormData({
      nombre: plato.nombre || '',
      precio: (plato.precio || 0).toString(),
      descripcion: plato.descripcion || '',
      disponible: plato.disponible !== false,
      vegetariano: plato.vegetariano === true,
      picante: plato.picante === true,
      fecha_fin: plato.fecha_fin || '',
      imagen_url: plato.imagen_url || plato.imagen || ''
    });
    
    // ✅ CONFIGURAR IMAGEN EXISTENTE
    const imagenExistente = plato.imagen_url || plato.imagen;
    if (imagenExistente) {
      console.log('🖼️ Plato especial tiene imagen existente:', imagenExistente);
      setExistingImageUrl(imagenExistente);
      // ✅ NO configurar selectedImage con la URL existente
      setSelectedImage(null);
    } else {
      console.log('📷 Plato especial sin imagen');
      setExistingImageUrl(null);
      setSelectedImage(null);
    }
    
    // ✅ RESETEAR ESTADOS DE NUEVA IMAGEN
    setHasNewImage(false);
    setImageError(false);
    setImageUploadProgress(0);
    setImageUploadResult(null);
    setUploadingImage(false);
    
    // ✅ CONFIGURAR MODO EDICIÓN
    setModoEdicion(plato.id);
    
    setSyncStatus('✏️ Editando plato especial...');
    console.log('✅ Formulario configurado para editar:', plato.nombre);
  };

  // ✅ TOGGLE DISPONIBILIDAD
  const toggleDisponibilidad = async (plato) => {
    if (userRole !== 'admin') {
      Alert.alert('Acceso restringido', 'Solo los administradores pueden cambiar la disponibilidad');
      return;
    }

    if (!plato || typeof plato !== 'object') return;

    try {
      const platoActualizado = { ...plato, disponible: !plato.disponible };
      
      if (endpointDisponible) {
        await ApiService.updatePlatoEspecial(plato.id, platoActualizado);
      }
      
      setPlatosEspeciales(prev => 
        prev.map(p => p.id === plato.id ? platoActualizado : p)
      );
      
      const nombreSeguro = plato.nombre || 'Plato especial';
      const estadoTexto = platoActualizado.disponible ? 'activado' : 'desactivado';
      setSyncStatus(`✅ ${nombreSeguro} ${estadoTexto}`);
    } catch (error) {
      console.error('❌ Error toggleando disponibilidad:', error);
      Alert.alert('Error', 'No se pudo cambiar la disponibilidad');
    } finally {
      setTimeout(() => setSyncStatus(''), 3000);
    }
  };

  // ✅ ELIMINAR IMAGEN ACTUAL
  const eliminarImagenActual = () => {
    Alert.alert(
      'Eliminar Imagen',
      '¿Estás seguro de que deseas eliminar la imagen actual?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setSelectedImage(null);
            setExistingImageUrl(null);
            setHasNewImage(false);
            setImageError(false);
            setImageUploadResult(null);
            setFormData(prev => ({ ...prev, imagen_url: '' }));
            console.log('🗑️ Imagen eliminada del formulario');
          }
        }
      ]
    );
  };

  // ✅ LIMPIAR FORMULARIO - COMPLETAMENTE CORREGIDA COMO EN CARTA.JS
  const limpiarFormulario = () => {
    setFormData({
      nombre: '',
      precio: '',
      descripcion: '',
      disponible: true,
      vegetariano: false,
      picante: false,
      fecha_fin: '',
      imagen_url: ''
    });
    
    // ✅ LIMPIAR TODOS LOS ESTADOS DE IMAGEN
    setSelectedImage(null);
    setExistingImageUrl(null);
    setHasNewImage(false);
    setImageError(false);
    setImageUploadProgress(0);
    setImageUploadResult(null);
    setUploadingImage(false);
    
    setModoEdicion(null);
    setFormErrors({});
    setShowAdvancedForm(false);
    setSyncStatus('');
    
    console.log('🧹 Formulario de plato especial limpiado completamente');
  };

  // ✅ FUNCIÓN PARA OBTENER LA IMAGEN A MOSTRAR - COPIADA DE CARTA.JS
  const getImageToShow = () => {
    // Si hay una nueva imagen seleccionada, mostrarla
    if (selectedImage && hasNewImage) {
      return selectedImage.uri;
    }
    // Si hay imagen existente y no hay nueva, mostrar la existente
    if (existingImageUrl && !hasNewImage) {
      return existingImageUrl;
    }
    // Si no hay nada, return null
    return null;
  };

  // ✅ REFRESH
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await ApiService.getPlatosEspeciales();
      setPlatosEspeciales(Array.isArray(response) ? response : response?.especiales || []);
      setSyncStatus('✅ Datos actualizados');
      setEndpointDisponible(true);
      setErrorConexion(null);
    } catch (error) {
      console.error('❌ Error en refresh:', error);
      setEndpointDisponible(false);
      setErrorConexion(error.message);
      setSyncStatus('❌ Error actualizando datos');
    } finally {
      setRefreshing(false);
    }
  }, [setPlatosEspeciales]);

  // ✅ EFECTOS
  useEffect(() => {
    const verificarEndpoint = async () => {
      try {
        await ApiService.getPlatosEspeciales();
        setEndpointDisponible(true);
        setModoFallback(false);
      } catch (error) {
        console.log('⚠️ Endpoint no disponible, activando modo fallback');
        setEndpointDisponible(false);
        setModoFallback(true);
        setErrorConexion(error.message);
      }
    };

    verificarEndpoint();
  }, []);

  // ✅ CÁLCULO DE PADDING DINÁMICO
  const getTopPadding = () => {
    if (Platform.OS === 'android') {
      return StatusBar.currentHeight ? StatusBar.currentHeight + 10 : 35;
    }
    return insets.top > 0 ? insets.top + 10 : 50;
  };

  const getBottomPadding = () => {
    return Math.max(insets.bottom || 0, 20);
  };

  // ✅ OBTENER IMAGEN A MOSTRAR
  const imageToShow = getImageToShow();

  return (
    <View style={[styles.container, { paddingTop: getTopPadding() }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: getBottomPadding() }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4CAF50']}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Platos Especiales</Text>
        </View>

        {/* Estado de conexión */}
        {syncStatus && typeof syncStatus === 'string' && syncStatus.length > 0 && (
          <View style={[
            styles.statusContainer,
            syncStatus.includes('✅') ? styles.statusSuccess :
            syncStatus.includes('❌') ? styles.statusError : {}
          ]}>
            <Text style={styles.statusText}>{syncStatus}</Text>
            {pendingChanges > 0 && (
              <Text style={styles.statusSubtext}>
                {pendingChanges} cambios pendientes de sincronización
              </Text>
            )}
          </View>
        )}

        {/* Alerta de modo fallback */}
        {modoFallback && (
          <View style={styles.alertContainer}>
            <Ionicons name="warning" size={20} color="#e65100" />
            <Text style={styles.alertText}>
              Modo offline activo. Los cambios se sincronizarán cuando se restablezca la conexión.
            </Text>
          </View>
        )}

        {/* Formulario */}
        <View style={styles.formContainer}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {modoEdicion ? 'Editar Plato Especial' : 'Agregar Plato Especial'}
            </Text>
            <TouchableOpacity
              style={styles.advancedToggle}
              onPress={() => setShowAdvancedForm(!showAdvancedForm)}
            >
              <Text style={styles.advancedToggleText}>Avanzado</Text>
              <Ionicons 
                name={showAdvancedForm ? "chevron-up" : "chevron-down"} 
                size={16} 
                color="#007AFF" 
              />
            </TouchableOpacity>
          </View>

          {/* Campos básicos */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Nombre del Plato *</Text>
            <TextInput
              style={[styles.input, formErrors.nombre && styles.inputError]}
              value={formData.nombre}
              onChangeText={(text) => setFormData(prev => ({ ...prev, nombre: text }))}
              placeholder="Ej: Paella Especial del Chef"
              multiline={false}
            />
            {formErrors.nombre && typeof formErrors.nombre === 'string' && (
              <Text style={styles.errorText}>{formErrors.nombre}</Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Precio *</Text>
            <TextInput
              style={[styles.input, formErrors.precio && styles.inputError]}
              value={formData.precio}
              onChangeText={(text) => setFormData(prev => ({ ...prev, precio: text }))}
              placeholder="Ej: 25000"
              keyboardType="numeric"
            />
            {formErrors.precio && typeof formErrors.precio === 'string' && (
              <Text style={styles.errorText}>{formErrors.precio}</Text>
            )}
            {formData.precio && formData.precio.length > 0 && (
              <Text style={styles.pricePreview}>
                Vista previa: {formatearPrecio(formData.precio)}
              </Text>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Descripción *</Text>
            <TextInput
              style={[styles.textArea, formErrors.descripcion && styles.inputError]}
              value={formData.descripcion}
              onChangeText={(text) => setFormData(prev => ({ ...prev, descripcion: text }))}
              placeholder="Describe los ingredientes y características especiales..."
              multiline={true}
              numberOfLines={3}
            />
            {formErrors.descripcion && typeof formErrors.descripcion === 'string' && (
              <Text style={styles.errorText}>{formErrors.descripcion}</Text>
            )}
          </View>

          {/* Disponibilidad */}
          <View style={styles.switchContainer}>
            <Text style={styles.label}>Disponible</Text>
            <Switch
              value={formData.disponible}
              onValueChange={(value) => setFormData(prev => ({ ...prev, disponible: value }))}
              thumbColor={formData.disponible ? "#4CAF50" : "#f4f3f4"}
              trackColor={{ false: "#767577", true: "#81b0ff" }}
            />
          </View>

          {/* ✅ IMAGEN DEL PLATO - COMPLETAMENTE CORREGIDA COMO EN CARTA.JS */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Imagen del Plato</Text>
            
            {imageToShow ? (
              <View style={styles.imageContainer}>
                <Image source={{ uri: imageToShow }} style={styles.imagePreview} />
                
                {/* ✅ INDICADOR DE TIPO DE IMAGEN */}
                <View style={[
                  styles.imageTypeBadge,
                  { backgroundColor: hasNewImage ? '#4CAF50' : '#2196F3' }
                ]}>
                  <Ionicons 
                    name={hasNewImage ? "add-circle" : "image"} 
                    size={12} 
                    color="white" 
                  />
                  <Text style={styles.imageTypeText}>
                    {hasNewImage ? 'Nueva' : 'Actual'}
                  </Text>
                </View>
                
                {uploadingImage && (
                  <View style={styles.uploadingOverlay}>
                    <ActivityIndicator size={sizes.large} color="#007AFF" />
                    <Text style={styles.uploadingText}>
                      Subiendo imagen... {Math.round(imageUploadProgress)}%
                    </Text>
                    <View style={styles.progressBarContainer}>
                      <View 
                        style={[
                          styles.progressBar, 
                          { width: `${imageUploadProgress}%` }
                        ]} 
                      />
                    </View>
                  </View>
                )}
                
                {imageError && (
                  <View style={styles.imageErrorOverlay}>
                    <Ionicons name="warning" size={24} color="#FF5722" />
                    <Text style={styles.imageErrorText}>Error subiendo imagen</Text>
                  </View>
                )}
                
                <TouchableOpacity
                  style={styles.changeImageButton}
                  onPress={seleccionarImagen}
                  disabled={uploadingImage}
                >
                  <Ionicons name="camera" size={16} color="white" />
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={eliminarImagenActual}
                  disabled={uploadingImage}
                >
                  <Ionicons name="close" size={16} color="white" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.imagePickerButton}
                onPress={seleccionarImagen}
                disabled={uploadingImage}
              >
                <Ionicons name="camera" size={32} color="#007AFF" />
                <Text style={styles.imagePickerText}>Seleccionar Imagen</Text>
                <Text style={styles.imagePickerSubtext}>
                  Toca para seleccionar una foto del plato
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Campos avanzados */}
          {showAdvancedForm && (
            <>
              <View style={styles.switchContainer}>
                <Text style={styles.label}>Vegetariano</Text>
                <Switch
                  value={formData.vegetariano}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, vegetariano: value }))}
                  thumbColor={formData.vegetariano ? "#4CAF50" : "#f4f3f4"}
                  trackColor={{ false: "#767577", true: "#81b0ff" }}
                />
              </View>

              <View style={styles.switchContainer}>
                <Text style={styles.label}>Picante</Text>
                <Switch
                  value={formData.picante}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, picante: value }))}
                  thumbColor={formData.picante ? "#FF5722" : "#f4f3f4"}
                  trackColor={{ false: "#767577", true: "#ffab91" }}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Fecha de Finalización (Opcional)</Text>
                <TextInput
                  style={styles.input}
                  value={formData.fecha_fin}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, fecha_fin: text }))}
                  placeholder="YYYY-MM-DD"
                />
              </View>
            </>
          )}

          {/* Botones */}
          <View style={styles.buttonContainer}>
            {modoEdicion ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.button,
                    styles.updateButton,
                    (!isFormValid || loading || uploadingImage) && styles.buttonDisabled
                  ]}
                  onPress={actualizarPlatoEspecial}
                  disabled={!isFormValid || loading || uploadingImage}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.buttonText}>Actualizar</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={limpiarFormulario}
                >
                  <Text style={styles.cancelButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.addButton,
                  (!isFormValid || loading || uploadingImage) && styles.buttonDisabled
                ]}
                onPress={crearPlatoEspecial}
                disabled={!isFormValid || loading || uploadingImage}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.buttonText}>Agregar Plato Especial</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Lista de platos especiales */}
        <View style={styles.listContainer}>
          <View style={styles.sectionHeader}>
            <Text style={styles.listTitle}>Platos Especiales</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{platosEspeciales.length.toString()}</Text>
            </View>
          </View>

          {platosEspeciales.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="restaurant" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No hay platos especiales</Text>
              <Text style={styles.emptySubtext}>
                Agrega el primer plato especial usando el formulario anterior
              </Text>
            </View>
          ) : (
            platosEspeciales.map((plato, index) => {
              if (!plato || typeof plato !== 'object') {
                return null;
              }
              
              return (
                <PlatoEspecialCard
                  key={plato.id || `plato-${index}`}
                  plato={plato}
                  onEdit={editarPlatoEspecial}
                  onDelete={eliminarPlatoEspecial}
                  onToggleAvailability={toggleDisponibilidad}
                  userRole={userRole}
                  formatearPrecio={formatearPrecio}
                />
              );
            })
          )}
        </View>

        {/* Espacio adicional para el scroll */}
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ✅ COMPONENTE PARA TARJETA DE PLATO ESPECIAL

function PlatoEspecialCard({ 
  plato = {}, 
  onEdit, 
  onDelete, 
  onToggleAvailability, 
  userRole = '', 
  formatearPrecio
}) {
  const [imageError, setImageError] = useState(false);

  // Validación temprana
  if (!plato || typeof plato !== 'object' || !plato.id) {
    return null;
  }

  const nombreSeguro = typeof plato.nombre === 'string' ? plato.nombre : 'Sin nombre';
  const precioSeguro = typeof formatearPrecio === 'function' ? formatearPrecio(plato.precio) : '$0';
  const descripcionSegura = typeof plato.descripcion === 'string' ? plato.descripcion : '';

  return (
    <View style={styles.platoCard}>
      <View style={styles.platoHeader}>
        <View style={styles.platoInfo}>
          {/* Imagen del plato especial */}
          {(plato.imagen_url || plato.imagen) && !imageError && (
            <View style={styles.platoImageContainer}>
              <Image
                source={{ uri: plato.imagen_url || plato.imagen }}
                style={styles.platoImage}
                onError={() => setImageError(true)}
              />
            </View>
          )}
          
          <View style={styles.platoDetails}>
            <Text style={styles.platoNombre}>{nombreSeguro}</Text>
            <Text style={styles.platoPrecio}>{precioSeguro}</Text>
            {descripcionSegura.length > 0 && (
              <Text style={styles.platoDescripcion} numberOfLines={2}>
                {descripcionSegura}
              </Text>
            )}
            
            {/* Badges de características */}
            <View style={styles.platoBadgesContainer}>
              {plato.vegetariano && (
                <View style={styles.badgeVegetariano}>
                  <Text style={styles.badgeText}>🌱 Vegetariano</Text>
                </View>
              )}
              {plato.picante && (
                <View style={styles.badgePicante}>
                  <Text style={styles.badgeText}>🌶️ Picante</Text>
                </View>
              )}
              {!plato.disponible && (
                <View style={styles.badgeNoDisponible}>
                  <Text style={styles.badgeText}>❌ No disponible</Text>
                </View>
              )}
              {plato.fecha_fin && (
                <View style={styles.badgeTemporal}>
                  <Text style={styles.badgeText}>⏰ Temporal</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Botones de Acción */}
        <View style={styles.platoActions}>
          {/* Botón de Editar */}
          {userRole === 'admin' && typeof onEdit === 'function' && (
            <TouchableOpacity
              style={styles.editButton}
              onPress={() => {
                console.log('🔧 Editando plato especial:', plato.nombre);
                onEdit(plato);
              }}
            >
              <Ionicons name="pencil" size={20} color="#2196F3" />
            </TouchableOpacity>
          )}

          {/* Botón de Eliminar */}
          {userRole === 'admin' && typeof onDelete === 'function' && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => {
                console.log('🗑️ Eliminando plato especial:', plato.nombre);
                onDelete(plato.id);
              }}
            >
              <Ionicons name="trash" size={20} color="#FF5722" />
            </TouchableOpacity>
          )}

          {/* ✅ BOTÓN DE TOGGLE DISPONIBILIDAD - CORREGIDO */}
          {typeof onToggleAvailability === 'function' && (
            <TouchableOpacity
              style={[
                styles.toggleButton,
                { 
                  backgroundColor: plato.disponible ? '#4CAF50' : '#FF9800',
                  opacity: userRole === 'admin' ? 1 : 0.6
                }
              ]}
              onPress={() => {
                console.log('🔄 Toggle disponibilidad plato especial:', plato.nombre, 'Actual:', plato.disponible);
                onToggleAvailability(plato);
              }}
              // ✅ REMOVIDO: disabled={userRole !== 'admin'}
              // La validación de permisos se hace en la función toggleDisponibilidad
            >
              <Ionicons 
                name={plato.disponible ? "checkmark-circle" : "close-circle"} 
                size={16} 
                color="white" 
              />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}


// ✅ ESTILOS COMPLETAMENTE DEFINIDOS CON NUEVOS ESTILOS PARA EDICIÓN DE IMÁGENES
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  statusContainer: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  statusText: {
    color: '#1565c0',
    fontSize: 14,
    fontWeight: '500',
  },
  statusSubtext: {
    color: '#1565c0',
    fontSize: 12,
    marginTop: 2,
  },
  statusSuccess: {
    backgroundColor: '#e8f5e8',
    borderLeftColor: '#4caf50',
  },
  statusError: {
    backgroundColor: '#ffebee',
    borderLeftColor: '#f44336',
  },
  alertContainer: {
    backgroundColor: '#fff3e0',
    padding: 12,
    margin: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    flexDirection: 'row',
    alignItems: 'center',
  },
  alertText: {
    color: '#e65100',
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
  },
  formContainer: {
    backgroundColor: 'white',
    margin: 16,
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  advancedToggleText: {
    color: '#007AFF',
    fontSize: 14,
    marginRight: 4,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
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
    backgroundColor: '#fff5f5',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
    textAlignVertical: 'top',
    minHeight: 80,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
  },
  pricePreview: {
    color: '#4CAF50',
    fontSize: 14,
    marginTop: 4,
    fontWeight: '500',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
  },
  // ✅ Estilos para manejo de imágenes mejorados - COPIADOS DE CARTA.JS
  imageContainer: {
    position: 'relative',
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  // ✅ NUEVO: Badge para indicar tipo de imagen
  imageTypeBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  imageTypeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 4,
  },
  // ✅ NUEVO: Botón para cambiar imagen
  changeImageButton: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#2196F3',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  imageErrorText: {
    color: '#FF5722',
    fontSize: 12,
    marginTop: 4,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#FF5722',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  uploadingText: {
    color: '#007AFF',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  progressBarContainer: {
    width: '80%',
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
  imagePickerButton: {
    borderWidth: 2,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9ff',
    minHeight: 120,
  },
  imagePickerText: {
    color: '#007AFF',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  imagePickerSubtext: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  addButton: {
    backgroundColor: '#4CAF50',
  },
  updateButton: {
    backgroundColor: '#2196F3',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.6,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  // Estilos para la lista
  listContainer: {
    margin: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  countBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  countText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    backgroundColor: 'white',
    padding: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  platoCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  platoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  platoInfo: {
    flex: 1,
    flexDirection: 'row',
  },
  platoImageContainer: {
    marginRight: 12,
  },
  platoImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  platoDetails: {
    flex: 1,
  },
  platoNombre: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  platoPrecio: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
    marginBottom: 4,
  },
  platoDescripcion: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  platoActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    padding: 10,
    marginHorizontal: 4,
  },
  deleteButton: {
    padding: 10,
    marginHorizontal: 4,
  },
  toggleButton: {
    padding: 10,
    borderRadius: 20,
    marginLeft: 8,
  },
  platoMetadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  platoBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    marginBottom: 4,
  },
  vegetarianBadge: {
    backgroundColor: '#e8f5e8',
  },
  spicyBadge: {
    backgroundColor: '#fff3e0',
  },
  unavailableBadge: {
    backgroundColor: '#fff3e0',
  },
  pendingSyncBadge: {
    backgroundColor: '#e3f2fd',
  },
  badgeText: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: '500',
  },
  detailText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
   badgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  platoBadgesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  badgeVegetariano: {
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
    marginBottom: 2,
  },
  badgePicante: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
    marginBottom: 2,
  },
  badgeNoDisponible: {
    backgroundColor: '#FFEBEE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
    marginBottom: 2,
  },
  badgeTemporal: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginRight: 4,
    marginBottom: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#666',
  },
  // Botón de toggle mejorado
  toggleButton: {
    borderRadius: 15,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  }
});