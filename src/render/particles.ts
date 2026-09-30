// CPU-simulated particle pools rendered as a single THREE.Points each (custom shader: soft dot / pixel
// square / 4-point glint), plus an instanced crystal-shard system for ice and BREAK.
import * as THREE from 'three';

export type V3 = { x: number; y: number; z: number };
export const SOFT = 0, PIXEL = 1, GLINT = 2;

export interface EmitOpts {
  count: number;
  /** position jitter: radius (sphere) or per-axis box half-extents */
  spread?: number | [number, number, number];
  vel?: [number, number, number];
  /** random velocity magnitude added in a sphere */
  velSpread?: number;
  life?: [number, number];
  size?: [number, number];
  color?: THREE.ColorRepresentation;
  color2?: THREE.ColorRepresentation;
  /** HDR multiplier on color (>1 blooms) */
  intensity?: number;
  alpha?: number;
  gravity?: number;
  drag?: number;
  shape?: number;
}

const VS = /* glsl */ `
attribute vec4 aColor; attribute float aSize; attribute float aShape;
uniform float uScale;
varying vec4 vColor; varying float vShape;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  vColor = aColor; vShape = aShape;
}`;
const FS = /* glsl */ `
varying vec4 vColor; varying float vShape;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  float a;
  if (vShape < 0.5) a = exp(-r2 * 3.2) * (1.0 - smoothstep(0.8, 1.0, r2));
  else if (vShape < 1.5) a = step(max(abs(p.x), abs(p.y)), 0.55);
  else a = clamp(max(0.0, 1.0 - abs(p.x * p.y) * 40.0) * (1.0 - sqrt(r2)) + exp(-r2 * 14.0), 0.0, 1.0);
  a *= vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}`;

const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();

export class ParticlePool {
  readonly points: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  private n: number;
  private head = 0;
  private pos: Float32Array; private col: Float32Array; private size: Float32Array; private shape: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array;
  private s0: Float32Array; private s1: Float32Array; private c0: Float32Array; private c1: Float32Array;
  private grav: Float32Array; private drag: Float32Array; private a0: Float32Array;
  private geo: THREE.BufferGeometry;
  private alive = 0;

  constructor(capacity: number, additive: boolean) {
    this.n = capacity;
    const f = (k: number) => new Float32Array(capacity * k);
    this.pos = f(3); this.col = f(4); this.size = f(1); this.shape = f(1);
    this.vel = f(3); this.life = f(1); this.max = f(1); this.s0 = f(1); this.s1 = f(1);
    this.c0 = f(3); this.c1 = f(3); this.grav = f(1); this.drag = f(1); this.a0 = f(1);
    this.geo = new THREE.BufferGeometry();
    const attr = (name: string, arr: Float32Array, k: number) => {
      const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); this.geo.setAttribute(name, a);
    };
    attr('position', this.pos, 3); attr('aColor', this.col, 4); attr('aSize', this.size, 1); attr('aShape', this.shape, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } }, vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 20 : 19;
  }

  emit(at: V3, o: EmitOpts) {
    const sp = o.spread ?? 0, vs = o.velSpread ?? 0;
    const [l0, l1] = o.life ?? [0.6, 1.0];
    const [z0, z1] = o.size ?? [0.2, 0];
    tmpC.set(o.color ?? 0xffffff).multiplyScalar(o.intensity ?? 1);
    tmpC2.set(o.color2 ?? o.color ?? 0xffffff).multiplyScalar(o.intensity ?? 1);
    for (let k = 0; k < o.count; k++) {
      const i = this.head; this.head = (this.head + 1) % this.n;
      let dx: number, dy: number, dz: number;
      if (typeof sp === 'number') { [dx, dy, dz] = sphere(sp); } else { dx = (Math.random() * 2 - 1) * sp[0]; dy = (Math.random() * 2 - 1) * sp[1]; dz = (Math.random() * 2 - 1) * sp[2]; }
      this.pos[i * 3] = at.x + dx; this.pos[i * 3 + 1] = at.y + dy; this.pos[i * 3 + 2] = at.z + dz;
      const [vx, vy, vz] = sphere(vs);
      const v = o.vel ?? [0, 0, 0];
      this.vel[i * 3] = v[0] + vx; this.vel[i * 3 + 1] = v[1] + vy; this.vel[i * 3 + 2] = v[2] + vz;
      this.max[i] = this.life[i] = l0 + Math.random() * (l1 - l0);
      const js = 0.7 + Math.random() * 0.6;
      this.s0[i] = z0 * js; this.s1[i] = z1 * js;
      this.c0[i * 3] = tmpC.r; this.c0[i * 3 + 1] = tmpC.g; this.c0[i * 3 + 2] = tmpC.b;
      this.c1[i * 3] = tmpC2.r; this.c1[i * 3 + 1] = tmpC2.g; this.c1[i * 3 + 2] = tmpC2.b;
      this.grav[i] = o.gravity ?? 0; this.drag[i] = o.drag ?? 0; this.a0[i] = o.alpha ?? 1;
      this.shape[i] = o.shape ?? SOFT;
    }
    this.alive = this.n;
  }

  update(dt: number) {
    if (!this.alive) return;
    let alive = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      const d = Math.max(0, 1 - this.drag[i] * dt);
      const j = i * 3;
      this.vel[j] *= d; this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = this.life[i] <= 0 ? 0 : this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      const q = i * 4;
      this.col[q] = this.c0[j] + (this.c1[j] - this.c0[j]) * t;
      this.col[q + 1] = this.c0[j + 1] + (this.c1[j + 1] - this.c0[j + 1]) * t;
      this.col[q + 2] = this.c0[j + 2] + (this.c1[j + 2] - this.c0[j + 2]) * t;
      this.col[q + 3] = this.a0[i] * Math.min(1, t * 8) * (1 - t * t);
    }
    this.alive = alive;
    for (const a of Object.values(this.geo.attributes)) (a as THREE.BufferAttribute).needsUpdate = true;
  }
}

