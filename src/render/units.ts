// Battle unit: lit pixel-sprite billboard with frame animation, custom flash/grey/dissolve/rim shader,
// alpha-tested shadow casting, blob shadow, target ring, active glow and "broken" stars.
import * as THREE from 'three';
import type { SpriteSheet } from '../art';
import type { StageUnit } from './api';
import { blobTex, glowTex, ringTex, starTex } from './fxtex';

/** World units per sprite pixel (same for every unit). */
export const PX = 1 / 24;

const boundsCache = new WeakMap<SpriteSheet, { top: number; left: number; right: number }>();
/** Opaque bounds of frame 0 in sprite pixels. */
function bounds(s: SpriteSheet) {
  let b = boundsCache.get(s);
  if (b) return b;
  const d = s.canvas.getContext('2d')!.getImageData(0, 0, s.w, s.h).data;
  let top = s.h, left = s.w, right = 0;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (d[(y * s.w + x) * 4 + 3] > 128) {
    top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x);
  }
  b = { top: top >= s.h ? 0 : top, left, right: Math.max(left, right) };
  boundsCache.set(s, b);
  return b;
}

export class Unit {
  readonly root = new THREE.Group();   // world position (home + offset)
  readonly yaw = new THREE.Group();    // faces the camera (cylindrical billboard)
  readonly body = new THREE.Group();   // pivot at feet: tilt / squash / hover
  readonly mesh: THREE.Mesh;
  readonly home = new THREE.Vector3();
  readonly offset = new THREE.Vector3();
  readonly u = {
    uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uGrey: { value: 0 }, uDim: { value: 1 },
    uDissolve: { value: 0 }, uDissolveColor: { value: new THREE.Color(0.6, 0.8, 2.0) },
    uRim: { value: 0 }, uRimColor: { value: new THREE.Color(1.6, 1.3, 0.7) },
    uGlow: { value: new THREE.Color(0, 0, 0) },
    uPx: { value: new THREE.Vector2(1, 1) },
  };
  readonly tex: THREE.CanvasTexture;
  readonly blob: THREE.Mesh;
  readonly ring: THREE.Mesh;
  readonly glow: THREE.Mesh;
  readonly stars = new THREE.Group();
  /** sprite-space heights in world units above the feet */
  readonly headH: number; readonly width: number; readonly float: number;
  ko = false; broken = false; targeted = false; active = false; removed = false;
  tilt = 0; squash = 1; lift = 0; hoverAmt = 1; rimBoost = 0;
  ringK = 0; glowK = 0; brokenK = 0;
  private frame = 0; private frameT = Math.random() * 10; private seed = Math.random() * 100;
  fps = 5;

