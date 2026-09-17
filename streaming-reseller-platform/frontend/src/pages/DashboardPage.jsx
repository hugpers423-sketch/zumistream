import React, { useEffect } from 'react';
import { useUser } from '../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { LiquidGlassProvider } from '../context/LiquidGlassContext';
import { DashboardCharts } from '../components/DashboardCharts';
import { UserStats } from '../components/UserStats';
import { RecentActivity } from '../components/RecentActivity';
import { CommissionPanel } from '../components/CommissionPanel';
import { ProviderManager } from '../components/ProviderManager';
import { SocialCommercePanel } from '../components/SocialCommercePanel';
import { GamificationPanel } from '../components/GamificationPanel';
import { IntroVideoComponent } from './LandingPage';

const DashboardPage = () => {
  const { user, isLoading } = useUser();
  
  if (isLoading) {
    return <LoadingScreen />;
  }
  
  // AI-generated personalized intro based on user role
  useEffect(() => {
    const showPersonalizedIntro = () => {
      // Show role-specific animated intro
      const intros = {
        SUPER_ADMIN: 'Bienvenido al panel de control total. Gestiona tu imperio de streaming.',
        SUPER_RESELLER: '¡Felicidades! Has alcanzado el nivel Super Revendedor. Gestiona tus sub-revendedores.',
        SUB_RESELLER: 'Empieza a generar ingresos con tus primeras referencias y créditos.',
        SUB_ADMIN: 'Panel de control administrativo. Gestiona usuarios y proveedores.',
        CUSTOMER: 'Bienvenido a tu dashboard personal. Gestiona tus créditos y suscripciones.',
      };
      
      // Store intro has been shown
      sessionStorage.setItem('dashboard_intro_shown', 'true');
    };
    
    if (!sessionStorage.getItem('dashboard_intro_shown')) {
      showPersonalizedIntro();
    }
  }, [user?.role]);
  
  return (
    <LiquidGlassProvider>
      <div className="dashboard-page">
        {/* Top Bar */}
        <header className="top-bar glass-effect">
          <div className="brand-bar">
            <h1>🎛️ Panel de Control</h1>
            <span className="user-info">
              Bienvenido, {user.fullName || 'Usuario'}
            </span>
          </div>
          
          <div className="top-actions">
            <Button variant="ghost" size="small" onClick={() => window.open('/settings', '_blank')}>
              ⚙️ Configuraciones
            </Button>
            <Button variant="ghost" size="small" onClick={() => window.open('/logout', '_self')}>
              🚪 Cerrar Sesión
            </Button>
          </div>
        </header>
        
        {/* Main Content */}
        <main className="main-content">
          {/* User Stats Overview */}
          <section className="user-stats">
            <UserStats user={user} />
          </section>
          
          {/* Dashboard Cards Grid */}
          <section className="cards-grid">
            <GlassCard className="card-analytics">
              <h3>📊 Resumen General</h3>
              <div className="stats-container">
                <StatItem label="Total Usuarios" value={1247} trend={'+12.5%'} trendType="up" />
                <StatItem label="Créditos Vendidos" value="S/ 45,230" trend={'+8.3%'} trendType="up" />
                <StatItem label="Proveedores Activos" value={8} trend={'+1'} trendType="neutral" />
                <StatItem label="Comisiones Pendientes" value="S/ 3,250" trend={'+5.1%'} trendType="up" />
              </div>
            </GlassCard>
            
            <GlassCard className="card-revenue">
              <h3>💰 Ingresos del Mes</h3>
              <RevenueChart />
            </GlassCard>
            
            <GlassCard className="card-subs">
              <h3>📺 Suscripciones Activas</h3>
              <SubscriptionChart />
            </GlassCard>
            
            <GlassCard className="card-providers">
              <h3>🖥️ Proveedores</h3>
              <ProviderOverview />
            </GlassCard>
          </section>
          
          {/* Recent Activity */}
          <section className="recent-activity">
            <h2>🔔 Actividad Reciente</h2>
            <RecentActivity user={user} />
          </section>
          
          {/* Commission Panel */}
          <section className="commission-panel">
            <h2>💵 Comisión por Referidos</h2>
            <CommissionPanel user={user} />
          </section>
          
          {/* Provider Management */}
          <section className="provider-section">
            <h2>📦 Gestión de Proveedores</h2>
            <ProviderManager />
          </section>
          
          {/* Social Commerce */}
          <section className="social-commerce">
            <h2>📱 Social Commerce</h2>
            <SocialCommercePanel />
          </section>
          
          {/* Gamification & Referrals */}
          <section className="gamification">
            <h2>🎮 Gamificación y Referidos</h2>
            <GamificationPanel user={user} />
          </section>
        </main>
        
        {/* Sidebar */}
        <aside className="sidebar glass-effect">
          <nav>
            <ul>
              <li>
                <Link to="/dashboard" className={useRouteMatch('/dashboard') ? 'active' : ''}>
                  <svg><rect width="24" height="24" x="2" y="6" rx="2" ry="2"></rect><path d="M6 2l3 6 6-3L6 2z"></path></svg>
                  <span>Dashboard</span>
                </Link>
              </li>
              <li>
                <Link to="/subscriptions" className={useRouteMatch('/subscriptions') ? 'active' : ''}>
                  <svg><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-3z"></path></svg>
                  <span>Suscripciones</span>
                </Link>
              </li>
              <li>
                <Link to="/providers" className={useRouteMatch('/providers') ? 'active' : ''}>
                  <svg><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><path d="M18 20h-6l-2-8H6l-2-8H4l1.5-5h10l1.5 5z"></path></svg>
                  <span>Proveedores</span>
                </Link>
              </li>
              <li>
                <Link to="/social" className={useRouteMatch('/social') ? 'active' : ''}>
                  <svg><path d="M12 22s8.93-8.36 8-8.89V12c0-3.3-2.67-5.93-5-6.06V4c-3.01.27-5 3.02-5 5v3.05c3.67.82 5 3.13 5 5.95-.08.61-.5 1.13-1 .32zM3 4v4h12l2-8h-8l-2 8H3z"></path></svg>
                  <span>Social Commerce</span>
                </Link>
              </li>
              <li>
                <Link to="/gamification" className={useRouteMatch('/gamification') ? 'active' : ''}>
                  <svg><path d="M12 2v4h16l-7 7-4-4-7 7V2z"></path></svg>
                  <span>Gamificación</span>
                </Link>
              </li>
              <li>
                <Link to="/settings" className={useRouteMatch('/settings') ? 'active' : ''}>
                  <svg><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                  <span>Configuración</span>
                </Link>
              </li>
            </ul>
          </nav>
        </aside>
      </div>
    </LiquidGlassProvider>
  );
};

export default DashboardPage;