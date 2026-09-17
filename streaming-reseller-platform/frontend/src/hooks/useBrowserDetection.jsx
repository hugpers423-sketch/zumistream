import { useEffect, useState } from 'react';

// Browser Detection Hook - detects device type, browser, and capabilities
export const useBrowserDetection = () => {
  const [deviceType, setDeviceType] = useState('desktop');
  const [browser, setBrowser] = useState('chrome');
  const [supportsWebGL, setSupportsWebGL] = useState(false);
  const [supportsLiquidGlass, setSupportsLiquidGlass] = useState(false);
  
  useEffect(() => {
    // Detect device type
    const mobileAgents = ['Android', 'iPhone', 'iPad', 'iPod', 'BlackBerry', 'Windows Phone'];
    const isMobile = mobileAgents.some(agent => navigator.userAgent.includes(agent));
    const isTablet = navigator.userAgent.includes('Tablet');
    
    if (isTablet) {
      setDeviceType('tablet');
    } else if (isMobile) {
      setDeviceType('mobile');
    } else {
      setDeviceType('desktop');
    }
    
    // Detect browser
    const userAgent = navigator.userAgent;
    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      setBrowser('chrome');
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      setBrowser('safari');
    } else if (userAgent.includes('Firefox')) {
      setBrowser('firefox');
    } else if (userAgent.includes('Edg')) {
      setBrowser('edge');
    }
    
    // Detect WebGL support
    try {
      const canvas = document.createElement('canvas');
      setSupportsWebGL !!canvas.getContext('webgl2') || !!canvas.getContext('webgl');
    } catch (e) {
      setSupportsWebGL(false);
    }
    
    // Detect Liquid Glass support (WebGL2 + specific features)
    setSupportsLiquidGlass(navigator.hardwareConcurrency && navigator.hardwareConcurrency > 2);
    
  }, []);
  
  return { deviceType, browser, supportsWebGL, supportsLiquidGlass };
};