  constructor(readonly def: StageUnit, readonly sheet: SpriteSheet) {
    const s = sheet;
    this.tex = new THREE.CanvasTexture(s.canvas);
    this.tex.magFilter = THREE.NearestFilter; this.tex.minFilter = THREE.NearestFilter; this.tex.generateMipmaps = false;
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.repeat.set(1 / s.frames, 1);
    this.u.uPx.value.set(s.w * s.frames, s.h);

    const b = bounds(s);
    this.float = s.float * PX;
    this.headH = (s.footY - b.top) * PX;
    this.width = (b.right - b.left + 1) * PX;
    const geo = new THREE.PlaneGeometry(s.w * PX, s.h * PX);
    geo.translate(0, (s.footY - s.h / 2) * PX, 0);

    const mat = new THREE.MeshStandardMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.u);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uFlash, uGrey, uDim, uDissolve, uRim; uniform vec3 uFlashColor, uDissolveColor, uRimColor, uGlow; uniform vec2 uPx;
          float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec2 pg = floor(vMapUv * uPx);
          float dEdge = 0.0;
          if (uDissolve > 0.0) {
            float n = h21(pg) * 0.7 + (1.0 - fract(vMapUv.y)) * 0.3;
            if (n < uDissolve) discard;
            dEdge = 1.0 - smoothstep(0.0, 0.1, n - uDissolve);
          }
          float rimEdge = 0.0;
          if (uRim > 0.0) {
            vec2 tx = 1.0 / uPx;
            float na = texture2D(map, vMapUv + vec2(tx.x, 0.0)).a * texture2D(map, vMapUv - vec2(tx.x, 0.0)).a
                     * texture2D(map, vMapUv + vec2(0.0, tx.y)).a * texture2D(map, vMapUv - vec2(0.0, tx.y)).a;
            rimEdge = (1.0 - step(0.5, na)) * uRim;
          }
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(0.8, 0.82, 0.9), uGrey) * uDim;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          normal = normalize(normal + (viewMatrix * vec4(0.0, 0.7, 0.0, 0.0)).xyz);`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
          gl_FragColor.rgb += (uGlow + 0.1) * diffuseColor.rgb + uRimColor * rimEdge + uDissolveColor * dEdge; // +0.1: readability floor
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor, uFlash);`);
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh.renderOrder = 10;
    this.body.add(this.mesh);
    this.yaw.add(this.body);
    this.root.add(this.yaw);

    const decal = (tex: THREE.Texture, size: number, additive: boolean, y: number, opacity = 1) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * (additive ? 1 : 0.42)), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, opacity, fog: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: true, polygonOffsetFactor: -2,
      }));
      m.rotation.x = -Math.PI / 2; m.position.y = y; m.renderOrder = additive ? 8 : 7;
      this.root.add(m);
      return m;
    };
    const w = Math.max(1.1, this.width);
    this.blob = decal(blobTex(), w * 1.3, false, 0.17, 0.9);
    this.ring = decal(ringTex(), w * 1.45, true, 0.19);
    this.glow = decal(glowTex(), w * 2.2, true, 0.18);
    this.ring.visible = this.glow.visible = false;

    for (let i = 0; i < 3; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: new THREE.Color(2.4, 2.1, 0.9), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      sp.scale.setScalar(0.32);
      this.stars.add(sp);
    }
    this.stars.visible = false;
    this.root.add(this.stars);
  }

  /** anchor in world space, relative to the unit's home (stable for UI) */
  anchor(which: 'head' | 'center' | 'feet', out: THREE.Vector3) {
    out.copy(this.home);
    if (which === 'feet') out.y += this.float * 0.5;
    else if (which === 'head') out.y += this.float + this.headH;
    else out.y += this.float + this.headH * 0.5;
    return out;
  }

  /** current world position of sprite centre (follows animation) */
  centerNow(out: THREE.Vector3) {
    this.root.updateMatrixWorld();
    return out.set(0, this.float + this.headH * 0.5, 0).applyMatrix4(this.root.matrixWorld);
  }

  update(time: number, dt: number, camYaw: number) {
    this.frameT += dt * this.fps;
    const f = this.ko ? 0 : Math.floor(this.frameT) % this.sheet.frames;
    if (f !== this.frame) { this.frame = f; }
    this.tex.offset.x = this.frame / this.sheet.frames;

    this.root.position.copy(this.home).add(this.offset);
    this.yaw.rotation.y = camYaw;
    const bob = this.float > 0 ? Math.sin(time * 2.2 + this.seed) * 0.12 * this.hoverAmt : 0;
    this.body.position.y = this.float + bob + this.lift;
    this.body.rotation.z = this.tilt;
    this.body.scale.set(1 / Math.sqrt(this.squash), this.squash, 1);

    const hgt = Math.max(0, this.body.position.y);
    const bs = 1 / (1 + hgt * 0.35);
    this.blob.scale.set(bs, bs, 1);
    (this.blob.material as THREE.MeshBasicMaterial).opacity = bs * (this.ko && this.def.side === 'enemy' ? 1 - this.u.uDissolve.value : 1);

    // decals
    this.ringK += ((this.targeted ? 1 : 0) - this.ringK) * Math.min(1, dt * 12);
    this.ring.visible = this.ringK > 0.01;
    if (this.ring.visible) {
      this.ring.rotation.z = time * 0.8;
      const s = 0.8 + 0.2 * this.ringK + 0.04 * Math.sin(time * 6);
      this.ring.scale.set(s, s, 1);
      (this.ring.material as THREE.MeshBasicMaterial).color.setRGB(2.2, 1.7, 0.7).multiplyScalar(this.ringK);
    }
    this.u.uRim.value = Math.max(this.ringK, this.rimBoost);
    this.glowK += ((this.active ? 1 : 0) - this.glowK) * Math.min(1, dt * 6);
    this.glow.visible = this.glowK > 0.01;
    if (this.glow.visible) {
      const p = 0.75 + 0.25 * Math.sin(time * 3);
      (this.glow.material as THREE.MeshBasicMaterial).color.setRGB(0.55, 0.8, 1.0).multiplyScalar(this.glowK * p * 0.9);
    }

    this.brokenK += ((this.broken && !this.ko ? 1 : 0) - this.brokenK) * Math.min(1, dt * 5);
    this.stars.visible = this.brokenK > 0.02;
    if (this.stars.visible) {
      const hy = this.float + this.headH * this.squash + 0.15;
      this.stars.children.forEach((s, i) => {
        const a = time * 3 + (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.45, hy + Math.sin(a * 2) * 0.05, Math.sin(a) * 0.3);
        s.scale.setScalar(0.3 * this.brokenK * (0.8 + 0.2 * Math.sin(time * 9 + i)));
      });
    }
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat) mat.dispose();
    });
    this.mesh.customDepthMaterial?.dispose();
    this.tex.dispose();
  }
}
