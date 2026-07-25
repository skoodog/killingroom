// Rotating canvas minimap: the Waller grid, the lake, landmarks, traffic
// and everybody near you.

import { NS_STREETS, EW_STREETS, LAKE_NORTH, LAKE_SOUTH, PARKS, BOUNDS, polyZAt } from '../world/austin.js';
import { clamp } from '../core/mathx.js';

const RANGE = 170;   // metres shown across the map radius

export class Minimap {
  constructor(canvas, world, player) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.player = player;
    this.acc = 0;
    this.compass = document.getElementById('compass');
  }

  update(dt, game) {
    this.acc += dt;
    if (this.acc < 1 / 22) return;
    this.acc = 0;

    const c = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const R = W / 2;
    const p = this.player;
    const scale = R / RANGE;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);

    c.save();
    c.beginPath();
    c.arc(R, R, R - 2, 0, Math.PI * 2);
    c.clip();

    c.fillStyle = '#14171d';
    c.fillRect(0, 0, W, H);

    c.translate(R, R);
    c.rotate(p.yaw);          // north-up rotates with the player's heading
    c.scale(scale, scale);
    c.translate(-p.pos.x, -p.pos.z);

    const x0 = p.pos.x - RANGE * 1.5, x1 = p.pos.x + RANGE * 1.5;
    const z0 = p.pos.z - RANGE * 1.5, z1 = p.pos.z + RANGE * 1.5;

    // parks
    c.fillStyle = '#25341f';
    for (const park of PARKS) {
      const r = park.rect;
      if (r.x1 < x0 || r.x0 > x1 || r.z1 < z0 || r.z0 > z1) continue;
      c.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    }

    // water
    if (z1 > 30 && z0 < 480) {
      c.fillStyle = '#16302b';
      c.beginPath();
      c.moveTo(LAKE_NORTH[0].x, LAKE_NORTH[0].z);
      for (const q of LAKE_NORTH) c.lineTo(q.x, q.z);
      for (let i = LAKE_SOUTH.length - 1; i >= 0; i--) c.lineTo(LAKE_SOUTH[i].x, LAKE_SOUTH[i].z);
      c.closePath();
      c.fill();
    }

    // streets
    c.lineCap = 'butt';
    for (const s of NS_STREETS) {
      if (s.x < x0 || s.x > x1) continue;
      c.strokeStyle = s.arterial ? '#4e5561' : '#3b4048';
      c.lineWidth = s.w * 0.85;
      c.beginPath();
      c.moveTo(s.x, EW_STREETS[0].z - 40);
      c.lineTo(s.x, EW_STREETS[EW_STREETS.length - 1].z + 40);
      c.stroke();
    }
    for (const s of EW_STREETS) {
      if (s.z < z0 || s.z > z1) continue;
      c.strokeStyle = s.nightlife ? '#5a4a3a' : s.arterial ? '#4e5561' : '#3b4048';
      c.lineWidth = s.w * 0.85;
      c.beginPath();
      c.moveTo(NS_STREETS[0].x - 40, s.z);
      c.lineTo(NS_STREETS[NS_STREETS.length - 1].x + 40, s.z);
      c.stroke();
    }

    // landmark footprints
    c.fillStyle = 'rgba(255,181,61,0.55)';
    for (const L of this.world.landmarkPos || []) {
      if (L.x < x0 || L.x > x1 || L.z < z0 || L.z > z1) continue;
      const s = clamp(L.h / 12, 5, 22);
      c.fillRect(L.x - s / 2, L.z - s / 2, s, s);
    }

    // crowd
    const crowd = game.crowd;
    if (crowd) {
      for (const a of crowd.agents) {
        if (!a.alive) continue;
        if (a.x < x0 || a.x > x1 || a.z < z0 || a.z > z1) continue;
        c.fillStyle = a.cop ? '#59a6ff' : a.state === 2 ? '#8a2a2a' : '#c9c4b6';
        c.fillRect(a.x - 2.2, a.z - 2.2, 4.4, 4.4);
      }
    }
    // traffic
    if (game.traffic) {
      c.fillStyle = '#7d8590';
      for (const v of game.traffic.cars) {
        if (v.x < x0 || v.x > x1 || v.z < z0 || v.z > z1) continue;
        c.fillRect(v.x - 2, v.z - 2, 4, 4);
      }
    }

    c.restore();

    // player arrow
    c.save();
    c.translate(R, R);
    c.fillStyle = '#ffb53d';
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6.5, 8);
    c.lineTo(0, 4.5);
    c.lineTo(-6.5, 8);
    c.closePath();
    c.fill();
    c.restore();

    // view cone
    c.save();
    c.translate(R, R);
    c.fillStyle = 'rgba(255,181,61,0.10)';
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, R * 0.9, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
    c.closePath();
    c.fill();
    c.restore();

    if (this.compass) {
      const deg = ((-this.player.yaw * 180) / Math.PI + 360) % 360;
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      this.compass.textContent = dirs[Math.round(deg / 45) % 8];
    }
  }
}
