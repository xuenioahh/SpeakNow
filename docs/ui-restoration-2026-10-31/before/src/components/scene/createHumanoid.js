import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original, locally generated articulated characters. No external model or
// texture licence is required. Rigid-weight skinning preserves crisp clothing
// and facial details while sharing a single skeleton across material batches.
export function createHumanoid(anchor, index, surface) {
  const root = new THREE.Group(); root.name = `npc:${anchor.sceneAnchorId}`;
  root.userData.cueId = anchor.id; root.userData.npc = true;
  const bones = [], geometries = [], materials = [], buckets = new Map();
  const bone = (name, parent, position) => {
    const item = new THREE.Bone(); item.name = name; item.position.fromArray(position);
    (parent || root).add(item); bones.push(item); return item;
  };
  const hips = bone('hips', null, [0, .94, 0]);
  const spine = bone('spine', hips, [0, .14, 0]);
  const chest = bone('chest', spine, [0, .22, 0]);
  const neck = bone('neck', chest, [0, .22, 0]);
  const head = bone('head', neck, [0, .17, 0]);
  const limbs = [-1, 1].map(side => {
    const shoulder = bone(`shoulder-${side}`, chest, [side * .245, .1, 0]);
    const elbow = bone(`elbow-${side}`, shoulder, [0, -.3, 0]);
    const wrist = bone(`wrist-${side}`, elbow, [0, -.265, 0]);
    const thigh = bone(`thigh-${side}`, hips, [side * .115, -.04, 0]);
    const knee = bone(`knee-${side}`, thigh, [0, -.41, 0]);
    const ankle = bone(`ankle-${side}`, knee, [0, -.39, 0]);
    return { side, shoulder, elbow, wrist, thigh, knee, ankle };
  });
  root.updateMatrixWorld(true);
  const skin = new THREE.MeshStandardMaterial({ color: ['#c68e70', '#90634f', '#dfb391'][index], roughness: .64 });
  const hair = new THREE.MeshStandardMaterial({ color: ['#302921', '#282b32', '#654331'][index], roughness: .89 });
  const cloth = surface('fabric', ['#526f65', '#686578', '#a27862'][index]);
  const trousers = surface('fabric', '#38434a');
  const shoe = new THREE.MeshStandardMaterial({ color: '#343536', roughness: .48 });
  const eye = new THREE.MeshStandardMaterial({ color: '#eee9dd', roughness: .3 });
  const iris = new THREE.MeshStandardMaterial({ color: '#293e3b', roughness: .32 });
  const lip = new THREE.MeshStandardMaterial({ color: '#81584d', roughness: .75 });
  const accent = new THREE.MeshStandardMaterial({ color: '#ddc59e', roughness: .85 });
  materials.push(skin, hair, shoe, eye, iris, lip, accent);
  function add(geometry, finish, parent, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    geometry.applyMatrix4(local).applyMatrix4(parent.matrixWorld);
    const count = geometry.attributes.position.count, indices = new Uint16Array(count * 4), weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = bones.indexOf(parent); weights[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    if (!buckets.has(finish)) buckets.set(finish, []);
    buckets.get(finish).push(geometry);
  }
  const ellipsoid = (finish, parent, position, scale) => add(new THREE.SphereGeometry(1, 20, 14), finish, parent, position, scale);
  const capsule = (finish, parent, position, radius, length, scale = [1, 1, 1]) => add(new THREE.CapsuleGeometry(radius, length, 4, 12), finish, parent, position, scale);
  ellipsoid(trousers, hips, [0, -.035, 0], [.215, .15, .14]);
  const torsoProfile = [[0, -.12], [.17, -.12], [.2, .02], [.235, .26], [.21, .34], [.09, .4], [0, .4]].map(([radius, y]) => new THREE.Vector2(radius, y));
  add(new THREE.LatheGeometry(torsoProfile, 24), cloth, spine, [0, 0, 0], [1, 1, .7]);
  capsule(skin, neck, [0, .015, 0], .073, .11);
  ellipsoid(skin, head, [0, .02, 0], [.17, .225, .175]);
  // Hair has a back, crown and a swept fringe; it is not a billboard.
  ellipsoid(hair, head, [0, .12, -.035], [.177, .15, .168]);
  ellipsoid(hair, head, [-.06, .16, .07], [.13, .09, .115]);
  if (index === 2) ellipsoid(hair, head, [0, -.015, -.14], [.175, .19, .085]);
  ellipsoid(skin, head, [0, .006, .166], [.027, .044, .033]);
  for (const side of [-1, 1]) {
    ellipsoid(skin, head, [side * .168, .012, 0], [.034, .055, .027]);
    ellipsoid(lip, head, [side * .182, .01, .014], [.009, .027, .012]);
    ellipsoid(eye, head, [side * .066, .047, .151], [.045, .028, .023]);
    ellipsoid(iris, head, [side * .065, .046, .174], [.017, .019, .009]);
    ellipsoid(eye, head, [side * .06, .052, .183], [.005, .005, .003]);
    add(new THREE.CapsuleGeometry(.008, .06, 4, 8), hair, head, [side * .066, .091, .16], [1, 1, .6], [0, 0, Math.PI / 2]);
  }
  const smile = new THREE.CatmullRomCurve3([new THREE.Vector3(-.055, -.07, .147), new THREE.Vector3(0, -.079, .16), new THREE.Vector3(.055, -.07, .147)]);
  add(new THREE.TubeGeometry(smile, 12, .006, 5, false), lip, head, [0, 0, 0]);
  for (const { side, shoulder, elbow, wrist, thigh, knee, ankle } of limbs) {
    capsule(cloth, shoulder, [0, -.14, 0], .078, .16);
    capsule(skin, elbow, [0, -.115, 0], .057, .16);
    ellipsoid(skin, wrist, [0, -.045, .01], [.055, .078, .028]);
    for (let finger = 0; finger < 4; finger++) capsule(skin, wrist, [-.033 + finger * .022, -.109, .01], .0085, .035);
    ellipsoid(skin, wrist, [side * -.052, -.054, .024], [.016, .04, .015]);
    capsule(trousers, thigh, [0, -.205, 0], .105, .22, [1, 1, .9]);
    capsule(trousers, knee, [0, -.17, 0], .077, .24);
    ellipsoid(shoe, ankle, [0, -.022, .065], [.09, .075, .18]);
  }
  // Collar, placket, buttons and an apron/name tag supply readable role detail.
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(.095, .07, .018), accent, chest, [side * .062, .14, .137], [1, 1, 1], [0, 0, side * .4]);
  for (const y of [-.03, .065, .16]) ellipsoid(accent, spine, [0, y, .153], [.012, .012, .01]);
  if (anchor.npcRole?.toLowerCase().includes('barista')) {
    add(new THREE.BoxGeometry(.32, .4, .025), accent, spine, [0, -.015, .153]);
    add(new THREE.BoxGeometry(.18, .09, .03), cloth, spine, [0, -.1, .172]);
  } else add(new THREE.BoxGeometry(.1, .045, .018), accent, chest, [.11, .065, .149]);
  const skeleton = new THREE.Skeleton(bones);
  for (const [finish, parts] of buckets) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose());
    geometries.push(geometry);
    const mesh = new THREE.SkinnedMesh(geometry, finish); mesh.name = 'Articulated character';
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
    root.add(mesh); mesh.bind(skeleton);
  }
  const eyelids = [-1, 1].map(side => {
    const geometry = new THREE.SphereGeometry(1, 12, 8); geometries.push(geometry);
    const lid = new THREE.Mesh(geometry, skin); lid.position.set(side * .066, .047, .164); lid.scale.set(.046, .001, .025); head.add(lid); return lid;
  });
  const mouthGeometry = new THREE.SphereGeometry(1, 12, 8); geometries.push(mouthGeometry);
  const mouth = new THREE.Mesh(mouthGeometry, lip); head.add(mouth);
  mouth.position.set(0, -.082, .16); mouth.scale.set(.038, .001, .012);
  let mouthEnergy = 0;
  const seated = anchor.pose === 'seated';
  const baseHip = seated ? .71 : .94;
  hips.position.y = baseHip;
  for (const limb of limbs) { limb.thigh.rotation.x = seated ? -1.1 : 0; limb.knee.rotation.x = seated ? 1.1 : 0; }
  root.position.fromArray(anchor.npcPosition); root.position.y += .055;
  root.rotation.y = anchor.npcYaw;
  let state = 'idle', entered = 0;
  return {
    root, skeleton, geometries, materials,
    getState: () => state,
    getMouthEnergy: () => mouthEnergy,
    setSpeechEnergy(energy, motion) {
      const target = motion && state === 'speaking' && Number.isFinite(energy) ? Math.min(1, Math.max(0, energy) * 7) : 0;
      if (state !== 'speaking') mouthEnergy = 0; else mouthEnergy += (target - mouthEnergy) * .5;
      if (target === 0 && mouthEnergy < .001) mouthEnergy = 0;
      mouth.scale.y = .001 + mouthEnergy * .027; mouth.position.y = -.082 - mouthEnergy * .012;
    },
    setState(next, time) { if (state !== next) { state = next; entered = time; } },
    update(time, motion, camera, active) {
      const dt = time - entered;
      const breathing = motion ? Math.sin(time * 1.7 + index) * .003 : 0;
      hips.position.y = baseHip + breathing;
      const blinkPhase = (time + index * 1.1) % (4.2 + index * .7);
      const closure = motion && blinkPhase < .16 ? Math.sin(blinkPhase / .16 * Math.PI) : 0;
      eyelids.forEach(lid => { lid.scale.y = .001 + closure * .03; });
      const targetYaw = active ? Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z) - anchor.npcYaw : 0;
      head.rotation.y = THREE.MathUtils.clamp(targetYaw, -.4, .4);
      head.rotation.x = active && state === 'listening' ? -.045 : active && state === 'thinking' ? .045 : 0;
      spine.rotation.z = motion ? Math.sin(time * .7 + index) * .008 : 0;
      for (const limb of limbs) {
        // Only real playback start/end activates a restrained conversational
        // gesture. There is deliberately no invented audio-energy lip sync.
        const speaking = active && state === 'speaking' && motion;
        limb.shoulder.rotation.z = limb.side * (.07 + (speaking && limb.side === 1 ? .2 * Math.min(1, dt * 3) : 0));
        limb.elbow.rotation.x = speaking && limb.side === 1 ? -.35 - Math.sin(dt * 1.8) * .08 : -.07;
      }
      if (active && state === 'reaction' && motion && dt < .65) head.rotation.x = Math.sin(dt / .65 * Math.PI) * .08;
    },
    dispose() { geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); skeleton.dispose(); },
  };
}
