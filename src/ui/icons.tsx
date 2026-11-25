import type { ReactElement } from 'react';
import { ITEMS } from '../game/data/items';
import type { BuildShape } from '../game/data/buildables';

/** Hand-drawn SVG icon set for items and buildables (48x48 viewBox). */

function shapeSvg(shape: string, c1: string, c2: string): ReactElement {
  const stroke = 'rgba(0,0,0,0.55)';
  switch (shape) {
    case 'log':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <rect x="6" y="16" width="32" height="16" rx="3" fill={c1} />
          <path d="M10 20 h20 M12 27 h18" stroke="rgba(0,0,0,0.25)" />
          <ellipse cx="38" cy="24" rx="5" ry="8" fill={c2} />
          <ellipse cx="38" cy="24" rx="2.5" ry="4.5" fill="none" stroke="rgba(90,50,20,0.6)" />
        </g>
      );
    case 'stone':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M8 32 L12 18 L22 11 L34 14 L41 26 L36 37 L18 39 Z" fill={c1} />
          <path d="M14 20 L22 14 L30 16" fill="none" stroke={c2} strokeWidth="2" />
        </g>
      );
    case 'ore':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M8 32 L12 18 L22 11 L34 14 L41 26 L36 37 L18 39 Z" fill={c1} />
          <path d="M16 22 l4 -3 l3 4 l-4 3 Z M27 26 l5 -2 l2 5 l-5 2 Z M20 31 l3 -1 l1 3 l-3 1 Z M29 17 l3 0 l1 3 l-3 1 Z" fill={c2} />
        </g>
      );
    case 'ingot':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M6 32 L12 20 L38 20 L42 32 Z" fill={c1} />
          <path d="M12 20 L16 14 L36 14 L38 20 Z" fill={c2} />
        </g>
      );
    case 'fiber':
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <path d="M14 40 C16 28 12 18 10 8 M20 40 C21 28 20 16 22 6 M26 40 C26 28 28 18 32 8 M32 40 C30 30 34 20 38 12" fill="none" stroke={c1} strokeWidth="3" strokeLinecap="round" />
          <rect x="12" y="27" width="24" height="5" rx="2" fill={c2} />
        </g>
      );
    case 'gel':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M24 8 C30 18 38 22 38 30 C38 37 32 41 24 41 C16 41 10 37 10 30 C10 22 18 18 24 8 Z" fill={c1} />
          <ellipse cx="18" cy="28" rx="3" ry="5" fill={c2} opacity="0.8" stroke="none" />
        </g>
      );
    case 'pelt':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M14 8 L20 13 L28 13 L34 8 L36 18 L42 22 L36 28 L38 40 L28 35 L20 35 L10 40 L12 28 L6 22 L12 18 Z" fill={c1} />
          <path d="M18 20 L30 20 M17 26 L31 26" stroke={c2} strokeWidth="2" />
        </g>
      );
    case 'leather':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <rect x="8" y="12" width="32" height="24" rx="4" fill={c1} />
          <path d="M8 20 h32 M8 28 h32" stroke={c2} strokeWidth="1.5" strokeDasharray="3 2" />
        </g>
      );
    case 'crystal':
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <path d="M24 4 L30 14 L28 40 L20 40 L18 14 Z" fill={c1} />
          <path d="M24 4 L30 14 L24 16 L18 14 Z" fill={c2} />
          <path d="M12 18 L16 24 L15 40 L10 40 L8 24 Z" fill={c1} />
          <path d="M36 16 L40 23 L39 40 L33 40 L32 23 Z" fill={c1} />
        </g>
      );
    case 'essence':
      return (
        <g>
          <circle cx="24" cy="24" r="15" fill={c1} stroke={stroke} strokeWidth="1.5" />
          <path d="M24 12 C32 16 30 24 24 24 C18 24 16 32 24 36" fill="none" stroke={c2} strokeWidth="2.5" />
          <circle cx="19" cy="18" r="3" fill="white" opacity="0.6" />
        </g>
      );
    case 'fragment':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M8 12 L34 8 L40 22 L32 40 L12 36 L16 24 Z" fill={c1} />
          <path d="M16 18 L28 16 L26 28 L20 30" fill="none" stroke={c2} strokeWidth="2.2" />
        </g>
      );
    case 'berry':
      return (
        <g stroke={stroke} strokeWidth="1.2">
          <path d="M24 10 C30 6 36 8 38 12 C32 14 28 14 24 10 Z" fill={c2} />
          <circle cx="18" cy="26" r="7" fill={c1} />
          <circle cx="30" cy="26" r="7" fill={c1} />
          <circle cx="24" cy="35" r="7" fill={c1} />
          <circle cx="16" cy="24" r="2" fill="white" opacity="0.5" stroke="none" />
        </g>
      );
    case 'meat':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <ellipse cx="20" cy="22" rx="13" ry="10" fill={c1} transform="rotate(-30 20 22)" />
          <path d="M28 30 L38 40" stroke={c2} strokeWidth="5" strokeLinecap="round" />
          <circle cx="40" cy="38" r="3" fill={c2} />
          <circle cx="37" cy="42" r="3" fill={c2} />
        </g>
      );
    case 'salve':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <rect x="11" y="18" width="26" height="20" rx="4" fill={c2} />
          <rect x="9" y="12" width="30" height="8" rx="2" fill={c1} />
          <path d="M18 28 h12 M24 22 v12" stroke={c1} strokeWidth="3" />
        </g>
      );
    case 'potion':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M20 6 h8 v8 C36 17 38 24 38 29 C38 37 32 42 24 42 C16 42 10 37 10 29 C10 24 12 17 20 14 Z" fill="rgba(220,235,255,0.35)" />
          <path d="M11 28 C16 25 32 25 37 28 C37 36 31 41 24 41 C17 41 11 36 11 28 Z" fill={c1} stroke="none" />
          <rect x="19" y="4" width="10" height="5" rx="1" fill="#8a5a32" />
          <circle cx="18" cy="31" r="2.5" fill={c2} stroke="none" opacity="0.8" />
        </g>
      );
    case 'club':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M12 40 L28 16 C30 10 38 8 40 12 C42 16 38 22 32 22 L16 42 Z" fill={c1} />
          <path d="M14 40 L18 34" stroke={c2} strokeWidth="3" />
        </g>
      );
    case 'sword':
      return (
        <g stroke={stroke} strokeWidth="1.3">
          <path d="M36 6 L42 6 L42 12 L20 34 L14 28 Z" fill={c1} />
          <path d="M37 9 L20 31" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
          <path d="M10 26 L22 38 L19 41 L7 29 Z" fill="#b08a4a" />
          <path d="M14 34 L8 40" stroke={c2} strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    case 'axe':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M12 42 L32 12" stroke="#7a5230" strokeWidth="4" strokeLinecap="round" />
          <path d="M26 10 C32 4 42 6 42 14 C40 20 34 22 30 20 Z" fill={c1} />
        </g>
      );
    case 'pickaxe':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M14 42 L30 14" stroke="#7a5230" strokeWidth="4" strokeLinecap="round" />
          <path d="M8 16 C16 6 34 4 42 12 C36 10 24 10 16 18 Z" fill={c1} />
        </g>
      );
    case 'armor':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <path d="M14 8 L20 12 L28 12 L34 8 L42 14 L38 22 L36 20 L36 40 L12 40 L12 20 L10 22 L6 14 Z" fill={c1} />
          <path d="M20 12 L24 20 L28 12 M24 20 V40" fill="none" stroke={c2} strokeWidth="2" />
        </g>
      );
    case 'sigil':
      return (
        <g>
          <circle cx="24" cy="24" r="17" fill={c2} stroke={stroke} strokeWidth="1.5" />
          <circle cx="24" cy="24" r="12" fill="none" stroke={c1} strokeWidth="2" />
          <path d="M24 13 L28 24 L24 35 L20 24 Z M13 24 H35" fill="none" stroke={c1} strokeWidth="2" />
        </g>
      );
    case 'core':
      return (
        <g>
          <path d="M24 4 L40 16 L34 40 L14 40 L8 16 Z" fill="#3a3448" stroke={stroke} strokeWidth="1.5" />
          <path d="M24 12 L32 20 L24 34 L16 20 Z" fill={c1} />
          <circle cx="24" cy="22" r="4" fill={c2} />
        </g>
      );
    case 'scroll':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <rect x="10" y="10" width="28" height="28" fill={c1} />
          <rect x="7" y="7" width="34" height="6" rx="3" fill="#b8a77a" />
          <rect x="7" y="35" width="34" height="6" rx="3" fill="#b8a77a" />
          <path d="M15 19 h18 M15 24 h18 M15 29 h12" stroke="rgba(0,0,0,0.35)" />
          <circle cx="34" cy="30" r="4" fill={c2} />
        </g>
      );
    case 'brick':
      return (
        <g stroke={stroke} strokeWidth="1.3">
          <path d="M6 28 L14 20 H42 L34 28 Z" fill={c1} />
          <path d="M6 28 H34 V38 H6 Z" fill={c2} />
          <path d="M34 28 L42 20 V30 L34 38 Z" fill={c2} opacity="0.8" />
          <path d="M20 28 V38" stroke="rgba(0,0,0,0.3)" />
        </g>
      );
    case 'bone':
      return (
        <g stroke={stroke} strokeWidth="1.3">
          <path d="M14 34 L34 14" stroke={c1} strokeWidth="6" strokeLinecap="round" />
          <circle cx="11" cy="33" r="4" fill={c1} />
          <circle cx="15" cy="37" r="4" fill={c1} />
          <circle cx="33" cy="11" r="4" fill={c1} />
          <circle cx="37" cy="15" r="4" fill={c1} />
          <path d="M18 31 L31 18" stroke={c2} strokeWidth="1.5" />
        </g>
      );
    case 'charm':
      return (
        <g stroke={stroke} strokeWidth="1.3">
          <path d="M14 6 C18 18 30 18 34 6" fill="none" stroke="#8a6a4a" strokeWidth="2" />
          <path d="M24 16 L30 26 L24 42 L18 26 Z" fill={c1} />
          <circle cx="24" cy="26" r="3" fill={c2} />
        </g>
      );
    case 'ring':
      return (
        <g stroke={stroke} strokeWidth="1.3">
          <ellipse cx="24" cy="30" rx="13" ry="10" fill="none" stroke={c1} strokeWidth="5" />
          <path d="M24 10 L31 18 L24 25 L17 18 Z" fill={c2} />
          <path d="M24 12 L28 18 L24 22" fill="white" opacity="0.5" stroke="none" />
        </g>
      );
    case 'amulet':
      return (
        <g stroke={stroke} strokeWidth="1.3">
          <path d="M10 6 C12 20 36 20 38 6" fill="none" stroke="#c9a45c" strokeWidth="2" strokeDasharray="3 2" />
          <circle cx="24" cy="30" r="11" fill={c1} />
          <circle cx="24" cy="30" r="5.5" fill={c2} />
        </g>
      );
    case 'tome':
      return (
        <g stroke={stroke} strokeWidth="1.5">
          <rect x="10" y="7" width="27" height="34" rx="2" fill={c1} />
          <rect x="12" y="35" width="25" height="5" fill="#e9dcb5" />
          <path d="M23 15 L28 22 L23 29 L18 22 Z" fill={c2} />
          <rect x="10" y="7" width="4" height="34" fill="rgba(0,0,0,0.3)" stroke="none" />
        </g>
      );
    default:
      return <circle cx="24" cy="24" r="14" fill={c1} />;
  }
}

