import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Original, locally generated articulated characters. Appearance is selected
// from a stable anchor seed so every role keeps its own face and silhouette.
function seedOf(value) {
  let seed = 2166136261;
  for (const char of value) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

function characterProfile(anchor, index) {
  const seed = seedOf(anchor.sceneAnchorId || `${anchor.id}:${index}`);
  const pick = (items, offset = 0) => items[(seed + offset) % items.length];
  const scene = (anchor.sceneAnchorId || '').split(':')[0];
  const hairStyles = ['crop', 'side-part', 'curls', 'bob', 'long', 'bun', 'fade', 'coils', 'waves'];
  // The stride keeps the three people in a scene from sharing one hair shape.
  const sceneSeed = seedOf((anchor.sceneAnchorId || `${anchor.id}:${index}`).split(':')[0]);
  const hairStyle = hairStyles[((sceneSeed % hairStyles.length) + index * 3) % hairStyles.length];
  const faceShapes = [
    { width: .162, height: .219, jaw: .112, nose: .021 },
    { width: .172, height: .228, jaw: .124, nose: .024 },
    { width: .158, height: .235, jaw: .108, nose: .019 },
  ];
  const builds = [
    { shoulder: .215, torso: .218, hip: .205, arm: .071, leg: .094 },
    { shoulder: .245, torso: .235, hip: .215, arm: .078, leg: .103 },
    { shoulder: .275, torso: .251, hip: .225, arm: .084, leg: .112 },
  ];
  const outfitSets = {
    cafe: ['#426b5a', '#8b6958', '#52677f', '#9a6d58', '#596d55'],
    restaurant: ['#6c3f3b', '#344e4b', '#7d5c46', '#485867'],
    hospital: ['#4f8b8d', '#547796', '#668a76', '#587c8d'],
    airport: ['#354b62', '#655d78', '#536b6d', '#45556f'],
    bank: ['#3e6659', '#465b77', '#66566f', '#556a62'],
    hotel: ['#43594e', '#5e4e5d', '#645643', '#465a65'],
    university: ['#586883', '#6c5d7b', '#567364', '#8b654e'],
    office: ['#48586e', '#5d4e69', '#4f6a5e', '#80604e'],
    shopping: ['#586582', '#4f6d68', '#8b654f', '#6a5c7d'],
    phone: ['#53677d', '#5c6758', '#806251', '#5d5974'],
    car_rental: ['#4e6471', '#5c6650', '#756052', '#4b5f79'],
    museum: ['#60677d', '#5b715f', '#846650', '#5a6271'],
  };
  const skin = ['#f0c9a9', '#d9a982', '#bd8664', '#98674f', '#e0b992', '#805744', '#c79372'];
  const hair = ['#261f1c', '#40302a', '#6b4936', '#242a31', '#8a6245', '#362b36', '#55483d'];
  const eye = ['#3c2b23', '#3c5146', '#4e6176', '#604b39'];
  const pants = ['#353b42', '#48505a', '#3b4544', '#4a4142', '#343944'];
  const jackets = ['#eee4d1', '#d7d0c3', '#d8e2dc', '#e8d9c7'];
  const features = faceShapes[(seed >>> 4) % faceShapes.length];
  const build = builds[(seed >>> 7) % builds.length];
  const upper = pick(outfitSets[scene] || outfitSets.office, index * 2);
  const sceneRole = anchor.npcRole || '';
  return {
    seed, scene, hairStyle, features, build,
    skin: pick(skin, 3), hair: pick(hair, 11), eye: pick(eye, 17),
    cloth: upper, jacket: pick(jackets, 23), trousers: pick(pants, 29),
    outfit: scene === 'cafe' || scene === 'restaurant' ? 'apron'
      : scene === 'hospital' ? 'medical'
        : ['airport', 'bank', 'hotel', 'office'].includes(scene) ? 'tailored'
          : scene === 'university' ? 'cardigan' : 'workwear',
    glasses: seed % 5 === 0 || /doctor|support/i.test(sceneRole),
    facialHair: index !== 1 && seed % 4 === 0,
    hairHighlight: seed % 3 === 0 ? '#a47c57' : pick(hair, 11),
    ageDetail: seed % 4 === 1,
  };
}

// Rigid-weight skinning keeps accessories and uniform details crisp while
// sharing the same skeleton and render batches.
export function createHumanoid(anchor, index, surface) {
  const root = new THREE.Group(); root.name = `npc:${anchor.sceneAnchorId}`;
  root.userData.cueId = anchor.id; root.userData.npc = true;
  const profile = characterProfile(anchor, index);
  const { build, features } = profile;
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
    const shoulder = bone(`shoulder-${side}`, chest, [side * build.shoulder, .1, 0]);
    const elbow = bone(`elbow-${side}`, shoulder, [0, -.3, 0]);
    const wrist = bone(`wrist-${side}`, elbow, [0, -.265, 0]);
    const thigh = bone(`thigh-${side}`, hips, [side * build.hip * .54, -.04, 0]);
    const knee = bone(`knee-${side}`, thigh, [0, -.41, 0]);
    const ankle = bone(`ankle-${side}`, knee, [0, -.39, 0]);
    return { side, shoulder, elbow, wrist, thigh, knee, ankle };
  });
  root.updateMatrixWorld(true);
  const skin = new THREE.MeshStandardMaterial({ color: profile.skin, roughness: .72 });
  const hair = new THREE.MeshStandardMaterial({ color: profile.hair, roughness: .91 });
  const hairHighlight = new THREE.MeshStandardMaterial({ color: profile.hairHighlight, roughness: .9 });
  const cloth = surface('fabric', profile.cloth);
  const jacket = surface('fabric', profile.jacket);
  const trousers = surface('fabric', profile.trousers);
  const shoe = new THREE.MeshStandardMaterial({ color: profile.seed % 2 ? '#353535' : '#57483e', roughness: .58 });
  const eye = new THREE.MeshStandardMaterial({ color: '#e4d7c6', roughness: .42 });
  const iris = new THREE.MeshStandardMaterial({ color: profile.eye, roughness: .42 });
  const pupil = new THREE.MeshStandardMaterial({ color: '#171717', roughness: .28 });
  const lip = new THREE.MeshStandardMaterial({ color: '#895d50', roughness: .82 });
  const accent = new THREE.MeshStandardMaterial({ color: profile.seed % 2 ? '#d6bd91' : '#bac4bd', roughness: .76 });
  const frame = new THREE.MeshStandardMaterial({ color: profile.seed % 2 ? '#332d29' : '#7b674e', metalness: .18, roughness: .42 });
  materials.push(skin, hair, hairHighlight, shoe, eye, iris, pupil, lip, accent, frame);
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
  const capsule = (finish, parent, position, radius, length, scale = [1, 1, 1], rotation = [0, 0, 0]) => add(new THREE.CapsuleGeometry(radius, length, 4, 12), finish, parent, position, scale, rotation);
  ellipsoid(trousers, hips, [0, -.035, 0], [build.hip, .15, .14]);
  capsule(cloth, spine, [0, .13, 0], build.torso * .84, .21, [1.02, 1, .7]);
  ellipsoid(cloth, chest, [0, .04, 0], [build.shoulder, .16, .15]);
  if (profile.outfit === 'tailored' || profile.outfit === 'medical' || profile.outfit === 'cardigan') {
    // Open front panels break the one-piece shirt silhouette. The V opening
    // keeps them readable without adding a texture or a large render cost.
    for (const side of [-1, 1]) {
      capsule(jacket, chest, [side * .13, .005, .025], .054, .21, [1, 1, .38], [0, 0, side * -.12]);
      add(new THREE.BoxGeometry(.085, .018, .012), accent, chest, [side * .11, -.045, .144], [1, 1, 1], [0, 0, side * .16]);
    }
  }
  if (profile.outfit === 'medical') {
    for (const side of [-1, 1]) {
      add(new THREE.BoxGeometry(.11, .065, .012), jacket, chest, [side * .145, -.065, .098]);
      add(new THREE.BoxGeometry(.065, .005, .014), accent, chest, [side * .145, -.065, .106]);
    }
  }
  capsule(skin, neck, [0, .015, 0], .073, .11);
  ellipsoid(skin, head, [0, .02, 0], [features.width, features.height, .17]);
  ellipsoid(skin, head, [0, -.064, .025], [features.jaw, .112, .119]);
  ellipsoid(skin, head, [0, -.132, .035], [features.jaw * .64, .047, .093]);
  // Hair silhouettes vary by role seed: close crops, curls, bobs, buns and
  // longer shapes replace the old identical cap-and-fringe construction.
  ellipsoid(hair, head, [0, .125, -.025], [.17, .12, .165]);
  if (['side-part', 'waves', 'bob'].includes(profile.hairStyle)) {
    ellipsoid(hairHighlight, head, [-.055, .17, .055], [.112, .065, .104]);
    ellipsoid(hair, head, [.055, .14, .072], [.105, .072, .098]);
  } else if (profile.hairStyle === 'curls' || profile.hairStyle === 'coils') {
    for (let curl = 0; curl < 9; curl++) {
      const angle = curl / 9 * Math.PI * 2;
      ellipsoid(curl % 3 === 0 ? hairHighlight : hair, head,
        [Math.cos(angle) * .115, .17 + Math.sin(curl * 2.1) * .018, .045 + Math.sin(angle) * .092],
        [.045, .044, .041]);
    }
  }
  if (profile.hairStyle === 'fade' || profile.hairStyle === 'crop') {
    for (const side of [-1, 1]) ellipsoid(hair, head, [side * .124, .06, -.015], [.045, .095, .112]);
  }
  if (profile.hairStyle === 'bob' || profile.hairStyle === 'long' || profile.hairStyle === 'waves') {
    ellipsoid(hair, head, [0, -.035, -.108], [.154, .205, .075]);
    for (const side of [-1, 1]) capsule(hair, head, [side * .132, -.055, -.015], .036, .2, [1, 1, .72], [0, 0, side * -.12]);
  }
  if (profile.hairStyle === 'bun') {
    ellipsoid(hair, head, [0, .02, -.176], [.071, .073, .066]);
    for (const side of [-1, 1]) ellipsoid(hairHighlight, head, [side * .105, .15, -.03], [.07, .045, .065]);
  }
  if (profile.hairStyle === 'side-part' || profile.hairStyle === 'waves') {
    ellipsoid(hair, head, [-.105, .115, .035], [.06, .095, .11]);
  }
  // Soft facial planes and a bridge/tip nose read better than a single ball.
  ellipsoid(skin, head, [0, .014, .155], [features.nose * .72, .053, .029]);
  ellipsoid(skin, head, [0, -.018, .178], [features.nose, .024, .025]);
  for (const side of [-1, 1]) {
    ellipsoid(skin, head, [side * .158, .005, -.004], [.024, .043, .025]);
    ellipsoid(skin, head, [side * .164, .004, .014], [.009, .022, .008]);
    ellipsoid(eye, head, [side * .059, .052, .15], [.032, .017, .009]);
    ellipsoid(iris, head, [side * .059, .051, .158], [.0105, .011, .005]);
    ellipsoid(pupil, head, [side * .059, .051, .162], [.0048, .0065, .003]);
    ellipsoid(eye, head, [side * .056, .055, .165], [.0025, .0025, .0015]);
    add(new THREE.CapsuleGeometry(.0045, .043, 3, 8), hair, head, [side * .059, .082, .151], [1, 1, .6], [0, 0, Math.PI / 2]);
    if (profile.ageDetail) ellipsoid(skin, head, [side * .092, .015, .139], [.018, .008, .006]);
  }
  const mouth = new THREE.CatmullRomCurve3([new THREE.Vector3(-.033, -.087, .151), new THREE.Vector3(0, -.091, .16), new THREE.Vector3(.033, -.087, .151)]);
  add(new THREE.TubeGeometry(mouth, 10, .0035, 5, false), lip, head, [0, 0, 0]);
  ellipsoid(lip, head, [0, -.105, .148], [.022, .004, .004]);
  if (profile.glasses) {
    for (const side of [-1, 1]) add(new THREE.TorusGeometry(.027, .003, 5, 18), frame, head,
      [side * .059, .051, .16], [1, .68, 1]);
    add(new THREE.CapsuleGeometry(.0025, .025, 3, 6), frame, head, [0, .052, .16], [1, 1, .55], [0, 0, Math.PI / 2]);
  }
  if (profile.facialHair) {
    ellipsoid(hair, head, [0, -.12, .083], [.084, .05, .055]);
    for (const side of [-1, 1]) ellipsoid(hair, head, [side * .073, -.084, .078], [.035, .045, .05]);
  }
  for (const { side, shoulder, elbow, wrist, thigh, knee, ankle } of limbs) {
    capsule(cloth, shoulder, [0, -.14, 0], build.arm, .16);
    capsule(skin, elbow, [0, -.115, 0], .057, .16);
    ellipsoid(skin, wrist, [0, -.045, .01], [.055, .078, .028]);
    for (let finger = 0; finger < 4; finger++) capsule(skin, wrist, [-.033 + finger * .022, -.109, .01], .0085, .035);
    ellipsoid(skin, wrist, [side * -.052, -.054, .024], [.016, .04, .015]);
    capsule(trousers, thigh, [0, -.205, 0], build.leg, .22, [1, 1, .9]);
    capsule(trousers, knee, [0, -.17, 0], .077, .24);
    ellipsoid(shoe, ankle, [0, -.022, .065], [.09, .075, .18]);
  }
  // Collar, placket, buttons and an apron/name tag supply readable role detail.
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(.095, .07, .018), accent, chest, [side * .062, .14, .137], [1, 1, 1], [0, 0, side * .4]);
  for (const y of [-.03, .065, .16]) ellipsoid(accent, spine, [0, y, .153], [.012, .012, .01]);
  if (profile.outfit === 'apron') {
    add(new THREE.BoxGeometry(.32, .4, .025), accent, spine, [0, -.015, .153]);
    add(new THREE.BoxGeometry(.18, .09, .03), cloth, spine, [0, -.1, .172]);
    for (const side of [-1, 1]) capsule(accent, chest, [side * .145, -.035, .095], .009, .22, [1, 1, .6], [0, 0, side * .08]);
  } else {
    add(new THREE.BoxGeometry(.1, .045, .018), accent, chest, [.11, .065, .149]);
    if (profile.outfit === 'medical') add(new THREE.BoxGeometry(.065, .06, .012), accent, chest, [.13, -.07, .112]);
  }
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
    const lid = new THREE.Mesh(geometry, skin); lid.position.set(side * .059, .052, .15); lid.scale.set(.033, .001, .012); head.add(lid); return lid;
  });
  const mouthGeometry = new THREE.SphereGeometry(1, 12, 8); geometries.push(mouthGeometry);
  const speechMouth = new THREE.Mesh(mouthGeometry, lip); head.add(speechMouth);
  speechMouth.position.set(0, -.082, .16); speechMouth.scale.set(.038, .001, .012);
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
      speechMouth.scale.y = .001 + mouthEnergy * .027; speechMouth.position.y = -.082 - mouthEnergy * .012;
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
