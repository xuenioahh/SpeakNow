import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './buildRoom';

export function createScene(container, theme, scenarioId, markers, onSelect, onFailure) {
  let renderer, built, resizeObserver, intersectionObserver;
  let frame = 0, disposed = false, visible = true, lastFrame = 0, elapsed = 0, drag = null;
  const listeners = [];
  const resources = [];
  const projectionCache = new WeakMap();
  const compact = window.matchMedia("(max-width: 640px)").matches;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const listen = (element, type, handler, options) => { element.addEventListener(type, handler, options); listeners.push(() => element.removeEventListener(type, handler, options)); };
  const dispose = () => {
    if (disposed) return;
    disposed = true; cancelAnimationFrame(frame);
    resizeObserver?.disconnect(); intersectionObserver?.disconnect();
    listeners.forEach(remove => remove()); built?.dispose(); resources.forEach(resource => resource.dispose());
    renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove();
  };
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !compact, alpha: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.prepend(renderer.domElement);
    const background = new THREE.Color('#242c29');
    const scene = new THREE.Scene(); scene.background = background; scene.fog = new THREE.Fog('#242c29', 23, 65);
    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    const environmentMap = generator.fromScene(environment, 0.04);
    environment.dispose(); generator.dispose(); resources.push(environmentMap);
    scene.environment = environmentMap.texture; scene.environmentIntensity = 0.28;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const fill = new THREE.HemisphereLight('#eff5e8', '#606950', 1.8); scene.add(fill);
    const sun = new THREE.DirectionalLight(theme.light, 3); sun.position.set(2.5, 8, 5); sun.castShadow = true;
    resources.push(sun.shadow);
    sun.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024); sun.shadow.camera.left = -6; sun.shadow.camera.right = 6; sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0004; scene.add(sun);
    const rim = new THREE.DirectionalLight('#c1d9e5', 1.3); rim.position.set(-4, 4, -1); scene.add(rim);
    built = buildRoom(scenarioId, theme); scene.add(built.room);
    const current = { theta: 0.61, phi: 0.98, radius: 13.2, target: new THREE.Vector3(0, 1.0, 0) };
    const desired = { ...current, target: current.target.clone() };
    let view = 'overview';
    let width = 1, height = 1;
    const spherical = new THREE.Spherical(), projected = new THREE.Vector3(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const cuePoints = theme.cues.map(cue => new THREE.Vector3(...cue.position));
    function overviewRadius() { return width / height < 1.1 ? 16 : 13.2; }
    function setView(next) {
      view = next;
      desired.theta = next === 'inside' ? 0.06 : 0.61;
      desired.phi = next === 'inside' ? 1.38 : 0.98;
      desired.radius = next === 'inside' ? (width / height < 1 ? 9.8 : 8.7) : overviewRadius();
      desired.target.set(0, next === 'inside' ? 1.4 : 1, next === 'inside' ? -0.8 : 0);
      invalidate();
    }
    function rotate(dx, dy = 0) {
      desired.theta = THREE.MathUtils.clamp(desired.theta + dx, -0.12, 1.12);
      desired.phi = THREE.MathUtils.clamp(desired.phi + dy, 0.64, 1.46);
      invalidate();
    }
    function zoom(delta) { desired.radius = THREE.MathUtils.clamp(desired.radius + delta, 7.6, 19); invalidate(); }
    function focus(id) {
      built.setActive(id);
      const cue = theme.cues.find(c => c.id === id);
      if (!cue) { setView(view); return; }
      desired.target.set(cue.position[0] * 0.5, Math.max(1, cue.position[1] * 0.85), cue.position[2] * 0.5);
      desired.radius = width / height < 1.1 ? 13.8 : 10.4;
      desired.theta = 0.36; desired.phi = 1.12; invalidate();
    }
    function lighting(night) {
      fill.intensity = night ? 0.65 : 1.8; sun.intensity = night ? 0.8 : 3; rim.intensity = night ? 0.8 : 1.3;
      sun.color.set(night ? '#ffbc79' : theme.light);
      renderer.toneMappingExposure = night ? 0.95 : 1.08;
      background.set(night ? '#1c252a' : '#242c29'); scene.fog.color.copy(background);
      scene.environmentIntensity = night ? 0.16 : 0.28;
      built.lighting(night);
      renderer.shadowMap.needsUpdate = true; invalidate();
    }
    function render(now) {
      frame = 0;
      if (disposed || !visible || document.hidden) { lastFrame = 0; return; }
      const dt = Math.min((now - lastFrame) / 1000 || 0.033, 0.06);
      if (!media.matches && now - lastFrame < 32) { frame = requestAnimationFrame(render); return; }
      lastFrame = now; elapsed += dt;
      const ease = media.matches ? 1 : 1 - Math.exp(-dt * 8);
      for (const key of ['theta', 'phi', 'radius']) current[key] += (desired[key] - current[key]) * ease;
      current.target.lerp(desired.target, ease);
      spherical.set(current.radius, current.phi, current.theta);
      camera.position.setFromSpherical(spherical).add(current.target); camera.lookAt(current.target); camera.updateMatrixWorld();
      built.update(elapsed, camera, !media.matches);
      renderer.render(scene, camera);
      markers.forEach((marker, i) => {
        if (!marker) return;
        projected.copy(cuePoints[i]).project(camera);
        const transform = `translate(${(projected.x * 0.5 + 0.5) * width}px, ${(-projected.y * 0.5 + 0.5) * height}px) translate(-50%, -50%)`;
        const hidden = projected.z > 1 || projected.z < -1 || Math.abs(projected.x) > 0.95 || Math.abs(projected.y) > 0.91;
        const previous = projectionCache.get(marker);
        if (!previous || previous.transform !== transform) marker.style.transform = transform;
        if (!previous || previous.hidden !== hidden) marker.hidden = hidden;
        if (!previous || previous.transform !== transform || previous.hidden !== hidden) projectionCache.set(marker, { transform, hidden });
      });
      const moving = Math.abs(current.theta - desired.theta) + Math.abs(current.phi - desired.phi) + Math.abs(current.radius - desired.radius) + current.target.distanceTo(desired.target) > 0.001;
      if (!media.matches && (built.hasMotion || moving)) frame = requestAnimationFrame(render);
    }
    function invalidate() { if (!disposed && !frame && visible && !document.hidden) frame = requestAnimationFrame(render); }
    function hit(event) {
      const rect = container.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / width * 2 - 1, -((event.clientY - rect.top) / height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(built.interactives, true);
      for (const hit of hits) {
        let object = hit.object;
        while (object && !object.userData.cueId) object = object.parent;
        if (theme.cues.some(c => c.id === object?.userData.cueId)) return object.userData.cueId;
      }
      return null;
    }
    listen(container, 'pointerdown', e => {
      if (e.target !== renderer.domElement || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { x: e.clientX, y: e.clientY, total: 0, id: e.pointerId };
      container.setPointerCapture(e.pointerId);
    });
    listen(container, 'pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.total += Math.abs(dx) + Math.abs(dy);
      rotate(-dx * 0.006, e.pointerType === 'mouse' ? -dy * 0.003 : 0);
      drag.x = e.clientX; drag.y = e.clientY;
    });
    listen(container, 'pointerup', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.total < 7) { const id = hit(e); if (id) onSelect(id); }
      drag = null;
      if (container.hasPointerCapture(e.pointerId)) container.releasePointerCapture(e.pointerId);
    });
    listen(container, 'pointercancel', () => { drag = null; });
    listen(container, 'lostpointercapture', () => { drag = null; });
    listen(renderer.domElement, 'webglcontextlost', e => { e.preventDefault(); dispose(); onFailure(); });
    listen(document, 'visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; } else invalidate(); });
    listen(media, 'change', invalidate);
    resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect(); width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      const nextRatio = Math.min(window.devicePixelRatio || 1, window.matchMedia('(max-width: 640px)').matches ? 1.25 : 1.6);
      if (renderer.getPixelRatio() !== nextRatio) renderer.setPixelRatio(nextRatio);
      renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
      if (view === 'overview') desired.radius = overviewRadius();
      invalidate();
    }); resizeObserver.observe(container);
    intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) invalidate(); else { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; }
    }, { threshold: 0.01 }); intersectionObserver.observe(container);
    invalidate();
    return { rotate, zoom, focus, setView, lighting, dispose };
  } catch (error) { dispose(); throw error; }
}