function sphere(r: number): [number, number, number] {
  if (!r) return [0, 0, 0];
  let x, y, z;
  do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; } while (x * x + y * y + z * z > 1);
  return [x * r, y * r, z * r];
}

// ------------------------------------------------------------------ crystal shards

export class Shards {
  readonly mesh: THREE.InstancedMesh;
  private n: number; private head = 0;
  private p: Float32Array; private v: Float32Array; private life: Float32Array; private max: Float32Array;
  private axis: THREE.Vector3[]; private ang: Float32Array; private spin: Float32Array; private sc: Float32Array;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private s = new THREE.Vector3(); private t = new THREE.Vector3();
  private any = false;

  constructor(capacity: number) {
    this.n = capacity;
    const g = new THREE.OctahedronGeometry(1, 0);
    g.scale(0.35, 1, 0.35);
    // per-face shade so facets read even under flat HDR colour
    const cols = new Float32Array(g.attributes.position.count * 3);
    for (let f = 0; f < cols.length / 9; f++) { const b = [1, 0.55, 0.8, 0.4, 0.9, 0.6, 0.75, 0.45][f % 8]; cols.fill(b, f * 9, f * 9 + 9); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(g, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    const f = (k: number) => new Float32Array(capacity * k);
    this.p = f(3); this.v = f(3); this.life = f(1); this.max = f(1); this.ang = f(1); this.spin = f(1); this.sc = f(1);
    this.axis = Array.from({ length: capacity }, () => new THREE.Vector3(0, 1, 0));
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < capacity; i++) { this.mesh.setMatrixAt(i, this.m); this.mesh.setColorAt(i, new THREE.Color(1, 1, 1)); }
  }

  /** Burst of shards. vel = base velocity; speed = random sphere magnitude; up = extra upward kick. */
  emit(at: V3, count: number, colors: THREE.ColorRepresentation[], o: { speed?: number; up?: number; size?: number; life?: number; vel?: [number, number, number]; spread?: number; intensity?: number } = {}) {
    const c = new THREE.Color();
    for (let k = 0; k < count; k++) {
      const i = this.head; this.head = (this.head + 1) % this.n;
      const [dx, dy, dz] = sphere(o.spread ?? 0.2);
      this.p[i * 3] = at.x + dx; this.p[i * 3 + 1] = at.y + dy; this.p[i * 3 + 2] = at.z + dz;
      const [vx, vy, vz] = sphere(o.speed ?? 5);
      const b = o.vel ?? [0, 0, 0];
      this.v[i * 3] = b[0] + vx; this.v[i * 3 + 1] = b[1] + vy + (o.up ?? 2) * Math.random(); this.v[i * 3 + 2] = b[2] + vz;
      this.max[i] = this.life[i] = (o.life ?? 1.2) * (0.6 + Math.random() * 0.6);
      this.axis[i].set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.ang[i] = Math.random() * 6; this.spin[i] = (Math.random() - 0.5) * 20;
      this.sc[i] = (o.size ?? 0.18) * (0.5 + Math.random());
      c.set(colors[k % colors.length]).multiplyScalar(o.intensity ?? 2.2);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceColor!.needsUpdate = true;
    this.any = true;
  }

  update(dt: number) {
    if (!this.any) return;
    let any = false;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      const j = i * 3;
      this.v[j + 1] -= 9 * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.08 && this.v[j + 1] < 0) { this.p[j + 1] = 0.08; this.v[j + 1] *= -0.35; this.v[j] *= 0.6; this.v[j + 2] *= 0.6; this.spin[i] *= 0.5; }
      this.ang[i] += this.spin[i] * dt;
      const k = this.life[i] <= 0 ? 0 : this.sc[i] * Math.min(1, (this.life[i] / this.max[i]) * 3);
      this.q.setFromAxisAngle(this.axis[i], this.ang[i]);
      this.m.compose(this.t.set(this.p[j], this.p[j + 1], this.p[j + 2]), this.q, this.s.set(k, k, k));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.any = any;
  }
}
