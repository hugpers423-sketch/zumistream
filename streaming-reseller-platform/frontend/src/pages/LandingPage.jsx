import React, { useState, useEffect } from 'react';
import { LiquidGlassProvider, useLiquidGlass } from '../context/LiquidGlassContext';
import { useBrowserDetection } from '../hooks/useBrowserDetection';
import { useOnboarding } from '../hooks/useOnboarding';
import { aiGenerateIntroVideo } from '../services/aiService';

const LandingPage = () => {
  const { deviceType, browser } = useBrowserDetection();
  const { progress, startTour, completeTour } = useOnboarding();
  const { showGlassEffect, glassStyle } = useLiquidGlass();
  
  // AI-generated intro video when user first visits
  useEffect(() => {
    const handleFirstVisit = async () => {
      // Check if this is the first visit (no localStorage marker)
      const hasSeenIntro = localStorage.getItem('seen_welcome_intro');
      
      if (!hasSeenIntro) {
        // Generate AI intro video
        try {
          const videoData = await aiGenerateIntroVideo();
          localStorage.setItem('seen_welcome_intro', 'true');
          setState({ showIntroVideo: true, introVideo: videoData });
        } catch (error) {
          console.error('AI intro generation failed, showing traditional welcome', error);
          localStorage.setItem('seen_welcome_intro', 'true');
          setState({ showIntroVideo: false });
        }
      }
    };
    
    handleFirstVisit();
  }, []);
  
  const [showIntroVideo, setState] = useState({ showIntroVideo: false, introVideo: null });
  const [showTourModal, setShowTourModal] = useState(false);
  
  return (
    <LiquidGlassProvider 
      showEffect={showGlassEffect} 
      glassStyle={glassStyle}
    >
      <div className="landing-page">
        {/* AI-Generated Intro Video */}
        {showIntroVideo && showIntroVideo.showIntroVideo && (
          <IntroVideoComponent video={showIntroVideo.introVideo} onClose={() => setState({ showIntroVideo: false })} />
        )}
        
        {/* Main Content */}
        <main className="main-content">
          {/* Hero Section with Liquid Glass */}
          <section className="hero-section glass-effect">
            <div className="hero-content">
              <h1 className="gradient-heading">
                <span className="glass-text">StreamingReseller</span>
                <span className="tagline">El negocio de streaming más poderoso del Perú</span>
              </h1>
              
              <GlassCard className="primary-card">
                <h2>🚀 Convierte tus redes sociales en ingresos</h2>
                <p className="lead">
                  Vende créditos de streaming, gestiona proveedores y cobra con Yape.
                  El primer panel multi-nivel con diseño Liquid Glass y WebGL jamás visto.
                </p>
                
                <div className="cta-buttons">
                  <button 
                    className="btn-primary glass-btn"
                    onClick={() => setShowTourModal(true)}
                  >
                    Iniciar Tour Interactivo
                  </button>
                  <button 
                    className="btn-secondary glass-btn"
                    onClick={() => window.location.href='/dashboard'}
                  >
                    Acceder al Panel
                  </button>
                </div>
              </GlassCard>
              
              {/* Social Proof & Stats */}
              <div className="stats-grid">
                <GlassStat number="50K+" label="Resellers Activos" />
                <GlassStat number="2M+" label="Créditos Vendidos" />
                <GlassStat number="99.9%" label="Uptime Garantizado" />
                <GlassStat number="S/ 0" label="Comisión por Referido" />
              </div>
            </div>
            
            {/* Animated Background with WebGL */}
            <div className="webgl-background">
              <Canvas />
            </div>
          </section>
          
          {/* Features Grid */}
          <section className="features-grid">
            <GlassCard className="feature-card">
              <h3>🎯 Panel Multi-Nivel</h3>
              <p>Admin principal → Super Revendedores → Sub Revendedores → Clientes. Gestión completa de jerarquía.</p>
            </GlassCard>
            
            <GlassCard className="feature-card">
              <h3>💳 Yape Integration</h3>
              <p>Recargas instantáneas con Yape, Mercado Pago y transferencias bancarias. Pago directo al cliente.</p>
            </GlassCard>
            
            <GlassCard className="feature-card">
              <h3>📱 Social Commerce</h3>
              <p>Integración con WhatsApp, Instagram, TikTok y Facebook. Vende directo desde tus redes sociales.</p>
            </GlassCard>
            
            <GlassCard className="feature-card">
              <h3>📊 Panel Analítico</h3>
              <p>Estadísticas en tiempo real, gráficos de conversión, seguimiento de comisiones y rendimiento de proveedores.</p>
            </GlassCard>
          </section>
          
          {/* How It Works */}
          <section className="how-it-works">
            <h2>¿Cómo funciona?</h2>
            <div className="steps">
              <StepStep number={1} title="Regístrate" description="Crea tu cuenta admin principal en minutos"/>
              <StepStep number={2} title="Configura" description="Agrega proveedores de streaming y configura precios"/>
              <StepStep number={3} title="Comparte" description="Invita colaboradores y comparte en redes sociales"/>
              <StepStep number={4} title="Vende" description="Clientes compran créditos y adquieren suscripciones"/>
              <StepStep number={5} title="Cobra" description="Pagos vía Yape, transferencia o tarjeta"/>
            </div>
          </section>
        </main>
        
        {/* Floating CTA */}
        <FloatingCTA />
        
        {/* Onboarding Tour Modal */}
        <TourModal visible={showTourModal} onClose={() => setShowTourModal(false)} />
      </div>
    </LiquidGlassProvider>
  );
};

export default LandingPage;

// Step component
const StepStep = ({ number, title, description }) => (
  <div className="step-item">
    <div className="step-number">{number}</div>
    <h4>{title}</h4>
    <p>{description}</p>
  </div>
);

// Floating CTA
const FloatingCTA = () => (
  <div className="floating-cta">
    <GlassButton pulse>Empezar Ahora →</GlassButton>
  </div>
);

export default FloatingCTA;