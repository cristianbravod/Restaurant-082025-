// contexts/AuthContext.js - Contexto de autenticación COMPLETO restaurado
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform, Alert } from 'react-native';
import ApiService from '../services/ApiService';

// 🔐 ESTADOS DE AUTENTICACIÓN
export const AuthStates = {
  INITIALIZING: 'initializing',
  UNAUTHENTICATED: 'unauthenticated',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  ERROR: 'error',
  COLD_START: 'cold_start',
  OFFLINE: 'offline'
};

// 🎯 CONTEXTO DE AUTENTICACIÓN
const AuthContext = createContext({
  user: null,
  isLoggedIn: false,
  loading: false,
  initializing: true,
  error: null,
  state: AuthStates.INITIALIZING,
  userRole: null,
  isOffline: false,
  serverStatus: null,
  connectionAttempts: 0,
  canRetry: true,
  isColdStart: false,
  needsRetry: false,
  login: async () => {},
  logout: async () => {},
  switchUser: async () => {},
  retryConnection: async () => {},
  clearError: () => {},
  checkAuthStatus: async () => {}
});

// 🔧 PROVIDER DE AUTENTICACIÓN
export function AuthProvider({ children }) {
  // 🔐 Estados de usuario y autenticación
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState(null);
  const [state, setState] = useState(AuthStates.INITIALIZING);
  
  // 🌐 Estados de conexión y servidor
  const [isOffline, setIsOffline] = useState(false);
  const [serverStatus, setServerStatus] = useState({
    isWarm: false,
    lastCheck: null,
    responseTime: null,
    version: null
  });
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [canRetry, setCanRetry] = useState(true);
  const [isColdStart, setIsColdStart] = useState(false);
  const [needsRetry, setNeedsRetry] = useState(false);

  // 🎯 PROPIEDADES DERIVADAS
  const userRole = user?.rol || null;

  // 🚀 INICIALIZACIÓN AL CARGAR LA APP
  useEffect(() => {
    initializeAuth();
  }, []);

  // 📊 MONITOREO DE ESTADO DEL SERVIDOR
  useEffect(() => {
    const interval = setInterval(checkServerStatus, 30000); // Cada 30 segundos
    return () => clearInterval(interval);
  }, [isLoggedIn]);

  // 🔄 INICIALIZACIÓN DE LA AUTENTICACIÓN
  const initializeAuth = async () => {
    try {
      console.log('🔄 Inicializando autenticación...');
      setState(AuthStates.INITIALIZING);
      
      // Verificar si hay token guardado
      const [savedToken, savedUserData] = await Promise.all([
        AsyncStorage.getItem('auth_token'),
        AsyncStorage.getItem('userData')
      ]);

      if (savedToken && savedUserData) {
        try {
          const userData = JSON.parse(savedUserData);
          console.log('🔑 Token encontrado, verificando validez...');
          
          // Configurar token en ApiService
          ApiService.setAuthToken(savedToken);
          
          // Verificar token con el servidor
          const verificationResult = await ApiService.request('/auth/verify');
          
          if (verificationResult.success && verificationResult.user) {
            console.log('✅ Token válido, restaurando sesión:', verificationResult.user.email);
            setUser(verificationResult.user);
            setIsLoggedIn(true);
            setState(AuthStates.AUTHENTICATED);
            setError(null);
          } else {
            throw new Error('Token inválido');
          }
          
        } catch (tokenError) {
          console.log('❌ Token inválido, limpiando datos:', tokenError.message);
          await clearStoredAuth();
          setState(AuthStates.UNAUTHENTICATED);
        }
        
      } else {
        console.log('📝 No hay sesión guardada');
        setState(AuthStates.UNAUTHENTICATED);
      }
      
    } catch (error) {
      console.error('❌ Error inicializando auth:', error);
      setState(AuthStates.ERROR);
      setError(error.message);
    } finally {
      setInitializing(false);
    }
  };

  // 🔍 VERIFICAR ESTADO DEL SERVIDOR
  const checkServerStatus = async () => {
    try {
      const startTime = Date.now();
      const healthResult = await ApiService.healthCheck();
      const responseTime = Date.now() - startTime;
      
      if (healthResult.success) {
        setServerStatus({
          isWarm: true,
          lastCheck: new Date().toISOString(),
          responseTime,
          version: healthResult.data?.version || null
        });
        setIsOffline(false);
        setIsColdStart(false);
        
        // Reset connection attempts on success
        if (connectionAttempts > 0) {
          setConnectionAttempts(0);
          setCanRetry(true);
        }
        
      } else {
        throw new Error(healthResult.error || 'Server not responding');
      }
      
    } catch (error) {
      console.log('⚠️ Server status check failed:', error.message);
      
      setServerStatus(prev => ({
        ...prev,
        isWarm: false,
        lastCheck: new Date().toISOString()
      }));
      
      // Detectar si es cold start o problema de conexión
      if (error.message.includes('timeout') || error.message.includes('slow')) {
        setIsColdStart(true);
      } else {
        setIsOffline(true);
      }
      
      setConnectionAttempts(prev => prev + 1);
      
      // Después de 3 intentos fallidos, desactivar retry automático
      if (connectionAttempts >= 3) {
        setCanRetry(false);
        setNeedsRetry(true);
      }
    }
  };

  // 🔑 FUNCIÓN DE LOGIN
  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);
      setState(AuthStates.AUTHENTICATING);
      
      console.log('🔐 Intentando login para:', email);
      
      // Verificar conectividad antes del login
      if (Platform.OS === 'android' && !__DEV__) {
        console.log('📱 Verificando conectividad en APK...');
        const healthCheck = await ApiService.healthCheck();
        
        if (!healthCheck.success) {
          setIsColdStart(true);
          setState(AuthStates.COLD_START);
          console.log('❄️ Servidor en cold start, reintentando...');
          
          // Esperar un poco más para cold start
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
      
      const result = await ApiService.login(email, password);
      
      if (result.success) {
        console.log('✅ Login exitoso:', result.user?.nombre);
        
        // Guardar datos de usuario
        setUser(result.user);
        setIsLoggedIn(true);
        setState(AuthStates.AUTHENTICATED);
        
        // Actualizar estado del servidor
        setServerStatus(prev => ({
          ...prev,
          isWarm: true,
          lastCheck: new Date().toISOString()
        }));
        
        setIsOffline(false);
        setIsColdStart(false);
        setConnectionAttempts(0);
        
        return { success: true, user: result.user };
        
      } else {
        const errorMessage = result.message || result.error || 'Error de login';
        console.log('❌ Login falló:', errorMessage); 
        
        setError(errorMessage);
        setState(AuthStates.ERROR);
        
        return { success: false, error: errorMessage };
      }
      
    } catch (error) {
      console.error('❌ Error en login:', error);
      
      const errorMessage = error.message || 'Error de conexión';
      setError(errorMessage);
      setState(AuthStates.ERROR);
      
      // Detectar tipo de error
      if (error.message?.includes('timeout') || error.message?.includes('slow')) {
        setIsColdStart(true);
        setState(AuthStates.COLD_START);
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        setIsOffline(true);
        setState(AuthStates.OFFLINE);
      }
      
      return { success: false, error: errorMessage };
      
    } finally {
      setLoading(false);
    }
  };

  // 🚪 FUNCIÓN DE LOGOUT
  const logout = async () => {
    try {
      console.log('🚪 Cerrando sesión...');
      
      // Limpiar estado local
      setUser(null);
      setIsLoggedIn(false);
      setState(AuthStates.UNAUTHENTICATED);
      setError(null);
      
      // Limpiar datos almacenados
      await clearStoredAuth();
      
      // Limpiar ApiService
      await ApiService.clearAuth();
      
      console.log('✅ Sesión cerrada exitosamente');
      return { success: true };
      
    } catch (error) {
      console.error('❌ Error cerrando sesión:', error);
      return { success: false, error: error.message };
    }
  };

  // 🔄 CAMBIAR USUARIO
  const switchUser = async () => {
    try {
      console.log('🔄 Cambiando usuario...');
      
      const logoutResult = await logout();
      
      if (logoutResult.success) {
        // Esperar un momento para que el usuario vea el cambio
        setTimeout(() => {
          setState(AuthStates.UNAUTHENTICATED);
        }, 500);
        
        return { success: true };
      } else {
        throw new Error(logoutResult.error);
      }
      
    } catch (error) {
      console.error('❌ Error cambiando usuario:', error);
      return { success: false, error: error.message };
    }
  };

  // 🔄 REINTENTAR CONEXIÓN
  const retryConnection = async () => {
    try {
      console.log('🔄 Reintentando conexión...');
      setLoading(true);
      setError(null);
      
      // Incrementar intentos
      setConnectionAttempts(prev => prev + 1);
      
      // Verificar salud del servidor
      const healthResult = await ApiService.healthCheck();
      
      if (healthResult.success) {
        console.log('✅ Conexión restaurada');
        
        setIsOffline(false);
        setIsColdStart(false);
        setNeedsRetry(false);
        setConnectionAttempts(0);
        setCanRetry(true);
        
        // Si el usuario estaba logueado, verificar su sesión
        if (isLoggedIn && user) {
          await checkAuthStatus();
        } else {
          setState(AuthStates.UNAUTHENTICATED);
        }
        
        return { success: true };
        
      } else {
        throw new Error(healthResult.error || 'Servidor no disponible');
      }
      
    } catch (error) {
      console.error('❌ Retry falló:', error);
      
      setError(error.message);
      
      // Después de 5 intentos, desactivar retry
      if (connectionAttempts >= 5) {
        setCanRetry(false);
        Alert.alert(
          'Problemas de Conexión',
          'No se puede conectar con el servidor después de varios intentos. Verifica tu conexión a internet y que el servidor esté funcionando.',
          [{ text: 'OK' }]
        );
      }
      
      return { success: false, error: error.message };
      
    } finally {
      setLoading(false);
    }
  };

  // ✅ VERIFICAR ESTADO DE AUTENTICACIÓN
  const checkAuthStatus = async () => {
    try {
      if (!isLoggedIn || !user) {
        return { success: false, error: 'No authenticated' };
      }
      
      const result = await ApiService.request('/auth/verify');
      
      if (result.success && result.user) {
        // Actualizar datos del usuario si han cambiado
        if (JSON.stringify(result.user) !== JSON.stringify(user)) {
          setUser(result.user);
          await AsyncStorage.setItem('userData', JSON.stringify(result.user));
        }
        
        return { success: true, user: result.user };
      } else {
        throw new Error('Token inválido');
      }
      
    } catch (error) {
      console.log('❌ Auth status check failed:', error.message);
      
      // Si el token es inválido, cerrar sesión
      if (error.message.includes('token') || error.message.includes('unauthorized')) {
        await logout();
      }
      
      return { success: false, error: error.message };
    }
  };

  // 🧹 LIMPIAR DATOS ALMACENADOS
  const clearStoredAuth = async () => {
    try {
      await AsyncStorage.multiRemove([
        'auth_token',
        'userData',
        'cached_menu',
        'cached_categorias',
        'cached_especiales',
        'platos_especiales_cache',
        'informes_ventas_cache'
      ]);
      console.log('🧹 Datos de autenticación limpiados');
    } catch (error) {
      console.error('❌ Error limpiando datos:', error);
    }
  };

  // 🚫 LIMPIAR ERROR
  const clearError = () => {
    setError(null);
    if (state === AuthStates.ERROR) {
      setState(isLoggedIn ? AuthStates.AUTHENTICATED : AuthStates.UNAUTHENTICATED);
    }
  };

  // 📊 OBTENER INFORMACIÓN DE DEBUG
  const getDebugInfo = () => {
    return {
      user: user ? {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol
      } : null,
      isLoggedIn,
      loading,
      initializing,
      error,
      state,
      userRole,
      isOffline,
      serverStatus,
      connectionAttempts,
      canRetry,
      isColdStart,
      needsRetry,
      timestamp: new Date().toISOString(),
      platform: Platform.OS,
      isDev: __DEV__
    };
  };

  // 🎯 VALOR DEL CONTEXTO
  const contextValue = {
    // Estados principales
    user,
    isLoggedIn,
    loading,
    initializing,
    error,
    state,
    
    // Estados derivados
    userRole,
    isOffline,
    serverStatus,
    connectionAttempts,
    canRetry,
    isColdStart,
    needsRetry,
    
    // Funciones
    login,
    logout,
    switchUser,
    retryConnection,
    clearError,
    checkAuthStatus,
    getDebugInfo
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

// 🪝 HOOK PARA USAR EL CONTEXTO
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  
  return context;
}

// 🔍 HOOK PARA DEBUGGING
export function useAuthDebug() {
  const auth = useAuth();
  
  useEffect(() => {
    if (__DEV__) {
      console.log('🔍 Auth Debug Info:', auth.getDebugInfo());
    }
  }, [auth.state, auth.isLoggedIn, auth.error]);
  
  return auth.getDebugInfo();
}

export default AuthContext;