// HD-2D battle stage: diorama + sprites + FX + camera + post. Implements the Stage contract (./api.ts).
import * as THREE from 'three';
import type { Element } from '../game/types';
import { getSprite } from '../art';
import type { CastKind, Stage, StageMode, StageUnit } from './api';
import { Diorama, THEMES, clonePalette, lerpPalette, type Theme } from './diorama';
import { Post } from './post';
import { GLINT, PIXEL, ParticlePool, SOFT, Shards, type V3 } from './particles';
import { Tweens, ease, lerp } from './tween';
import { Unit } from './units';
import { beamTex, boltTex, glowTex, hexTex, raysTex, ringTex, slashTex } from './fxtex';

const EL_COLOR: Record<Element, number> = { phys: 0xffffff, fire: 0xff7a2a, ice: 0x8ae8ff, thunder: 0xfff3a0, holy: 0xffe6a0, dark: 0xa050ff };
const KIND_COLOR: Record<CastKind, number> = { ...EL_COLOR, heal: 0x7dffa0, buff: 0xffcf5a, debuff: 0xb050ff, shield: 0x80d8ff };

interface ModeLook { focus: number; band: number; falloff: number; blur: number; min: number; darken: number; vignette: number; bloom: number; rays: number; exposure: number }
const LOOK: Record<StageMode, ModeLook> = {
  battle: { focus: 0.52, band: 0.1, falloff: 0.28, blur: 3.2, min: 0, darken: 0, vignette: 0.5, bloom: 0.55, rays: 1, exposure: 1 },
  title: { focus: 0.46, band: 0.08, falloff: 0.3, blur: 3.6, min: 0, darken: 0, vignette: 0.55, bloom: 0.7, rays: 1.8, exposure: 1.05 },
  map: { focus: 0.5, band: 0, falloff: 0.2, blur: 4.5, min: 1, darken: 0.45, vignette: 0.6, bloom: 0.5, rays: 1.2, exposure: 0.9 },
};

