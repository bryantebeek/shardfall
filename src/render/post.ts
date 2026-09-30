// Post chain: scene -> bloom -> tilt-shift (H,V) -> ACES + sRGB (OutputPass) -> grade/vignette/flash.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const tiltShader = (): THREE.ShaderMaterialParameters & { uniforms: Record<string, THREE.IUniform> } => ({
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2(1, 0) },
    uFocus: { value: 0.5 }, uBand: { value: 0.12 }, uFalloff: { value: 0.3 },
    uMax: { value: 2.5 }, uMin: { value: 0 }, uTopBias: { value: 1.2 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uFocus, uBand, uFalloff, uMax, uMin, uTopBias;
    varying vec2 vUv;
    void main() {
      float d = vUv.y - uFocus;
      d *= d > 0.0 ? uTopBias : 1.0;
      float b = max(uMin, smoothstep(uBand, uBand + uFalloff, abs(d))) * uMax;
      if (b < 0.05) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 st = uDir * b;
      // interleaved-gradient jitter hides the sparse-tap grid pattern
      float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;
      vec2 uv = vUv + st * j;
      vec4 s = texture2D(tDiffuse, uv) * 0.1624;
      s += (texture2D(tDiffuse, uv + st * 1.0) + texture2D(tDiffuse, uv - st * 1.0)) * 0.1448;
      s += (texture2D(tDiffuse, uv + st * 2.0) + texture2D(tDiffuse, uv - st * 2.0)) * 0.1098;
      s += (texture2D(tDiffuse, uv + st * 3.0) + texture2D(tDiffuse, uv - st * 3.0)) * 0.0706;
      s += (texture2D(tDiffuse, uv + st * 4.0) + texture2D(tDiffuse, uv - st * 4.0)) * 0.0386;
      s += (texture2D(tDiffuse, uv + st * 5.0) + texture2D(tDiffuse, uv - st * 5.0)) * 0.0179;
      s += (texture2D(tDiffuse, uv + st * 6.0) + texture2D(tDiffuse, uv - st * 6.0)) * 0.0071;
      gl_FragColor = s / 0.9440;
    }`,
});

const gradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uLift: { value: new THREE.Color(0, 0, 0) }, uGain: { value: new THREE.Color(1, 1, 1) }, uSat: { value: 1 },
    uVignette: { value: 0.45 }, uDarken: { value: 0 }, uFlash: { value: new THREE.Color(0, 0, 0) },
    uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uLift, uGain, uFlash; uniform float uSat, uVignette, uDarken, uTime; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // lift shadows toward the theme tint, warm/gain the highlights
      c = c * mix(vec3(1.0), uGain, smoothstep(0.35, 1.0, l)) + uLift * (1.0 - smoothstep(0.0, 0.55, l));
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      // soft S-curve
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.25);
      vec2 d = (vUv - 0.5) * vec2(1.0, 0.85);
      float v = smoothstep(0.78, 0.2, length(d));
      c *= mix(1.0 - uVignette, 1.0, v);
      c *= 1.0 - uDarken * (0.55 + 0.45 * (1.0 - v));
      c += uFlash;
      c += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.018;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  tiltH: ShaderPass; tiltV: ShaderPass;
  grade: ShaderPass;
  output: OutputPass;
  private renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.4, 0.92);
    this.composer.addPass(this.bloom);
    this.tiltH = new ShaderPass(tiltShader());
    this.tiltV = new ShaderPass(tiltShader());
    this.tiltV.uniforms.uDir.value.set(0, 1);
    this.composer.addPass(this.tiltH);
    this.composer.addPass(this.tiltV);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
    this.grade = new ShaderPass(gradeShader);
    this.composer.addPass(this.grade);
  }

  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    const px = this.renderer.getPixelRatio();
    // blur step expressed in UV per (CSS) pixel so the look is resolution independent
    this.tiltH.uniforms.uDir.value.set(1 / w, 0);
    this.tiltV.uniforms.uDir.value.set(0, 1 / h);
    this.grade.uniforms.uRes.value.set(w * px, h * px);
  }

  /** focus: screen-space v (0 bottom..1 top); blur: max step in px; min: 0..1 blur everywhere */
  setTilt(focus: number, band: number, falloff: number, blur: number, min: number) {
    for (const p of [this.tiltH, this.tiltV]) {
      const u = p.uniforms;
      u.uFocus.value = focus; u.uBand.value = band; u.uFalloff.value = falloff; u.uMax.value = blur; u.uMin.value = min;
    }
  }

  render() { this.composer.render(); }
}
