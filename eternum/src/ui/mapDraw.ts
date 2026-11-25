import { WORLD } from '../game/config';
import { LOCATIONS } from '../game/data/locations';
import { EXPLORE_RES } from '../game/systems/Discovery';
import type { Game } from '../game/Game';

let fogCanvas: HTMLCanvasElement | null = null;
let fogData: ImageData | null = null;

function updateFog(game: Game): HTMLCanvasElement {
  if (!fogCanvas) {
    fogCanvas = document.createElement('canvas');
    fogCanvas.width = fogCanvas.height = EXPLORE_RES;
    fogData = fogCanvas.getContext('2d')!.createImageData(EXPLORE_RES, EXPLORE_RES);
  }
  const ex = game.discovery.explored;
  const d = fogData!.data;
  for (let i = 0; i < ex.length; i++) {
    d[i * 4] = 18;
    d[i * 4 + 1] = 17;
    d[i * 4 + 2] = 14;
    d[i * 4 + 3] = ex[i] ? 0 : 235;
  }
  fogCanvas.getContext('2d')!.putImageData(fogData!, 0, 0);
  return fogCanvas;
}

export interface MapDrawOpts {
  fog: boolean;
  labels: boolean;
  enemies: boolean;
  scale: number; // UI scale for markers
}

/** Draws the world map centred on (cx, cz) showing `span` metres across the canvas width. */
export function drawWorldMap(ctx: CanvasRenderingContext2D, game: Game, cx: number, cz: number, span: number, W: number, H: number, opts: MapDrawOpts) {
  const img = game.mapImage;
  ctx.fillStyle = '#16150f';
  ctx.fillRect(0, 0, W, H);
  if (!img) return;
  const pxPerM = img.width / WORLD.size;
  const spanZ = span * (H / W);
  const sx = (cx + WORLD.size / 2) * pxPerM - (span * pxPerM) / 2;
  const sy = (cz + WORLD.size / 2) * pxPerM - (spanZ * pxPerM) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, sx, sy, span * pxPerM, spanZ * pxPerM, 0, 0, W, H);
  if (opts.fog) {
    const fog = updateFog(game);
    const f = EXPLORE_RES / WORLD.size;
    ctx.drawImage(fog, (cx + WORLD.size / 2) * f - (span * f) / 2, (cz + WORLD.size / 2) * f - (spanZ * f) / 2, span * f, spanZ * f, 0, 0, W, H);
  }
  const toX = (x: number) => ((x - cx) / span) * W + W / 2;
  const toY = (z: number) => ((z - cz) / spanZ) * H + H / 2;
  const s = opts.scale;
  const st = game.state;
  const t = performance.now() / 1000;

  // Buildings
  ctx.fillStyle = 'rgba(255,240,210,0.85)';
  for (const p of game.building.pieces.values()) {
    if (p.def.snap !== 'cell' && p.def.snap !== 'free') continue;
    const x = toX(p.state.x);
    const y = toY(p.state.z);
    if (x < -5 || y < -5 || x > W + 5 || y > H + 5) continue;
    const r = Math.max(1.5, (2 / span) * W * 0.5);
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Locations
  ctx.font = `${Math.round(11 * s)}px "Noto Sans KR", sans-serif`;
  ctx.textAlign = 'center';
  for (const loc of LOCATIONS) {
    const discovered = st.discovered.includes(loc.id);
    const revealed = st.revealed.includes(loc.id);
    if (!discovered && !revealed) continue;
    const x = toX(loc.x);
    const y = toY(loc.z);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const r = 5 * s;
    ctx.save();
    ctx.translate(x, y);
    if (discovered) {
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = loc.kind === 'shrine' ? '#5fe0d8' : '#e9c46a';
      ctx.strokeStyle = '#1a140a';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.strokeRect(-r, -r, r * 2, r * 2);
    } else {
      ctx.fillStyle = `rgba(233,196,106,${0.5 + Math.sin(t * 4) * 0.3})`;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a140a';
      ctx.fillText('?', 0, 4 * s);
    }
    ctx.restore();
    if (opts.labels) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(discovered ? loc.name : '???', x + 1, y - r - 5 + 1);
      ctx.fillStyle = '#f1e6c8';
      ctx.fillText(discovered ? loc.name : '???', x, y - r - 5);
    }
  }

  // Spawn point
  const sp = st.player.spawn;
  if (sp) {
    const x = toX(sp.x);
    const y = toY(sp.z);
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 6 * s);
    ctx.lineTo(x + 5 * s, y);
    ctx.lineTo(x + 3.5 * s, y);
    ctx.lineTo(x + 3.5 * s, y + 4 * s);
    ctx.lineTo(x - 3.5 * s, y + 4 * s);
    ctx.lineTo(x - 3.5 * s, y);
    ctx.lineTo(x - 5 * s, y);
    ctx.closePath();
    ctx.fill();
  }

  // Enemies
  if (opts.enemies) {
    for (const e of game.enemies.list) {
      if (e.state === 'dead') continue;
      const x = toX(e.body.pos.x);
      const y = toY(e.body.pos.z);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillStyle = e.def.boss ? '#ff3a3a' : e.aggro ? '#ff6a4a' : '#d8a040';
      ctx.beginPath();
      ctx.arc(x, y, (e.def.boss ? 5 : 2.6) * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffe27a';
    for (const p of game.pickups.list) {
      const x = toX(p.pos.x);
      const y = toY(p.pos.z);
      if (x < 0 || y < 0 || x > W || y > H) continue;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
  }

  // Player arrow + view cone
  const pp = game.player.body.pos;
  const px = toX(pp.x);
  const py = toY(pp.z);
  const camYaw = game.cameraRig.yaw;
  ctx.save();
  ctx.translate(px, py);
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, 34 * s);
  grd.addColorStop(0, 'rgba(255,240,200,0.35)');
  grd.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  const ca = Math.atan2(Math.cos(camYaw), Math.sin(camYaw));
  ctx.arc(0, 0, 34 * s, ca - 0.6, ca + 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-game.player.yaw + Math.PI);
  ctx.fillStyle = '#fff6e0';
  ctx.strokeStyle = '#2a1e0a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -8 * s);
  ctx.lineTo(5.5 * s, 6 * s);
  ctx.lineTo(0, 3 * s);
  ctx.lineTo(-5.5 * s, 6 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
