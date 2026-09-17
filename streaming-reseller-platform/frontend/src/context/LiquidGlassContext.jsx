import React, { createContext, useState, useEffect, useCallback } from 'react';
import { LiquidGlassShader } from '../shaders/LiquidGlassShader';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Liquid Glass Context - provides glass effect state and WebGL setup
const LiquidGlassProvider = ({ children, showEffect = true, glassStyle = 'default' }) => {
  const [isInteracting, setInteracting] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [glassStyleConfig, setGlassStyleConfig] = useState(getGlassStyleConfig(glassStyle));
  const [particles, setParticles] = useState([]);
  
  // Three.js setup for WebGL background
  const { scene, camera, renderer } = useThree();
  
  useEffect(() => {
    // Initialize WebGL scene with Liquid Glass effect
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    
    // Create Liquid Glass plane
    const glassMaterial = new LiquidGlassShader.Material({
      transparent: true,
      refraction: glassStyleConfig.refraction,
      bevelDepth: glassStyleConfig.bevelDepth,
      bevelWidth: glassStyleConfig.bevelWidth,
      frost: glassStyleConfig.frost,
      shadow: glassStyleConfig.shadow,
      specular: glassStyleConfig.specular,
    });
    
    const glassGeometry = new THREE.SuperellipseGeometry(0, 0, 50, 50, 0.1);
    const glassMesh = new THREE.Mesh(glassGeometry, glassMaterial);
    scene.add(glassMesh);
    
    // Add particles
    const particleCount = 200;
    const particlesArray = [];
    for (let i = 0; i < particleCount; i++) {
      const particle = {
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100,
          (Math.random() - 0.5) * 100
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01,
          (Math.random() - 0.5) * 0.01
        ),
        size: Math.random() * 2 + 0.5,
        color: new THREE.Color(`hsl(${Math.random() * 360}, 70%, 70%)`)
      };
      particlesArray.push(particle);
    }
    setParticles(particlesArray);
    
    // Animation loop
    const clock = new THREE.Clock();
    
    const animate = () => {
      requestAnimationFrame(animate);
      
      const elapsed = clock.getElapsedTime();
      
      // Rotate glass based on mouse position
      if (isInteracting) {
        glassMesh.rotation.y = mousePosition.x * 0.1;
        glassMesh.rotation.x = -mousePosition.y * 0.1;
      }
      
      // Animate particles
      particlesArray.forEach((particle, index) => {
        particle.position.x += particle.velocity.x;
        particle.position.y += particle.velocity.y;
        particle.position.z += particle.velocity.z;
        
        // Wrap around
        if (particle.position.x > 50) particle.position.x = -50;
        if (particle.position.x < -50) particle.position.x = 50;
        if (particle.position.y > 50) particle.position.y = -50;
        if (particle.position.y < -50) particle.position.y = 50;
        if (particle.position.z > 50) particle.position.z = -50;
        if (particle.position.z < -50) particle.position.z = 50;
      });
      setParticles([...particlesArray]);
      
      renderer.render(scene, camera);
    };
    
    animate();
    
    // Mouse move handler for glass interaction
    const handleMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      setMousePosition({ x, y });
      setInteracting(true);
    };
    
    const handleMouseLeave = () => {
      setInteracting(false);
      setMousePosition({ x: 0, y: 0 });
    };
    
    renderer.domElement.addEventListener('mousemove', handleMouseMove);
    renderer.domElement.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      renderer.domElement.removeEventListener('mousemove', handleMouseMove);
      renderer.domElement.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [isInteracting, mousePosition, glassStyleConfig, scene, camera, renderer]);
  
  // Get glass style configuration based on style name
  const getGlassStyleConfig = (style) => {
    const configs = {
      'default': { refraction: 0.01, bevelDepth: 0.08, bevelWidth: 0.15, frost: 0, shadow: true, specular: true },
      'frost': { refraction: 0, bevelDepth: 0.035, bevelWidth: 0.119, frost: 0.9, shadow: true, specular: true },
      'premium': { refraction: 0.03, bevelDepth: 0.1, bevelWidth: 0.2, frost: 0.5, shadow: true, specular: true },
      'minimal': { refraction: 0.005, bevelDepth: 0, bevelWidth: 0, frost: 0, shadow: false, specular: false },
    };
    return configs[style] || configs['default'];
  };
  
  return (
    <LiquidGlassContext.Provider value={{
      showEffect,
      glassStyle,
      isInteracting,
      setInteracting,
      mousePosition,
      glassStyleConfig,
      particles,
      scene,
      camera,
      renderer,
    }}>
      {children}
    </LiquidGlassContext.Provider>
  );
};

const LiquidGlassContext = createContext({});

// Hook to use Liquid Glass properties
export const useLiquidGlass = () => React.useContext(LiquidGlassContext);

// Export for use in shaders
export { LiquidGlassProvider };