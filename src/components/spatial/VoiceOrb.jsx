import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const colors = { idle: '#9678ff', listening: '#79dedb', processing: '#ad91ff', speaking: '#97baff', completed: '#96e2bf', error: '#e5ad86' };
const vertexShader = `
  uniform float uTime; uniform float uEnergy; uniform float uFlow;
  varying vec3 vViewPosition; varying vec3 vPosition;
  void main() {
    float wave = sin(position.x * 3.8 + uTime * uFlow)
      * sin(position.y * 3.2 - uTime * 0.35)
      * sin(position.z * 4.0 + uTime * 0.25);
    vec3 p = position + normal * wave * (0.012 + uEnergy * 0.05);
    vPosition = p;
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vViewPosition = viewPosition.xyz;
    gl_Position = projectionMatrix * viewPosition;
  }
`;
const fragmentShader = `
  uniform float uTime; uniform float uEnergy; uniform float uFlow;
  uniform float uCompletion; uniform vec3 uColor;
  varying vec3 vViewPosition; varying vec3 vPosition;
  void main() {
    // Derivatives light the actual deformed surface rather than the original sphere.
    vec3 n = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    vec3 viewDirection = normalize(-vViewPosition);
    float facing = max(dot(n, viewDirection), 0.0);
    float fresnel = 0.04 + 0.96 * pow(1.0 - facing, 5.0);
    float key = max(dot(n, normalize(vec3(-0.6, 0.8, 1.0))), 0.0);
    float fill = max(dot(n, normalize(vec3(0.8, -0.2, 0.5))), 0.0);
    float bands = sin(vPosition.y * 7.0 + sin(vPosition.x * 3.5 + uTime * uFlow) + uTime * uFlow) * 0.5 + 0.5;
    float core = exp(-dot(vPosition.xy, vPosition.xy) * 2.7);
    vec3 color = mix(vec3(0.07, 0.045, 0.13), uColor, key * 0.44 + fill * 0.14 + bands * 0.13);
    color += uColor * (core * 0.19 + fresnel * 0.64 + uEnergy * 0.12 + uCompletion * 0.15);
    color += pow(key, 32.0) * vec3(0.84, 0.9, 1.0) * 0.5;
    gl_FragColor = vec4(color, 0.86 + fresnel * 0.1);
  }
`;

