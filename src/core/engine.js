// Renderer, scene, camera, lights and the frame loop.

import * as THREE from 'three';
import { clamp } from './mathx.js';

export class Engine {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;

    const tier = settings.tier;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: tier.antialias,
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setClearColor(0x8fb6d8, 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = settings.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;

    this.maxAnisotropy = Math.min(
      tier.anisotropy,
      this.renderer.capabilities.getMaxAnisotropy?.() || 1
    );

    this.scene = new THREE.Scene();
    this.scene.matrixWorldAutoUpdate = true;

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.12, tier.drawDistance * 1.15);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    // --- lighting rig -------------------------------------------------
    // One sun + one hemisphere bounce. Cheap, and with good colour choices
    // it reads far better than a pile of point lights.
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.position.set(-160, 260, 140);
    this.sun.castShadow = settings.shadows;
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.configureShadow();
    this.scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight(0xbcd8f5, 0x6b6152, 1.15);
    this.scene.add(this.hemi);

    this.fog = new THREE.Fog(0xc8d8e6, tier.fogNear, tier.fogFar);
    this.scene.fog = this.fog;

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frame = 0;
    this.dt = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._raf = 0;
    this._running = false;
    this._updaters = [];
    this._lastSize = [0, 0, 0];

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);

    settings.onChange((what) => {
      if (what === 'tier') this.applyTier();
      if (what === 'shadows') this.applyShadowToggle();
    });

    this.resize(true);
  }

  configureShadow() {
    const t = this.settings.tier;
    const cam = this.sun.shadow.camera;
    const d = t.shadowDistance;
    cam.left = -d; cam.right = d; cam.top = d; cam.bottom = -d;
    cam.near = 1; cam.far = d * 4.2;
    cam.updateProjectionMatrix();
    this.sun.shadow.mapSize.set(t.shadowMapSize, t.shadowMapSize);
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.55;
    this.sun.shadow.blurSamples = 8;
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
  }

  applyTier() {
    const t = this.settings.tier;
    this.camera.far = t.drawDistance * 1.15;
    this.camera.updateProjectionMatrix();
    this.fog.near = t.fogNear;
    this.fog.far = t.fogFar;
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.sun.castShadow = this.settings.shadows;
    this.maxAnisotropy = Math.min(t.anisotropy, this.renderer.capabilities.getMaxAnisotropy?.() || 1);
    this.configureShadow();
    this.resize(true);
  }

  applyShadowToggle() {
    this.renderer.shadowMap.enabled = this.settings.shadows;
    this.sun.castShadow = this.settings.shadows;
    this.scene.traverse((o) => { if (o.isMesh) o.material && (o.material.needsUpdate = true); });
  }

  /** Keep the shadow frustum tight around the player. */
  followShadow(x, y, z) {
    const t = this.settings.tier;
    const d = t.shadowDistance;
    // Snap to texel grid so shadows don't shimmer while walking.
    const texel = (d * 2) / t.shadowMapSize;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    this.sunTarget.position.set(sx, y, sz);
    this.sunTarget.updateMatrixWorld();
    const dir = this._sunDir || (this._sunDir = new THREE.Vector3(-0.5, 0.8, 0.35));
    this.sun.position.set(sx + dir.x * d * 2.4, y + dir.y * d * 2.4, sz + dir.z * d * 2.4);
    this.sun.updateMatrixWorld();
  }

  setSunDirection(dir) {
    this._sunDir = dir.clone().normalize();
  }

  resize(force = false) {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    const s = this.settings;
    const dpr = clamp(
      (window.devicePixelRatio || 1) * s.tier.pixelRatio * s.renderScale,
      0.4,
      s.tier.maxPixelRatio
    );
    const [lw, lh, ld] = this._lastSize;
    if (!force && lw === w && lh === h && Math.abs(ld - dpr) < 1e-3) return;
    this._lastSize = [w, h, dpr];

    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Slightly wider FOV on very narrow screens so phones aren't claustrophobic.
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h, dpr);
  }

  add(fn) { this._updaters.push(fn); return fn; }
  remove(fn) { const i = this._updaters.indexOf(fn); if (i >= 0) this._updaters.splice(i, 1); }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    const loop = () => {
      this._raf = requestAnimationFrame(loop);
      this.tick();
    };
    this._raf = requestAnimationFrame(loop);
  }

  stop() {
    this._running = false;
    cancelAnimationFrame(this._raf);
  }

  tick() {
    // Clamp dt so a background tab doesn't teleport everything on return.
    const raw = this.clock.getDelta();
    const dt = Math.min(raw, 0.1);
    this.dt = dt;
    this.elapsed += dt;
    this.frame++;

    const ms = raw * 1000;
    this._fpsAcc += ms; this._fpsFrames++;
    if (this._fpsAcc > 400) {
      this.fps = (this._fpsFrames * 1000) / this._fpsAcc;
      this._fpsAcc = 0; this._fpsFrames = 0;
    }
    if (this.settings.tickAdaptive(ms)) this.resize(true);

    this.renderer.info.reset();
    for (let i = 0; i < this._updaters.length; i++) this._updaters[i](dt, this.elapsed);
    this.renderer.render(this.scene, this.camera);
  }

  get drawCalls() { return this.renderer.info.render.calls; }
  get triangles() { return this.renderer.info.render.triangles; }

  dispose() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.renderer.dispose();
  }
}
