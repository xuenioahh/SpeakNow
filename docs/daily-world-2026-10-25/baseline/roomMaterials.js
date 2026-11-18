import * as THREE from 'three';

// Small, deterministic textures shared by every matching surface in one room.
// Keeping the pattern neutral lets the place palette supply the final color.
export function createSurfaceMaterials(materials, textures) {
  const patterns = new Map();
  function pattern(kind) {
    if (patterns.has(kind)) return patterns.get(kind);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d');
    let seed = 713;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    ctx.fillStyle = '#f4f1e9'; ctx.fillRect(0, 0, 256, 256);
    if (kind === 'wood') {
      for (let i = 0; i < 190; i++) {
        const x = random() * 256, bend = random() * 8, y = random() * 256;
        ctx.strokeStyle = `rgba(76,52,31,${0.025 + random() * 0.085})`;
        ctx.lineWidth = 0.3 + random() * 1.2;
        ctx.beginPath(); ctx.moveTo(x, y - 256);
        ctx.bezierCurveTo(x + bend, y - 90, x - bend, y + 90, x, y + 256); ctx.stroke();
      }
    } else if (kind === 'marble') {
      for (let i = 0; i < 9; i++) {
        const x = random() * 256, y = random() * 256;
        ctx.strokeStyle = `rgba(84,83,73,${0.06 + random() * 0.06})`;
        ctx.lineWidth = 0.4 + random() * 2;
        ctx.beginPath(); ctx.moveTo(x - 256, y - 160);
        ctx.bezierCurveTo(x - 70, y + 30, x + 80, y - 40, x + 256, y + 160); ctx.stroke();
      }
    } else if (kind === 'fabric') {
      for (let i = 0; i < 256; i += 4) {
        ctx.fillStyle = i % 8 ? '#ffffff35' : '#53574c14';
        ctx.fillRect(i, 0, 1, 256); ctx.fillRect(0, i, 256, 1);
      }
    }
    for (let i = 0; i < 4800; i++) {
      ctx.fillStyle = `rgba(${random() > 0.5 ? '255,255,255' : '76,70,58'},${kind === 'stone' ? 0.055 : 0.025})`;
      ctx.fillRect(random() * 256, random() * 256, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === 'wood' ? 5 : 3, kind === 'wood' ? 2 : 3);
    texture.anisotropy = 4;
    textures.add(texture); patterns.set(kind, texture);
    return texture;
  }
  return (kind, color) => {
    const key = `surface-${kind}-${color}`;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({
      color, map: pattern(kind), bumpMap: pattern(kind),
      bumpScale: kind === 'fabric' ? 0.018 : kind === 'wood' ? 0.012 : 0.006,
      roughness: kind === 'marble' ? 0.32 : kind === 'fabric' ? 0.92 : 0.76,
      envMapIntensity: kind === 'marble' ? 0.5 : 0.22,
    }));
    return materials.get(key);
  };
}