export default function VoiceOrb({ state = 'idle', energyRef }) {
  const host = useRef(null);
  const live = useRef({ state, energyRef });
  live.current = { state, energyRef };
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const node = host.current;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let compact = window.matchMedia('(max-width: 640px)').matches;
    let renderWidth = 0, renderHeight = 0, pixelRatio = 0;
    let renderer, observer, frame = 0, visible = true, disposed = false, broken = false, elapsed = 0, last = 0, energy = 0;
    let scene, geometry, material, shellMaterial, shellGeometry;
    let previousState = "idle", completionAge = 0;
    const fail = event => { event?.preventDefault?.(); broken = true; cancelAnimationFrame(frame); frame = 0; setFallback(true); };
    const render = time => {
      frame = 0;
      if (disposed || broken || !visible || document.hidden || !document.hasFocus()) return;
      if (compact && !reduced.matches && last && time - last < 32) {
        frame = requestAnimationFrame(render);
        return;
      }
      const delta = Math.min((time - (last || time)) / 1000, 0.05);
      const current = live.current;
      const still = reduced.matches || current.state === 'error';
      if (!still) elapsed += delta;
      if (current.state !== previousState) completionAge = 0;
      else completionAge += delta;
      previousState = current.state;
      last = time;
      const target = current.state === 'listening' ? current.energyRef?.current?.read?.() || 0 : 0;
      energy = still ? 0 : energy + (target - energy) * (1 - Math.exp(-delta / 0.08));
      material.uniforms.uTime.value = elapsed;
      material.uniforms.uEnergy.value = energy;
      const flowTarget = current.state === 'processing' ? 0.55 : 0.22;
      material.uniforms.uFlow.value += (flowTarget - material.uniforms.uFlow.value) * (still ? 1 : 1 - Math.exp(-delta / 0.3));
      material.uniforms.uCompletion.value = current.state === 'completed' && !still ? Math.sin(Math.min(completionAge / 0.85, 1) * Math.PI) : 0;
      material.uniforms.uColor.value.lerp(targetColor.set(colors[current.state] || colors.idle), still ? 1 : 1 - Math.exp(-delta / 0.22));
      scene.children[0].position.y = still ? 0 : Math.sin(elapsed * 0.7) * 0.045;
      scene.children[0].scale.setScalar(1 + energy * 0.035 + (still ? 0 : Math.sin(elapsed * 0.8) * 0.008));
      renderer.render(scene, camera);
      if (!still && !broken) frame = requestAnimationFrame(render);
    };
    const schedule = () => { last = 0; if (!frame && !disposed && !broken) frame = requestAnimationFrame(render); };
    const pause = () => { cancelAnimationFrame(frame); frame = 0; };
    const targetColor = new THREE.Color(colors.idle);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 20);
    camera.position.z = 4.5;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !compact, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.debug.onShaderError = () => fail();
      renderer.domElement.setAttribute('aria-hidden', 'true');
      node.appendChild(renderer.domElement);
      renderer.domElement.addEventListener('webglcontextlost', fail);
      scene = new THREE.Scene();
      geometry = new THREE.SphereGeometry(1, compact ? 40 : 64, compact ? 28 : 40);
      material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, uniforms: { uTime: { value: 0 }, uEnergy: { value: 0 }, uFlow: { value: 0.22 }, uCompletion: { value: 0 }, uColor: { value: new THREE.Color(colors.idle) } } });
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geometry, material));
      shellGeometry = new THREE.SphereGeometry(1.08, 40, 28);
      shellMaterial = new THREE.MeshPhongMaterial({ color: '#b3a0ed', transparent: true, opacity: 0.15, shininess: 100, specular: '#ffffff', side: THREE.FrontSide, depthWrite: false });
      group.add(new THREE.Mesh(shellGeometry, shellMaterial));
      scene.add(group, new THREE.AmbientLight('#a599df', 0.7));
      const light = new THREE.DirectionalLight('#d4f7ff', 3);
      light.position.set(-3, 4, 5); scene.add(light);
      const resize = new ResizeObserver(() => {
        if (disposed) return;
        const { width, height } = node.getBoundingClientRect();
        const nextWidth = Math.max(1, Math.round(width)), nextHeight = Math.max(1, Math.round(height));
        compact = window.matchMedia('(max-width: 640px)').matches;
        const nextRatio = Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.5);
        if (renderWidth === nextWidth && renderHeight === nextHeight && pixelRatio === nextRatio) return;
        renderWidth = nextWidth; renderHeight = nextHeight; pixelRatio = nextRatio;
        renderer.setPixelRatio(nextRatio);
        renderer.setSize(nextWidth, nextHeight);
        camera.aspect = nextWidth / nextHeight; camera.updateProjectionMatrix(); schedule();
      });
      resize.observe(node);
      observer = resize;
      const intersection = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; visible ? schedule() : pause(); });
      intersection.observe(node);
      const resume = () => { document.hidden || !document.hasFocus() ? pause() : schedule(); };
      document.addEventListener('visibilitychange', resume);
      window.addEventListener('focus', schedule); window.addEventListener('blur', pause);
      reduced.addEventListener('change', schedule);
      schedule();
      // State changes also invalidate the static reduced-motion render.
      node.addEventListener('orb-update', schedule);
      return () => {
        disposed = true; pause(); observer.disconnect(); intersection.disconnect();
        document.removeEventListener('visibilitychange', resume);
        window.removeEventListener('focus', schedule); window.removeEventListener('blur', pause);
        reduced.removeEventListener('change', schedule); node.removeEventListener('orb-update', schedule);
        renderer.domElement.removeEventListener('webglcontextlost', fail);
        geometry.dispose(); shellGeometry.dispose(); material.dispose(); shellMaterial.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); renderer.domElement.remove();
      };
    } catch {
      renderer?.dispose(); renderer?.domElement.remove(); geometry?.dispose(); material?.dispose(); shellGeometry?.dispose(); shellMaterial?.dispose(); observer?.disconnect(); fail();
    }
  }, []);
  useEffect(() => { host.current?.dispatchEvent(new Event('orb-update')); }, [state]);
  return <div className="voice-orb" data-state={state} data-renderer={fallback ? 'fallback' : 'webgl'}>
    <div className="orb-halo" aria-hidden="true" />
    <div className="orb-renderer" ref={host} hidden={fallback} />
    {fallback && <div className="orb-fallback" aria-hidden="true"><span /></div>}
    <div className="orb-ground" aria-hidden="true" />
  </div>;
}
