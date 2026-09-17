import { useEffect, useState } from 'react';
import { useBrowserDetection } from './useBrowserDetection';

// Onboarding Hook - provides interactive product tours, checklists, and video tutorials
export const useOnboarding = () => {
  const { supportsWebGL, supportsLiquidGlass } = useBrowserDetection();
  const [progress, setProgress] = useState(0);
  const [showTour, setShowTour] = useState(false);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [hasSeenIntro, setHasSeenIntro] = useState(false);
  
  // Check if user has completed onboarding
  useEffect(() => {
    const hasCompleted = localStorage.getItem('onboarding_completed');
    const seenIntro = localStorage.getItem('seen_welcome_intro');
    
    if (hasCompleted === 'true') {
      setProgress(100);
      setCompletedSteps(new Set(['all']));
    }
    
    if (seenIntro === 'true') {
      setHasSeenIntro(true);
    }
  }, []);
  
  // Start the onboarding tour
  const startTour = () => {
    setShowTour(true);
    setProgress(0);
    setCompletedSteps(new Set());
    localStorage.removeItem('onboarding_completed');
  };
  
  // Complete onboarding
  const completeOnboarding = () => {
    setProgress(100);
    setCompletedSteps(new Set(['all']));
    localStorage.setItem('onboarding_completed', 'true');
    setShowTour(false);
  };
  
  // Complete individual step
  const completeStep = (stepId) => {
    setCompletedSteps(prev => new Set([...prev, stepId]));
    
    const allSteps = ['step1', 'step2', 'step3', 'step4', 'step5'];
    const allCompleted = allSteps.every(step => completedSteps.has(step));
    
    if (allCompleted) {
      completeOnboarding();
    }
  };
  
  // Skip intro video
  const skipIntro = () => {
    setHasSeenIntro(true);
    localStorage.setItem('seen_welcome_intro', 'true');
  };
  
  // Get tour steps based on user role
  const getTourSteps = (role) => {
    const baseSteps = [
      { id: 'step1', title: '🏠 Bienvenida', description: 'Tour introductorio de la plataforma', completed: completedSteps.has('step1') },
      { id: 'step2', title: '👥 Panel de Control', description: 'Explora tu dashboard principal', completed: completedSteps.has('step2') },
      { id: 'step3', title: '💳 Créditos y Pagos', description: 'Configura tus métodos de pago Yape', completed: completedSteps.has('step3') },
      { id: 'step4', title: '📦 Proveedores', description: 'Agrega y configura proveedores de streaming', completed: completedSteps.has('step4') },
      { id: 'step5', title: '🚀 Venta', description: 'Empieza a vender créditos y suscripciones', completed: completedSteps.has('step5') },
    ];
    
    // Role-specific steps
    const roleSteps = {
      SUPER_ADMIN: [
        { id: 'admin1', title: '👑 Configuración Global', description: 'Configura todo el sistema', completed: completedSteps.has('admin1') },
        { id: 'admin2', title: '📊 Gestión de Usuarios', description: 'Administra todos los usuarios y roles', completed: completedSteps.has('admin2') },
      ],
      SUPER_RESELLER: [
        { id: 'res1', title: '📈 Panel de Revendedor', description: 'Gestiona tus sub-revendedores', completed: completedSteps.has('res1') },
        { id: 'res2', title: '💵 Comisiones', description: 'Configura tus comisiones por referidos', completed: completedSteps.has('res2') },
      ],
      SUB_RESELLER: [
        { id: 'sub1', title: '🛒 Catálogo de Productos', description: 'Ver y gestionar productos', completed: completedSteps.has('sub1') },
        { id: 'sub2', title: '💳 Mis Créditos', description: 'Recarga y gestiona tus créditos', completed: completedSteps.has('sub2') },
      ],
      CUSTOMER: [
        { id: 'cust1', title: '🛍️ Comprar Créditos', description: 'Adquiere créditos para streaming', completed: completedSteps.has('cust1') },
        { id: 'cust2', title: '📺 Mis Suscripciones', description: 'Gestiona tus suscripciones', completed: completedSteps.has('cust2') },
      ],
    };
    
    return (roleSteps[role] || baseSteps).map(step => ({
      ...step,
      description: getStepDescription(step.id, role),
    }));
  };
  
  // Get description for step
  const getStepDescription = (stepId, role) => {
    const descriptions = {
      step1: 'Da la bienvenida al nuevo usuario y muestra la interfaz principal',
      step2: 'Muestra el dashboard con estadísticas clave y menús de navegación',
      step3: 'Guía para agregar método de pago Yape y primera recarga',
      step4: 'Cómo agregar un nuevo proveedor de streaming al panel',
      step5: 'Pasos para crear tu primera suscripción o paquete de créditos',
      admin1: 'Configuración global del sistema: marcas, monedas, ajustes',
      admin2: 'Gestión de usuarios: crear, editar, suspender y reactivar',
      res1: 'Panel de control de sub-revendedores y jerarquía',
      res2: 'Sistema de comisiones automáticas por nivel',
      sub1: 'Catálogo con paquetes de créditos y suscripciones',
      sub2: 'Historial de transacciones y saldo de créditos',
      cust1: 'Selección de paquetes de 10, 30, 60, 120 créditos',
      cust2: 'Historial de compras y vencimientos de suscripción',
    };
    return descriptions[stepId] || 'Descripción del paso';
  };
  
  // Generate AI-powered personalized video based on user progress
  const generatePersonalizedVideo = async (userProgress) => {
    if (!hasSeenIntro) {
      // In a real implementation, this would call an AI service
      // to generate a custom video based on the user's journey
      const videoPrompt = generateVideoPrompt(userProgress, supportsLiquidGlass);
      // await aiService.generateVideo(videoPrompt);
      setHasSeenIntro(true);
      localStorage.setItem('seen_welcome_intro', 'true');
      return { type: 'ai-generated', prompt: videoPrompt };
    }
    return null;
  };
  
  // Generate video prompt based on user progress
  const generateVideoPrompt = (progress, isLiquidGlass) => {
    const features = isLiquidGlass 
      ? 'con diseño Liquid Glass con efectos WebGL refractantes'
      : 'con interfaz moderna y animaciones fluidas';
    
    const progressDescriptions = [
      'Usuario nuevo que está viendo el video de bienvenida',
      'Usuario que está explorando el panel de control',
      'Usuario que está configurando sus primeros créditos',
      'Usuario que ha agregado su primer proveedor',
      'Usuario listo para realizar su primera venta',
    ];
    
    return `Video de bienvenida interactivo para una plataforma de revendedor de streaming ${features}. El video muestra ${progressDescriptions[Math.min(progress, 4)]} y guía al usuario a través de los pasos esenciales del panel de control. Incluye elementos de gamificación, progreso visual y llamadas a la acción para completar el onboarding.`;
  };
  
  return {
    progress,
    setProgress,
    showTour,
    setShowTour,
    completedSteps,
    hasSeenIntro,
    startTour,
    completeOnboarding,
    completeStep,
    skipIntro,
    getTourSteps,
    generatePersonalizedVideo,
  };
};