export function ItemIcon({ id, size = 40 }: { id: string; size?: number }) {
  const def = ITEMS[id];
  if (!def) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="item-icon">
      {shapeSvg(def.icon.shape, def.icon.c1, def.icon.c2 ?? def.icon.c1)}
    </svg>
  );
}

export function BuildIcon({ shape, material, size = 40 }: { shape: BuildShape; material: 'wood' | 'stone' | 'marble'; size?: number }) {
  const main = material === 'marble' ? '#ece6da' : material === 'stone' ? '#a7a196' : '#b57f48';
  const dark = material === 'marble' ? '#c9a45c' : material === 'stone' ? '#6f6a62' : '#6a4426';
  const s = 'rgba(0,0,0,0.6)';
  let body: ReactElement;
  switch (shape) {
    case 'foundation':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M6 22 L24 13 L42 22 L24 31 Z" fill={main} />
          <path d="M6 22 L6 32 L24 41 L24 31 Z" fill={dark} />
          <path d="M42 22 L42 32 L24 41 L24 31 Z" fill={dark} opacity="0.8" />
        </g>
      );
      break;
    case 'floor':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M6 24 L24 15 L42 24 L24 33 Z" fill={main} />
          <path d="M6 24 L6 27 L24 36 L42 27 L42 24 L24 33 Z" fill={dark} />
        </g>
      );
      break;
    case 'wall':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="10" y="8" width="28" height="32" fill={main} />
          <path d="M17 8 V40 M24 8 V40 M31 8 V40" stroke="rgba(0,0,0,0.3)" />
          <rect x="10" y="8" width="28" height="4" fill={dark} />
          <rect x="10" y="36" width="28" height="4" fill={dark} />
        </g>
      );
      break;
    case 'doorway':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M10 8 H38 V40 H30 V20 H18 V40 H10 Z" fill={main} />
        </g>
      );
      break;
    case 'window':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="10" y="8" width="28" height="32" fill={main} />
          <rect x="18" y="16" width="12" height="10" fill="#9ccfef" />
          <path d="M24 16 V26 M18 21 H30" stroke={dark} />
        </g>
      );
      break;
    case 'door':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="14" y="8" width="20" height="32" rx="2" fill={main} />
          <path d="M14 15 H34 M14 32 H34" stroke={dark} strokeWidth="2" />
          <circle cx="30" cy="24" r="1.8" fill="#333" />
        </g>
      );
      break;
    case 'roof':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M6 34 L24 12 L42 34 Z" fill="#9a4a2e" />
          <path d="M11 28 H37 M16 22 H32" stroke="rgba(0,0,0,0.3)" />
        </g>
      );
      break;
    case 'gable':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M8 38 L40 38 L40 14 Z" fill={main} />
        </g>
      );
      break;
    case 'stairs':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M8 40 V34 H16 V27 H24 V20 H32 V13 H40 V40 Z" fill={main} />
        </g>
      );
      break;
    case 'pillar':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="19" y="10" width="10" height="28" fill={main} />
          <rect x="16" y="6" width="16" height="5" fill={dark} />
          <rect x="16" y="37" width="16" height="5" fill={dark} />
        </g>
      );
      break;
    case 'fence':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="8" y="14" width="5" height="26" fill={dark} />
          <rect x="35" y="14" width="5" height="26" fill={dark} />
          <rect x="8" y="20" width="32" height="4" fill={main} />
          <rect x="8" y="30" width="32" height="4" fill={main} />
        </g>
      );
      break;
    case 'workbench':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="6" y="18" width="36" height="6" fill={main} />
          <rect x="9" y="24" width="4" height="16" fill={dark} />
          <rect x="35" y="24" width="4" height="16" fill={dark} />
          <path d="M14 18 L18 10 L22 18" fill="#888" />
          <rect x="26" y="12" width="10" height="6" fill="#777" />
        </g>
      );
      break;
    case 'campfire':
      body = (
        <g stroke={s} strokeWidth="1.2">
          <path d="M10 40 L38 32 M10 32 L38 40" stroke="#6a4426" strokeWidth="5" strokeLinecap="round" />
          <path d="M24 8 C30 16 34 22 30 30 C28 34 20 34 18 30 C14 22 20 18 24 8 Z" fill="#ff8a3a" />
          <path d="M24 18 C27 22 28 26 26 29 C24 31 22 30 21 28 C20 24 23 22 24 18 Z" fill="#ffd36a" />
        </g>
      );
      break;
    case 'furnace':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="10" y="14" width="28" height="26" fill="#8a857c" />
          <rect x="20" y="6" width="8" height="9" fill="#6f6a62" />
          <path d="M17 40 V28 C17 22 31 22 31 28 V40 Z" fill="#ff7a2a" />
        </g>
      );
      break;
    case 'chest':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="8" y="20" width="32" height="18" fill={main} />
          <path d="M8 20 C8 10 40 10 40 20 Z" fill={dark} />
          <rect x="21" y="18" width="6" height="7" fill="#c9a45c" />
        </g>
      );
      break;
    case 'bed':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="6" y="24" width="36" height="10" fill={dark} />
          <rect x="6" y="14" width="5" height="22" fill={dark} />
          <rect x="11" y="20" width="10" height="5" rx="2" fill="#eee4cc" />
          <rect x="21" y="19" width="21" height="6" fill="#9a2c2c" />
        </g>
      );
      break;
    case 'torch':
      body = (
        <g stroke={s} strokeWidth="1.2">
          <rect x="22" y="18" width="4" height="24" fill={dark} />
          <path d="M24 4 C29 10 30 14 27 18 H21 C18 14 19 10 24 4 Z" fill="#ff9a3a" />
        </g>
      );
      break;
    case 'table':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="6" y="18" width="36" height="5" fill={main} />
          <rect x="10" y="23" width="4" height="17" fill={dark} />
          <rect x="34" y="23" width="4" height="17" fill={dark} />
        </g>
      );
      break;
    case 'chair':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="15" y="8" width="4" height="32" fill={dark} />
          <rect x="15" y="24" width="18" height="4" fill={main} />
          <rect x="29" y="28" width="4" height="12" fill={dark} />
        </g>
      );
      break;
    case 'banner':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="12" y="4" width="3" height="40" fill={dark} />
          <path d="M15 8 H36 V30 L26 25 L15 30 Z" fill="#2c4a8a" />
          <circle cx="25" cy="16" r="3.5" fill="#c9a45c" />
        </g>
      );
      break;
    case 'road':
      body = (
        <g stroke={s} strokeWidth="1.2">
          <path d="M4 30 L24 20 L44 30 L24 40 Z" fill={material === 'stone' ? '#9a948a' : '#8a6e4a'} />
          <path d="M12 30 L24 24 L36 30 L24 36 Z" fill="none" stroke="rgba(0,0,0,0.35)" strokeDasharray="3 2" />
        </g>
      );
      break;
    case 'bridge':
      body = (
        <g stroke={s} strokeWidth="1.3">
          <path d="M4 30 Q24 20 44 30 L44 34 Q24 24 4 34 Z" fill={main} />
          <path d="M8 29 V20 M16 25 V16 M24 23 V14 M32 25 V16 M40 29 V20" stroke={dark} strokeWidth="2" />
          <path d="M8 20 Q24 10 40 20" fill="none" stroke={dark} strokeWidth="2" />
          <path d="M4 40 Q24 36 44 40" fill="none" stroke="#4a9ad0" strokeWidth="2" />
        </g>
      );
      break;
    case 'castle_wall':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <path d="M6 14 H12 V18 H18 V14 H24 V18 H30 V14 H36 V18 H42 V14 H42 V42 H6 Z" fill="#9a948a" />
          <path d="M6 26 H42 M6 34 H42 M16 18 V26 M28 26 V34 M20 34 V42 M34 18 V26" stroke="rgba(0,0,0,0.3)" />
        </g>
      );
      break;
    case 'tower':
      body = (
        <g stroke={s} strokeWidth="1.5">
          <rect x="14" y="14" width="20" height="30" fill="#9a948a" />
          <path d="M11 8 H16 V12 H21 V8 H27 V12 H32 V8 H37 V15 H11 Z" fill="#7d776c" />
          <path d="M24 2 C27 5 27 7 24 9 C21 7 21 5 24 2 Z" fill="#ff9a3a" />
          <rect x="21" y="22" width="6" height="8" rx="3" fill="#2a2420" />
        </g>
      );
      break;
    case 'bookshelf':
      body = (
        <g stroke={s} strokeWidth="1.3">
          <rect x="10" y="6" width="28" height="36" fill={dark} />
          <rect x="13" y="9" width="4" height="9" fill="#a83a2e" />
          <rect x="18" y="10" width="4" height="8" fill="#3a5a8a" />
          <rect x="23" y="9" width="3" height="9" fill="#8a7a3a" />
          <rect x="13" y="22" width="5" height="9" fill="#3a6a3a" />
          <rect x="19" y="21" width="4" height="10" fill="#a83a2e" />
          <rect x="27" y="22" width="6" height="9" fill="#5a3a8a" />
          <path d="M10 19 H38 M10 32 H38" stroke={main} strokeWidth="2" />
        </g>
      );
      break;
    case 'rug':
      body = (
        <g stroke={s} strokeWidth="1.3">
          <path d="M4 28 L24 18 L44 28 L24 38 Z" fill="#9a2c2c" />
          <path d="M12 28 L24 22 L36 28 L24 34 Z" fill="none" stroke="#d9b56e" strokeWidth="1.5" />
        </g>
      );
      break;
    case 'planter':
      body = (
        <g stroke={s} strokeWidth="1.3">
          <path d="M14 30 H34 L31 42 H17 Z" fill="#6f6a62" />
          <circle cx="24" cy="20" r="9" fill="#4f8a34" />
          <circle cx="19" cy="15" r="2.5" fill="#e86a8a" />
          <circle cx="28" cy="14" r="2.5" fill="#e86a8a" />
          <circle cx="25" cy="22" r="2.5" fill="#ffd36a" />
        </g>
      );
      break;
    case 'lantern':
      body = (
        <g stroke={s} strokeWidth="1.3">
          <rect x="17" y="8" width="3" height="34" fill={dark} />
          <path d="M20 9 H32" stroke="#55504a" strokeWidth="2" />
          <rect x="27" y="12" width="9" height="11" rx="2" fill="#ffd28a" />
          <rect x="14" y="40" width="9" height="4" fill="#6f6a62" />
        </g>
      );
      break;
    default:
      body = <rect x="10" y="10" width="28" height="28" fill={main} />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="item-icon">
      {body}
    </svg>
  );
}
