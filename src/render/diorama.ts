// The ruined crystal sanctum: procedurally built, merged per material, pixel-textured, lit.
import * as THREE from 'three';
import { Rng } from '../game/rng';
import { getTexture, type TextureId } from '../art';
import { beamTex, cloudTex, flameTex, foliageTex, runeTex } from './fxtex';
import type { ParticlePool } from './particles';

export type Theme = 'ruins' | 'depths' | 'boss' | 'dusk';

export interface Palette {
  skyTop: THREE.Color; skyHorizon: THREE.Color; skyBottom: THREE.Color; sun: THREE.Color;
  fog: THREE.Color; fogDensity: number;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemi: number;
  key: THREE.Color; keyI: number; fill: THREE.Color; fillI: number;
  torch: THREE.Color; torchI: number;
  crystalA: THREE.Color; crystalB: THREE.Color; crystalI: number;
  rune: THREE.Color; rays: THREE.Color; raysI: number;
  mote: THREE.Color;
  lift: THREE.Color; gain: THREE.Color; sat: number; exposure: number;
}

const C = (h: string | number) => new THREE.Color(h);
export const THEMES: Record<Theme, Palette> = {
  ruins: {
    skyTop: C(0x0f2238), skyHorizon: C(0xd89a6a), skyBottom: C(0x2a3446), sun: C(0xffc98a),
    fog: C(0x76707e), fogDensity: 0.016,
    hemiSky: C(0x9cc0e0), hemiGround: C(0x3a2c24), hemi: 0.9,
    key: C(0xffd2a0), keyI: 3.0, fill: C(0x5fa0ff), fillI: 0.9,
    torch: C(0xff9038), torchI: 16,
    crystalA: C(0x30f0dc), crystalB: C(0x5cc8ff), crystalI: 10,
    rune: C(0x6ff6e0), rays: C(0xffd8a0), raysI: 0.16,
    mote: C(0xffe0a0),
    lift: C(0x0c1a24), gain: C(0xfff2e0), sat: 1.1, exposure: 1.0,
  },
  depths: {
    skyTop: C(0x03050c), skyHorizon: C(0x243060), skyBottom: C(0x0a0d1c), sun: C(0x6a80ff),
    fog: C(0x18203c), fogDensity: 0.022,
    hemiSky: C(0x5a6cc0), hemiGround: C(0x100c1a), hemi: 1.25,
    key: C(0xb8c4ff), keyI: 2.9, fill: C(0x8050ff), fillI: 1.0,
    torch: C(0xff8040), torchI: 13,
    crystalA: C(0x5a7cff), crystalB: C(0xb070ff), crystalI: 14,
    rune: C(0x9a80ff), rays: C(0x8ab0ff), raysI: 0.1,
    mote: C(0x9ad0ff),
    lift: C(0x0c0c28), gain: C(0xe8ecff), sat: 1.05, exposure: 1.12,
  },
  boss: {
    skyTop: C(0x0c0208), skyHorizon: C(0x7a1430), skyBottom: C(0x14050c), sun: C(0xff5070),
    fog: C(0x2a0c1c), fogDensity: 0.02,
    hemiSky: C(0x7a6090), hemiGround: C(0x1a0610), hemi: 0.8,
    key: C(0xffc0b0), keyI: 2.3, fill: C(0xa040ff), fillI: 1.2,
    torch: C(0xff4a20), torchI: 15,
    crystalA: C(0xc040ff), crystalB: C(0xff3060), crystalI: 14,
    rune: C(0xff3a60), rays: C(0xff7090), raysI: 0.1,
    mote: C(0xff9ab0),
    lift: C(0x1a0618), gain: C(0xffe8e0), sat: 1.0, exposure: 1.05,
  },
  // dusk over a burning village: ember sky, long red light
  dusk: {
    skyTop: C(0x1a0c1e), skyHorizon: C(0xff6a2a), skyBottom: C(0x2a1418), sun: C(0xff8a3a),
    fog: C(0x5a3030), fogDensity: 0.018,
    hemiSky: C(0xd08a6a), hemiGround: C(0x2a1410), hemi: 0.85,
    key: C(0xff9a5a), keyI: 3.2, fill: C(0x7a4aff), fillI: 0.7,
    torch: C(0xff6a1a), torchI: 20,
    crystalA: C(0x30f0dc), crystalB: C(0x5cc8ff), crystalI: 9,
    rune: C(0x6ff6e0), rays: C(0xff9a60), raysI: 0.2,
    mote: C(0xffb070),
    lift: C(0x1a0a0a), gain: C(0xffe6d0), sat: 1.15, exposure: 1.0,
  },
};

export function clonePalette(p: Palette): Palette {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) o[k] = v instanceof THREE.Color ? v.clone() : v;
  return o as unknown as Palette;
}
export function lerpPalette(out: Palette, a: Palette, b: Palette, t: number) {
  const O = out as unknown as Record<string, unknown>, A = a as unknown as Record<string, unknown>, B = b as unknown as Record<string, unknown>;
  for (const k of Object.keys(O)) {
    const v = O[k];
    if (v instanceof THREE.Color) v.lerpColors(A[k] as THREE.Color, B[k] as THREE.Color, t);
    else O[k] = (A[k] as number) + ((B[k] as number) - (A[k] as number)) * t;
  }
}

