import type { Cost } from './recipes';

export type LocationKind = 'camp' | 'tower' | 'stones' | 'shrine' | 'crystal' | 'wreck';

export interface LocationDef {
  id: string;
  name: string;
  subtitle: string;
  kind: LocationKind;
  x: number;
  z: number;
  discoverRadius: number;
  flatRadius: number;
  /** Force terrain height in the flattened zone (otherwise sampled). */
  flatHeight?: number;
  xp: number;
  lore: { title: string; text: string };
  chest?: { items: Cost[] };
  /** Reading this location's lore reveals another location on the map. */
  reveals?: string;
}

export const LOCATIONS: LocationDef[] = [
  {
    id: 'spawn_camp', name: '잿불 야영지', subtitle: '모든 여정이 시작되는 곳', kind: 'camp', x: 0, z: 150, discoverRadius: 18, flatRadius: 22, xp: 0,
    lore: {
      title: '방랑자의 일지',
      text:
        '바다가 나를 이 섬에 토해냈다. 배도, 동료도 없다. 남은 것은 꺼져가는 불씨 하나뿐.\n\n' +
        '숲에는 나무가, 고원에는 광석이 있다. 살아남으려면 도구를 만들고, 몸을 누일 곳을 지어야 한다.\n\n' +
        '북쪽 산맥 너머로 무너진 석조 건물들이 보인다. 이곳에는 오래전 거대한 문명이 있었던 것 같다. 사람들은 그것을 "에테르눔"이라 불렀다고 한다.',
    },
  },
  {
    id: 'old_watchtower', name: '무너진 감시탑', subtitle: '숲을 지키던 옛 파수꾼의 탑', kind: 'tower', x: 175, z: 55, discoverRadius: 20, flatRadius: 16, xp: 60,
    lore: {
      title: '파수꾼의 마지막 기록',
      text:
        '"수정이 노래를 멈춘 날, 산의 수호자들이 깨어났다. 그들은 더 이상 우리를 지키지 않는다."\n\n' +
        '돌판 아래에는 문양이 새겨진 파편이 숨겨져 있었다. 신전의 제단과 같은 문양이다.',
    },
    chest: { items: [{ item: 'ancient_fragment', qty: 1 }, { item: 'copper_ingot', qty: 3 }, { item: 'healing_salve', qty: 2 }] },
  },
  {
    id: 'standing_stones', name: '속삭이는 선돌', subtitle: '바람이 옛 노래를 부르는 곳', kind: 'stones', x: -165, z: 95, discoverRadius: 20, flatRadius: 18, xp: 60, reveals: 'sunken_shrine',
    lore: {
      title: '선돌의 비문',
      text:
        '"에테르눔의 아이들이여, 영원은 돌이 아니라 이어짐 속에 있다.\n집을 짓고, 불을 지피고, 이웃을 맞이하라. 그것이 문명이니."\n\n' +
        '비문 아래에 북쪽 고원을 가리키는 지도가 새겨져 있다. 가라앉은 신전의 위치가 지도에 표시되었다.',
    },
  },
  {
    id: 'sunken_shrine', name: '가라앉은 신전', subtitle: '수호자가 잠든 고대의 제단', kind: 'shrine', x: -45, z: -175, discoverRadius: 24, flatRadius: 24, xp: 100,
    lore: {
      title: '제단의 석판',
      text:
        '"수호자는 인장에 응답한다. 수정의 울림, 어둠의 정수, 그리고 옛 문양의 조각을 하나로 엮어라."\n\n' +
        '고대 인장의 제작법을 깨달았다. (작업대: 공명 수정 2, 어둠의 정수 3, 고대 파편 1, 돌 10)\n\n' +
        '인장을 제단에 바치면 폐허의 수호자가 깨어난다. 충분히 준비한 뒤에 도전하라.',
    },
  },
  {
    id: 'crystal_hollow', name: '공명의 골짜기', subtitle: '수정이 아직 노래하는 골짜기', kind: 'crystal', x: 165, z: -140, discoverRadius: 24, flatRadius: 20, xp: 80,
    lore: {
      title: '공명하는 수정',
      text:
        '거대한 수정들이 낮게 웅웅거린다. 귀를 기울이면 수많은 사람들의 웃음소리 같은 것이 들린다.\n\n' +
        '주변의 작은 수정 광맥은 구리 곡괭이 이상의 도구로 캘 수 있을 것 같다.',
    },
  },
  {
    id: 'shipwreck', name: '난파선', subtitle: '당신을 이곳에 데려온 배의 잔해', kind: 'wreck', x: -110, z: 268, discoverRadius: 22, flatRadius: 18, flatHeight: 1.3, xp: 50,
    lore: {
      title: '젖은 항해 일지',
      text: '"폭풍이 우리를 지도에 없는 섬으로 이끌었다. 섬의 중심에서 푸른 빛이 맥동한다..."\n\n나머지 글씨는 바닷물에 번져 읽을 수 없다.',
    },
    chest: { items: [{ item: 'wood', qty: 20 }, { item: 'fiber', qty: 10 }, { item: 'health_potion', qty: 1 }] },
  },
];

export const LOCATION_BY_ID: Record<string, LocationDef> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l]));

export const BOSS_ARENA = { x: -45, z: -175 };
