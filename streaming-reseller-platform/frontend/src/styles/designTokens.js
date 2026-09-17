import { StyleSheet, } from 'react-native';

// Design System Tokens - Liquid Glass Theme
export const tokens = {
  // Colors
  colors: {
    background: 'rgba(10, 10, 20, 0.8)',
    surface: 'rgba(20, 20, 35, 0.9)',
    surface2: 'rgba(30, 30, 50, 0.8)',
    primary: '#00D4AA', // Cyan-ish green
    primaryHover: '#00F5C4',
    secondary: '#6366F1', // Indigo
    onPrimary: '#0A0A14',
    onSecondary: '#F8FAFC',
    border: 'rgba(0, 212, 170, 0.3)',
    muted: 'rgba(100, 100, 120, 0.5)',
    text: '#F8FAFC',
    textMuted: 'rgba(200, 200, 220, 0.8)',
    error: '#FF4757',
    success: '#28C840',
    warning: '#F6E05E',
  },
  
  // Typography
  typography: {
    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
    h1: { fontSize: 32, fontWeight: 700, lineHeight: 40 },
    h2: { fontSize: 24, fontWeight: 600, lineHeight: 32 },
    h3: { fontSize: 20, fontWeight: 600, lineHeight: 28 },
    body: { fontSize: 16, fontWeight: 400, lineHeight: 24 },
    caption: { fontSize: 12, fontWeight: 400, lineHeight: 16 },
  },
  
  // Spacing
  spacing: {
    xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
  },
  
  // Border Radius
  radius: {
    sm: 8, md: 12, lg: 16, xl: 24, full: 9999,
  },
  
  // Shadows
  shadows: {
    sm: { shadowColor: 'rgba(0,0,0,0.3)', shadowBlur: 8, shadowOffset: { x: 0, y: 2 } },
    md: { shadowColor: 'rgba(0,0,0,0.4)', shadowBlur: 16, shadowOffset: { x: 0, y: 4 } },
    lg: { shadowColor: 'rgba(0,0,0,0.5)', shadowBlur: 24, shadowOffset: { x: 0, y: 8 } },
  },
  
  // Liquid Glass Specific
  liquidGlass: {
    blur: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0, 212, 170, 0.3)',
    borderRadius: 16,
    thickness: 1,
    refractionIndex: 1.1,
    bevelWidth: 0.15,
    bevelDepth: 0.08,
  },
};

// Component Styles
export const styles = StyleSheet.create({
  // Page Base
  page: {
    flex: 1,
    backgroundColor: tokens.colors.background,
    color: tokens.colors.text,
  },
  
  // Glass Effect
  glassContainer: {
    backgroundColor: tokens.colors.surface,
    backdropFilter: 'blur(20px)',
    borderRadius: tokens.radius.md,
    border: '1px solid rgba(0, 212, 170, 0.2)',
    ...tokens.shadows.md,
  },
  
  // Primary Glass Card
  glassCard: {
    backgroundColor: tokens.colors.surface2,
    backdropFilter: 'blur(25px)',
    borderRadius: tokens.radius.lg,
    border: '1px solid rgba(0, 212, 170, 0.3)',
    padding: tokens.spacing.md,
    ...tokens.shadows.lg,
  },
  
  // Heading Styles
  heading1: {
    ...tokens.typography.h1,
    color: tokens.colors.primary,
    marginBottom: tokens.spacing.sm,
    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
  },
  
  heading2: {
    ...tokens.typography.h2,
    color: tokens.colors.text,
    marginBottom: tokens.spacing.md,
  },
  
  // Button Styles
  primaryButton: {
    backgroundColor: tokens.colors.primary,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    ...tokens.shadows.md,
  },
  
  primaryButtonHover: {
    backgroundColor: tokens.colors.primaryHover,
    transform: [{ translateY: -2 }],
    ...tokens.shadows.lg,
  },
  
  secondaryButton: {
    backgroundColor: 'transparent',
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 212, 170, 0.3)',
    ...tokens.shadows.sm,
  },
  
  // Stats Styles
  statContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: tokens.colors.primary,
  },
  
  statLabel: {
    fontSize: tokens.typography.caption,
    color: tokens.colors.textMuted,
    marginTop: 4,
  },
  
  // Chart Container
  chartContainer: {
    backgroundColor: tokens.colors.surface2,
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    border: '1px solid rgba(0, 212, 170, 0.2)',
  },
  
  // Nav Link
  navLink: {
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    color: tokens.colors.textMuted,
    margin: 4,
    textAlign: 'center',
  },
  
  navLinkActive: {
    backgroundColor: 'rgba(0, 212, 170, 0.1)',
    color: tokens.colors.primary,
  },
  
  // Floating CTA
  floatingCTA: {
    position: 'absolute',
    bottom: tokens.spacing.xl,
    right: tokens.spacing.xl,
    backgroundColor: tokens.colors.primary,
    borderRadius: tokens.radius.full,
    padding: tokens.spacing.xl,
    ...tokens.shadows.lg,
    animation: 'pulse 2s ease infinite',
  },
  
  // Step Items
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.md,
    backgroundColor: tokens.colors.surface2,
    border: '1px solid rgba(0, 212, 170, 0.2)',
  },
  
  stepNumber: {
    minWidth: 32,
    height: 32,
    borderRadius: tokens.radius.full,
    backgroundColor: tokens.colors.primary,
    color: 'white',
    fontSize: 14,
    fontWeight: 700,
    textAlign: 'center',
    marginRight: tokens.spacing.md,
  },
  
  // Status Indicators
  statusActive: {
    color: tokens.colors.success,
    fontWeight: 600,
  },
  
  statusPending: {
    color: tokens.colors.warning,
    fontWeight: 600,
  },
  
  statusExpired: {
    color: tokens.colors.textMuted,
    textDecorationLine: 'line-through',
  },
});

// Export design tokens for use in other files
export default { tokens, styles };