// ---------------------------------------------------------------- texture + geometry helpers

const texCache = new Map<string, THREE.Texture>();
export function tileTex(id: TextureId): THREE.Texture {
  let t = texCache.get(id);
  if (!t) {
    t = new THREE.CanvasTexture(getTexture(id));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(id, t);
  }
  return t;
}

/** World units per texture repeat (32 texels) -> 16 texels / unit. */
const REPEAT = 2;

interface Bucket { pos: number[]; nrm: number[]; uv: number[]; col: number[] }

/** Accumulates transformed geometry into per-material buckets with world-projected UVs + baked AO tint. */
class Builder {
  buckets = new Map<string, Bucket>();
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();

  add(geo: THREE.BufferGeometry, mats: { side: string; top?: string }, x: number, y: number, z: number,
      o: { rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; tint?: number; ao?: number; baseY?: number } = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('normal');
    this.e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e), new THREE.Vector3(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1));
    g.applyMatrix4(this.m);
    g.computeVertexNormals();
    const P = g.attributes.position.array as Float32Array, N = g.attributes.normal.array as Float32Array;
    const baseY = o.baseY ?? y, ao = o.ao ?? 1.4, tint = o.tint ?? 1;
    for (let v = 0; v < P.length / 3; v += 3) {
      // per-triangle normal (flat)
      const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
      const isTop = ny > 0.7;
      const b = this.bucket(isTop && mats.top ? mats.top : mats.side);
      for (let k = 0; k < 3; k++) {
        const i = (v + k) * 3;
        const px = P[i], py = P[i + 1], pz = P[i + 2];
        b.pos.push(px, py, pz); b.nrm.push(N[i], N[i + 1], N[i + 2]);
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        if (ay >= ax && ay >= az) b.uv.push(px / REPEAT, -pz / REPEAT);
        else if (ax >= az) b.uv.push(pz / REPEAT * Math.sign(nx), py / REPEAT);
        else b.uv.push(-px / REPEAT * Math.sign(nz), py / REPEAT);
        const a = isTop ? 1 : 0.5 + 0.5 * THREE.MathUtils.smoothstep(py - baseY, 0, ao);
        b.col.push(a * tint, a * tint, a * tint);
      }
    }
    g.dispose();
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, mats: { side: string; top?: string }, o: Parameters<Builder['add']>[5] = {}) {
    this.add(new THREE.BoxGeometry(w, h, d), mats, x, y + h / 2, z, { baseY: y, ...o });
  }

  private bucket(k: string): Bucket {
    let b = this.buckets.get(k);
    if (!b) { b = { pos: [], nrm: [], uv: [], col: [] }; this.buckets.set(k, b); }
    return b;
  }

  build(parent: THREE.Object3D, mats: Record<string, THREE.Material>, shadows = true) {
    for (const [k, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      const mesh = new THREE.Mesh(g, mats[k]);
      mesh.castShadow = shadows; mesh.receiveShadow = true;
      mesh.name = k;
      parent.add(mesh);
    }
    this.buckets.clear();
  }
}

function stdMat(tex: TextureId, o: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map: tileTex(tex), vertexColors: true, roughness: 0.92, metalness: 0, ...o });
}

// ---------------------------------------------------------------- diorama

interface Fire { pos: THREE.Vector3; light?: THREE.PointLight; cards: THREE.Mesh[]; seed: number; scale: number }
interface CrystalLight { light: THREE.PointLight; seed: number; which: 'A' | 'B' }

