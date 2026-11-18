import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildRoom } from './buildRoom';

export function createScene(container, theme, scenarioId, markers, onSelect, onFailure, overlays = {}) {
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
    delete container.__scene;
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
    renderer.shadowMap.autoUpdate = true;
    renderer.shadowMap.needsUpdate = true;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.prepend(renderer.domElement);
    const background = new THREE.Color('#eef2f7');
    const scene = new THREE.Scene(); scene.background = background; scene.fog = new THREE.Fog('#eef2f7', 23, 65);
    const environment = new RoomEnvironment();
    const generator = new THREE.PMREMGenerator(renderer);
    const environmentMap = generator.fromScene(environment, 0.04);
    environment.dispose(); generator.dispose(); resources.push(environmentMap);
    scene.environment = environmentMap.texture; scene.environmentIntensity = 0.45;
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const fill = new THREE.HemisphereLight('#eff5e8', '#606950', 1.8); scene.add(fill);
    const sun = new THREE.DirectionalLight(theme.light, 3); sun.position.set(2.5, 8, 5); sun.castShadow = true;
    resources.push(sun.shadow);
    sun.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024); sun.shadow.camera.left = -6; sun.shadow.camera.right = 6; sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0004; scene.add(sun);
    const rim = new THREE.DirectionalLight('#c1d9e5', 1.3); rim.position.set(-4, 4, -1); scene.add(rim);
    built = buildRoom(scenarioId, theme); scene.add(built.room);
    const current = { position: new THREE.Vector3(7, 7.8, 10), target: new THREE.Vector3(0, 1, 0) };
    const desired = { position: current.position.clone(), target: current.target.clone() };
    let view = 'overview', focusedId = null, route = [], transitioning = false;
    let width = 1, height = 1;
    const projected = new THREE.Vector3(), raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
    const cuePoints = theme.cues.map(cue => new THREE.Vector3(...cue.anchor));
    const renderTimes = [], frameIntervals = [];
    let frames = 0, previousRendered = 0, subtitleVisible = false;
    const obstacles = [];
    built.room.traverse(object => { if (object instanceof THREE.Mesh && !(object instanceof THREE.SkinnedMesh) && !Array.isArray(object.material) && !object.material.transparent && object.geometry.type !== 'TorusGeometry') obstacles.push(object); });
    const transition = value => { if (transitioning !== value) { transitioning = value; overlays.onTransition?.(value); } };
    function setView(next) {
      focusedId = null; view = next; route = [];
      desired.position.set(next === 'inside' ? .4 : 7, next === 'inside' ? 2.2 : 7.8, next === 'inside' ? 7.8 : (width / height < 1.1 ? 17 : 10));
      desired.target.set(0, 1.2, -.4); transition(true); invalidate();
    }
    function rotate(dx, dy = 0) {
      route = [];
      const offset = desired.position.clone().sub(desired.target);
      const orbit = new THREE.Spherical().setFromVector3(offset);
      orbit.theta = THREE.MathUtils.clamp(orbit.theta + dx, -1.2, 1.2);
      orbit.phi = THREE.MathUtils.clamp(orbit.phi + dy, .55, 1.6);
      desired.position.setFromSpherical(orbit).add(desired.target);
      // The front aisle remains clear of room geometry, including tables.
      desired.position.z = Math.max(3.15, desired.position.z);
      desired.position.x = THREE.MathUtils.clamp(desired.position.x, -2.95, 3.2);
      transition(true); invalidate();
    }
    function zoom(delta) {
      route = [];
      const offset = desired.position.clone().sub(desired.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() + delta * .35, 2.8, 18));
      desired.position.copy(desired.target).add(offset); desired.position.z = Math.max(3.15, desired.position.z);
      transition(true); invalidate();
    }
    function focus(id, force = false) {
      if (id === focusedId && !force) return;
      focusedId = id; built.setActive(id);
      const cue = theme.cues.find(c => c.id === id);
      if (!cue) { setView(view); return; }
      desired.target.fromArray(cue.cameraTarget);
      const destination = new THREE.Vector3(...cue.cameraPosition);
      // A mobile portrait field of view must still contain the actor's torso.
      const aisle = Math.max(4.25, current.position.z, destination.z);
      route = [new THREE.Vector3(current.position.x, current.position.y, aisle), new THREE.Vector3(destination.x, destination.y, aisle), destination];
      if (media.matches) { desired.position.copy(destination); route = []; }
      else desired.position.copy(route.shift());
      transition(true); invalidate();
    }
    function occluded(point) {
      const offset = point.clone().sub(camera.position), distance = offset.length();
      raycaster.set(camera.position, offset.normalize()); raycaster.far = Math.max(.1, distance - .16);
      const blocked = raycaster.intersectObjects(obstacles, false).length > 0;
      raycaster.far = Infinity; return blocked;
    }
    function faceVisible(index) {
      const actor = built.actors[index], head = actor.skeleton.bones.find(bone => bone.name === 'head');
      const point = head.getWorldPosition(new THREE.Vector3()).add(head.getWorldDirection(new THREE.Vector3()).multiplyScalar(.15));
      const offset = point.clone().sub(camera.position);
      raycaster.set(camera.position, offset.clone().normalize()); raycaster.far = Math.max(.1, offset.length() - .08);
      const meshes = obstacles.filter(mesh => { let node = mesh; while (node) { if (node === actor.root) return false; node = node.parent; } return true; });
      const others = built.actors.filter(item => item !== actor).map(item => item.root);
      const blocked = raycaster.intersectObjects([...meshes, ...others], true).some(hit => hit.object.visible);
      raycaster.far = Infinity; return !blocked;
    }
    function place(element, point, caption = false) {
      if (!element) return;
      // Hidden captions need no projection or room-wide occlusion raycast.
      if (element.classList.contains('is-inactive')) { if (caption) subtitleVisible = false; return; }
      projected.copy(point).project(camera);
      const hidden = projected.z > 1 || projected.z < -1 || Math.abs(projected.x) > .98 || Math.abs(projected.y) > .94 || occluded(point);
      const x = (projected.x * .5 + .5) * width, y = (-projected.y * .5 + .5) * height;
      const labelWidth = caption ? Math.min(310, width - 32) : 160;
      const px = caption ? THREE.MathUtils.clamp(x, labelWidth / 2 + 16, width - labelWidth / 2 - 16) : x;
      const py = caption ? THREE.MathUtils.clamp(y - 90, 130, height - 290) : y;
      const transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`;
      const previous = projectionCache.get(element);
      if (!previous || previous.transform !== transform) element.style.transform = transform;
      if (!previous || previous.hidden !== hidden) element.hidden = hidden;
      projectionCache.set(element, { transform, hidden });
      if (caption) subtitleVisible = !hidden;
    }
    function lighting(night) {
      fill.intensity = night ? 1.2 : 1.8; sun.intensity = night ? 1.4 : 3; rim.intensity = night ? 1 : 1.3;
      sun.color.set(night ? '#ffbc79' : theme.light);
      renderer.toneMappingExposure = night ? 1.02 : 1.08;
      background.set(night ? '#e9e5f2' : '#eef2f7'); scene.fog.color.copy(background);
      scene.environmentIntensity = night ? 0.35 : 0.45;
      built.lighting(night);
      renderer.shadowMap.needsUpdate = true; invalidate();
    }
    function render(now) {
      frame = 0;
      if (disposed || !visible || document.hidden) { lastFrame = 0; return; }
      const dt = Math.min((now - lastFrame) / 1000 || 0.033, 0.06);
      if (!media.matches && now - lastFrame < 32) { frame = requestAnimationFrame(render); return; }
      lastFrame = now; elapsed += dt;
      const started = performance.now();
      const ease = media.matches ? 1 : 1 - Math.exp(-dt * 6);
      current.position.lerp(desired.position, ease); current.target.lerp(desired.target, ease);
      if (current.position.distanceTo(desired.position) < .035 && route.length) desired.position.copy(route.shift());
      const moving = route.length > 0 || current.position.distanceTo(desired.position) + current.target.distanceTo(desired.target) > .025;
      if (!moving) transition(false);
      camera.position.copy(current.position); camera.lookAt(current.target); camera.updateMatrixWorld();
      built.update(elapsed, camera, !media.matches, overlays.getSpeechEnergy?.());
      const speaker = theme.cues.find(item => item.id === focusedId);
      if (speaker) overlays.onAudioFrame?.({ position: camera.position.toArray(), forward: camera.getWorldDirection(new THREE.Vector3()).toArray(), up: camera.up.toArray(), speaker: [speaker.npcPosition[0], speaker.pose === 'seated' ? 1.45 : 1.75, speaker.npcPosition[2]] });
      renderer.render(scene, camera);
      markers.forEach((marker, i) => place(marker, cuePoints[i]));
      const cue = theme.cues.find(item => item.id === focusedId);
      if (cue && overlays.dialogue) {
        const point = new THREE.Vector3(...cue.npcPosition); point.y = cue.pose === 'seated' ? 1.48 : 1.92;
        place(overlays.dialogue, point, true);
      }
      frames++;
      if (previousRendered) frameIntervals.push(now - previousRendered);
      previousRendered = now;
      renderTimes.push(performance.now() - started);
      if (renderTimes.length > 240) renderTimes.shift();
      if (frameIntervals.length > 240) frameIntervals.shift();
      if (!media.matches && (built.hasMotion || moving)) frame = requestAnimationFrame(render);
    }

    function invalidate() { if (!disposed && !frame && visible && !document.hidden) frame = requestAnimationFrame(render); }
    function hit(event) {
      const rect = container.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / width * 2 - 1, -((event.clientY - rect.top) / height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(built.room.children, true);
      for (const hit of hits) {
        if (!hit.object.visible) continue;
        if (hit.object instanceof THREE.Mesh && !Array.isArray(hit.object.material) && hit.object.material.transparent) continue;
        let object = hit.object;
        while (object && !object.userData.cueId) object = object.parent;
        if (theme.cues.some(c => c.id === object?.userData.cueId)) return object.userData.cueId;
        return null;
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
      camera.fov = width / height < .8 ? 52 : 38; camera.updateProjectionMatrix();
      if (!focusedId) setView(view);
      invalidate();
    }); resizeObserver.observe(container);
    intersectionObserver = new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible) invalidate(); else { cancelAnimationFrame(frame); frame = 0; lastFrame = 0; }
    }, { threshold: 0.01 }); intersectionObserver.observe(container);
    invalidate();
    const api = { rotate, zoom, focus, setView, lighting, dispose,
      setConversationState(value) { built.setConversationState(value); invalidate(); },
      snapshot() {
        const sorted = [...renderTimes].sort((a,b) => a-b);
        return { sceneId: scenarioId, background: background.getHexString(), roomId: built.room.uuid, focusedId, transitioning, frames,
          cameraPosition: camera.position.toArray(), cameraTarget: current.target.toArray(), subtitleVisible,
          npc: built.actors.map((actor, index) => ({ id: theme.cues[index].id, faceVisible: faceVisible(index), state: actor.getState(), mouthEnergy: actor.getMouthEnergy(), uuid: actor.root.uuid, position: actor.root.position.toArray(), bones: actor.skeleton.bones.length, pose: theme.cues[index].pose, bounds: new THREE.Box3().setFromObject(actor.root).getSize(new THREE.Vector3()).toArray() })),
          fps: frameIntervals.length ? 1000 / (frameIntervals.reduce((a,b) => a+b,0) / frameIntervals.length) : null,
          renderMsP50: sorted[Math.floor(sorted.length * .5)], renderMsP95: sorted[Math.floor(sorted.length * .95)],
          drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, memory: { ...renderer.info.memory },
          reducedMotion: media.matches, pixelRatio: renderer.getPixelRatio(), width, height };
      } };
    // Read-only diagnostics are useful for support and reproducible render tests.
    Object.defineProperty(container, '__scene', { configurable: true, value: api });
    return api;
  } catch (error) { dispose(); throw error; }
}
