// The ruined crystal sanctum: procedurally built, merged per material, pixel-textured, lit.
import * as THREE from 'three';
import { Rng } from '../game/rng';
import { getTexture, type TextureId } from '../art';
import { beamTex, cloudTex, flameTex, foliageTex, runeTex } from './fxtex';
import type { ParticlePool } from './particles';
import type { StageSet } from './api';

export type Theme = 'ruins' | 'depths' | 'boss' | 'dusk';
export type { StageSet };

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
interface Smoke { m: THREE.Mesh; y0: number; speed: number; seed: number }
/** everything that belongs to one set: its geometry, and the animated bits the update loop drives */
interface SetState {
  group: THREE.Group;
  fires: Fire[]; crystalLights: CrystalLight[]; rune: THREE.Mesh[]; water: THREE.Texture[];
  floaters: { o: THREE.Object3D; y: number; s: number }[]; smoke: Smoke[];
  /** show the shared god rays */
  rays: boolean;
}

type Mats = { side: string; top?: string };
const TH = 1.75, TZ = -6.4;
/** the battle floor every set keeps flat at y = 0 (units stand on it) */
const inArena = (x: number, z: number) => Math.abs(x) < 9.5 && z > -5 && z < 5.5;

export class Diorama {
  readonly root = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly fill: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fog: THREE.FogExp2;
  private sky: THREE.Mesh;
  private skyU: Record<string, THREE.IUniform>;
  private crystalMatA: THREE.MeshStandardMaterial;
  private crystalMatB: THREE.MeshStandardMaterial;
  private rays: THREE.Mesh[] = [];
  private grassU = { uTime: { value: 0 } };
  private motes: THREE.Points;
  private moteU = { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() }, uScale: { value: 500 } };
  private fogCards: { m: THREE.Mesh; v: number }[] = [];
  private pal!: Palette;
  private mats: Record<string, THREE.Material>;
  private sets = new Map<StageSet, SetState>();
  private active!: SetState;
  private runeAt = new THREE.Vector3(0, 0.16, 0.2);

  constructor(scene: THREE.Scene, private seed = 1337) {
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

    // ---- materials (shared by every set)
    this.mats = {
      stone: stdMat('stone'), stoneTop: stdMat('stoneTop', { roughness: 0.8 }), brick: stdMat('brick'),
      moss: stdMat('moss'), dirt: stdMat('dirt'), grass: stdMat('grass'), wood: stdMat('wood'), rune: stdMat('rune', { roughness: 0.7 }),
      cliff: stdMat('stone', { color: 0x8a8898 }), leaf: stdMat('moss', { color: 0x9ab890, flatShading: true }),
      pine: stdMat('grass', { color: 0x4a7a6a, flatShading: true }),
      plaster: stdMat('stoneTop', { color: 0xd8c8a8 }), roof: stdMat('wood', { color: 0x9a5040 }), cloth: stdMat('dirt', { color: 0xb85a44 }),
      bark: stdMat('wood', { color: 0x7a6a5a }), ash: stdMat('stone', { color: 0x3a3440 }),
      window: new THREE.MeshStandardMaterial({ color: 0x2a1a10, emissive: 0xffa040, emissiveIntensity: 1.6, roughness: 1 }),
    };
    this.crystalMatA = new THREE.MeshStandardMaterial({ map: tileTex('crystal'), color: 0xffffff, emissiveMap: tileTex('crystal'), emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.25, metalness: 0.1, flatShading: true });
    this.crystalMatB = this.crystalMatA.clone();
    this.mats.crystalA = this.crystalMatA; this.mats.crystalB = this.crystalMatB;

    // ---- distant mountain silhouettes (fogged), the same behind every set
    const B = new Builder();
    for (let k = 0; k < 16; k++) {
      const x = -110 + k * 14.5 + rng.next() * 6, z = -70 - rng.next() * 40, h = 22 + rng.next() * 30;
      B.add(new THREE.ConeGeometry(10 + rng.next() * 12, h, 5 + rng.int(3)), { side: 'cliff', top: 'cliff' }, x, h / 2 - 8, z, { ry: rng.next() * 3, tint: 0.5, ao: 20, baseY: -8 });
    }
    B.build(this.root, this.mats, false);

    // ---- drifting mist
    for (let k = 0; k < 9; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 10), new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, opacity: 0.5 + rng.next() * 0.3, color: 0xffffff, fog: false }));
      m.position.set((rng.next() - 0.5) * 60, -3 + rng.next() * 10 + (k % 3) * 3, -16 - (k % 3) * 7 - rng.next() * 4);
      m.renderOrder = 2;
      this.root.add(m); this.fogCards.push({ m, v: (rng.next() - 0.5) * 0.5 });
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

    this.setSet('shrine');
  }

  /** Show a set (built the first time it's needed). */
  setSet(id: StageSet) {
    let st = this.sets.get(id);
    if (!st) { st = this.build(id); this.sets.set(id, st); }
    for (const [k, v] of this.sets) v.group.visible = k === id;
    for (const r of this.rays) r.visible = st.rays;
    this.active = st;
  }

  // ---------------------------------------------------------------- set building
  private build(id: StageSet): SetState {
    const st: SetState = { group: new THREE.Group(), fires: [], crystalLights: [], rune: [], water: [], floaters: [], smoke: [], rays: id === 'shrine' || id === 'village' };
    this.root.add(st.group);
    const rng = new Rng(this.seed + id.length * 97 + id.charCodeAt(0));
    const B = new Builder();
    const k = new Kit(B, rng);
    const spots: [number, number, number, number][] = [];
    ({ shrine: () => this.shrine(k, st, spots), village: () => this.village(k, st, spots), forest: () => this.forest(k, st, spots), bridge: () => this.bridge(k, st, spots), hill: () => this.hill(k, st, spots) })[id]();
    B.build(st.group, this.mats);
    for (const c of st.group.children) if (c.name.startsWith('crystal')) (c as THREE.Mesh).receiveShadow = false;
    this.foliage(rng, spots, st.group);
    return st;
  }

  private flame = () => new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false });
  private addFire(st: SetState, rng: Rng, p: THREE.Vector3, scale: number, withLight: boolean) {
    const cards: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7 * scale, 1.3 * scale), this.flame());
      m.position.copy(p).add(new THREE.Vector3(0, 0.55 * scale, 0));
      m.renderOrder = 22; cards.push(m); st.group.add(m);
    }
    let light: THREE.PointLight | undefined;
    if (withLight) {
      light = new THREE.PointLight(0xff9040, 10, 16, 1.6);
      light.position.copy(p).add(new THREE.Vector3(0, 0.9, 0.3));
      st.group.add(light);
    }
    st.fires.push({ pos: p.clone(), light, cards, seed: rng.next() * 100, scale });
  }
  private addCrystalLight(st: SetState, rng: Rng, x: number, y: number, z: number, which: 'A' | 'B') {
    const light = new THREE.PointLight(0xffffff, 8, 13, 1.7);
    light.position.set(x, y, z); st.group.add(light);
    st.crystalLights.push({ light, seed: rng.next() * 10, which });
  }
  private addWater(st: SetState, w: number, d: number, x: number, y: number, z: number, repeat: [number, number], flow: number, color = 0x8090a0) {
    const t = tileTex('water').clone(); t.repeat.set(...repeat); t.needsUpdate = true; t.userData.flow = flow; st.water.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, color, emissiveMap: t, emissive: 0x2a5a8a, emissiveIntensity: 0.55, roughness: 0.2, metalness: 0.3, transparent: true, opacity: 0.9 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; st.group.add(m);
  }
  /** grass tufts around a spot list (instanced crossed quads with wind) */
  private grassAround(rng: Rng, spots: [number, number, number, number][], n: number, x0: number, x1: number, z0: number, z1: number, y = 0, avoid = inArena) {
    for (let i = 0; i < n * 3 && n > 0; i++) {
      const x = x0 + rng.next() * (x1 - x0), z = z0 + rng.next() * (z1 - z0);
      if (avoid(x, z)) continue;
      spots.push([x, y, z, 0.6 + rng.next() * 0.7]); n--;
    }
  }

  // ---- the Anchorlight: Seren's ruined crystal shrine (the original set)
  private shrine(k: Kit, st: SetState, spots: [number, number, number, number][]) {
    const { B, rng } = k;
    const S = { side: 'stone', top: 'stoneTop' }, MS = { side: 'stone', top: 'moss' };
    k.ground();
    // battle floor: 2x2 flagstones, crumbling at the edges
    for (let ix = -4; ix < 4; ix++) for (let iz = -2; iz < 3; iz++) {
      const cx = ix * 2 + 1, cz = iz * 2;
      const edge = Math.max(Math.abs(cx) / 8, Math.abs(cz - 0.5) / 5);
      if (edge > 0.7 && rng.chance((edge - 0.7) * 2.2)) {
        if (rng.chance(0.5)) B.box(cx + rng.next() - 0.5, -0.05, cz + rng.next() - 0.5, 0.9, 0.18, 0.8, S, { ry: rng.next() * 3, rz: 0.15 });
        continue;
      }
      B.box(cx, -0.2 + rng.next() * 0.04, cz, 1.94, 0.3, 1.94, S, { rx: (rng.next() - 0.5) * 0.015, rz: (rng.next() - 0.5) * 0.015, tint: 0.88 + rng.next() * 0.16 });
    }
    for (let x = -8.6; x < 8.6; x += 1.2) {
      if (rng.chance(0.25)) continue;
      B.box(x, -0.1, 5.3 + rng.next() * 0.1, 1.1, 0.3, 0.5, S, { ry: (rng.next() - 0.5) * 0.1, tint: 0.8 });
    }
    // back terrace + stairs
    B.box(0, 0, TZ - 3.5, 26, TH, 7, { side: 'brick', top: 'stoneTop' }, { ao: 2 });
    for (let i = 0; i < 5; i++) B.box(0, 0, TZ + 2.07 - i * 0.46, 5.2, (TH / 5) * (i + 1), 0.46, S, { tint: 0.95 - i * 0.02 });
    for (const sx of [-2.9, 2.9]) B.box(sx, 0, TZ + 1.2, 0.6, TH + 0.35, 2.4, { side: 'brick', top: 'moss' }, { ao: 1.5 });
    for (let x = -13; x < 13; x += 1.3) {
      if (Math.abs(x) < 3.3 || rng.chance(0.3)) continue;
      B.box(x, TH, TZ - 0.5, 1.2, 0.4 + rng.next() * 0.7, 0.45, { side: 'brick', top: rng.chance(0.5) ? 'moss' : 'stoneTop' }, { baseY: TH, tint: 0.9 });
    }
    // back wall with arches
    const WZ = -12.6;
    for (let x = -13; x < 13; x += 2) {
      if (Math.abs(x + 1) < 1.5) continue;
      const h = 2 + rng.next() * 4 + (Math.abs(x) > 8 ? 1.5 : 0);
      B.box(x, TH, WZ, 2, h, 1, { side: 'brick', top: 'moss' }, { baseY: TH, ao: 2.5, tint: 0.85 + rng.next() * 0.1 });
      if (rng.chance(0.5)) B.box(x + rng.next(), TH + h, WZ, 0.6 + rng.next(), 0.3 + rng.next() * 0.5, 0.9, { side: 'brick', top: 'moss' }, { baseY: TH + h - 1 });
    }
    for (const ax of [-1.9, 1.9]) {
      B.box(ax, TH, WZ + 0.6, 1, 6.2, 1.2, S, { baseY: TH, ao: 3 });
      B.box(ax, TH, WZ + 0.6, 1.3, 0.5, 1.5, S, { baseY: TH });
    }
    B.box(-1.2, TH + 6.2, WZ + 0.6, 2.4, 0.8, 1.3, S, { baseY: TH + 5, rz: 0.05 });
    B.box(1.5, TH + 6.2, WZ + 0.6, 1.6, 0.6, 1.3, S, { baseY: TH + 5, rz: -0.12 });
    for (const sx of [-8.5, 7.5]) {
      for (const dx of [0, 2.6]) B.box(sx + dx, TH, -9.2, 0.9, 4.6, 0.9, { side: 'stone', top: 'moss' }, { baseY: TH, ao: 2.5 });
      if (sx < 0) B.box(sx + 1.3, TH + 4.6, -9.2, 3.6, 0.6, 1.0, MS, { baseY: TH + 4 });
    }
    k.pillar(-10.2, -1.6, 5.2, 0, false); k.pillar(-11.0, 3.2, 2.2); k.pillar(10.4, -2.4, 3.4); k.pillar(11.2, 2.6, 5.4, 0, false);
    k.pillar(-4.8, -7.4, 3.8, TH, false); k.pillar(4.4, -7.4, 2.6, TH); k.pillar(-12, -8.8, 1.6, TH);
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 3.2, 8), { side: 'stone' }, 8.2, 0.45, 6.6, { rz: Math.PI / 2, ry: 0.5, baseY: 0 });
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8), { side: 'stone', top: 'moss' }, -8.6, 0.5, 7.2, { rx: Math.PI / 2, ry: 1.2, baseY: 0 });
    k.rubble(70);
    k.backdrop();
    k.oak(-14.5, TH, -10.5, 1.3); k.oak(15, TH, -10, 1.1); k.oak(-17.5, 0.4, -4, 1.2); k.oak(18, 0.4, -5, 1.4);
    k.backPines(16);
    // crystals
    k.cluster(0, TH + 0.9, -10.4, 1.6, 'A', 0.35);
    B.box(0, TH, -10.4, 2.2, 0.9, 1.8, { side: 'rune', top: 'stoneTop' }, { baseY: TH });
    k.cluster(-12.4, 0, -4.8, 1.3, 'A'); k.cluster(12.6, 0, 0.2, 1.1, 'B'); k.cluster(-7.4, 0, 6.6, 0.55, 'B'); k.cluster(9.4, 0, 4.9, 0.45, 'A');
    k.cluster(6.2, TH, -8.4, 0.6, 'B'); k.cluster(-9.6, TH, -11.4, 0.7, 'B'); k.cluster(-15, 0.3, 2, 0.8, 'A');
    // braziers
    for (const bx of [-4.6, 4.6]) {
      B.box(bx, 0, -4.9, 0.8, 0.9, 0.8, S, { tint: 0.85 });
      B.add(new THREE.CylinderGeometry(0.62, 0.32, 0.45, 8), { side: 'stone', top: 'dirt' }, bx, 1.12, -4.9, { baseY: 0.9, ao: 0.5, tint: 0.6 });
      this.addFire(st, rng, new THREE.Vector3(bx, 1.35, -4.9), 1, true);
    }
    this.addFire(st, rng, new THREE.Vector3(-1.9, TH + 3.2, WZ + 1.3), 0.5, false);
    this.addFire(st, rng, new THREE.Vector3(1.9, TH + 3.2, WZ + 1.3), 0.5, false);
    this.addCrystalLight(st, rng, 0, TH + 2.6, -9.2, 'A');
    this.addCrystalLight(st, rng, -11.6, 1.6, -3.6, 'A');
    this.addCrystalLight(st, rng, 11.8, 1.4, 1.2, 'B');
    // rune circle
    const runeMat = new THREE.MeshBasicMaterial({ map: runeTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffffff, fog: false });
    for (const [s, sp] of [[7.4, 0.03], [4.2, -0.06]] as const) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), runeMat.clone());
      m.rotation.x = -Math.PI / 2; m.position.copy(this.runeAt); m.userData.spin = sp; m.renderOrder = 5;
      st.rune.push(m); st.group.add(m);
    }
    // waterfall and lake
    const wt = tileTex('water').clone(); wt.repeat.set(1.5, 6); wt.needsUpdate = true; wt.userData.flow = 1.6; st.water.push(wt);
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(3, 18), new THREE.MeshStandardMaterial({ map: wt, emissiveMap: wt, emissive: 0x6090b0, emissiveIntensity: 0.5, transparent: true, opacity: 0.9, roughness: 0.3 }));
    fall.position.set(-9.4, 6, -19.6); st.group.add(fall);
    this.addWater(st, 90, 40, 0, -2.5, -34, [10, 4], 0.02);
    // floating rocks in the void, and the sea of clouds below the plateau
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group(), s = 1 + rng.next() * 2.5;
      for (const [src, mat, y] of [[new THREE.ConeGeometry(s, s * 2.2, 6).rotateX(Math.PI), this.mats.cliff, -s * 1.1], [new THREE.CylinderGeometry(s, s * 1.05, 0.5, 6), this.mats.moss, 0]] as [THREE.BufferGeometry, THREE.Material, number][]) {
        const geo = src.toNonIndexed(); geo.computeVertexNormals();
        const uv = geo.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * s, uv.getY(j) * s);
        geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(0.8), 3));
        const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; g.add(m);
      }
      g.position.set((i % 2 ? 1 : -1) * (24 + rng.next() * 14), 1 + rng.next() * 9, -8 - rng.next() * 22);
      g.rotation.y = rng.next() * 3;
      st.group.add(g); st.floaters.push({ o: g, y: g.position.y, s: rng.next() * 10 });
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, opacity: 0.8, color: 0xffffff, fog: false }));
      m.rotation.x = -Math.PI / 2 + 0.3; m.position.set((i % 3 - 1) * 45, -9 + (i > 2 ? 2 : 0), (i > 2 ? -30 : 5));
      st.group.add(m);
    }
    // foliage
    for (let i = 0; i < 900 && spots.length < 520; i++) {
      const x = (rng.next() - 0.5) * 40, z = -5.5 + rng.next() * 16;
      if ((Math.abs(x) < 8 && z > -4 && z < 5) || (Math.abs(x) < 3 && z < -4)) continue;
      spots.push([x, 0, z, 0.6 + rng.next() * 0.7]);
    }
    for (let i = 0; i < 90; i++) {
      const t = rng.next();
      const [x, z] = rng.chance(0.5) ? [(t - 0.5) * 17, rng.chance(0.5) ? 5.4 + rng.next() * 0.6 : -4.3] : [rng.chance(0.5) ? -8.3 : 8.3, -4 + t * 9];
      spots.push([x + (rng.next() - 0.5) * 0.6, 0, z, 0.5 + rng.next() * 0.5]);
    }
    for (let i = 0; i < 80; i++) spots.push([(rng.next() - 0.5) * 26, TH, TZ - 0.8 - rng.next() * 5.5, 0.5 + rng.next() * 0.6]);
  }

  // ---- Emberfall: the village square, timber houses, a well and a market stall
  private village(k: Kit, st: SetState, spots: [number, number, number, number][]) {
    const { B, rng } = k;
    k.ground();
    // cobbled square
    for (let x = -9.5; x < 9.5; x += 1) for (let z = -4.5; z < 5.5; z += 1) {
      const edge = Math.max(Math.abs(x) / 9.5, Math.abs(z - 0.5) / 5);
      if (edge > 0.85 && rng.chance((edge - 0.85) * 4)) continue;
      B.box(x + 0.5 + (rng.next() - 0.5) * 0.08, -0.14, z + 0.5, 0.94, 0.18, 0.94, { side: 'stone', top: 'stoneTop' }, { ry: (rng.next() - 0.5) * 0.08, tint: 0.78 + rng.next() * 0.22 });
    }
    // house fronts around the square, and a second row behind
    const row1: [number, number, number, number][] = [[-15.5, -8.2, 6, 4.2], [-9.6, -8.6, 4.6, 3.6], [9.8, -8.4, 5, 4], [15.8, -8, 6, 3.4], [-17.5, 1.5, 5, 3.8], [17.5, 2, 5, 4]];
    for (const [x, z, w, h] of row1) k.house(x, z, w, h, 4.2, Math.abs(x) > 17 ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0);
    for (const [x, z, w, h] of [[-12, -15.5, 6, 5], [-4.5, -16.5, 5, 4.4], [4, -16, 6, 5.2], [12.5, -15, 5.6, 4.6], [0, -22, 7, 6]] as const) k.house(x, z, w, h, 5);
    // the lane out of the square, between the houses
    B.box(0, -0.05, -9.5, 4.4, 0.06, 9, { side: 'dirt', top: 'dirt' }, { tint: 0.9 });
    // the well
    B.add(new THREE.CylinderGeometry(1.0, 1.1, 0.9, 12), { side: 'stone', top: 'stoneTop' }, -11.6, 0.45, 3.4, { baseY: 0 });
    B.add(new THREE.CylinderGeometry(0.78, 0.78, 0.05, 12), { side: 'ash' }, -11.6, 0.86, 3.4, { baseY: 0.8 });
    for (const dx of [-0.95, 0.95]) B.box(-11.6 + dx, 0.9, 3.4, 0.16, 1.7, 0.16, { side: 'wood' });
    B.box(-11.6, 2.6, 3.4, 2.3, 0.14, 0.2, { side: 'wood' });
    k.prism(-11.6, 2.75, 3.4, 2.6, 1.5, 'roof');
    // a market stall with an awning, crates and barrels
    for (const [dx, dz] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) B.box(12 + dx, 0, 1.6 + dz, 0.14, 2.2, 0.14, { side: 'wood' });
    B.box(12, 0.85, 1.6, 2.8, 0.12, 1.7, { side: 'wood', top: 'wood' });
    B.box(12, 2.2, 1.9, 3.1, 0.1, 2.3, { side: 'cloth', top: 'cloth' }, { rx: 0.22 });
    for (let i = 0; i < 9; i++) {
      const x = (rng.chance(0.5) ? -1 : 1) * (10.5 + rng.next() * 4), z = -4 + rng.next() * 10;
      if (Math.abs(x + 11.6) < 1.6 && Math.abs(z - 3.4) < 1.6) continue;
      if (rng.chance(0.5)) B.box(x, 0, z, 0.7, 0.7, 0.7, { side: 'wood', top: 'wood' }, { ry: rng.next() * 3, tint: 0.8 + rng.next() * 0.2 });
      else B.add(new THREE.CylinderGeometry(0.34, 0.38, 0.9, 10), { side: 'wood', top: 'wood' }, x, 0.45, z, { baseY: 0, tint: 0.75 });
    }
    // lantern posts (the lit ones light the square)
    for (const lx of [-4.6, 4.6]) {
      B.box(lx, 0, -4.9, 0.25, 2.3, 0.25, { side: 'wood' });
      B.box(lx, 2.3, -4.9, 0.55, 0.22, 0.55, { side: 'stone', top: 'dirt' }, { tint: 0.6 });
      this.addFire(st, rng, new THREE.Vector3(lx, 2.45, -4.9), 0.55, true);
    }
    k.backdrop(true);
    k.backPines(12);
    k.oak(-20, 0.3, -6, 1.3); k.oak(21, 0.3, -9, 1.2);
    this.grassAround(rng, spots, 260, -26, 26, -7, 9);
  }

  // ---- the forest road: a dirt track through old trees
  private forest(k: Kit, st: SetState, spots: [number, number, number, number][]) {
    const { B, rng } = k;
    k.ground(1.6);
    B.box(0, -0.06, 0.5, 15, 0.07, 7.5, { side: 'dirt', top: 'dirt' }, { tint: 0.5 });
    B.box(0, -0.06, -9, 4.5, 0.07, 12, { side: 'dirt', top: 'dirt' }, { tint: 0.58 });
    // big trunks framing the road, and the forest thickening behind
    for (const [x, z, s] of [[-11, -5.5, 1.8], [11.5, -6, 1.9], [-9.5, -9, 1.5], [9.2, -9.5, 1.6], [-5.8, -10.5, 1.3], [5.6, -11, 1.4], [-12.5, 4.5, 1.4], [12.8, 3.8, 1.5], [-2.8, -13, 1.2], [3, -14, 1.3]] as const) k.oak(x, 0, z, s);
    // the canopy closing overhead
    for (let i = 0; i < 16; i++) {
      const x = (rng.next() - 0.5) * 30, z = -12 + rng.next() * 10, s = 1.4 + rng.next() * 1.4;
      B.add(new THREE.IcosahedronGeometry(s, 0), { side: 'leaf' }, x, 6.5 + rng.next() * 2, z, { ry: rng.next() * 3, baseY: 4, ao: 3, tint: 0.7 });
    }
    for (let i = 0; i < 46; i++) {
      const x = (rng.next() - 0.5) * 60, z = -9 - rng.next() * 24;
      if (Math.abs(x) < 3.2) continue;
      if (rng.chance(0.6)) k.pine(x, Math.max(0, (-12 - z) * 0.3), z, 1.2 + rng.next() * 1.3); else k.oak(x, Math.max(0, (-12 - z) * 0.3), z, 1 + rng.next() * 0.8);
    }
    for (let i = 0; i < 12; i++) {
      const x = (rng.chance(0.5) ? -1 : 1) * (18 + rng.next() * 8), z = -4 + rng.next() * 12;
      k.pine(x, 0, z, 1.2 + rng.next());
    }
    // a fallen log, stumps, mossy rocks
    B.add(new THREE.CylinderGeometry(0.45, 0.5, 5, 8), { side: 'bark', top: 'wood' }, -10.5, 0.4, 6.8, { rz: Math.PI / 2, ry: 0.35, baseY: 0 });
    for (const [x, z] of [[10.2, 5.8], [-11.8, -4.8], [12.5, -6]]) B.add(new THREE.CylinderGeometry(0.45, 0.55, 0.6, 8), { side: 'bark', top: 'wood' }, x, 0.3, z, { baseY: 0 });
    for (let i = 0; i < 22; i++) {
      const x = (rng.chance(0.5) ? -1 : 1) * (10 + rng.next() * 12), z = -6 + rng.next() * 14, s = 0.3 + rng.next() * 0.8;
      B.box(x, -0.1, z, s * 1.4, s * 0.8, s, { side: 'stone', top: 'moss' }, { ry: rng.next() * 3, rx: rng.next() * 0.3, tint: 0.7 });
    }
    // Kaldra's torches, staked beside the road
    for (const tx of [-4.6, 4.6]) {
      B.box(tx, 0, -4.9, 0.16, 1.9, 0.16, { side: 'wood' }, { rz: tx < 0 ? 0.08 : -0.08 });
      this.addFire(st, rng, new THREE.Vector3(tx, 1.95, -4.9), 0.55, true);
    }
    k.backdrop(true);
    this.grassAround(rng, spots, 520, -28, 28, -9, 10);
    // the verges of the road
    this.grassAround(rng, spots, 140, -10, 10, -5, 6, 0, (x, z) => Math.abs(x) < 7.5 && z > -3.5 && z < 4.5);
  }

  // ---- the north bridge: three stone arches over a cold river
  private bridge(k: Kit, st: SetState, spots: [number, number, number, number][]) {
    const { B, rng } = k;
    const RIVER = 7.6;
    k.ground(1, (x, z, h) => {
      const ax = Math.abs(x);
      return ax < RIVER ? -5.2 + THREE.MathUtils.smoothstep(ax, 1.2, RIVER) * (5.2 + h) : h; // grassy banks, not walls
    }, (x, z) => Math.abs(x) >= RIVER && inArena(x, z));
    // the bridge body: a side profile with three arches, extruded across the river
    const prof = new THREE.Shape();
    prof.moveTo(-10.5, -5.4); prof.lineTo(10.5, -5.4); prof.lineTo(10.5, 0); prof.lineTo(-10.5, 0); prof.lineTo(-10.5, -5.4);
    for (const cx of [-5, 0, 5]) {
      const r = 2.05, spring = -3.6;
      const hole = new THREE.Path();
      hole.moveTo(cx - r, -5.6); hole.lineTo(cx - r, spring); hole.absarc(cx, spring, r, Math.PI, 0, true); hole.lineTo(cx + r, -5.6); hole.lineTo(cx - r, -5.6);
      prof.holes.push(hole);
    }
    const body = new THREE.ExtrudeGeometry(prof, { depth: 9.2, bevelEnabled: false, curveSegments: 10 });
    B.add(body, { side: 'stone', top: 'stoneTop' }, 0, 0, -4.1, { baseY: -5, ao: 5, tint: 0.92 });
    // parapets: low at the front (so the party stays in view), taller at the back, with lantern posts
    for (let x = -10; x < 10; x += 1.25) {
      if (rng.chance(0.18)) continue;
      B.box(x + 0.6, 0, 4.85, 1.2, 0.34, 0.4, { side: 'stone', top: 'stoneTop' }, { tint: 0.85 });
      if (Math.abs(x + 0.6 - 4.6) > 0.7 && Math.abs(x + 0.6 + 4.6) > 0.7) B.box(x + 0.6, 0, -3.85, 1.2, 0.75, 0.45, { side: 'stone', top: rng.chance(0.4) ? 'moss' : 'stoneTop' }, { tint: 0.85 });
    }
    for (const lx of [-4.6, 4.6]) {
      B.box(lx, 0, -3.85, 0.6, 1.25, 0.6, { side: 'stone', top: 'stoneTop' });
      this.addFire(st, rng, new THREE.Vector3(lx, 1.3, -3.85), 0.55, true);
    }
    // the river, running from the hills behind to the camera
    this.addWater(st, RIVER * 2 + 1, 80, 0, -4.4, -20, [3, 16], 0.25);
    for (let i = 0; i < 26; i++) {
      const side = rng.chance(0.5) ? -1 : 1, x = side * (1.4 + rng.next() * 1.4), z = -18 + rng.next() * 30, s = 0.4 + rng.next() * 0.9;
      B.box(x, -4.9, z, s * 1.4, s, s * 1.2, { side: 'stone', top: 'moss' }, { ry: rng.next() * 3, tint: 0.65 });
    }
    // the banks: trees, rocks, reeds
    for (const [x, z, s] of [[-13.5, -3, 1.4], [14, -4, 1.5], [-16, 4, 1.2], [16.5, 3, 1.3]] as const) k.oak(x, 0, z, s);
    for (let i = 0; i < 14; i++) {
      const side = rng.chance(0.5) ? -1 : 1, x = side * (4.2 + rng.next() * 3), z = -8 - rng.next() * 11;
      const y = -5.2 + THREE.MathUtils.smoothstep(Math.abs(x), 1.2, RIVER) * (5.2 + (-12 - z > 0 ? (-12 - z) * 0.5 : 0));
      k.pine(x, y, z, 1 + rng.next());
    }
    for (let i = 0; i < 18; i++) {
      const x = (rng.chance(0.5) ? -1 : 1) * (RIVER + 2 + rng.next() * 18), z = -10 - rng.next() * 22;
      k.pine(x, Math.max(0, (-12 - z) * 0.5), z, 1.2 + rng.next() * 1.2);
    }
    k.rubble(30, (x) => Math.abs(x) < RIVER + 2.5);
    k.backdrop(true); // the river comes out of a gorge in the cliffs
    this.grassAround(rng, spots, 320, -28, 28, -8, 10, 0, (x, z) => Math.abs(x) < RIVER + 0.8 || inArena(x, z));
  }

  // ---- the hill: an open crest above the valley, and Emberfall burning far below
  private hill(k: Kit, st: SetState, spots: [number, number, number, number][]) {
    const { B, rng } = k;
    k.ground(0.8, (x, z, h) => (z < -6 ? h - (-6 - z) * 0.75 - 0.5 : h) + (Math.abs(x) > 18 ? (Math.abs(x) - 18) * 0.15 : 0));
    // standing stones and a dead tree on the crest
    for (const [x, z, hh, r] of [[-12.5, -5.2, 3.4, 0.08], [-10.4, -6.3, 2.4, -0.12], [-14.2, -3.4, 1.8, 0.2], [12.8, 4.6, 1.4, -0.25]] as const) {
      B.box(x, -0.3, z, 0.9, hh, 0.7, { side: 'stone', top: 'moss' }, { rz: r, ry: rng.next(), ao: 2 });
    }
    B.add(new THREE.CylinderGeometry(0.22, 0.36, 3.6, 6), { side: 'bark' }, 12.4, 1.8, -5.2, { baseY: 0, rz: -0.12 });
    for (const [dx, dy, a, l] of [[0.5, 2.9, -0.9, 1.8], [-0.4, 2.4, 0.8, 1.5], [0.2, 3.4, -0.3, 1.2], [0.9, 2.1, -1.3, 1.1]] as const) {
      B.add(new THREE.CylinderGeometry(0.05, 0.1, l, 5), { side: 'bark' }, 12.4 + dx, dy, -5.2, { rz: a, ry: rng.next() * 3, baseY: dy - 1 });
    }
    k.rubble(40);
    // torches, staked where the soldiers came up
    for (const tx of [-4.6, 4.6]) {
      B.box(tx, 0, -4.9, 0.16, 1.9, 0.16, { side: 'wood' }, { rz: tx < 0 ? 0.08 : -0.08 });
      this.addFire(st, rng, new THREE.Vector3(tx, 1.95, -4.9), 0.55, true);
    }
    // Emberfall below: dark roofs, fires, and smoke rising into the dusk
    const vy = -10;
    for (let i = 0; i < 46; i++) {
      const x = (rng.next() - 0.5) * 70, z = -30 - rng.next() * 30, w = 1.8 + rng.next() * 2.2, h = 1.4 + rng.next() * 1.6;
      B.box(x, vy - 1, z, w, h + 1, 2.4, { side: 'ash', top: 'ash' }, { ry: rng.next() * 0.6, tint: 0.5, ao: 0.1 });
      k.prism(x, vy + h, z, w + 0.3, 2.8, 'ash', 0.45);
      if (rng.chance(0.4)) this.addFire(st, rng, new THREE.Vector3(x, vy + h, z + 1.2), 0.8 + rng.next() * 0.8, false);
    }
    B.box(0, vy - 1.6, -45, 110, 0.6, 56, { side: 'dirt', top: 'grass' }, { tint: 0.45, ao: 0.1 });
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshBasicMaterial({ map: cloudTex(), transparent: true, depthWrite: false, opacity: 0.7, color: 0x1e1416, fog: false }));
      const x = (rng.next() - 0.5) * 60, z = -32 - rng.next() * 26, y0 = vy + 3 + rng.next() * 6;
      m.position.set(x, y0, z); m.renderOrder = 3; st.group.add(m);
      st.smoke.push({ m, y0, speed: 0.6 + rng.next() * 0.8, seed: rng.next() * 20 });
    }
    this.grassAround(rng, spots, 460, -26, 26, -8, 10);
  }

  private foliage(rng: Rng, spots: [number, number, number, number][], parent: THREE.Object3D) {
    if (!spots.length) return;
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const q2 = quad.clone().rotateY(Math.PI / 2);
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let off = 0;
    for (const g of [quad, q2]) {
      pos.push(...(g.attributes.position.array as Float32Array)); uv.push(...(g.attributes.uv.array as Float32Array));
      idx.push(...Array.from(g.index!.array as ArrayLike<number>, (i) => i + off)); off += g.attributes.position.count;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(off).fill(0).flatMap(() => [0, 1, 0]), 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
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
    parent.add(mesh);
  }

  setPalette(p: Palette) { this.pal = p; }

  /** Centre the rune circle between the battle formations. */
  placeRune(p: THREE.Vector3) {
    this.runeAt.set(p.x, 0.16, p.z);
    for (const st of this.sets.values()) for (const r of st.rune) r.position.copy(this.runeAt);
  }

  update(time: number, dt: number, pool: ParticlePool, camera: THREE.Camera, scale: number) {
    const p = this.pal, st = this.active;
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
    (this.mats.window as THREE.MeshStandardMaterial).emissive.copy(p.torch).lerp(new THREE.Color(1, 0.8, 0.5), 0.4);
    for (const c of st.crystalLights) {
      c.light.color.copy(c.which === 'A' ? p.crystalA : p.crystalB);
      c.light.intensity = p.crystalI * (0.85 + 0.15 * Math.sin(time * 1.3 + c.seed));
    }
    for (const r of st.rune) {
      r.rotation.z += (r.userData.spin as number) * dt;
      (r.material as THREE.MeshBasicMaterial).color.copy(p.rune).multiplyScalar(0.85 * (0.75 + 0.25 * Math.sin(time * 2 + r.userData.spin * 40)));
    }
    for (const f of st.fires) {
      const n = noise(time * 7 + f.seed) * 0.6 + noise(time * 17 + f.seed * 3) * 0.4;
      if (f.light) { f.light.color.copy(p.torch); f.light.intensity = p.torchI * (0.72 + 0.4 * n); }
      f.cards.forEach((c, i) => {
        c.quaternion.copy(camera.quaternion);
        c.scale.set(1 + 0.15 * Math.sin(time * 13 + i * 2 + f.seed), 0.85 + 0.35 * n, 1);
        c.position.x = f.pos.x + (i ? 0.08 : -0.08) * Math.sin(time * 5 + f.seed);
        (c.material as THREE.MeshBasicMaterial).color.copy(p.torch).lerp(new THREE.Color(1, 0.9, 0.7), 0.4).multiplyScalar(i ? 1.4 : 2.2);
      });
      if (dt > 0 && f.light) {
        const s = f.scale;
        if (Math.random() < dt * 40 * s) pool.emit({ x: f.pos.x, y: f.pos.y + 0.25 * s, z: f.pos.z }, { count: 1, spread: [0.25 * s, 0.05, 0.25 * s], vel: [0, 1.4 * s, 0], velSpread: 0.3, life: [0.4, 0.8], size: [0.55 * s, 0.1], color: 0xffd080, color2: p.torch, intensity: 2.2, drag: 1 });
        if (Math.random() < dt * 8 * s) pool.emit({ x: f.pos.x, y: f.pos.y + 0.5 * s, z: f.pos.z }, { count: 1, spread: 0.2 * s, vel: [0.2, 2.2, 0], velSpread: 0.8, life: [0.8, 1.8], size: [0.07, 0.03], color: 0xffc060, color2: 0xff4010, intensity: 4, shape: 1, drag: 0.5 });
      }
    }
    for (const s of st.smoke) {
      s.m.quaternion.copy(camera.quaternion);
      const t = ((time * s.speed * 0.15 + s.seed) % 1);
      s.m.position.y = s.y0 + t * 14;
      (s.m.material as THREE.MeshBasicMaterial).opacity = 0.7 * Math.sin(t * Math.PI);
    }
    for (const r of this.rays) {
      const m = r.material as THREE.MeshBasicMaterial;
      m.color.copy(p.rays).multiplyScalar(p.raysI * (r.userData.base as number) * (0.6 + 0.4 * Math.sin(time * 0.4 + (r.userData.seed as number))));
    }
    for (const w of st.water) w.offset.y += dt * (w.userData.flow as number);
    for (const f of st.floaters) { f.o.position.y = f.y + Math.sin(time * 0.4 + f.s) * 0.4; f.o.rotation.y += dt * 0.02; }
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

/** The building kit the sets share: terrain, trees, pillars, crystals, houses. */
class Kit {
  constructor(readonly B: Builder, readonly rng: Rng) {}

  /** the plateau heightfield: the arena flat, the rest rolling, rising at the back (shape can reshape it) */
  ground(rough = 1, shape?: (x: number, z: number, h: number) => number, flat: (x: number, z: number) => boolean = inArena, skirt = !shape) {
    const { B, rng } = this;
    const g = new THREE.PlaneGeometry(76, 34, 76, 34);
    g.rotateX(-Math.PI / 2);
    const gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i), z = gp.getZ(i) - 2;
      let h = flat(x, z) ? -0.02 : ((Math.sin(x * 0.7 + z * 0.3) + Math.sin(x * 0.23 - z * 0.9)) * 0.08 + rng.next() * 0.05) * rough;
      if (z < -12) h += (-12 - z) * 0.5;
      if (Math.abs(x) > 16) h += (Math.abs(x) - 16) * 0.12;
      if (shape) h = shape(x, z, h);
      gp.setY(i, h);
    }
    B.add(g, { side: 'dirt', top: 'grass' }, 0, 0, -2, { ao: 0.01, baseY: -10 });
    if (skirt) B.box(0, -9, -2, 75.8, 8.7, 33.8, { side: 'cliff', top: 'dirt' }, { ao: 9 });
  }

  /** cliffs stepping up into the fog behind the set */
  backdrop(soft = false, skip: (x: number) => boolean = () => false) {
    const { B, rng } = this;
    for (let k = 0; k < 44; k++) {
      const x = -48 + k * 2.3 + rng.next() * 2, row = k % 3;
      if (skip(x)) continue;
      const z = -18 - row * 6 - rng.next() * 3;
      const h = (Math.abs(x) < 13 ? (soft ? 1 : 2) + rng.next() * 4 + row * 2.5 : 6 + rng.next() * 8 + row * 4) + (Math.abs(x) > 18 ? 4 : 0);
      const w = 3 + rng.next() * 4;
      B.box(x, -2, z, w, h, 4 + rng.next() * 3, { side: 'cliff', top: 'moss' }, { ry: (rng.next() - 0.5) * 0.4, tint: 0.7 - row * 0.1, ao: 8 });
      if (rng.chance(0.5)) B.box(x + (rng.next() - 0.5) * 2, -2 + h, z + 1, w * 0.6, 1 + rng.next() * 2, 3, { side: 'cliff', top: 'moss' }, { ry: rng.next(), tint: 0.7, baseY: h - 3 });
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
      const x = sx * (19 + k * 1.8 + rng.next() * 2), z = -14 + k * 3.2;
      if (skip(x)) continue;
      B.box(x, -1, z, 3 + rng.next() * 3, 3 + rng.next() * 5 - k * 0.4, 3.5, { side: 'cliff', top: 'moss' }, { ry: rng.next(), tint: 0.75, ao: 4 });
    }
  }

  backPines(n: number) {
    const { rng } = this;
    for (let k = 0; k < n; k++) {
      const x = (rng.chance(0.5) ? -1 : 1) * (12 + rng.next() * 20), z = -14 - rng.next() * 12;
      this.pine(x, Math.max(0, (-12 - z) * 0.5), z, 1.3 + rng.next() * 1.2);
    }
  }

  rubble(n: number, skip: (x: number, z: number) => boolean = () => false) {
    const { B, rng } = this;
    for (let k = 0; k < n; k++) {
      const x = (rng.next() - 0.5) * 34, z = -5 + rng.next() * 15;
      if ((Math.abs(x) < 8.5 && z > -4.5 && z < 5.2) || skip(x, z)) continue;
      const s = 0.15 + rng.next() * 0.45;
      B.box(x, -0.08, z, s * 1.3, s * 0.7, s, { side: 'stone', top: 'stoneTop' }, { rx: rng.next() * 0.6, ry: rng.next() * 3, rz: rng.next() * 0.6, tint: 0.75 + rng.next() * 0.2, ao: 0.5 });
    }
  }

  pillar(x: number, z: number, h: number, y0 = 0, broken = true) {
    const { B, rng } = this;
    const S = { side: 'stone', top: 'stoneTop' }, MS = { side: 'stone', top: 'moss' };
    B.box(x, y0, z, 1.5, 0.45, 1.5, S, { baseY: y0, tint: 0.9 });
    B.add(new THREE.CylinderGeometry(0.52, 0.58, h, 8), { side: 'stone', top: broken ? 'moss' : 'stoneTop' }, x, y0 + 0.45 + h / 2, z, { baseY: y0, ao: 2, ry: rng.next() });
    if (!broken) B.box(x, y0 + 0.45 + h, z, 1.45, 0.4, 1.45, S, { baseY: y0 + h });
    else for (let k = 0; k < 3; k++) B.box(x + (rng.next() - 0.5) * 0.4, y0 + 0.4 + h, z + (rng.next() - 0.5) * 0.4, 0.35, 0.2 + rng.next() * 0.35, 0.35, MS, { baseY: y0 + h, ry: rng.next() * 3 });
    for (let k = 0; k < 5; k++) {
      const a = rng.next() * 6.28, r = 1 + rng.next() * 1.2, s = 0.2 + rng.next() * 0.35;
      B.box(x + Math.cos(a) * r, y0 - 0.05, z + Math.sin(a) * r * 0.8, s, s * 0.8, s * 1.2, S, { rx: rng.next(), ry: rng.next() * 3, rz: rng.next(), baseY: y0 - 0.3, tint: 0.85 });
    }
  }

  pine(x: number, y: number, z: number, s: number) {
    const { B, rng } = this;
    B.add(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 1.4 * s, 5), { side: 'wood' }, x, y + 0.7 * s, z, { baseY: y });
    for (let i = 0; i < 4; i++) {
      const r = (1.3 - i * 0.26) * s, hh = 1.5 * s;
      B.add(new THREE.ConeGeometry(r, hh, 7), { side: 'pine' }, x, y + (1.2 + i * 0.85) * s + hh / 2, z, { ry: rng.next() * 3, baseY: y + i * s, ao: 3 * s });
    }
  }

  oak(x: number, y: number, z: number, s: number) {
    const { B, rng } = this;
    B.add(new THREE.CylinderGeometry(0.2 * s, 0.32 * s, 2.4 * s, 6), { side: 'wood' }, x, y + 1.2 * s, z, { baseY: y, rz: (rng.next() - 0.5) * 0.2 });
    for (let i = 0; i < 5; i++) {
      B.add(new THREE.IcosahedronGeometry((0.9 + rng.next() * 0.6) * s, 0), { side: 'leaf' }, x + (rng.next() - 0.5) * 1.8 * s, y + (2.6 + rng.next() * 1.3) * s, z + (rng.next() - 0.5) * 1.4 * s, { baseY: y + 1.5 * s, ao: 2.5 * s, ry: rng.next() * 3 });
    }
  }

  cluster(x: number, y: number, z: number, s: number, which: 'A' | 'B', tilt = 0.5) {
    const { B, rng } = this;
    const n = 4 + rng.int(4);
    for (let i = 0; i < n; i++) {
      const big = i === 0;
      const h = (big ? 2.2 : 0.7 + rng.next() * 1.3) * s;
      const r = h * (0.18 + rng.next() * 0.06);
      const a = rng.next() * 6.28, d = big ? 0 : (0.25 + rng.next() * 0.45) * s;
      B.add(new THREE.CylinderGeometry(0, r, h, 5 + rng.int(2)), { side: which === 'A' ? 'crystalA' : 'crystalB' }, x + Math.cos(a) * d, y + h * 0.42, z + Math.sin(a) * d,
        { rx: big ? 0.05 : Math.sin(a) * tilt, rz: big ? -0.05 : -Math.cos(a) * tilt, ry: rng.next() * 3, baseY: y - 0.5, ao: 0.8 * s });
    }
  }

  /** a gable roof: a triangular prism along x whose base (at y) is `span` wide, apex up */
  prism(x: number, y: number, z: number, len: number, span: number, mat: string, tint = 1, ry = 0) {
    const r = span / Math.sqrt(3);
    this.B.add(new THREE.CylinderGeometry(r, r, len, 3), { side: mat }, x, y + r / 2, z, { rx: -Math.PI / 2, rz: Math.PI / 2, ry, tint, baseY: y });
  }

  /** a timber-framed house facing +z (ry turns it), roof and chimney, windows lit or shuttered */
  house(x: number, z: number, w: number, h: number, d: number, ry = 0) {
    const { B, rng } = this;
    const rot = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(ry) + dz * Math.sin(ry), z - dx * Math.sin(ry) + dz * Math.cos(ry)];
    const put = (dx: number, y: number, dz: number, bw: number, bh: number, bd: number, m: Mats, tint = 1) => {
      const [px, pz] = rot(dx, dz);
      B.box(px, y, pz, bw, bh, bd, m, { ry, tint, baseY: 0 });
    };
    put(0, 0, 0, w, 0.5, d, { side: 'stone', top: 'stoneTop' });
    put(0, 0.5, 0, w - 0.2, h, d - 0.2, { side: 'plaster' }, 0.85 + rng.next() * 0.15);
    for (const dx of [-w / 2 + 0.2, 0, w / 2 - 0.2]) put(dx, 0.5, d / 2 - 0.05, 0.2, h, 0.14, { side: 'wood' });
    put(0, 0.5 + h * 0.55, d / 2 - 0.05, w - 0.2, 0.16, 0.14, { side: 'wood' });
    put(0, 0.5 + h - 0.1, d / 2 - 0.05, w - 0.2, 0.18, 0.14, { side: 'wood' });
    for (const dx of [-w / 4, w / 4]) put(dx + 0.05, 0.5 + h * 0.62, d / 2 - 0.02, 0.55, 0.6, 0.08, { side: rng.chance(0.6) ? 'window' : 'wood' });
    put(w / 4 - 0.6, 0.5, d / 2 - 0.02, 0.8, 1.45, 0.08, { side: 'wood' }, 0.7);
    const [rx, rz] = rot(0, 0);
    const r = (d + 0.7) / Math.sqrt(3);
    B.add(new THREE.CylinderGeometry(r, r, w + 0.5, 3), { side: 'roof' }, rx, 0.5 + h + r / 2, rz, { rx: -Math.PI / 2, rz: Math.PI / 2, ry, tint: 0.85 + rng.next() * 0.15, baseY: 0.5 + h });
    const [cx, cz] = rot(-w / 4, -d / 4);
    B.box(cx, 0.5 + h, cz, 0.5, r * 1.5 + 0.6, 0.5, { side: 'brick', top: 'stoneTop' }, { ry, baseY: 0.5 + h });
  }
}

function noise(x: number) {
  const i = Math.floor(x), f = x - i;
  const h = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