export class Diorama {
  readonly root = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private fires: Fire[] = [];
  private crystalLights: CrystalLight[] = [];
  private crystalMatA: THREE.MeshStandardMaterial;
  private crystalMatB: THREE.MeshStandardMaterial;
  private rune: THREE.Mesh[] = [];
  private rays: THREE.Mesh[] = [];
  private grassU = { uTime: { value: 0 } };
  private motes: THREE.Points;
  private moteU = { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() }, uScale: { value: 500 } };
  private water: THREE.Texture[] = [];
  private floaters: { o: THREE.Object3D; y: number; s: number }[] = [];
  private fogCards: { m: THREE.Mesh; v: number }[] = [];
  private pal!: Palette;

  constructor(scene: THREE.Scene, seed = 1337) {
    const rng = new Rng(seed);
    scene.add(this.root);
    this.fog = new THREE.FogExp2(0x000000, 0.02);
    scene.fog = this.fog;

    // ---- lights
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.key = new THREE.DirectionalLight(0xffffff, 2);
    this.key.position.set(-12, 12.5, 9);
    this.key.target.position.set(0, 0, -1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -17; sc.right = 17; sc.top = 14; sc.bottom = -12; sc.near = 1; sc.far = 50;
    this.key.shadow.bias = -0.0004; this.key.shadow.normalBias = 0.03; this.key.shadow.radius = 3;
    this.fill = new THREE.DirectionalLight(0xffffff, 0.5);
    this.fill.position.set(10, 8, -12);
    this.root.add(this.hemi, this.key, this.key.target, this.fill);

    // ---- sky dome
    this.skyU = { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sun: { value: new THREE.Color() } };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top, horizon, bottom, sun; varying vec3 vP;
        void main(){ float y = vP.y;
          vec3 c = y > 0.0 ? mix(horizon, top, pow(smoothstep(0.0, 0.55, y), 0.7)) : mix(horizon, bottom, smoothstep(0.0, 0.25, -y));
          vec3 sd = normalize(vec3(-0.45, 0.12, -1.0));
          float s = max(0.0, dot(vP, sd));
          c += sun * (pow(s, 12.0) * 0.6 + pow(s, 200.0) * 2.0);
          gl_FragColor = vec4(c, 1.0); }`,
    }));
    this.sky.renderOrder = -10;
    this.root.add(this.sky);

    // ---- materials
    const mats: Record<string, THREE.Material> = {
      stone: stdMat('stone'), stoneTop: stdMat('stoneTop', { roughness: 0.8 }), brick: stdMat('brick'),
      moss: stdMat('moss'), dirt: stdMat('dirt'), grass: stdMat('grass'), wood: stdMat('wood'), rune: stdMat('rune', { roughness: 0.7 }),
      cliff: stdMat('stone', { color: 0x8a8898 }), leaf: stdMat('moss', { color: 0x9ab890, flatShading: true }),
      pine: stdMat('grass', { color: 0x4a7a6a, flatShading: true }),
    };
    this.crystalMatA = new THREE.MeshStandardMaterial({ map: tileTex('crystal'), color: 0xffffff, emissiveMap: tileTex('crystal'), emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.1, flatShading: true });
    this.crystalMatB = this.crystalMatA.clone();
    mats.crystalA = this.crystalMatA; mats.crystalB = this.crystalMatB;

    const B = new Builder();
    const S = { side: 'stone', top: 'stoneTop' };
    const MS = { side: 'stone', top: 'moss' };

    // ---- plateau ground (heightfield, grass top, rising at the back)
    const ground = new THREE.PlaneGeometry(76, 34, 76, 34);
    ground.rotateX(-Math.PI / 2);
    const gp = ground.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i) - 2;
      const inArena = Math.abs(x) < 9.5 && z > -5 && z < 5.5;
      let h = inArena ? -0.02 : (Math.sin(x * 0.7 + z * 0.3) + Math.sin(x * 0.23 - z * 0.9)) * 0.08 + rng.next() * 0.05;
      if (z < -12) h += (-12 - z) * 0.5;
      if (Math.abs(x) > 16) h += (Math.abs(x) - 16) * 0.12;
      gp.setY(i, h);
    }
    B.add(ground, { side: 'dirt', top: 'grass' }, 0, 0, -2, { ao: 0.01, baseY: -10 });
    // plateau cliff skirt (seen in title/map when the camera swings)
    B.box(0, -9, -2, 75.8, 8.7, 33.8, { side: 'cliff', top: 'dirt' }, { ao: 9 });

    // ---- battle floor: 2x2 flagstones, crumbling at the edges
    for (let ix = -4; ix < 4; ix++) for (let iz = -2; iz < 3; iz++) {
      const cx = ix * 2 + 1, cz = iz * 2;
      const edge = Math.max(Math.abs(cx) / 8, Math.abs(cz - 0.5) / 5);
      if (edge > 0.7 && rng.chance((edge - 0.7) * 2.2)) {
        if (rng.chance(0.5)) B.box(cx + rng.next() - 0.5, -0.05, cz + rng.next() - 0.5, 0.9, 0.18, 0.8, S, { ry: rng.next() * 3, rz: 0.15 });
        continue;
      }
      B.box(cx, -0.2 + rng.next() * 0.04, cz, 1.94, 0.3, 1.94, { side: 'stone', top: 'stoneTop' }, { rx: (rng.next() - 0.5) * 0.015, rz: (rng.next() - 0.5) * 0.015, tint: 0.88 + rng.next() * 0.16 });
    }
    // floor rim / kerb
    for (let x = -8.6; x < 8.6; x += 1.2) {
      if (rng.chance(0.25)) continue;
      B.box(x, -0.1, 5.3 + rng.next() * 0.1, 1.1, 0.3, 0.5, S, { ry: (rng.next() - 0.5) * 0.1, tint: 0.8 });
    }

    // ---- back terrace + stairs
    const TZ = -6.4, TH = 1.75;
    B.box(0, 0, TZ - 3.5, 26, TH, 7, { side: 'brick', top: 'stoneTop' }, { ao: 2 });
    for (let i = 0; i < 5; i++) {
      const h = (TH / 5) * (i + 1);
      B.box(0, 0, TZ + 2.07 - i * 0.46, 5.2, h, 0.46, { side: 'stone', top: 'stoneTop' }, { tint: 0.95 - i * 0.02 });
    }
    // stair cheek walls
    for (const sx of [-2.9, 2.9]) B.box(sx, 0, TZ + 1.2, 0.6, TH + 0.35, 2.4, { side: 'brick', top: 'moss' }, { ao: 1.5 });
    // terrace edge parapet (broken)
    for (let x = -13; x < 13; x += 1.3) {
      if (Math.abs(x) < 3.3 || rng.chance(0.3)) continue;
      const h = 0.4 + rng.next() * 0.7;
      B.box(x, TH, TZ - 0.5, 1.2, h, 0.45, { side: 'brick', top: rng.chance(0.5) ? 'moss' : 'stoneTop' }, { baseY: TH, tint: 0.9 });
    }
    // back wall with arches
    const WZ = -12.6;
    for (let x = -13; x < 13; x += 2) {
      const gap = Math.abs(x + 1) < 1.5;
      if (gap) continue;
      const h = 2 + rng.next() * 4 + (Math.abs(x) > 8 ? 1.5 : 0);
      B.box(x, TH, WZ, 2, h, 1, { side: 'brick', top: 'moss' }, { baseY: TH, ao: 2.5, tint: 0.85 + rng.next() * 0.1 });
      if (rng.chance(0.5)) B.box(x + rng.next(), TH + h, WZ, 0.6 + rng.next(), 0.3 + rng.next() * 0.5, 0.9, { side: 'brick', top: 'moss' }, { baseY: TH + h - 1 });
    }
    // great arch framing the shrine
    for (const ax of [-1.9, 1.9]) {
      B.box(ax, TH, WZ + 0.6, 1, 6.2, 1.2, { side: 'stone', top: 'stoneTop' }, { baseY: TH, ao: 3 });
      B.box(ax, TH, WZ + 0.6, 1.3, 0.5, 1.5, S, { baseY: TH });
    }
    B.box(-1.2, TH + 6.2, WZ + 0.6, 2.4, 0.8, 1.3, S, { baseY: TH + 5, rz: 0.05 });
    B.box(1.5, TH + 6.2, WZ + 0.6, 1.6, 0.6, 1.3, S, { baseY: TH + 5, rz: -0.12 });

    // side arches on terrace
    for (const sx of [-8.5, 7.5]) {
      for (const dx of [0, 2.6]) B.box(sx + dx, TH, -9.2, 0.9, 4.6, 0.9, { side: 'stone', top: 'moss' }, { baseY: TH, ao: 2.5 });
      if (sx < 0) B.box(sx + 1.3, TH + 4.6, -9.2, 3.6, 0.6, 1.0, MS, { baseY: TH + 4 });
    }

    // ---- pillars
    const pillar = (x: number, z: number, h: number, y0 = 0, broken = true) => {
      B.box(x, y0, z, 1.5, 0.45, 1.5, S, { baseY: y0, tint: 0.9 });
      B.add(new THREE.CylinderGeometry(0.52, 0.58, h, 8), { side: 'stone', top: broken ? 'moss' : 'stoneTop' }, x, y0 + 0.45 + h / 2, z, { baseY: y0, ao: 2, ry: rng.next() });
      if (!broken) {
        B.box(x, y0 + 0.45 + h, z, 1.45, 0.4, 1.45, S, { baseY: y0 + h });
      } else {
        // jagged top
        for (let k = 0; k < 3; k++) B.box(x + (rng.next() - 0.5) * 0.4, y0 + 0.4 + h, z + (rng.next() - 0.5) * 0.4, 0.35, 0.2 + rng.next() * 0.35, 0.35, MS, { baseY: y0 + h, ry: rng.next() * 3 });
      }
      for (let k = 0; k < 5; k++) {
        const a = rng.next() * 6.28, r = 1 + rng.next() * 1.2, s = 0.2 + rng.next() * 0.35;
        B.box(x + Math.cos(a) * r, y0 - 0.05, z + Math.sin(a) * r * 0.8, s, s * 0.8, s * 1.2, S, { rx: rng.next(), ry: rng.next() * 3, rz: rng.next(), baseY: y0 - 0.3, tint: 0.85 });
      }
    };
    pillar(-10.2, -1.6, 5.2, 0, false);
    pillar(-11.0, 3.2, 2.2);
    pillar(10.4, -2.4, 3.4);
    pillar(11.2, 2.6, 5.4, 0, false);
    pillar(-4.8, -7.4, 3.8, TH, false);
    pillar(4.4, -7.4, 2.6, TH);
    pillar(-12, -8.8, 1.6, TH);
    // fallen column drum
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 3.2, 8), { side: 'stone' }, 8.2, 0.45, 6.6, { rz: Math.PI / 2, ry: 0.5, baseY: 0 });
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8), { side: 'stone', top: 'moss' }, -8.6, 0.5, 7.2, { rx: Math.PI / 2, ry: 1.2, baseY: 0 });

    // ---- scattered rubble on the grass
    for (let k = 0; k < 70; k++) {
      const x = (rng.next() - 0.5) * 34, z = -5 + rng.next() * 15;
      if (Math.abs(x) < 8.5 && z > -4.5 && z < 5.2) continue;
      const s = 0.15 + rng.next() * 0.45;
      B.box(x, -0.08, z, s * 1.3, s * 0.7, s, S, { rx: rng.next() * 0.6, ry: rng.next() * 3, rz: rng.next() * 0.6, tint: 0.75 + rng.next() * 0.2, ao: 0.5 });
    }

    // ---- background cliffs (stepping up into fog)
    for (let k = 0; k < 44; k++) {
      const x = -48 + k * 2.3 + rng.next() * 2, row = k % 3;
      const z = -18 - row * 6 - rng.next() * 3;
      const h = (Math.abs(x) < 13 ? 2 + rng.next() * 4 + row * 2.5 : 6 + rng.next() * 8 + row * 4) + (Math.abs(x) > 18 ? 4 : 0);
      const w = 3 + rng.next() * 4;
      B.box(x, -2, z, w, h, 4 + rng.next() * 3, { side: 'cliff', top: 'moss' }, { ry: (rng.next() - 0.5) * 0.4, tint: 0.7 - row * 0.1, ao: 8 });
      if (rng.chance(0.5)) B.box(x + (rng.next() - 0.5) * 2, -2 + h, z + 1, w * 0.6, 1 + rng.next() * 2, 3, { side: 'cliff', top: 'moss' }, { ry: rng.next(), tint: 0.7, baseY: h - 3 });
    }
    // distant mountain silhouettes (fogged)
    for (let k = 0; k < 16; k++) {
      const x = -110 + k * 14.5 + rng.next() * 6, z = -70 - rng.next() * 40, h = 22 + rng.next() * 30;
      B.add(new THREE.ConeGeometry(10 + rng.next() * 12, h, 5 + rng.int(3)), { side: 'cliff', top: 'cliff' }, x, h / 2 - 8, z, { ry: rng.next() * 3, tint: 0.5, ao: 20, baseY: -8 });
    }
    // side bluffs framing the stage
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
      const x = sx * (19 + k * 1.8 + rng.next() * 2), z = -14 + k * 3.2;
      B.box(x, -1, z, 3 + rng.next() * 3, 3 + rng.next() * 5 - k * 0.4, 3.5, { side: 'cliff', top: 'moss' }, { ry: rng.next(), tint: 0.75, ao: 4 });
    }

    // ---- trees
    const pine = (x: number, y: number, z: number, s: number) => {
      B.add(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.4 * s, 5), { side: 'wood' }, x, y + 0.7 * s, z, { baseY: y });
      for (let i = 0; i < 4; i++) {
        const r = (1.3 - i * 0.26) * s, hh = 1.5 * s;
        B.add(new THREE.ConeGeometry(r, hh, 7), { side: 'pine' }, x, y + (1.2 + i * 0.85) * s + hh / 2, z, { ry: rng.next() * 3, baseY: y + i * s, ao: 3 * s });
      }
    };
    const oak = (x: number, y: number, z: number, s: number) => {
      B.add(new THREE.CylinderGeometry(0.2 * s, 0.32 * s, 2.4 * s, 6), { side: 'wood' }, x, y + 1.2 * s, z, { baseY: y, rz: (rng.next() - 0.5) * 0.2 });
      for (let i = 0; i < 5; i++) {
        B.add(new THREE.IcosahedronGeometry((0.9 + rng.next() * 0.6) * s, 0), { side: 'leaf' }, x + (rng.next() - 0.5) * 1.8 * s, y + (2.6 + rng.next() * 1.3) * s, z + (rng.next() - 0.5) * 1.4 * s, { baseY: y + 1.5 * s, ao: 2.5 * s, ry: rng.next() * 3 });
      }
    };
    oak(-14.5, TH, -10.5, 1.3); oak(15, TH, -10, 1.1); oak(-17.5, 0.4, -4, 1.2); oak(18, 0.4, -5, 1.4);
    for (let k = 0; k < 16; k++) {
      const x = (rng.chance(0.5) ? -1 : 1) * (12 + rng.next() * 20), z = -14 - rng.next() * 12;
      pine(x, 0 + Math.max(0, (-12 - z) * 0.5), z, 1.3 + rng.next() * 1.2);
    }
    for (let k = 0; k < 10; k++) {
      const x = -30 + k * 6 + rng.next() * 3;
      if (Math.abs(x) < 7) continue;
      pine(x, 9 + rng.next() * 6, -28 - rng.next() * 6, 1.8 + rng.next());
    }

    // ---- crystals
    const cluster = (x: number, y: number, z: number, s: number, which: 'A' | 'B', tilt = 0.5) => {
      const n = 4 + rng.int(4);
      for (let i = 0; i < n; i++) {
        const big = i === 0;
        const h = (big ? 2.2 : 0.7 + rng.next() * 1.3) * s;
        const r = h * (0.18 + rng.next() * 0.06);
        const g = new THREE.CylinderGeometry(0, r, h, 5 + rng.int(2));
        const a = rng.next() * 6.28, d = big ? 0 : (0.25 + rng.next() * 0.45) * s;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        B.add(g, { side: which === 'A' ? 'crystalA' : 'crystalB' }, px, y + h * 0.42, pz,
          { rx: big ? 0.05 : Math.sin(a) * tilt, rz: big ? -0.05 : -Math.cos(a) * tilt, ry: rng.next() * 3, baseY: y - 0.5, ao: 0.8 * s });
      }
    };
    cluster(0, TH + 0.9, -10.4, 1.6, 'A', 0.35);
    B.box(0, TH, -10.4, 2.2, 0.9, 1.8, { side: 'rune', top: 'stoneTop' }, { baseY: TH });
    cluster(-12.4, 0, -4.8, 1.3, 'A');
    cluster(12.6, 0, 0.2, 1.1, 'B');
    cluster(-7.4, 0, 6.6, 0.55, 'B');
    cluster(9.4, 0, 4.9, 0.45, 'A');
    cluster(6.2, TH, -8.4, 0.6, 'B');
    cluster(-9.6, TH, -11.4, 0.7, 'B');
    cluster(-15, 0.3, 2, 0.8, 'A');

    // ---- braziers (stone pedestals + bowls)
    const brazierAt: THREE.Vector3[] = [];
    for (const bx of [-4.6, 4.6]) {
      const z = -4.9;
      B.box(bx, 0, z, 0.8, 0.9, 0.8, S, { tint: 0.85 });
      B.add(new THREE.CylinderGeometry(0.62, 0.32, 0.45, 8), { side: 'stone', top: 'dirt' }, bx, 1.12, z, { baseY: 0.9, ao: 0.5, tint: 0.6 });
      brazierAt.push(new THREE.Vector3(bx, 1.35, z));
    }

    B.build(this.root, mats);
    // crystals don't need to receive their own shadows (flat emissive look)
    for (const c of this.root.children) if (c.name.startsWith('crystal')) { (c as THREE.Mesh).receiveShadow = false; }

    // ---- rune circle
    const runeMat = new THREE.MeshBasicMaterial({ map: runeTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false });
    for (const [s, sp] of [[7.4, 0.03], [4.2, -0.06]] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), runeMat.clone());
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.16, 0.2); m.userData.spin = sp;
      m.renderOrder = 5;
      this.rune.push(m); this.root.add(m);
    }

    // ---- fires
    const flameMat = new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false });
    const addFire = (p: THREE.Vector3, scale: number, withLight: boolean) => {
      const cards: THREE.Mesh[] = [];
      for (let i = 0; i < 2; i++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * scale, 1.3 * scale), flameMat.clone());
        m.position.copy(p).add(new THREE.Vector3(0, 0.55 * scale, 0));
        m.renderOrder = 22; cards.push(m); this.root.add(m);
      }
      let light: THREE.PointLight | undefined;
      if (withLight) {
        light = new THREE.PointLight(0xff9040, 10, 16, 1.6);
        light.position.copy(p).add(new THREE.Vector3(0, 0.9, 0.3));
        this.root.add(light);
      }
      this.fires.push({ pos: p.clone(), light, cards, seed: rng.next() * 100, scale });
    };
    for (const p of brazierAt) addFire(p, 1, true);
    // arch torches (no light, just glow)
    addFire(new THREE.Vector3(-1.9, TH + 3.2, WZ + 1.3), 0.5, false);
    addFire(new THREE.Vector3(1.9, TH + 3.2, WZ + 1.3), 0.5, false);

    // ---- crystal lights
    const cl = (x: number, y: number, z: number, which: 'A' | 'B') => {
      const light = new THREE.PointLight(0xffffff, 8, 13, 1.7);
      light.position.set(x, y, z); this.root.add(light);
      this.crystalLights.push({ light, seed: rng.next() * 10, which });
    };
    cl(0, TH + 2.6, -9.2, 'A');
    cl(-11.6, 1.6, -3.6, 'A');
    cl(11.8, 1.4, 1.2, 'B');

    // ---- foliage (instanced crossed quads with wind)
    this.buildFoliage(rng, TZ, TH);

    // ---- waterfall
    const wt = tileTex('water').clone();
    wt.repeat.set(1.5, 6); wt.needsUpdate = true;
    const wmat = new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: 0x6090b0, emissiveIntensity: 0.5, transparent: true, opacity: 0.9, roughness: 0.3 });
    this.water.push(wt);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(3, 18), wmat);
    fall.position.set(-9.4, 6, -19.6); this.root.add(fall);
    const pool = tileTex('water').clone(); pool.repeat.set(10, 4); pool.needsUpdate = true; this.water.push(pool);
    const lake = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), new THREE.MeshStandardMaterial({ map: pool, color: 0x8090a0, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.85 }));
    lake.rotation.x = -Math.PI / 2; lake.position.set(0, -2.5, -34); this.root.add(lake);

    // ---- floating rocks in the void
    for (let k = 0; k < 7; k++) {
      const g = new THREE.Group();
      const s = 1 + rng.next() * 2.5;
      const parts: [THREE.BufferGeometry, THREE.Material, number][] = [
        [new THREE.ConeGeometry(s, s * 2.2, 6).rotateX(Math.PI), mats.cliff, -s * 1.1],
        [new THREE.CylinderGeometry(s, s * 1.05, 0.5, 6), mats.moss, 0],
      ];
      for (const [src, mat, y] of parts) {
        const geo = src.toNonIndexed(); geo.computeVertexNormals();
        const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(0.8), 3));
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y; m.castShadow = true; g.add(m);
      }
      const side = k % 2 ? 1 : -1;
      g.position.set(side * (24 + rng.next() * 14), 1 + rng.next() * 9, -8 - rng.next() * 22);
      g.rotation.y = rng.next() * 3;
      this.root.add(g);
      this.floaters.push({ o: g, y: g.position.y, s: rng.next() * 10 });
    }

    // ---- fog cards + sea of clouds
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, opacity: 0.5 + rng.next() * 0.3, color: 0xffffff, fog: false }));
      m.position.set((rng.next() - 0.5) * 60, -3 + rng.next() * 10 + (k % 3) * 3, -16 - (k % 3) * 7 - rng.next() * 4);
      m.renderOrder = 2;
      this.root.add(m); this.fogCards.push({ m, v: (rng.next() - 0.5) * 0.5 });
    }
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, opacity: 0.8, color: 0xffffff, fog: false }));
      m.rotation.x = -Math.PI / 2 + 0.3; m.position.set((k % 3 - 1) * 45, -9 + (k > 2 ? 2 : 0), (k > 2 ? -30 : 5));
      this.root.add(m); this.fogCards.push({ m, v: 0.3 });
    }

    // ---- god rays
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + rng.next() * 2.6, 30), new THREE.MeshBasicMaterial({ map: beamTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false, side: THREE.DoubleSide }));
      m.position.set(-11 + k * 3.8 + rng.next(), 9, -9 + rng.next() * 7);
      m.rotation.set(0, 0.25, 0.55);
      m.userData.seed = rng.next() * 10; m.userData.base = 0.5 + rng.next() * 0.5;
      m.renderOrder = 6;
      this.rays.push(m); this.root.add(m);
    }

    // ---- ambient motes (GPU-animated points)
    const N = 420;
    const mp = new Float32Array(N * 3), ms = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      mp[i * 3] = (rng.next() - 0.5) * 34; mp[i * 3 + 1] = rng.next() * 7; mp[i * 3 + 2] = -12 + rng.next() * 20;
      ms[i] = rng.next();
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 1));
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({
      uniforms: this.moteU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float aSeed; uniform float uTime, uScale; uniform vec3 uColor, uColor2; varying vec3 vC; varying float vA;
        void main(){ vec3 p = position; float t = uTime * (0.15 + aSeed * 0.2) + aSeed * 50.0;
          p.x += sin(t * 1.3) * 0.8 + t * 0.15; p.y = mod(p.y + t * 0.25, 7.0) + 0.1; p.z += cos(t) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
          float tw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0);
          vA = tw * smoothstep(0.0, 1.0, p.y) * smoothstep(7.0, 5.0, p.y);
          vC = aSeed > 0.7 ? uColor2 : uColor;
          gl_PointSize = (aSeed > 0.7 ? 0.09 : 0.06) * uScale / -mv.z; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord*2.0-1.0; float a = exp(-dot(p,p)*4.0) * vA; gl_FragColor = vec4(vC * 2.5, a); }`,
    }));
    this.motes.frustumCulled = false; this.motes.renderOrder = 23;
    this.root.add(this.motes);
  }

  private buildFoliage(rng: Rng, TZ: number, TH: number) {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const q2 = quad.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const merge = (a: THREE.BufferGeometry[]) => {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      let off = 0;
      for (const g of a) {
        pos.push(...(g.attributes.position.array as Float32Array)); uv.push(...(g.attributes.uv.array as Float32Array));
        idx.push(...Array.from(g.index!.array as ArrayLike<number>, (i) => i + off)); off += g.attributes.position.count;
      }
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(off).fill(0).flatMap(() => [0, 1, 0]), 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
    };
    merge([quad, q2]);
    const spots: [number, number, number, number][] = [];
    const add = (x: number, y: number, z: number, s: number) => spots.push([x, y, z, s]);
    for (let k = 0; k < 900 && spots.length < 520; k++) {
      const x = (rng.next() - 0.5) * 40, z = -5.5 + rng.next() * 16;
      const inFloor = Math.abs(x) < 8 && z > -4 && z < 5;
      if (inFloor) continue;
      if (Math.abs(x) < 3 && z < -4) continue;
      add(x, 0, z, 0.6 + rng.next() * 0.7);
    }
    // along floor edges (crumbly look)
    for (let k = 0; k < 90; k++) {
      const t = rng.next();
      const [x, z] = rng.chance(0.5) ? [(t - 0.5) * 17, rng.chance(0.5) ? 5.4 + rng.next() * 0.6 : -4.3] : [rng.chance(0.5) ? -8.3 : 8.3, -4 + t * 9];
      add(x + (rng.next() - 0.5) * 0.6, 0, z, 0.5 + rng.next() * 0.5);
    }
    for (let k = 0; k < 80; k++) add((rng.next() - 0.5) * 26, TH, TZ - 0.8 - rng.next() * 5.5, 0.5 + rng.next() * 0.6);
    const n = spots.length;
    const cells = new Float32Array(n);
    const mat = new THREE.MeshLambertMaterial({ map: foliageTex(), alphaTest: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    spots.forEach(([x, y, z, s], i) => {
      m.compose(new THREE.Vector3(x, y - 0.02, z), q.setFromEuler(e.set(0, rng.next() * 3, 0)), new THREE.Vector3(s, s, s));
      mesh.setMatrixAt(i, m);
      const r = rng.next();
      cells[i] = r < 0.62 ? rng.int(4) : r < 0.85 ? 4 + rng.int(2) : 6 + rng.int(2);
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.grassU.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aCell; uniform float uTime;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv.x = (uv.x + aCell) / 8.0;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;
          transformed.x += sin(uTime * 1.7 + ph) * 0.12 * uv.y * uv.y;
          transformed.z += cos(uTime * 1.3 + ph) * 0.06 * uv.y * uv.y;`);
      // both faces of the crossed quads use the up-normal (no black back faces)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    };
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  setPalette(p: Palette) { this.pal = p; }

  /** Centre the rune circle between the battle formations. */
  placeRune(p: THREE.Vector3) { for (const r of this.rune) r.position.set(p.x, 0.16, p.z); }

  update(time: number, dt: number, pool: ParticlePool, camera: THREE.Camera, scale: number) {
    const p = this.pal;
    this.skyU.top.value.copy(p.skyTop); this.skyU.horizon.value.copy(p.skyHorizon);
    this.skyU.bottom.value.copy(p.skyBottom); this.skyU.sun.value.copy(p.sun);
    this.fog.color.copy(p.fog); this.fog.density = p.fogDensity;
    this.hemi.color.copy(p.hemiSky); this.hemi.groundColor.copy(p.hemiGround); this.hemi.intensity = p.hemi;
    this.key.color.copy(p.key); this.key.intensity = p.keyI;
    this.fill.color.copy(p.fill); this.fill.intensity = p.fillI;
    this.crystalMatA.emissive.copy(p.crystalA).multiplyScalar(1.6); this.crystalMatA.color.copy(p.crystalA).lerp(new THREE.Color(1, 1, 1), 0.5);
    this.crystalMatB.emissive.copy(p.crystalB).multiplyScalar(1.6); this.crystalMatB.color.copy(p.crystalB).lerp(new THREE.Color(1, 1, 1), 0.5);
    const pulse = 0.85 + 0.15 * Math.sin(time * 1.3);
    this.crystalMatA.emissiveIntensity = this.crystalMatB.emissiveIntensity = 1.1 * pulse;
    for (const c of this.crystalLights) {
      c.light.color.copy(c.which === 'A' ? p.crystalA : p.crystalB);
      c.light.intensity = p.crystalI * (0.85 + 0.15 * Math.sin(time * 1.3 + c.seed));
    }
    for (const r of this.rune) {
      r.rotation.z += (r.userData.spin as number) * dt;
      (r.material as THREE.MeshBasicMaterial).color.copy(p.rune).multiplyScalar(0.85 * (0.75 + 0.25 * Math.sin(time * 2 + r.userData.spin * 40)));
    }
    for (const f of this.fires) {
      const n = noise(time * 7 + f.seed) * 0.6 + noise(time * 17 + f.seed * 3) * 0.4;
      if (f.light) { f.light.color.copy(p.torch); f.light.intensity = p.torchI * (0.72 + 0.4 * n); }
      f.cards.forEach((c, i) => {
        c.quaternion.copy(camera.quaternion);
        c.scale.set(1 + 0.15 * Math.sin(time * 13 + i * 2 + f.seed), 0.85 + 0.35 * n, 1);
        c.position.x = f.pos.x + (i ? 0.08 : -0.08) * Math.sin(time * 5 + f.seed);
        (c.material as THREE.MeshBasicMaterial).color.copy(p.torch).lerp(new THREE.Color(1, 0.9, 0.7), 0.4).multiplyScalar(i ? 1.4 : 2.2);
      });
      if (dt > 0) {
        const s = f.scale;
        if (Math.random() < dt * 40 * s) pool.emit({ x: f.pos.x, y: f.pos.y + 0.25 * s, z: f.pos.z }, { count: 1, spread: [0.25 * s, 0.05, 0.25 * s], vel: [0, 1.4 * s, 0], velSpread: 0.3, life: [0.4, 0.8], size: [0.55 * s, 0.1], color: 0xffd080, color2: p.torch, intensity: 2.2, drag: 1 });
        if (Math.random() < dt * 8 * s) pool.emit({ x: f.pos.x, y: f.pos.y + 0.5 * s, z: f.pos.z }, { count: 1, spread: 0.2 * s, vel: [0.2, 2.2, 0], velSpread: 0.8, life: [0.8, 1.8], size: [0.07, 0.03], color: 0xffc060, color2: 0xff4010, intensity: 4, shape: 1, drag: 0.5 });
      }
    }
    for (const r of this.rays) {
      const m = r.material as THREE.MeshBasicMaterial;
      m.color.copy(p.rays).multiplyScalar(p.raysI * (r.userData.base as number) * (0.6 + 0.4 * Math.sin(time * 0.4 + (r.userData.seed as number))));
    }
    for (const w of this.water) w.offset.y += dt * (w.repeat.y > 5 ? 1.6 : 0.02);
    for (const f of this.floaters) { f.o.position.y = f.y + Math.sin(time * 0.4 + f.s) * 0.4; f.o.rotation.y += dt * 0.02; }
    for (const c of this.fogCards) {
      c.m.position.x += c.v * dt; if (c.m.position.x > 50) c.m.position.x = -50; if (c.m.position.x < -50) c.m.position.x = 50;
      (c.m.material as THREE.MeshBasicMaterial).color.copy(p.fog).lerp(p.skyHorizon, 0.25);
      if (Math.abs(c.m.rotation.x) < 0.01) c.m.quaternion.copy(camera.quaternion);
    }
    this.grassU.uTime.value = time;
    this.moteU.uTime.value = time; this.moteU.uScale.value = scale;
    this.moteU.uColor.value.copy(p.mote); this.moteU.uColor2.value.copy(p.crystalA);
  }
}

function noise(x: number) {
  const i = Math.floor(x), f = x - i;
  const h = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
