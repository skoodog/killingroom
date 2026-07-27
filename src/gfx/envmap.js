// A sky reflection for the glass.
//
// Until now a curtain wall was lit but reflected nothing, which is why it
// never read as glass: the thing that identifies glass at a distance is not
// its colour, it is that it carries an image of the sky and goes dark where
// it faces the ground.
//
// This is a tiny procedural cube — six 32px faces painted from the same
// colours the sky shader is already using, so the reflection tracks the time
// of day for free. It costs a few kilobytes of texture and one repaint every
// few in-game minutes.
//
// It deliberately does NOT reflect the city. Real reflections of geometry
// need a cube camera per surface or a screen-space pass, neither of which
// this renderer has. A sky-only reflection is the honest 90% — it makes glass
// read correctly against the sky and at grazing angles, and it will never
// show you a building that isn't there.

import * as THREE from 'three';

const FACE = 32;

function faceCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = FACE;
  return c;
}

const hex = (c) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

export class SkyEnvironment {
  constructor() {
    // three's cube face order: +X, -X, +Y, -Y, +Z, -Z
    this.faces = [faceCanvas(), faceCanvas(), faceCanvas(), faceCanvas(), faceCanvas(), faceCanvas()];
    this.texture = new THREE.CubeTexture(this.faces);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
    this._lastHour = -99;
  }

  /**
   * Repaint if the sky has moved enough to matter. Called every frame; does
   * nothing on almost all of them.
   */
  update(sky, force = false) {
    const h = sky.hour;
    if (!force && Math.abs(h - this._lastHour) < 0.06) return;
    this._lastHour = h;

    const zenith = sky.hemiSky;
    const horizon = sky.fogColor;
    const ground = sky.hemiGround;

    // sides: horizon at the bottom, zenith at the top
    for (const i of [0, 1, 4, 5]) {
      const x = this.faces[i].getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, FACE);
      g.addColorStop(0, hex(zenith));
      g.addColorStop(0.52, hex(horizon));
      g.addColorStop(1, hex(ground));
      x.fillStyle = g;
      x.fillRect(0, 0, FACE, FACE);
    }
    // up: zenith, lifted slightly so glass catches a highlight
    const up = this.faces[2].getContext('2d');
    up.fillStyle = hex(zenith);
    up.fillRect(0, 0, FACE, FACE);
    const gu = up.createRadialGradient(FACE / 2, FACE / 2, 0, FACE / 2, FACE / 2, FACE * 0.6);
    gu.addColorStop(0, 'rgba(255,255,255,0.35)');
    gu.addColorStop(1, 'rgba(255,255,255,0)');
    up.fillStyle = gu;
    up.fillRect(0, 0, FACE, FACE);
    // down: the street
    const dn = this.faces[3].getContext('2d');
    dn.fillStyle = hex(ground);
    dn.fillRect(0, 0, FACE, FACE);

    this.texture.needsUpdate = true;
  }

  dispose() { this.texture.dispose(); }
}