type Rig = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.3, 450);
  const diorama = new Diorama(scene);
  const glow = new ParticlePool(3000, true);
  const smoke = new ParticlePool(700, false);
  const shards = new Shards(160);
  scene.add(glow.points, smoke.points, shards.mesh);
  const post = new Post(renderer, scene, camera);

  // FX lights: fixed pool (constant light count avoids shader recompiles)
  const fxLights = [0, 1].map(() => { const l = new THREE.PointLight(0xffffff, 0, 12, 1.6); scene.add(l); return l; });
  let fxLightNext = 0;

  const game = new Tweens(), real = new Tweens();
  const units = new Map<string, Unit>();
  let time = 0, gtime = 0;
  let stopT = 0, slowT = 0, slowScale = 1;
  let trauma = 0;
  const flashC = new THREE.Color(0, 0, 0);
  let bloomPulse = 0;
  let limitK = 0, limitUnit: Unit | null = null;

  // theme + mode state
  let mode: StageMode = 'title';
  let theme: Theme = 'ruins';
  const pal = clonePalette(THEMES.ruins);
  let palFrom = clonePalette(pal), palTo = THEMES.ruins, palK = 1;
  diorama.setPalette(pal);
  let look: ModeLook = { ...LOOK.title }, lookFrom: ModeLook = { ...LOOK.title }, lookK = 1;
  let rigFrom: Rig = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 30 }, rigK = 1;
  const camTarget = new THREE.Vector3();

  function rig(m: StageMode, t: number): Rig {
    if (m === 'battle') {
      return {
        pos: new THREE.Vector3(Math.sin(t * 0.21) * 0.15, 8.6 + Math.sin(t * 0.17) * 0.06, 20.5),
        target: new THREE.Vector3(Math.sin(t * 0.21) * 0.06, 1.9, -0.6),
        fov: 30,
      };
    }
    if (m === 'title') {
      const a = Math.sin(t * 0.045 + 0.6) * 0.5, r = 27 + Math.sin(t * 0.06) * 2.5;
      const target = new THREE.Vector3(0, 3.4, -7);
      return { pos: new THREE.Vector3(Math.sin(a) * r, 6.5 + Math.sin(t * 0.08) * 1.2, target.z + Math.cos(a) * r), target, fov: 32 };
    }
    const a = Math.sin(t * 0.03) * 0.35;
    return { pos: new THREE.Vector3(Math.sin(a) * 34, 19, -4 + Math.cos(a) * 34), target: new THREE.Vector3(Math.sin(t * 0.05) * 2, 0, -6), fov: 34 };
  }
  const r0 = rig('title', 0);
  camera.position.copy(r0.pos); camTarget.copy(r0.target);

  // ------------------------------------------------------------------ helpers
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), bufSize = new THREE.Vector2();
  const U = (id: string) => units.get(id);

  function towardCam(p: THREE.Vector3, d: number) {
    return p.add(tmp2.copy(camera.position).sub(p).normalize().multiplyScalar(d));
  }
  function centerOf(u: Unit) { return u.centerNow(new THREE.Vector3()); }
  function feetOf(u: Unit) { return new THREE.Vector3().copy(u.home).add(u.offset).setY(0.2); }

  function fxLight(p: V3, color: THREE.ColorRepresentation, intensity: number, dur: number) {
    const l = fxLights[fxLightNext]; fxLightNext = (fxLightNext + 1) % fxLights.length;
    l.position.set(p.x, p.y + 0.4, p.z + 0.6); l.color.set(color);
    intensity *= 0.5;
    game.to(dur, (k) => { l.intensity = intensity * (1 - k); }, ease.outQuad);
  }

  /** Temporary additive textured quad. billboard = faces camera each frame; else fixed orientation. */
  function card(tex: THREE.Texture, color: THREE.ColorRepresentation, w: number, h: number, at: THREE.Vector3, o: { ground?: boolean; blend?: THREE.Blending } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
      map: tex, color, transparent: true, depthWrite: false, fog: false, blending: o.blend ?? THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    m.position.copy(at);
    if (o.ground) m.rotation.x = -Math.PI / 2;
    m.renderOrder = 24;
    scene.add(m);
    return m;
  }
  function kill(m: THREE.Mesh) { m.removeFromParent(); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
  function face(m: THREE.Object3D) { m.quaternion.copy(camera.quaternion); }
  const col = (c: number, k = 1) => new THREE.Color(c).multiplyScalar(k);

  function hitStop(s: number) { stopT = Math.max(stopT, s); }
  function slowmo(s: number, scale: number) { slowT = Math.max(slowT, s); slowScale = scale; }

  function flashUnit(u: Unit, color = 0xffffff, dur = 0.2) {
    u.u.uFlashColor.value.set(color).multiplyScalar(1.1);
    game.to(dur, (k) => { u.u.uFlash.value = 0.95 * (1 - k); }, ease.outQuad);
  }

  // ------------------------------------------------------------------ element FX

  function burst(p: THREE.Vector3, el: Element | CastKind, big: boolean) {
    const n = big ? 2 : 1;
    switch (el) {
      case 'fire':
        glow.emit(p, { count: 16 * n, spread: 0.35, velSpread: 3 * n, vel: [0, 1.4, 0], life: [0.3, 0.7], size: [0.7, 0.15], color: 0xffa040, color2: 0xc02000, intensity: 1.4, drag: 3.5 });
        glow.emit(p, { count: 2, spread: 0.15, velSpread: 1, life: [0.12, 0.22], size: [1.2, 1.8], color: 0xffd090, intensity: 0.4, drag: 3 });
        glow.emit(p, { count: 18 * n, spread: 0.2, velSpread: 6, vel: [0, 2, 0], life: [0.5, 1.1], size: [0.08, 0.03], color: 0xffd070, color2: 0xff3000, intensity: 4, gravity: 5, drag: 1, shape: PIXEL });
        smoke.emit(p, { count: 8 * n, spread: 0.4, vel: [0, 1.2, 0], velSpread: 0.6, life: [0.8, 1.4], size: [0.7, 1.6], color: 0x2a1a18, alpha: 0.5, drag: 1 });
        fxLight(p, 0xff7a2a, big ? 26 : 16, 0.5);
        break;
      case 'ice':
        shards.emit(p, 8 * n, [0xffffff, 0x9eeaff, 0x5ab8ff], { speed: 4.5, up: 3, size: 0.14, life: 1.1, intensity: 1.4 });
        glow.emit(p, { count: 20 * n, spread: 0.4, velSpread: 2.5, life: [0.4, 0.9], size: [0.12, 0], color: 0xe8fbff, color2: 0x60c8ff, intensity: 3, shape: GLINT, drag: 2 });
        glow.emit(p, { count: 2, spread: 0.3, velSpread: 0.6, life: [0.4, 0.7], size: [1.4, 2.4], color: 0x70c0ff, intensity: 0.4, drag: 2 });
        fxLight(p, 0x7ad8ff, big ? 34 : 22, 0.6);
        break;
      case 'thunder':
        glow.emit(p, { count: 30 * n, spread: 0.2, velSpread: 8, life: [0.15, 0.45], size: [0.07, 0.02], color: 0xffffff, color2: 0xffe060, intensity: 6, shape: PIXEL, drag: 4, gravity: 4 });
        glow.emit(p, { count: 2, spread: 0.1, life: [0.12, 0.2], size: [3, 4], color: 0xd8e8ff, intensity: 0.75 });
        fxLight(p, 0xd0e4ff, big ? 60 : 40, 0.35);
        break;
      case 'holy':
        glow.emit(p, { count: 24 * n, spread: [0.5, 0.8, 0.3], vel: [0, 2.2, 0], velSpread: 0.6, life: [0.6, 1.2], size: [0.14, 0], color: 0xfff6d0, color2: 0xffc850, intensity: 4, shape: GLINT, drag: 1 });
        glow.emit(p, { count: 2, spread: 0.2, life: [0.3, 0.5], size: [2, 3], color: 0xffe8a0, intensity: 0.6 });
        fxLight(p, 0xffe0a0, big ? 36 : 24, 0.6);
        break;
      case 'dark':
        smoke.emit(p, { count: 16 * n, spread: 0.5, velSpread: 1.4, vel: [0, 0.6, 0], life: [0.7, 1.3], size: [0.8, 1.8], color: 0x1a0828, color2: 0x05020a, alpha: 0.75, drag: 2 });
        glow.emit(p, { count: 8 * n, spread: 0.4, velSpread: 2.4, life: [0.4, 0.9], size: [0.4, 0.1], color: 0xb060ff, color2: 0x400890, intensity: 1.1, drag: 2.5 });
        glow.emit(p, { count: 14 * n, spread: 0.5, velSpread: 3, life: [0.4, 0.8], size: [0.07, 0.02], color: 0xe0a0ff, intensity: 3, shape: PIXEL, drag: 2 });
        fxLight(p, 0xa050ff, big ? 30 : 20, 0.6);
        break;
      default: // phys
        glow.emit(p, { count: 22 * n, spread: 0.1, velSpread: 7, vel: [0, 1.5, 0], life: [0.2, 0.5], size: [0.08, 0.02], color: 0xffffff, color2: 0xffb040, intensity: 5, shape: PIXEL, drag: 3, gravity: 7 });
        glow.emit(p, { count: 2, spread: 0.05, life: [0.1, 0.18], size: [1.6, 2.6], color: 0xffffff, intensity: 0.6 });
        if (big) fxLight(p, 0xfff0d0, 26, 0.3);
    }
  }

  async function slash(p: THREE.Vector3, color = 0xffffff, dir = 1, scale = 1) {
    const m = card(slashTex(), col(color, 3), 2.6 * scale, 2.6 * scale, towardCam(p.clone(), 0.6));
    const base = (dir > 0 ? -0.5 : Math.PI + 0.5) + (Math.random() - 0.5) * 0.6;
    await game.to(0.22, (k) => {
      face(m); m.rotateZ(base - k * 0.9 * dir);
      m.scale.setScalar(0.7 + k * 0.5);
      (m.material as THREE.MeshBasicMaterial).opacity = k < 0.4 ? 1 : 1 - (k - 0.4) / 0.6;
    }, ease.outCubic);
    kill(m);
  }

  function frostRing(p: THREE.Vector3, color: number, size = 3) {
    const m = card(ringTex(), col(color, 2.2), size, size, new THREE.Vector3(p.x, 0.22, p.z), { ground: true });
    game.to(0.6, (k) => { m.scale.setScalar(0.2 + k); m.rotation.z = k * 1.5; (m.material as THREE.MeshBasicMaterial).opacity = 1 - k; }, ease.outCubic).then(() => kill(m));
  }

  function pillar(p: THREE.Vector3, color: number, dur = 0.8, width = 1.3) {
    const base = new THREE.Vector3(p.x, 0, p.z);
    const a = card(beamTex(), col(color, 0.9), width * 1.2, 14, base.clone().setY(6.5));
    const b = card(beamTex(), col(0xffffff, 1.6), width * 0.3, 14, base.clone().setY(6.5));
    towardCam(a.position, 0.4); towardCam(b.position, 0.45);
    game.to(dur, (k, raw) => {
      const w = raw < 0.25 ? ease.outCubic(raw / 0.25) : 1 - ease.inQuad((raw - 0.25) / 0.75);
      for (const m of [a, b]) { face(m); m.scale.set(Math.max(0.001, w), 1, 1); }
    }).then(() => { kill(a); kill(b); });
    frostRing(p, color, 2.8);
  }

  async function projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, dur: number, arc: number, trail: (p: THREE.Vector3) => void) {
    const m = card(glowTex(), col(color, 3), 1.1, 1.1, from.clone());
    const p = new THREE.Vector3();
    let prev = 0;
    await game.to(dur, (k) => {
      for (let i = 1; i <= 4; i++) {
        const kk = lerp(prev, k, i / 4);
        p.lerpVectors(from, to, kk); p.y += Math.sin(kk * Math.PI) * arc;
        trail(p);
      }
      prev = k;
      m.position.copy(p); face(m); m.scale.setScalar(0.8 + 0.3 * Math.sin(k * 30));
    }, ease.inQuad);
    kill(m);
  }

  function channel(u: Unit, color: number, dur: number) {
    const c = new THREE.Color(color);
    const circ = card(ringTex(), col(color, 1.8), 2.4, 2.4, feetOf(u).setY(0.21), { ground: true });
    game.to(dur + 0.25, (k, raw) => {
      circ.rotation.z = raw * 3; circ.scale.setScalar(0.5 + ease.outBack(Math.min(1, raw * 2.5)) * 0.6);
      (circ.material as THREE.MeshBasicMaterial).opacity = raw < 0.7 ? 1 : (1 - raw) / 0.3;
      u.u.uGlow.value.copy(c).multiplyScalar(0.7 * Math.sin(raw * Math.PI));
      u.lift = Math.sin(raw * Math.PI) * 0.12;
    }).then(() => { kill(circ); u.u.uGlow.value.setRGB(0, 0, 0); u.lift = 0; });
    const f = feetOf(u);
    glow.emit(f, { count: 26, spread: [0.6, 0.05, 0.4], vel: [0, 2.6, 0], velSpread: 0.4, life: [0.4, 0.8], size: [0.12, 0], color, intensity: 3, shape: GLINT, drag: 1 });
  }

  async function reaction(u: Unit, kind: 'heal' | 'buff' | 'debuff' | 'shield') {
    const c = centerOf(u), f = feetOf(u);
    if (kind === 'heal') {
      glow.emit(f, { count: 34, spread: [0.6, 0.1, 0.4], vel: [0, 2.2, 0], velSpread: 0.5, life: [0.7, 1.3], size: [0.15, 0], color: 0xb0ffb0, color2: 0xffe070, intensity: 3.2, shape: GLINT, drag: 1.2 });
      glow.emit(c, { count: 2, spread: 0.2, life: [0.4, 0.6], size: [2, 2.6], color: 0x60ff90, intensity: 0.35 });
      frostRing(f, 0x70ff9a, 2.2);
      flashUnit(u, 0xc0ffc0, 0.35);
      fxLight(c, 0x70ff90, 16, 0.6);
    } else if (kind === 'buff') {
      for (let i = 0; i < 3; i++) game.wait(i * 0.12).then(() => glow.emit(f, { count: 16, spread: [0.55, 0.05, 0.35], vel: [0, 3.5, 0], velSpread: 0.2, life: [0.4, 0.7], size: [0.3, 0.05], color: 0xffe07a, color2: 0xff9a20, intensity: 2.5, drag: 0.5 }));
      const a = card(beamTex(), col(0xffc850, 1.3), u.width * 1.6, 3.2, f.clone().setY(1.4));
      towardCam(a.position, 0.2);
      game.to(0.7, (k) => { face(a); a.scale.set(1, 0.6 + k * 0.6, 1); (a.material as THREE.MeshBasicMaterial).opacity = Math.sin(k * Math.PI); }).then(() => kill(a));
      flashUnit(u, 0xffe090, 0.3);
    } else if (kind === 'debuff') {
      const top = c.clone(); top.y += u.headH * 0.6;
      for (let i = 0; i < 4; i++) game.wait(i * 0.1).then(() => glow.emit(top, { count: 10, spread: [0.5, 0.1, 0.3], vel: [0, -0.3, 0], life: [0.6, 1.0], size: [0.12, 0.06], color: 0xd080ff, color2: 0x4010a0, intensity: 2.5, gravity: 5, shape: PIXEL }));
      smoke.emit(c, { count: 10, spread: 0.5, vel: [0, -0.2, 0], velSpread: 0.3, life: [0.6, 1.0], size: [0.6, 1.2], color: 0x240a38, alpha: 0.6, drag: 1 });
      flashUnit(u, 0x8030c0, 0.35);
    } else {
      const h = card(hexTex(), col(0x80d8ff, 2), 2.4 * Math.max(1, u.width / 1.6), 2.4 * Math.max(1, u.width / 1.6), towardCam(c.clone(), 0.7));
      game.to(0.8, (k, raw) => {
        face(h); h.scale.setScalar(0.6 + ease.outBack(Math.min(1, raw * 3)) * 0.4);
        (h.material as THREE.MeshBasicMaterial).opacity = (raw < 0.6 ? 1 : (1 - raw) / 0.4) * (0.75 + 0.25 * Math.sin(raw * 60));
      }).then(() => kill(h));
      glow.emit(c, { count: 16, spread: 0.8, velSpread: 0.5, life: [0.4, 0.8], size: [0.12, 0], color: 0xc8f0ff, intensity: 3, shape: GLINT });
      fxLight(c, 0x80d8ff, 16, 0.5);
    }
  }

  async function castOn(from: Unit, to: Unit, kind: CastKind): Promise<void> {
    const c = centerOf(to), f = feetOf(to), src = centerOf(from);
    const dir = to.def.side === 'enemy' ? 1 : -1;
    switch (kind) {
      case 'fire': {
        await projectile(src, c, 0xff8a3a, 0.23, 1.2, (p) => glow.emit(p, { count: 1, spread: 0.08, velSpread: 0.4, vel: [0, 0.8, 0], life: [0.2, 0.4], size: [0.45, 0.08], color: 0xffb050, color2: 0xd02800, intensity: 1.6, drag: 2 }));
        burst(c, 'fire', true);
        return;
      }
      case 'ice': {
        frostRing(f, 0x8ae8ff, 3.2);
        glow.emit(c, { count: 20, spread: 1.4, vel: [0, 0, 0], velSpread: 0.2, life: [0.2, 0.3], size: [0.1, 0.2], color: 0xe0faff, intensity: 3, shape: GLINT });
        await game.wait(0.2);
        shards.emit(f, 14, [0xffffff, 0xa8f0ff, 0x60b8ff], { speed: 2, up: 7, size: 0.24, life: 1.1, spread: 0.5, intensity: 1.5 });
        burst(c, 'ice', true);
        return;
      }
      case 'thunder': {
        await game.wait(0.12);
        const bolt = card(boltTex(Math.floor(Math.random() * 4)), col(0xe0f0ff, 2.2), 1.5, 12, new THREE.Vector3(c.x, 6.2 + f.y, c.z));
        towardCam(bolt.position, 0.5);
        game.to(0.28, (k) => { face(bolt); (bolt.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (0.5 + 0.5 * Math.round(Math.random())); bolt.scale.x = Math.random() < 0.5 ? 1 : -1; }).then(() => kill(bolt));
        flash('#9fb8ff');
        await game.wait(0.1);
        burst(c, 'thunder', true);
        trauma = Math.min(1, trauma + 0.25);
        return;
      }
      case 'holy': {
        pillar(f, 0xffe6a0, 0.9);
        await game.wait(0.22);
        burst(c, 'holy', true);
        return;
      }
      case 'dark': {
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          smoke.emit({ x: c.x + Math.cos(a) * 1.5, y: c.y + (Math.random() - 0.5), z: c.z + Math.sin(a) * 0.8 }, { count: 2, vel: [-Math.cos(a) * 5, 0, -Math.sin(a) * 2.6], life: [0.3, 0.5], size: [0.8, 1.3], color: 0x2a0c40, alpha: 0.7, drag: 3 });
        }
        await game.wait(0.22);
        burst(c, 'dark', true);
        return;
      }
      case 'phys': {
        await game.wait(0.1);
        slash(c, 0xffffff, dir, 1.1);
        await game.wait(0.12);
        burst(c, 'phys', false);
        return;
      }
      default: {
        await projectile(src, c, KIND_COLOR[kind], 0.23, 1.6, (p) => glow.emit(p, { count: 1, spread: 0.1, life: [0.2, 0.4], size: [0.14, 0], color: KIND_COLOR[kind], intensity: 3, shape: GLINT }));
        reaction(to, kind);
      }
    }
  }

  function flash(color = '#ffffff') {
    const c = new THREE.Color(color);
    real.to(0.28, (k) => { flashC.copy(c).multiplyScalar(0.6 * (1 - k)); }, ease.outQuad);
  }

  // ------------------------------------------------------------------ layout
  // Formation slots in normalized screen space of the (sway-free) battle camera, [x, feetY].
  // Agreed with the UI: feet at y 0.60-0.64, heroes x 0.16/0.25/0.34, enemies x 0.60-0.82.
  const HERO_SCREEN: [number, number][] = [[0.34, 0.6], [0.25, 0.62], [0.16, 0.64]];
  const ENEMY_SCREEN: Record<number, [number, number][]> = {
    1: [[0.72, 0.625]],
    2: [[0.8, 0.605], [0.64, 0.635]],
    3: [[0.71, 0.6], [0.6, 0.635], [0.82, 0.625]],
    4: [[0.7, 0.595], [0.59, 0.635], [0.8, 0.635], [0.88, 0.6]],
  };
  const layoutCam = new THREE.PerspectiveCamera(30, 16 / 9, 0.3, 450);
  const ray = new THREE.Raycaster(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  /** world point on the floor under normalized screen (x, y-from-top) of the battle camera */
  function groundAt(x: number, y: number, out = new THREE.Vector3()) {
    const r = rig('battle', 0);
    layoutCam.fov = r.fov; layoutCam.updateProjectionMatrix();
    layoutCam.position.copy(r.pos); layoutCam.lookAt(r.target); layoutCam.updateMatrixWorld();
    ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), layoutCam);
    return ray.ray.intersectPlane(ground, out) ?? out.set(0, 0, 0);
  }
  diorama.placeRune(groundAt(0.5, 0.625));
  function layout() {
    const heroes = [...units.values()].filter((u) => u.def.side === 'hero');
    const enemies = [...units.values()].filter((u) => u.def.side === 'enemy' && !u.removed);
    heroes.forEach((u, i) => {
      const s = HERO_SCREEN[heroes.length === 1 ? 1 : i % 3];
      groundAt(s[0] - Math.floor(i / 3) * 0.07, s[1], u.home);
    });
    const bySize = [...enemies].sort((a, b) => b.headH * b.width - a.headH * a.width);
    const bigBoss = bySize.length > 0 && bySize[0].width > 3;
    const slots = bigBoss
      ? [[0.735, 0.625], [0.56, 0.64], [0.57, 0.595], [0.9, 0.64]] as [number, number][]
      : ENEMY_SCREEN[Math.min(4, enemies.length)] ?? [];
    bySize.forEach((u, i) => {
      const s = slots[i] ?? [0.7 + 0.05 * i, 0.62];
      groundAt(s[0], s[1], u.home);
    });
  }

  // ------------------------------------------------------------------ loop
  let last = performance.now();
  function frame(now: number) {
    requestAnimationFrame(frame);
    const rdt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    step(rdt);
    post.render();
  }
  function step(rdt: number) {
    if (stopT > 0) stopT -= rdt;
    else if (slowT > 0) slowT -= rdt;
    const ts = stopT > 0 ? 0 : slowT > 0 ? slowScale : 1;
    const gdt = rdt * ts;
    time += rdt; gtime += gdt;
    real.update(rdt); game.update(gdt);

    // theme / look blending
    if (palK < 1) { palK = Math.min(1, palK + rdt / 1.6); lerpPalette(pal, palFrom, palTo, ease.inOutSine(palK)); }
    // tilt-shift focus band hugs the units (heads..feet) in battle
    const T = { ...LOOK[mode] };
    if (mode === 'battle' && units.size) {
      let top = 0, bot = 1;
      for (const u of units.values()) {
        top = Math.max(top, 1 - stage.screenPos(u.def.id, 'head').y + 0.03);
        bot = Math.min(bot, 1 - stage.screenPos(u.def.id, 'feet').y - 0.02);
      }
      T.focus = (top + bot) / 2; T.band = Math.max(0.08, (top - bot) / 2);
    }
    if (lookK < 1) {
      lookK = Math.min(1, lookK + rdt / 1.4);
      const k = ease.inOutCubic(lookK);
      for (const key of Object.keys(look) as (keyof ModeLook)[]) look[key] = lerp(lookFrom[key], T[key], k);
    } else {
      const k = Math.min(1, rdt * 3);
      for (const key of Object.keys(look) as (keyof ModeLook)[]) look[key] += (T[key] - look[key]) * k;
    }

    // camera
    const r = rig(mode, time);
    if (rigK < 1) {
      rigK = Math.min(1, rigK + rdt / 1.8);
      const k = ease.inOutCubic(rigK);
      r.pos.lerpVectors(rigFrom.pos, r.pos, k); r.target.lerpVectors(rigFrom.target, r.target, k); r.fov = lerp(rigFrom.fov, r.fov, k);
    }
    if (limitK > 0 && limitUnit) {
      const c = limitUnit.centerNow(tmp);
      const dirv = new THREE.Vector3().subVectors(r.pos, r.target).normalize();
      const pos = c.clone().addScaledVector(dirv, 12.5).add(new THREE.Vector3(1.6, -0.4, 0));
      const k = ease.inOutCubic(limitK);
      r.pos.lerp(pos, k); r.target.lerp(c.clone().add(new THREE.Vector3(1.4, 0.2, 0)), k); r.fov = lerp(r.fov, 28, k);
    }
    trauma = Math.max(0, trauma - rdt * 1.6);
    const sh = trauma * trauma * 0.45;
    camera.position.copy(r.pos).add(tmp.set(Math.sin(time * 41) * sh, Math.sin(time * 37 + 1) * sh, 0));
    camTarget.copy(r.target);
    camera.lookAt(camTarget);
    camera.rotateZ(Math.sin(time * 29) * sh * 0.05);
    if (camera.fov !== r.fov) { camera.fov = r.fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    const fwd = camera.getWorldDirection(tmp);
    const yaw = Math.atan2(-fwd.x, -fwd.z);

    const scale = renderer.getDrawingBufferSize(bufSize).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    glow.material.uniforms.uScale.value = smoke.material.uniforms.uScale.value = scale;

    for (const u of units.values()) u.update(gtime, gdt, yaw);
    diorama.update(time, gdt, glow, camera, scale);
    glow.update(gdt); smoke.update(gdt); shards.update(gdt);

    // post
    post.setTilt(look.focus, look.band, look.falloff, look.blur, look.min);
    post.bloom.strength = look.bloom + bloomPulse;
    const g = post.grade.uniforms;
    g.uLift.value.copy(pal.lift); g.uGain.value.copy(pal.gain); g.uSat.value = pal.sat;
    g.uVignette.value = look.vignette + limitK * 0.2;
    g.uDarken.value = look.darken + limitK * 0.2;
    g.uFlash.value.copy(flashC);
    g.uTime.value = time;
    renderer.toneMappingExposure = pal.exposure * look.exposure;
    // rays follow mode
    pal.raysI = palTo.raysI * look.rays;
  }
  requestAnimationFrame(frame);

  // ------------------------------------------------------------------ Stage API
  const stage: Stage = {
    resize(w, h) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      post.setSize(w, h);
    },

    setMode(m, th) {
      if (th && th !== theme) {
        theme = th; palFrom = clonePalette(pal); palTo = THEMES[th]; palK = 0;
      }
      if (m === mode) return;
      rigFrom = { pos: camera.position.clone(), target: camTarget.clone(), fov: camera.fov };
      rigK = 0;
      lookFrom = { ...look }; lookK = 0;
      mode = m;
    },

    setUnits(list) {
      const keep = new Set<string>();
      for (const d of list) {
        const ex = units.get(d.id);
        if (ex && ex.def.sprite === d.sprite && !ex.removed) { keep.add(d.id); continue; }
        if (ex) { ex.dispose(); units.delete(d.id); }
      }
      for (const [id, u] of units) if (!keep.has(id)) { u.dispose(); units.delete(id); }
      const fresh: Unit[] = [];
      for (const d of list) {
        if (units.has(d.id)) continue;
        const u = new Unit(d, getSprite(d.sprite));
        units.set(d.id, u); scene.add(u.root); fresh.push(u);
      }
      // keep map order == list order for layout
      const ordered = list.map((d) => units.get(d.id)!).filter(Boolean);
      units.clear(); for (const u of ordered) units.set(u.def.id, u);
      layout();
      fresh.forEach((u, i) => {
        const delay = i * 0.12;
        if (u.def.side === 'hero') {
          u.offset.x = -8; u.fps = 11;
          game.wait(delay).then(() => game.to(0.9, (k) => { u.offset.x = -8 * (1 - k); }, ease.outCubic)).then(() => { u.fps = 5; });
        } else {
          u.u.uDissolve.value = 1;
          game.wait(0.25 + delay).then(() => {
            const c = u.anchor('center', new THREE.Vector3());
            glow.emit(c, { count: 30, spread: [u.width * 0.5, u.headH * 0.5, 0.3], vel: [0, 1, 0], velSpread: 0.6, life: [0.5, 1], size: [0.14, 0], color: 0xd0b0ff, intensity: 3, shape: GLINT });
            return game.to(0.8, (k) => { u.u.uDissolve.value = 1 - k; }, ease.outQuad);
          });
        }
      });
    },

    screenPos(id, anchor) {
      const u = U(id);
      if (!u) return { x: 0.5, y: 0.5 };
      const p = u.anchor(anchor, new THREE.Vector3()).project(camera);
      return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    },

    attack(fromId, toId) {
      const u = U(fromId);
      if (!u) return Promise.resolve();
      const t = toId ? U(toId) : null;
      const dir = u.def.side === 'hero' ? 1 : -1;
      const start = u.offset.clone();
      const dest = t
        ? new THREE.Vector3().subVectors(t.home, u.home).add(new THREE.Vector3(-dir * (0.5 + (t.width + u.width) * 0.35), 0, 0.05))
        : new THREE.Vector3(dir * 0.7, 0, 0);
      return new Promise<void>((resolve) => {
        (async () => {
          u.fps = 12;
          // anticipation: crouch back
          await game.to(0.09, (k) => { u.offset.copy(start).x -= dir * 0.35 * k; u.squash = 1 - 0.12 * k; u.tilt = dir * 0.08 * k; }, ease.outQuad);
          const back = u.offset.clone();
          glow.emit(feetOf(u), { count: 8, spread: [0.3, 0.02, 0.2], vel: [-dir * 1.5, 0.6, 0], velSpread: 0.4, life: [0.3, 0.5], size: [0.5, 0.9], color: 0x806a50, intensity: 0.5 });
          await game.to(0.16, (k) => { u.offset.lerpVectors(back, dest, k); u.offset.y = Math.sin(k * Math.PI) * 0.25; u.squash = 0.88 + 0.2 * k; u.tilt = -dir * 0.1 * k; }, ease.inQuad);
          // impact
          if (t) slash(centerOf(t), 0xffffff, dir, Math.max(1, t.headH / 2.4));
          resolve();
          await game.to(0.08, (k) => { u.squash = 1.08 - 0.08 * k; u.tilt = -dir * 0.1 * (1 - k); });
          await game.wait(0.08);
          const hit = u.offset.clone();
          await game.to(0.34, (k) => { u.offset.lerpVectors(hit, start, k); u.offset.y = Math.sin(k * Math.PI) * 0.35; }, ease.inOutQuad);
          u.offset.copy(start); u.squash = 1; u.tilt = u.broken ? -dir * 0.22 : 0; u.fps = 5;
        })();
      });
    },

    cast(fromId, toIds, kind) {
      const u = U(fromId);
      const targets = toIds.map(U).filter((x): x is Unit => !!x);
      const color = KIND_COLOR[kind];
      if (u) channel(u, color, 0.22);
      return (async () => {
        await game.wait(0.22);
        if (!u) { for (const t of targets) burst(centerOf(t), kind, false); return; }
        await Promise.all(targets.map((t, i) => game.wait(i * 0.02).then(() => castOn(u, t, kind))));
      })();
    },

    hit(id, element, big = false) {
      const u = U(id);
      if (!u) return;
      const dir = u.def.side === 'enemy' ? 1 : -1;
      flashUnit(u, 0xffffff, big ? 0.28 : 0.18);
      burst(centerOf(u), element, big);
      const A = big ? 0.55 : 0.3;
      const baseTilt = u.broken ? -dir * 0.22 : 0;
      game.to(big ? 0.5 : 0.35, (k, raw) => {
        u.offset.x = dir * A * Math.sin(Math.min(1, raw * 4) * Math.PI / 2) * (1 - raw) ** 2;
        u.tilt = baseTilt + dir * 0.18 * Math.sin(raw * 22) * (1 - raw);
      });
      if (big) { hitStop(0.08); trauma = Math.min(1, trauma + 0.45); }
    },

    heal(id) { const u = U(id); if (u) reaction(u, 'heal'); },
    block(id) { const u = U(id); if (u) reaction(u, 'shield'); },
    buff(id) { const u = U(id); if (u) reaction(u, 'buff'); },
    debuff(id) { const u = U(id); if (u) reaction(u, 'debuff'); },

    shatter(id) {
      const u = U(id);
      if (!u) return;
      const c = centerOf(u);
      const pal2 = [0xffffff, pal.crystalA.getHex(), pal.crystalB.getHex(), 0xa8f4ff];
      shards.emit(c, 56, pal2, { speed: 7.5, up: 4, size: 0.3, life: 1.6, spread: u.width * 0.3, intensity: 1.25 });
      glow.emit(c, { count: 40, spread: 0.3, velSpread: 9, life: [0.3, 0.8], size: [0.22, 0], color: 0xffffff, color2: pal.crystalA, intensity: 3, shape: GLINT, drag: 3 });
      const ring = card(ringTex(), col(0xbff8ff, 3), 3, 3, feetOf(u).setY(0.23), { ground: true });
      real.to(0.7, (k) => { ring.scale.setScalar(0.3 + k * 2.4); (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k; }, ease.outCubic).then(() => kill(ring));
      flashUnit(u, 0xd8ffff, 0.4);
      fxLight(c, pal.crystalA, 40, 0.8);
      flash('#bdf6ff');
      trauma = Math.min(1, trauma + 0.6);
      hitStop(0.06);
      slowmo(0.36, 0.25);
      real.to(0.8, (k) => { bloomPulse = 0.6 * Math.sin(Math.min(1, k * 3) * Math.PI / 2) * (1 - k); }).then(() => { bloomPulse = 0; });
    },

    setBroken(id, broken) {
      const u = U(id);
      if (!u || u.broken === broken) return;
      u.broken = broken;
      const dir = u.def.side === 'enemy' ? 1 : -1;
      const t0 = u.tilt, s0 = u.squash, d0 = u.u.uDim.value;
      game.to(0.35, (k) => {
        u.tilt = lerp(t0, broken ? -dir * 0.22 : 0, k);
        u.squash = lerp(s0, broken ? 0.9 : 1, k);
        u.u.uDim.value = lerp(d0, broken ? 0.62 : 1, k);
        u.hoverAmt = broken ? 0.3 : 1;
      }, ease.outBack);
      u.fps = broken ? 2.5 : 5;
    },

    setTargeted(id) { for (const u of units.values()) u.targeted = u.def.id === id && !u.removed; },
    setActive(id) { for (const u of units.values()) u.active = u.def.id === id && !u.removed; },

    ko(id) {
      const u = U(id);
      if (!u || u.ko) return Promise.resolve();
      u.ko = true; u.targeted = false; u.active = false; u.broken = false;
      if (u.def.side === 'hero') {
        flashUnit(u, 0xffffff, 0.2);
        const t0 = u.tilt;
        return game.to(0.55, (k) => {
          u.tilt = lerp(t0, Math.PI / 2, ease.outQuad(k));
          u.lift = u.width * 0.3 * k + Math.sin(k * Math.PI) * 0.25;
          u.u.uGrey.value = k * 0.85; u.u.uDim.value = lerp(1, 0.75, k);
          u.squash = 1;
        }, ease.linear).then(() => { glow.emit(feetOf(u), { count: 14, spread: [0.8, 0.05, 0.3], vel: [0, 0.8, 0], velSpread: 0.8, life: [0.3, 0.6], size: [0.6, 1.1], color: 0x7a6a58, intensity: 0.4 }); });
      }
      return (async () => {
        u.mesh.castShadow = false;
        flashUnit(u, 0xffffff, 0.25);
        u.u.uDissolveColor.value.copy(pal.crystalB).multiplyScalar(2.5);
        await game.wait(0.15);
        const c = u.anchor('center', new THREE.Vector3());
        let acc = 0;
        await game.to(1.0, (k) => {
          u.u.uDissolve.value = k;
          u.lift = k * 0.3;
          acc += 1;
          if (acc % 2 === 0) glow.emit({ x: c.x, y: c.y + (k - 0.5) * u.headH, z: c.z }, { count: 5, spread: [u.width * 0.45, u.headH * 0.2, 0.2], vel: [0, 1.6, 0], velSpread: 0.4, life: [0.6, 1.2], size: [0.1, 0.02], color: 0xffffff, color2: pal.crystalB, intensity: 3.5, shape: PIXEL, drag: 0.5 });
        }, ease.inQuad);
        u.removed = true;
        units.delete(id);
        u.dispose();
      })();
    },

    revive(id) {
      const u = U(id);
      if (!u || !u.ko) return;
      u.ko = false;
      const f = feetOf(u);
      pillar(f, 0xffe6a0, 1.1, 1.4);
      glow.emit(f, { count: 40, spread: [0.7, 0.1, 0.4], vel: [0, 3, 0], velSpread: 0.6, life: [0.6, 1.2], size: [0.16, 0], color: 0xfff6d0, intensity: 4, shape: GLINT, drag: 1 });
      fxLight(centerOf(u), 0xffe0a0, 30, 1);
      const t0 = u.tilt, l0 = u.lift;
      game.to(0.8, (k) => {
        u.tilt = lerp(t0, 0, k); u.lift = lerp(l0, 0, k) + Math.sin(k * Math.PI) * 0.4;
        u.u.uGrey.value = 0.85 * (1 - k); u.u.uDim.value = lerp(0.75, 1, k);
        u.u.uGlow.value.setRGB(1, 0.85, 0.5).multiplyScalar(Math.sin(k * Math.PI));
      }, ease.inOutCubic).then(() => { u.u.uGlow.value.setRGB(0, 0, 0); });
    },

    limit(heroId) {
      const u = U(heroId);
      if (!u) return Promise.resolve();
      limitUnit = u;
      const c = centerOf(u);
      const rays = card(raysTex(), col(0xffd890, 0.22), 8, 8, c.clone().add(new THREE.Vector3(0, 0, -0.5)));
      const halo = card(glowTex(), col(0xffe0a0, 0.12), 4.5, 4.5, c.clone().add(new THREE.Vector3(0, 0, -0.4)));
      real.to(0.4, (k) => { limitK = k; diorama.dim = k; }, ease.outCubic);
      let n = 0;
      const charge = game.to(0.85, (k) => {
        u.u.uGlow.value.setRGB(0.25, 0.2, 0.1).multiplyScalar(k); u.rimBoost = k;
        u.lift = ease.outCubic(k) * 0.3;
        for (const m of [rays, halo]) { face(m); m.rotateZ(time * 0.6 * (m === rays ? 1 : -1)); }
        rays.scale.setScalar(0.2 + k * 0.8); halo.scale.setScalar(0.3 + k);
        (rays.material as THREE.MeshBasicMaterial).opacity = k; (halo.material as THREE.MeshBasicMaterial).opacity = k;
        if (++n % 3 === 0) {
          const a = Math.random() * Math.PI * 2, r = 3;
          glow.emit({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, z: c.z + 0.3 }, { count: 1, vel: [-Math.cos(a) * r * 3.5, -Math.sin(a) * r * 3.5, 0], life: [0.22, 0.27], size: [0.12, 0.04], color: 0xfff0c0, intensity: 2.5, shape: GLINT });
        }
      });
      return (async () => {
        await charge;
        // burst
        flash('#fff0c8');
        trauma = Math.min(1, trauma + 0.55);
        glow.emit(c, { count: 50, spread: 0.3, velSpread: 11, life: [0.4, 0.9], size: [0.2, 0], color: 0xffffff, color2: 0xffb040, intensity: 2.5, shape: GLINT, drag: 2.5 });
        fxLight(c, 0xffd890, 26, 0.6);
        real.to(0.5, (k) => { bloomPulse = 0.35 * (1 - k); });
        game.to(0.35, (k) => {
          face(rays); rays.scale.setScalar(1 + k * 1.2); (rays.material as THREE.MeshBasicMaterial).opacity = 1 - k;
          face(halo); halo.scale.setScalar(1.3 + k * 2); (halo.material as THREE.MeshBasicMaterial).opacity = 1 - k;
        }).then(() => { kill(rays); kill(halo); });
        await game.wait(0.35);
        u.u.uGlow.value.setRGB(0, 0, 0);
        game.to(0.3, (k) => { u.lift = 0.3 * (1 - k); u.rimBoost = 1 - k; });
        real.to(0.55, (k) => { limitK = 1 - k; diorama.dim = 1 - k; }, ease.inOutCubic).then(() => { limitUnit = null; });
      })();
    },

    shake(intensity) { trauma = Math.min(1, trauma + intensity); },
    flash,
  };

  const w0 = canvas.clientWidth || 1280, h0 = canvas.clientHeight || 720;
  stage.resize(w0, h0);
  // dev-only hooks for deterministic headless captures (not part of the Stage contract)
  Object.assign(stage, { __step: step, __render: () => post.render() });
  return stage;
}
