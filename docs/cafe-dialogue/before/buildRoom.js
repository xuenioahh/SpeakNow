import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSurfaceMaterials } from './roomMaterials';

// A small art-directed diorama for each place. All assets are local and generated
// once; the render loop only updates the camera and a handful of ambient props.
export function buildRoom(id, theme) {
  const room = new THREE.Group();
  const geometries = new Set();
  const materials = new Map();
  const textures = new Set();
  const interactives = [];
  const animated = [];
  const lightingUpdates = [];
  const surface = createSurfaceMaterials(materials, textures);
  let activeId = null;
  const palette = { wood: '#b68a59', dark: '#283c3c', ivory: '#f3e8d5', metal: '#b5bdb6', gold: '#b99357', green: '#62866a' };
  const material = (color, metalness = 0, emissive = false) => {
    const key = `${color}-${metalness}-${emissive}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: metalness ? 0.3 : 0.72, metalness, ...(emissive ? { emissive: color, emissiveIntensity: 0.3 } : {}) }));
    return materials.get(key);
  };
  function mesh(geometry, color, x, y, z, parent = room, metalness = 0) {
    geometries.add(geometry);
    const finish = color === palette.wood ? surface('wood', color) : material(color, metalness);
    const object = new THREE.Mesh(geometry, finish);
    object.position.set(x, y, z);
    object.castShadow = true;
    object.receiveShadow = true;
    parent.add(object);
    return object;
  }
  const box = (w, h, d, c, x, y, z, p = room, r = 0.035) => mesh(r ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d), c, x, y, z, p);
  const cylinder = (r, h, c, x, y, z, p = room, top = r) => mesh(new THREE.CylinderGeometry(top, r, h, 24), c, x, y, z, p);
  const sphere = (r, c, x, y, z, p = room) => mesh(new THREE.SphereGeometry(r, 16, 12), c, x, y, z, p);
  const group = (x, y, z, key) => {
    const g = new THREE.Group(); g.position.set(x, y, z); room.add(g);
    if (key) { g.userData.cueId = key; interactives.push(g); }
    return g;
  };
  function batchBoxes(w, h, d, color, positions, parent = room) {
    const geometry = new THREE.BoxGeometry(w, h, d); geometries.add(geometry);
    const batch = new THREE.InstancedMesh(geometry, material(color), positions.length);
    const matrix = new THREE.Matrix4();
    positions.forEach(([x, y, z], i) => { matrix.makeTranslation(x, y, z); batch.setMatrixAt(i, matrix); });
    batch.receiveShadow = true; parent.add(batch);
    return batch;
  }
  function metal(object, color = palette.metal) { object.material = material(color, 0.65); return object; }
  function rug(x, z, w, d, color) {
    const mat = box(w, 0.024, d, color, x, 0.072, z, room, 0.015); mat.material = surface('fabric', color);
    for (const dx of [-w / 2 + 0.09, w / 2 - 0.09]) box(0.025, 0.004, d - 0.15, '#e7d6b5', x + dx, 0.087, z, room, 0);
  }
  function pen(x, y, z, parent = room) {
    const barrel = cylinder(0.016, 0.33, palette.dark, x, y, z, parent); barrel.rotation.x = Math.PI / 2; barrel.rotation.z = -0.22;
    metal(box(0.013, 0.015, 0.08, palette.gold, x + 0.015, y + 0.018, z - 0.11, parent, 0), palette.gold);
  }
  function books(x, y, z, parent = room) {
    ['#668378', '#b79a78', '#8793a3'].forEach((color, i) => {
      const book = box(0.52 - i * 0.035, 0.08, 0.39, color, x + i * 0.025, y + i * 0.09, z, parent, 0.015);
      book.rotation.y = i * 0.08;
      box(0.44 - i * 0.035, 0.045, 0.012, '#ede5d4', x + i * 0.025, y + i * 0.09, z + 0.2, parent, 0);
    });
  }
  function bottle(x, y, z, color = '#59725a', parent = room) {
    cylinder(0.07, 0.27, color, x, y + 0.14, z, parent, 0.06);
    cylinder(0.027, 0.1, color, x, y + 0.32, z, parent);
    cylinder(0.03, 0.035, palette.gold, x, y + 0.39, z, parent);
    box(0.09, 0.1, 0.015, palette.ivory, x, y + 0.15, z + 0.065, parent, 0);
  }
  function sign(lines, w, h, x, y, z, { bg = palette.dark, ink = palette.ivory, parent = room, floor = false, font = 'sans-serif' } = {}) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.round(768 * h / w);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lineHeight = canvas.height / (lines.length + 0.65);
    lines.forEach((line, index) => {
      ctx.font = `${index === 0 ? '600' : '400'} ${Math.min(index === 0 ? 68 : 40, lineHeight * 0.6)}px ${font}`;
      ctx.fillText(line, canvas.width / 2, (index + 0.8) * lineHeight, canvas.width * 0.88);
    });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }); materials.set(texture.uuid, mat);
    const geo = new THREE.PlaneGeometry(w, h); geometries.add(geo);
    const face = new THREE.Mesh(geo, mat); face.position.set(x, y, z); if (floor) face.rotation.x = -Math.PI / 2;
    parent.add(face); return face;
  }
  function plant(x, z, scale = 1) {
    const p = group(x, 0, z); p.scale.setScalar(scale);
    cylinder(0.26, 0.45, '#b9a18b', 0, 0.23, 0, p, 0.31);
    cylinder(0.255, 0.025, '#433f31', 0, 0.46, 0, p);
    cylinder(0.035, 1.0, '#716d43', 0, 0.9, 0, p);
    for (let i = 0; i < 8; i++) {
      const angle = i * 2.4;
      const leaf = sphere(0.25, i % 2 ? '#789464' : '#567554', Math.cos(angle) * 0.25, 0.8 + i * 0.09, Math.sin(angle) * 0.23, p);
      leaf.scale.set(0.65, 1.7, 0.5); leaf.rotation.z = Math.cos(angle) * 0.7;
    }
  }
  function chair(x, z, color = theme.accent, angle = 0) {
    const c = group(x, 0, z); c.rotation.y = angle;
    box(0.68, 0.14, 0.64, color, 0, 0.52, 0, c, 0.08).material = surface('fabric', color);
    box(0.7, 0.68, 0.13, color, 0, 0.9, -0.29, c, 0.06).material = surface('fabric', color);
    for (const dx of [-0.25, 0.25]) for (const dz of [-0.23, 0.23]) cylinder(0.035, 0.48, palette.dark, dx, 0.24, dz, c);
  }
  function pendant(x, z, color = palette.gold) {
    cylinder(0.016, 0.4, palette.dark, x, 3.45, z);
    const shade = mesh(new THREE.ConeGeometry(0.34, 0.24, 32, 1, true), color, x, 3.15, z);
    shade.material.side = THREE.DoubleSide;
    const bulb = sphere(0.1, '#ffe5ac', x, 3.04, z); bulb.material = material('#ffe5ac', 0, true);
    const lamp = new THREE.PointLight('#ffdba3', 2.2, 5, 2); lamp.position.set(x, 2.95, z); room.add(lamp);
    lightingUpdates.push(night => { lamp.intensity = night ? 7 : 2.2; bulb.material.emissiveIntensity = night ? 1.4 : 0.3; });
  }
  function counter(w = 3.8, z = -0.45, c = palette.wood) {
    box(w, 1.16, 0.95, c, 0, 0.6, z);
    box(w + 0.12, 0.12, 1.08, palette.ivory, 0, 1.24, z).material = surface('marble', palette.ivory);
    for (let i = -w / 2 + 0.1; i < w / 2; i += 0.16) box(0.04, 0.98, 0.028, c, i, 0.59, z + 0.49, room, 0);
    box(w - 0.15, 0.055, 0.98, palette.gold, 0, 0.09, z);
  }
  function desk(z = 0) {
    box(3.15, 0.13, 1.28, palette.wood, 0, 1.2, z);
    for (const x of [-1.3, 1.3]) box(0.09, 1.14, 1, palette.dark, x, 0.57, z);
  }
  function laptop(x, y, z, key) {
    const p = group(x, y, z, key);
    box(0.82, 0.04, 0.58, palette.metal, 0, 0, 0, p);
    box(0.82, 0.53, 0.045, palette.dark, 0, 0.27, -0.24, p);
    sign(['SPEAKNOW', 'Make your next move.'], 0.72, 0.43, 0, 0.27, -0.214, { parent: p, bg: '#416868' });
    for (let i = 0; i < 4; i++) box(0.62, 0.004, 0.025, '#6e7e7c', 0, 0.025, -0.12 + i * 0.06, p, 0);
  }
  function paper(x, y, z, key, title, lines = ['YOUR NEXT STEP', 'Ask. Clarify. Confirm.']) {
    const p = group(x, y, z, key);
    box(0.64, 0.035, 0.8, palette.ivory, 0, 0, 0, p);
    sign([title, ...lines], 0.58, 0.72, 0, 0.02, 0, { parent: p, bg: palette.ivory, ink: palette.dark, floor: true });
  }
  function windowPanel(x = -1.5, width = 2.7) {
    box(width + 0.14, 1.96, 0.08, palette.ivory, x, 2.08, -2.72);
    const sky = box(width, 1.8, 0.1, '#abc5c7', x, 2.08, -2.66);
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const skyMaterial = new THREE.MeshBasicMaterial({ map: texture }); materials.set(texture.uuid, skyMaterial); sky.material = skyMaterial;
    function paintSky(night) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 128);
      gradient.addColorStop(0, night ? '#233955' : '#7eaebe');
      gradient.addColorStop(0.65, night ? '#69758a' : '#c5d8d4');
      gradient.addColorStop(1, night ? '#d5a77b' : '#ece3c9');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 128); texture.needsUpdate = true;
    }
    paintSky(false); lightingUpdates.push(paintSky);
    const reflection = sign(['', ''], width * 0.09, 1.72, x - width * 0.32, 2.08, -2.58, { bg: '#e6f3ef' });
    reflection.material.transparent = true; reflection.material.opacity = 0.15; reflection.material.depthWrite = false;
    reflection.rotation.z = -0.12;
    // Layered skyline behind the window mullions.
    for (let i = 0; i < 7; i++) {
      const h = 0.25 + (i % 3) * 0.16;
      box(width / 8, h, 0.02, i % 2 ? '#849ea3' : '#8eaeb4', x - width / 2 + (i + 0.7) * width / 7, 1.23 + h / 2, -2.599, room, 0);
    }
    for (const dx of [-width / 2, 0, width / 2]) box(0.045, 1.88, 0.14, palette.ivory, x + dx, 2.08, -2.57);
    box(width, 0.04, 0.14, palette.ivory, x, 2.1, -2.57);
    box(width + 0.2, 0.1, 0.35, palette.ivory, x, 1.12, -2.5);
  }
  function attendant(x, z, color = '#668879') {
    const p = group(x, 0, z);
    cylinder(0.22, 0.62, color, 0, 1.2, 0, p, 0.17);
    sphere(0.2, '#c69574', 0, 1.72, 0, p);
    const hair = sphere(0.205, '#40382f', 0, 1.8, -0.035, p); hair.scale.y = 0.65;
    for (const dx of [-0.075, 0.075]) sphere(0.018, palette.dark, dx, 1.73, 0.18, p);
    for (const dx of [-0.24, 0.24]) { const arm = cylinder(0.065, 0.46, color, dx, 1.25, 0.04, p); arm.rotation.z = dx * 1.3; }
  }
  function shelves(x, z, key = 'books') {
    const p = group(x, 0, z, key);
    for (const y of [0.4, 1.1, 1.8, 2.5]) {
      box(1.25, 0.075, 0.5, palette.wood, 0, y, 0, p);
      if (y < 2.5) for (let j = 0; j < 6; j++) box(0.11, 0.35 + (j % 3) * 0.08, 0.3, ['#d0b897', '#728e83', '#a08273'][j % 3], -0.47 + j * 0.18, y + 0.27, 0, p);
    }
    for (const dx of [-0.65, 0.65]) box(0.065, 2.6, 0.5, palette.wood, dx, 1.3, 0, p);
  }
  function wallBoard(key, title, lines, x = 0.8, width = 2.1, bg = palette.ivory) {
    const p = group(x, 2.25, -2.57, key);
    box(width + 0.1, 1.24, 0.07, palette.wood, 0, 0, 0, p);
    sign([title, ...lines], width, 1.14, 0, 0, 0.041, { parent: p, bg, ink: bg === palette.ivory ? palette.dark : palette.ivory });
  }
  function cup(x, y, z, key, steam = false) {
    const p = group(x, y, z, key);
    cylinder(0.2, 0.026, palette.ivory, 0, 0, 0, p);
    cylinder(0.105, 0.22, palette.ivory, 0, 0.13, 0, p, 0.13);
    cylinder(0.11, 0.008, '#674732', 0, 0.243, 0, p);
    const handle = mesh(new THREE.TorusGeometry(0.07, 0.023, 8, 16), palette.ivory, 0.14, 0.14, 0, p);
    handle.rotation.y = 0;
    if (steam) for (let i = 0; i < 3; i++) {
      const geo = new THREE.SphereGeometry(0.035, 8, 6); geometries.add(geo);
      const mat = new THREE.MeshBasicMaterial({ color: '#fff0db', transparent: true, opacity: 0.25, depthWrite: false }); materials.set(`steam-${i}`, mat);
      const vapor = new THREE.Mesh(geo, mat); vapor.position.set((i - 1) * 0.065, 0.35, 0); vapor.scale.set(0.6, 2.5, 0.6); p.add(vapor);
      animated.push(t => { const phase = (t * 0.4 + i / 3) % 1; vapor.position.y = 0.3 + phase * 0.65; vapor.position.x = Math.sin(t + i) * 0.05; mat.opacity = 0.28 * (1 - phase); });
    }
  }

  // Architectural shell: a thick chamfered plinth, inset flooring, open front,
  // acoustic wall details, skirting, and a shadow-catching ground beneath it.
  box(7.1, 0.3, 5.9, '#4e5650', 0, -0.2, 0, room, 0.12);
  const flooring = box(6.85, 0.1, 5.65, theme.floor, 0, 0, 0, room, 0.04);
  box(6.9, 3.4, 0.14, theme.wall, 0, 1.7, -2.8);
  box(0.14, 3.4, 5.65, theme.wall, -3.43, 1.7, 0);
  box(6.82, 0.1, 0.07, palette.ivory, 0, 0.12, -2.69);
  box(0.07, 0.1, 5.5, palette.ivory, -3.32, 0.12, 0);
  const tiled = ['airport', 'hotel', 'hospital', 'museum', 'shopping', 'car_rental', 'bank'].includes(id);
  flooring.material = surface(tiled ? 'stone' : 'wood', theme.floor);
  for (let x = -3.15; x < 3.3; x += tiled ? 0.9 : 0.42) box(0.008, 0.003, 5.45, '#8a8171', x, 0.055, 0, room, 0);
  if (tiled) for (let z = -2.4; z < 2.8; z += 0.9) box(6.7, 0.003, 0.008, '#8a8171', 0, 0.055, z, room, 0);
  const ground = mesh(new THREE.PlaneGeometry(200, 200), '#242c29', 0, -0.38, 0); ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  const shadow = new THREE.ShadowMaterial({ opacity: 0.24 }); materials.set('ground-shadow', shadow); ground.material = shadow;
  plant(2.85, -2.1, id === 'museum' ? 0.8 : 1);

  if (id === 'cafe') {
    const wallArt = sign(['TAKE', 'A LITTLE', 'MOMENT.'], 1.0, 1.3, -3.34, 2.05, -0.2, { bg: '#dbccb0', ink: '#53654e', font: 'serif' }); wallArt.rotation.y = Math.PI / 2;
    windowPanel(-2.1, 1.9); counter(4.3, -0.75);
    wallBoard('menu', 'BREW & BEAN', ['ESPRESSO  /  LATTE  /  FILTER', 'OAT MILK · FRESH PASTRIES'], 0.55, 2.5, '#273e32');
    // Espresso machine, double group heads and stacked cups.
    box(0.95, 0.55, 0.5, palette.metal, -1.3, 1.6, -0.85);
    box(0.87, 0.3, 0.08, palette.dark, -1.3, 1.57, -0.55);
    for (const x of [-1.52, -1.1]) { cylinder(0.07, 0.14, palette.gold, x, 1.47, -0.49); cup(x, 1.88, -0.85); }
    cup(0.6, 1.31, -0.5, 'coffee', true);
    const pastry = group(1.75, 1.32, -0.55, 'pastry'); box(0.9, 0.045, 0.58, palette.wood, 0, 0, 0, pastry);
    for (let i = 0; i < 3; i++) { const roll = mesh(new THREE.TorusGeometry(0.105, 0.065, 8, 16, Math.PI * 1.5), '#d59b57', -0.27 + i * 0.26, 0.09, 0, pastry); roll.rotation.x = Math.PI / 2; }
    for (const x of [-1.45, 0, 1.45]) { cylinder(0.31, 0.12, '#b08659', x, 0.75, 0.8); for (const dx of [-0.2, 0.2]) for (const dz of [-0.2, 0.2]) cylinder(0.027, 0.69, palette.dark, x + dx, 0.36, 0.8 + dz); }
    pendant(-0.9, -0.6); pendant(1.2, -0.6); attendant(0.1, -1.6);
  } else if (id === 'airport') {
    windowPanel(-1.6, 3.1); counter(3.3, -0.35, '#557d8a');
    wallBoard('board', 'DEPARTURES', ['BA123   NEW YORK   16:40', 'DELAYED             GATE B12'], 0.75, 3, '#18333d');
    paper(-0.7, 1.33, -0.2, 'passport', 'BOARDING PASS', ['BA123  /  NEW YORK', 'GATE B12']);
    const bag = group(2.1, 0, 1, 'luggage'); box(0.65, 0.9, 0.42, '#c59453', 0, 0.57, 0, bag, 0.08);
    for (const x of [-0.22, 0.22]) { cylinder(0.025, 0.4, palette.metal, x, 1.19, 0, bag); sphere(0.065, palette.dark, x, 0.1, 0, bag); }
    box(0.47, 0.055, 0.09, palette.dark, 0, 1.4, 0, bag);
    for (let i = 0; i < 5; i++) box(0.025, 0.7, 0.02, '#a5753e', -0.23 + i * 0.115, 0.57, 0.22, bag);
    for (const x of [-2.2, -0.3, 1.4]) { cylinder(0.12, 0.05, palette.metal, x, 0.1, 1.65); cylinder(0.025, 0.85, palette.metal, x, 0.53, 1.65); }
    box(3.6, 0.1, 0.025, '#3e6886', -0.4, 0.9, 1.65);
    attendant(0.2, -1.25, '#455d7b'); sign(['02', 'CHECK-IN'], 0.6, 0.7, -1.18, 0.7, 0.15);
  } else if (id === 'hotel') {
    for (let i = 0; i < 32; i++) box(0.06, 3.2, 0.08, '#737363', -3.1 + i * 0.2, 1.7, -2.69);
    counter(4.4, -0.4, '#565f58'); sign(['THE GRAND', 'A place to arrive.'], 2.4, 0.8, 0, 1.95, -2.59, { bg: '#515b51', ink: '#e9ce95', font: 'serif' });
    const bell = group(-1, 1.34, -0.2, 'bell'); cylinder(0.2, 0.035, palette.dark, 0, 0, 0, bell); const dome = sphere(0.15, palette.gold, 0, 0.07, 0, bell); dome.scale.y = 0.6; cylinder(0.026, 0.08, palette.gold, 0, 0.2, 0, bell);
    paper(0.8, 1.32, -0.2, 'key', 'ROOM 204', ['THE GRAND', 'WELCOME BACK']);
    const clock = group(0, 2.83, -2.53, 'clock'); const disc = cylinder(0.27, 0.06, palette.gold, 0, 0, 0, clock); disc.rotation.x = Math.PI / 2;
    sign(['11:00', 'CHECKOUT'], 0.43, 0.3, 0, 0, 0.04, { parent: clock, bg: '#bd9e65', ink: '#253831' });
    pendant(-1.5, -0.3); pendant(1.5, -0.3); attendant(0, -1.35, '#314b42');
    box(1.5, 0.15, 0.9, '#a28569', -1.7, 0.5, 1.6); box(1.5, 0.6, 0.16, '#a28569', -1.7, 0.8, 1.22);
  } else if (id === 'restaurant') {
    windowPanel(-1.4, 2.4); sign(['BELLA ITALIA', 'Buona sera.'], 1.6, 0.9, 1.5, 2.3, -2.7, { bg: theme.wall, font: 'serif' });
    cylinder(1.25, 0.12, palette.wood, 0, 1.15, 0.4); cylinder(0.13, 1.1, palette.dark, 0, 0.57, 0.4);
    box(0.65, 0.012, 2.15, '#ece0c6', 0, 1.217, 0.4);
    chair(-1.7, 0.3, '#a46750', -Math.PI / 2); chair(1.7, 0.3, '#a46750', Math.PI / 2);
    paper(-0.7, 1.24, 0.5, 'menu', 'THE MENU', ['SEASONAL / LOCAL', 'Ask about ingredients']);
    const plate = group(0.5, 1.24, 0.6, 'plate'); cylinder(0.33, 0.04, palette.ivory, 0, 0, 0, plate); cylinder(0.22, 0.016, '#d2b16e', 0, 0.03, 0, plate);
    for (let i = 0; i < 5; i++) sphere(0.045, i % 2 ? '#a14f39' : '#537346', Math.sin(i * 2) * 0.13, 0.05, Math.cos(i * 2) * 0.13, plate);
    const wine = group(1.05, 1.25, -0.05, 'wine'); cylinder(0.1, 0.02, palette.ivory, 0, 0, 0, wine); cylinder(0.016, 0.23, palette.ivory, 0, 0.13, 0, wine); const glass = sphere(0.115, '#804354', 0, 0.33, 0, wine); glass.scale.y = 1.2;
    cylinder(0.09, 0.25, palette.ivory, 0, 1.37, -0.3); const flame = sphere(0.032, '#ffc36d', 0, 1.54, -0.3); flame.scale.y = 2; flame.material = material('#ffc36d', 0, true);
    animated.push(t => { flame.scale.y = 1.7 + Math.sin(t * 3) * 0.25; }); pendant(0, 0.4); plant(-2.65, -1.9);
  } else if (id === 'museum') {
    function painting(x, key, colors) {
      const p = group(x, 2, -2.58, key); box(1.55, 1.65, 0.09, palette.gold, 0, 0, 0, p);
      box(1.4, 1.5, 0.035, colors[0], 0, 0, 0.055, p);
      for (let i = 0; i < 24; i++) {
        const stroke = box(0.3 + (i % 3) * 0.09, 0.07, 0.015, colors[1 + i % 3], Math.sin(i * 7) * 0.43, -0.6 + i * 0.049, 0.08, p, 0);
        stroke.rotation.z = Math.sin(i) * 0.3;
      }
      box(1.4, 0.08, 0.18, palette.dark, x, 3.15, -2.1);
      const light = new THREE.SpotLight('#ffe4ae', 12, 6, Math.PI / 5, 0.8, 2); light.position.set(x, 3.05, -1.6); light.target.position.set(x, 1.8, -2.65); room.add(light, light.target);
    }
    painting(-1.75, 'painting', ['#a4b2a0', '#778f89', '#c7bd8c', '#728299']); painting(1.65, 'landscape', ['#b9b6a3', '#8d9b88', '#d1bb88', '#9ea4b4']);
    const p = group(0, 0, 0.2, 'sculpture'); box(0.95, 1, 0.85, '#ece5d5', 0, 0.5, 0, p);
    const sculpture = mesh(new THREE.TorusKnotGeometry(0.29, 0.1, 64, 12), '#b09b74', 0, 1.48, 0, p, 0.65); sculpture.rotation.x = 0.4;
    box(2, 0.16, 0.6, '#947658', -1.3, 0.53, 1.6); for (const x of [-2, -0.6]) box(0.09, 0.48, 0.45, palette.dark, x, 0.25, 1.6);
    sign(['LIGHT / FORM', 'Studies in seeing'], 1.15, 0.6, 0, 2.8, -2.7, { bg: theme.wall, ink: '#3d4941', font: 'serif' });
  } else if (id === 'car_rental') {
    windowPanel(-1.8, 2.3); wallBoard('policy', 'QUICKRENT', ['YOUR COASTAL ESCAPE', 'GPS  /  COVER  /  MILEAGE'], 1.6, 2.1, '#2c4e55');
    const car = group(-0.85, 0, 0.45, 'car'); car.rotation.y = -0.14;
    box(2.9, 0.48, 1.35, '#cda76a', 0, 0.59, 0, car, 0.15); box(1.5, 0.52, 1.15, '#8bb2b9', -0.1, 1.04, 0, car, 0.14);
    box(1.36, 0.06, 1.18, '#d8b67d', -0.1, 1.32, 0, car); box(0.08, 0.5, 1.19, '#cda76a', -0.1, 1.06, 0, car);
    for (const x of [-0.9, 0.94]) for (const z of [-0.68, 0.68]) {
      const wheel = cylinder(0.32, 0.18, '#26332f', x, 0.35, z, car); wheel.rotation.x = Math.PI / 2;
      const rim = cylinder(0.17, 0.19, palette.metal, x, 0.35, z, car); rim.rotation.x = Math.PI / 2;
    }
    for (const z of [-0.43, 0.43]) box(0.025, 0.12, 0.26, '#f6e4b5', 1.46, 0.63, z, car);
    box(1, 1.15, 0.8, '#e1d5bc', 2, 0.6, -0.7); const keys = group(1.85, 1.2, -0.6, 'keys'); box(0.15, 0.055, 0.27, palette.dark, 0, 0, 0, keys); box(0.05, 0.02, 0.24, palette.gold, 0, 0, 0.21, keys);
    for (const x of [-2.75, 0.95]) box(0.035, 0.005, 3.5, '#ece4cf', x, 0.06, 0.6, room, 0);
  } else if (id === 'shopping') {
    counter(3.5, 0, '#93869e'); laptop(-0.7, 1.34, 0, 'laptop'); paper(0.7, 1.34, 0.2, 'receipt', 'RECEIPT', ['TECHMART', 'Proof of purchase']);
    const display = group(0, 0, -2.3, 'exchange');
    for (const y of [0.85, 1.65, 2.45]) {
      box(5.6, 0.09, 0.65, palette.ivory, 0, y, 0, display);
      for (let i = 0; i < 5; i++) { box(0.48, 0.42, 0.25, ['#b8cbd0', '#c5acc9', '#d8c3a1'][i % 3], -2.1 + i * 1.05, y + 0.26, 0, display); box(0.3, 0.24, 0.01, palette.dark, -2.1 + i * 1.05, y + 0.26, 0.135, display); }
    }
    sign(['TECHMART', 'Find your everyday upgrade.'], 2.6, 0.55, 0, 3.05, -2.69, { bg: theme.wall }); pendant(0, 0); attendant(0.6, -1);
  } else {
    // Workplaces share furniture proportions, but each has a different layout,
    // silhouette and task props rather than recoloring the same empty room.
    if (id !== 'bank') { desk(); chair(0.1, -1, '#758c83'); }
    if (id === 'bank') {
      counter(3.9, -0.2, '#496c61'); wallBoard('rates', 'FIRST NATIONAL', ['SAVINGS  /  EVERYDAY', 'COMPARE RATES & FEES'], 0, 3, '#36584b');
      paper(-0.9, 1.33, -0.1, 'form', 'ACCOUNT FORM'); paper(0.8, 1.33, 0, 'card', 'IDENTIFICATION');
      for (const x of [-1.9, 1.9]) { cylinder(0.15, 0.05, palette.gold, x, 0.12, 1.7); cylinder(0.035, 0.9, palette.gold, x, 0.55, 1.7); }
      box(3.8, 0.065, 0.04, '#715943', 0, 0.95, 1.7); attendant(0, -1.3, '#3c5147');
    } else if (id === 'hospital') {
      wallBoard('chart', 'YOUR CONSULTATION', ['WHEN DID IT START?', 'TIMING  /  DURATION  /  SEVERITY'], 0, 2.8);
      paper(-0.7, 1.3, 0.1, 'notes', 'SYMPTOM NOTES', ['TWO WEEKS', 'Morning / dizziness']); paper(1.05, 1.3, 0.1, 'plan', 'NEXT STEPS');
      box(1.1, 0.18, 2.2, '#dce8de', -2.3, 0.85, -0.7); box(0.85, 0.15, 0.5, palette.ivory, -2.3, 1.01, -1.45);
      for (const z of [-1.5, 0.1]) box(0.8, 0.75, 0.075, palette.metal, -2.3, 0.4, z);
      box(0.65, 0.65, 0.15, palette.ivory, -2.6, 2.6, -2.62); box(0.12, 0.43, 0.03, '#8ea9a0', -2.6, 2.6, -2.52); box(0.43, 0.12, 0.03, '#8ea9a0', -2.6, 2.6, -2.5); attendant(0, -1.1, '#d9e4d9');
    } else if (id === 'university') {
      shelves(-2.25, -2.15); wallBoard('calendar', 'NEXT SEMESTER', ['MON   TUE   WED   THU   FRI', 'REQUIRED COURSES + ELECTIVES'], 0.9, 2.5);
      paper(-0.75, 1.3, 0, 'plan', 'MY STUDY PLAN'); laptop(0.7, 1.3, -0.1); chair(-1.8, 1.35, '#b29a85', -0.2); attendant(0, -1.1, '#8b7d96');
    } else if (id === 'office') {
      windowPanel(-1.5, 2.7); wallBoard('calendar', 'TEAM CALENDAR', ['PLAN AHEAD', 'PROJECTS  /  LEAVE  /  COVER'], 1.1, 1.9);
      laptop(-0.75, 1.3, 0, 'laptop'); paper(1.1, 1.3, 0.2, 'handover', 'HANDOVER'); chair(-0.5, 1.25, '#a7ae87'); attendant(0.3, -1.1, '#5d6e58');
      box(1, 0.7, 0.9, '#9e896c', -2.6, 0.4, -1.9); plant(-2.6, -1.9, 0.6);
    } else if (id === 'phone') {
      windowPanel(-1.4, 2.8); shelves(2.2, -2.2, 'shelf');
      const phone = group(-0.9, 1.29, 0.2, 'phone'); box(0.26, 0.08, 0.5, palette.dark, 0, 0, 0, phone); sign(['CALL', 'SUPPORT'], 0.21, 0.4, 0, 0.043, 0, { parent: phone, floor: true, bg: '#50766e' });
      paper(0.1, 1.3, 0.2, 'bill', 'PHONE BILL', ['EXTRA CHARGE', '$50.00']); paper(1.05, 1.3, 0.1, 'notes', 'CALL NOTES'); chair(0, 1.25, '#8f9bb2');
      cylinder(0.2, 0.035, palette.gold, 1.2, 1.3, -0.4); cylinder(0.025, 0.55, palette.gold, 1.2, 1.58, -0.4); mesh(new THREE.ConeGeometry(0.26, 0.24, 24), '#d4b88d', 1.2, 1.94, -0.4);
      cup(-1.2, 1.29, -0.3); box(2.6, 0.02, 1.6, '#697888', 0, 0.07, 1.2);
    }
  }
  // Soft contact shadows anchor furniture even where a single sun misses it.
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 64;
  const shadowCtx = shadowCanvas.getContext('2d');
  const gradient = shadowCtx.createRadialGradient(32, 32, 4, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(23,29,23,0.32)'); gradient.addColorStop(1, 'rgba(23,29,23,0)');
  shadowCtx.fillStyle = gradient; shadowCtx.fillRect(0, 0, 64, 64);
  const contactTexture = new THREE.CanvasTexture(shadowCanvas); textures.add(contactTexture);
  const contactMaterial = new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  materials.set('contact-shadow', contactMaterial);
  const contactGeometry = new THREE.PlaneGeometry(1, 1); geometries.add(contactGeometry);
  room.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  [...room.children].filter(object => object instanceof THREE.Group).forEach(object => {
    bounds.setFromObject(object);
    if (bounds.min.y > 0.12 || bounds.max.y < 0.3) return;
    const size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
    const contact = new THREE.Mesh(contactGeometry, contactMaterial);
    contact.rotation.x = -Math.PI / 2; contact.position.set(center.x, 0.058, center.z);
    contact.scale.set(Math.max(0.6, size.x * 1.3), Math.max(0.6, size.z * 1.3), 1); room.add(contact);
  });
  // Clone only actionable finishes, so highlighting never affects other props.
  const highlights = [];
  interactives.forEach(object => object.traverse(child => {
    if (!child.isMesh || !child.material.isMeshStandardMaterial) return;
    const finish = child.material.clone(); child.material = finish; materials.set(finish.uuid, finish);
    highlights.push({ id: object.userData.cueId, finish, color: finish.emissive.clone(), intensity: finish.emissiveIntensity });
  }));
  // Small luminous rings locate each actionable object in the world.
  const rings = theme.cues.map(cue => {
    const ring = mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 28), theme.accent, ...cue.position);
    ring.material = material(theme.accent, 0, true); ring.userData.cueId = cue.id; interactives.push(ring);
    return ring;
  });
  return {
    room, interactives, hasMotion: animated.length > 0,
    setActive(value) {
      activeId = value;
      highlights.forEach(({ id: cueId, finish, color, intensity }) => {
        finish.emissive.copy(cueId === value ? new THREE.Color(theme.accent) : color);
        finish.emissiveIntensity = cueId === value ? 0.16 : intensity;
      });
    },
    lighting(night) { lightingUpdates.forEach(update => update(night)); },
    update(time, camera, motion) {
      rings.forEach((ring, i) => { ring.quaternion.copy(camera.quaternion); ring.scale.setScalar(theme.cues[i].id === activeId ? 1.4 : 1); });
      if (motion) animated.forEach(update => update(time));
    },
    dispose() { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); },
  };
}
