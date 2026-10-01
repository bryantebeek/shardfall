// Chapter 1 — Emberfall (see STORY.md): the map, the Memories, the village's events and the script.
// Fail, and Seren's Hourglass returns the party to dawn with a new Memory; reach the hill, and the chapter ends.
import type { Battle } from './battle';
import type { StageSet, StageUnit } from '../render/api';
import { EMBERFALL } from './enemies';
import { addAcc, addItem, damageHero, healHero, newRun, rollAcc, rollCards, withRng, type EventFollowUp, type Run } from './run';
import type { Rng } from './rng';
import type { SpriteId } from './types';

// ───────────────────────── memories ─────────────────────────
export type MemoryKind = 'Foresight' | 'Pathfinding' | 'People';
export interface Memory { id: string; kind: MemoryKind; text: string; use: string }

/** in the order they're remembered: one for each time the party falls */
export const MEMORIES: Memory[] = [
  { id: 'guard', kind: 'Foresight', text: 'The Ashen Knight always guards his left.', use: 'Against the Ashen Knight, his weaknesses are known from the start and his shield is weaker.' },
  { id: 'bridge', kind: 'Pathfinding', text: 'The soldiers cross the north bridge at dusk.', use: 'At the North Bridge you can bring it down, so they never reach the hill.' },
  { id: 'well', kind: 'People', text: 'The miller\'s daughter hides in the well.', use: 'At the Mill, look in the well.' },
];

/** what persists across attempts: which attempt this is, what they remember, and what they've seen */
export interface Story { chapter: 1; attempt: number; memories: string[]; seen: string[] }
/** things done this attempt (they're undone by a rewind) */
export type Flag = 'bridgeDown' | 'nellSaved' | 'towerClimbed' | 'patrolsKnown';

export const knows = (run: Run, id: string) => !!run.story?.memories.includes(id);
export const flagged = (run: Run, f: Flag) => !!run.flags?.includes(f);
export function nextMemory(story: Story): Memory | null { return MEMORIES.find(m => !story.memories.includes(m.id)) ?? null; }

/** A new chapter: the first night is attempt 1 (scripted); the escape starts at dawn. */
export function newStory(): Story { return { chapter: 1, attempt: 1, memories: [], seen: [] }; }

/** Dawn: a fresh party, deck and purse, a new Emberfall, and everything they remember. */
export function beginAttempt(story: Story, seed?: number): Run {
  const run = newRun(seed);
  run.story = story;
  run.flags = [];
  run.map = [];
  Object.assign(run, withRng(run, genMap));
  run.at = START;
  run.path = [START];
  return run;
}

/** What the party remembers about the Ashen Knight. */
export const knightSetup = (run: Run) => (b: Battle) => {
  for (const e of b.enemies) {
    if (e.def !== 'ashknight') continue;
    if (knows(run, 'guard')) { e.known = [...e.weak]; e.shield = e.maxShield = 3; }
  }
};

/** The party fell: back to dawn (on a new map), remembering one more thing. Returns the Memory gained (if any). */
export function rewind(run: Run): { run: Run; memory: Memory | null } {
  const story = run.story!;
  story.attempt++;
  const memory = nextMemory(story);
  if (memory) story.memories.push(memory.id);
  return { run: beginAttempt(story), memory };
}

// ───────────────────────── the map ─────────────────────────
/**
 * Emberfall as a place: locations joined by roads (coordinates on a 1320×900 map), drawn anew every attempt,
 * because the Hourglass never brings back quite the same day. Fights happen on roads; places hold events,
 * the market, rest, treasure, elites and the hill. Side trips are dead ends you walk back from.
 */
export type PlaceKind = 'start' | 'crossroads' | 'event' | 'shop' | 'inn' | 'elite' | 'treasure' | 'boss';
export interface Place { id: number; name: string; x: number; y: number; kind: PlaceKind; text: string; event?: string; spur?: boolean; far?: boolean; set: StageSet }
export interface Road { from: number; to: number; ambush?: string }
interface Look { name: string; text: string; set: StageSet }

export const START = 0;
/** the Anchorlight's row, then five rows of places toward the hill (bottom to top) */
const ROW_Y = [810, 690, 570, 450, 330, 210], HILL_Y = 95;
type Plain = 'crossroads' | 'shop' | 'inn' | 'elite' | 'treasure';
const L = (name: string, text: string, set: StageSet): Look => ({ name, text, set });
/** what each kind of place can be, near the village and further out */
const LOOKS: Record<Plain, { near: Look[]; far: Look[] }> = {
  crossroads: {
    near: [L('Village Square', 'The heart of the village.', 'village'), L('Chapel Lane', 'Shuttered houses and a lane of cobbles.', 'village'), L('The Well Green', 'A patch of green and a stone well.', 'village'), L('Tanners\' Row', 'The smell gets there before you do.', 'village'), L('The South Gate', 'A gate nobody has closed in years.', 'village'), L('Orchard Walk', 'Apple trees, and a wall to climb.', 'village')],
    far: [L('Forest Edge', 'Where the trees close over the road.', 'forest'), L('The Old Milestone', 'Luminar, 90 leagues. Someone has scratched out the 9.', 'forest'), L('Charcoal Clearing', 'Cold kilns and black earth.', 'forest'), L('The Split Oak', 'Struck by lightning, still alive.', 'forest'), L('The Pilgrim Steps', 'Stone steps worn into the hillside.', 'forest'), L('Fox Hollow', 'A dip in the road, out of the wind.', 'forest')],
  },
  shop: { near: [L('Emberfall Market', 'Stalls, and a merchant who takes Shards.', 'village')], far: [L('A Pedlar\'s Cart', 'A pedlar who hasn\'t heard about Kaldra yet.', 'forest')] },
  inn: { near: [L('The Lantern Inn', 'Warm beds, if nobody asks questions.', 'village')], far: [L('Shepherd\'s Hut', 'A cold hearth, and a door that locks.', 'forest'), L('The Hermit\'s Lodge', 'The hermit is out. The fire isn\'t.', 'forest')] },
  elite: { near: [L('The Burnt Farm', 'Kaldra\'s scouts got here first.', 'village')], far: [L('Woodcutter\'s Camp', 'Kaldra\'s vanguard has made camp here.', 'forest'), L('Kaldran Outpost', 'Tents, a banner, and a captain.', 'forest')] },
  treasure: { near: [L('A Collapsed Cellar', 'Something glints under the beams.', 'village')], far: [L('An Overgrown Cairn', 'Older than the village. Older than the Order.', 'forest')] },
};
const AMBUSH = { near: ['Kaldran scouts', 'Something in the lane', 'Torchlight between the houses', 'Wings in the eaves'], far: ['The forest road', 'Kaldran outriders', 'Deep in the trees', 'Something in the undergrowth', 'The ridge path'] };
/** events that can turn up anywhere (the Mill and the North Bridge are always somewhere) */
const ROAMING = ['library', 'shrine', 'tower', 'wagon', 'deserter', 'chapel'];

/** A new Emberfall: rows of places from the Anchorlight to the hill, roads that don't cross, and a few side trips. */
export function genMap(r: Rng): { places: Place[]; roads: Road[] } {
  const places: Place[] = [], roads: Road[] = [];
  const add = (p: Omit<Place, 'id'>) => { const q = { ...p, id: places.length }; places.push(q); return q; };
  const blank = { name: '', text: '', kind: 'crossroads' as PlaceKind, set: 'village' as StageSet };
  const rows: Place[][] = [[add({ ...blank, name: 'The Anchorlight', x: 660, y: ROW_Y[0], kind: 'start', text: 'Seren\'s shrine. Every attempt starts here.', set: 'shrine' })]];
  for (const [k, n] of [2 + r.int(2), 3 + r.int(2), 3 + r.int(2), 3, 2 + r.int(2)].entries()) {
    const span = 1000 / n;
    rows.push(Array.from({ length: n }, (_, i) => add({ ...blank, far: k + 1 >= 3,
      x: Math.round(160 + span * (i + 0.5) + (r.next() - 0.5) * span * 0.4), y: ROW_Y[k + 1] + r.range(-22, 22) })));
  }
  const hill = add({ ...blank, name: 'The Hill', x: 660, y: HILL_Y, kind: 'boss', far: true, text: 'The way out of Emberfall.', set: 'hill' });

  // roads: each place to the next row's places above it, so none cross; now and then one more
  for (let k = 0; k + 1 < rows.length; k++) {
    const a = rows[k], b = rows[k + 1];
    const lo = (i: number) => Math.floor((i * b.length) / a.length), hi = (i: number) => Math.max(lo(i), Math.ceil(((i + 1) * b.length) / a.length) - 1);
    a.forEach((p, i) => {
      for (let j = lo(i); j <= hi(i); j++) roads.push({ from: p.id, to: b[j].id });
      if (i + 1 < a.length && lo(i + 1) === hi(i) + 1 && r.chance(0.35)) roads.push({ from: p.id, to: b[hi(i) + 1].id });
    });
  }
  for (const p of rows[5]) roads.push({ from: p.id, to: hill.id });

  // side trips: two or three dead ends beside a place, wherever there's room
  const main = rows.slice(1, 5).flat();
  for (const parent of r.shuffle([...main]).slice(0, 2 + r.int(2))) {
    const spot = r.shuffle([-1, 1]).map(sx => ({ x: parent.x + sx * 125, y: parent.y - 28 }))
      .find(q => q.x > 70 && q.x < 1250 && places.every(o => Math.hypot(o.x - q.x, o.y - q.y) > 100));
    if (!spot) continue;
    const spur = add({ ...blank, ...spot, spur: true, far: parent.far });
    roads.push({ from: parent.id, to: spur.id });
  }

  // what's where: the story's places, a rest before the hill, and the rest by chance
  const todo = places.filter(p => !p.name);
  const take = (p: Place) => todo.splice(todo.indexOf(p), 1);
  const events = r.shuffle([...ROAMING]);
  const setEvent = (p: Place, id: string) => { Object.assign(p, { kind: 'event', event: id, name: EMBERFALL_EVENTS[id].name, text: EMBERFALL_EVENTS[id].text, set: EMBERFALL_EVENTS[id].set }); take(p); };
  setEvent(r.pick(todo.filter(p => !p.far)), 'mill');
  setEvent(r.pick(rows[3].concat(rows[4])), 'bridge');
  const looks = { near: {} as Record<Plain, Look[]>, far: {} as Record<Plain, Look[]> };
  for (const k of Object.keys(LOOKS) as Plain[]) { looks.near[k] = r.shuffle([...LOOKS[k].near]); looks.far[k] = r.shuffle([...LOOKS[k].far]); }
  const count = (k: PlaceKind) => places.filter(p => p.kind === k && p.name).length;
  /** every name once: when a kind runs out of names, the place is a crossroads instead */
  const setPlain = (p: Place, k: Plain) => {
    const band = looks[p.far ? 'far' : 'near'], other = looks[p.far ? 'near' : 'far'];
    let look = band[k].pop();
    if (!look) { k = 'crossroads'; look = band.crossroads.pop() ?? other.crossroads.pop()!; }
    Object.assign(p, { kind: k, ...look });
    take(p);
  };
  setPlain(r.pick(rows[5].filter(p => todo.includes(p))), 'inn');
  for (const p of [...todo]) {
    const row = ROW_Y.indexOf(ROW_Y.reduce((a, y) => (Math.abs(y - p.y) < Math.abs(a - p.y) ? y : a)));
    const k = r.weighted({
      event: events.length ? 45 : 0, crossroads: p.spur ? 0 : 20, shop: count('shop') < 2 ? 10 : 0, inn: count('inn') < 2 && row >= 3 ? 6 : 0,
      elite: count('elite') < 2 && row >= 2 ? 12 : 0, treasure: count('treasure') < 1 ? 8 : 0,
    });
    if (k === 'event') setEvent(p, events.pop()!);
    else setPlain(p, k as Plain);
  }

  // ambushes: most roads onward, never a side trip, always the last stretch to the hill
  for (const road of roads) {
    const to = places[road.to];
    if (to.spur || !(to.kind === 'boss' || r.chance(0.5))) continue;
    road.ambush = r.pick(AMBUSH[to.far ? 'far' : 'near']);
  }
  return { places, roads };
}

/** Pathfinding and People Memories show where their place is, on every new map */
const REVEALS: Record<string, string> = { bridge: 'bridge', well: 'mill' };
/** places the party can see from the start of an attempt, beyond the roads in front of them */
export function revealed(run: Run): Place[] {
  if (flagged(run, 'towerClimbed')) return run.places!;
  const evs = run.story!.memories.map(m => REVEALS[m]).filter(Boolean);
  return run.places!.filter(p => p.event && evs.includes(p.event));
}

export const here = (run: Run) => run.at ?? START;
const at = (run: Run) => run.places![here(run)];
/** the further from the village, the later it gets */
export const storyTheme = (run: Run): 'ruins' | 'dusk' => (at(run).far ? 'dusk' : 'ruins');
/** where it happens: the set of the place the party is at (or walking to) */
export const storySet = (run: Run): StageSet => at(run).set;

/** Where the party can go: onward to places not yet visited this attempt, or back the way they came from a side trip. */
export function exits(run: Run): { road: Road; to: Place; back: boolean }[] {
  const id = here(run), places = run.places!, roads = run.roads!;
  if (places[id].spur) {
    const road = roads.find(r => r.to === id)!;
    return [{ road, to: places[road.from], back: true }];
  }
  return roads.filter(r => r.from === id && !run.path.includes(r.to)).map(road => ({ road, to: places[road.to], back: false }));
}

/** Walk to a place. Returns whether the road is ambushed (first time only; the deserter's warning spares one) and whether the place is new. */
export function travel(run: Run, to: number): { road: Road; place: Place; ambush: boolean; dodged: boolean; arrive: boolean } {
  const x = exits(run).find(e => e.to.id === to);
  if (!x) throw new Error(`can't go to ${to} from ${here(run)}`);
  const arrive = !run.path.includes(to);
  run.at = to;
  run.path.push(to);
  let ambush = !x.back && !!x.road.ambush;
  const dodged = ambush && flagged(run, 'patrolsKnown');
  if (dodged) { run.flags = run.flags!.filter(f => f !== 'patrolsKnown'); ambush = false; }
  return { road: x.road, place: x.to, ambush, dodged, arrive };
}

/** who waits on a road, or at a place */
export function roadEnemies(run: Run, road: Road): string[] {
  return [...withRng(run, r => r.pick(run.places![road.to].far ? EMBERFALL.normal : EMBERFALL.easy))];
}
export function placeEnemies(run: Run, place: Place): string[] {
  if (place.kind === 'boss') return flagged(run, 'bridgeDown') ? ['ashknight'] : ['soldier', 'ashknight', 'soldier'];
  return [...withRng(run, r => r.pick(EMBERFALL.elite))];
}

// ───────────────────────── events ─────────────────────────
// Each event place plays as a short scene in its own set: a few lines, a choice, and what came of it.
export interface Choice { label: string; desc: string; go: (run: Run) => { lines: Line[]; follow?: EventFollowUp } }
export interface PlaceEvent {
  id: string; name: string; set: StageSet;
  /** what the map says about the place */
  text: string;
  intro: (run: Run) => Line[]; options: (run: Run) => Choice[];
}

/** they've had this event in an earlier attempt */
const again = (run: Run, id: string) => !!run.story?.seen.includes(id);
const leave = (lines: Line[]): Choice => ({ label: 'Move on', desc: 'Nothing here is worth the time.', go: () => ({ lines }) });

export const EMBERFALL_EVENTS: Record<string, PlaceEvent> = {
  library: { id: 'library', name: 'Shrine Library', set: 'shrine', text: 'Pilgrim records, weather almanacs, and Lyra.',
    intro: run => [
      { text: 'Wax, dust and old paper. Pilgrim records and weather almanacs, three hundred years of them, and a lamp still warm on the only table.' },
      again(run, 'library')
        ? { who: 'lyra', text: 'I\'ve read all of these. Why do I feel like I\'ve read them twice?' }
        : { who: 'lyra', text: 'Two minutes. There\'s a shelf in the back nobody from the Order ever bothers with.' },
      { who: 'aldric', text: 'Two.' },
    ],
    options: () => [
      { label: 'Read', desc: 'Choose 1 of 3 cards.', go: r => ({
        lines: [{ who: 'lyra', text: 'Here. These three. The rest are sermons.' }],
        follow: { kind: 'cards', cards: withRng(r, x => rollCards(x, 3, { common: 40, uncommon: 45, rare: 15 })) } }) },
      { label: 'Study', desc: 'Upgrade a card.', go: () => ({
        lines: [{ who: 'lyra', text: 'No, your grip is wrong. Again. Better.' }, { who: 'aldric', text: 'You\'ve never held a sword.' }, { who: 'lyra', text: 'I\'ve read about it.' }],
        follow: { kind: 'upgrade' } }) },
      leave([{ who: 'lyra', text: 'Fine. But I\'m taking the almanac.' }]),
    ] },
  mill: { id: 'mill', name: 'The Mill', set: 'village', text: 'The wheel still turns. Nobody is working it.',
    intro: run => [
      { text: 'The mill wheel still turns, but nobody is working it. Flour on the floor, a bucket by the well, its rope still swinging.' },
      knows(run, 'well')
        ? { who: 'aldric', text: 'The well. She\'s in the well.' }
        : { who: 'seren', text: 'Someone was here a moment ago.' },
    ],
    options: run => [
      knows(run, 'well')
        ? { label: 'Look in the well', desc: '40 Shards, a Potion, an Ether and an accessory.', go: r => {
          r.flags!.push('nellSaved');
          r.shards += 40;
          addItem(r, 'potion');
          addItem(r, 'ether');
          const acc = withRng(r, x => rollAcc(r, x));
          if (acc) addAcc(r, acc);
          return { lines: [
            { text: 'Nell is curled on a ledge above the water, exactly where he knew she would be.', cast: [...PARTY, U('e0', 'nell')] },
            { who: 'nell', text: 'Are they gone? The men with the torches?' },
            { who: 'aldric', text: 'Not yet. Find your father, and stay off the roads tonight.' },
            { text: 'By the time she\'s out, half the lane has come running. They send the party off with their best: bread, a pouch of shards, a flask of ether, and her father\'s gift.' },
          ], follow: acc ? { kind: 'acc', acc } : undefined };
        } }
        : { label: 'Call out', desc: 'Is anyone here?', go: () => ({ lines: [
          { who: 'seren', text: 'Hello? We\'re not with them.' },
          { text: 'No answer. Only the wheel, and the rope, still swinging.' },
        ] }) },
      { label: 'Search the mill', desc: 'Gain 20 Shards.', go: r => { r.shards += 20; return { lines: [
        { text: 'A tin of crystal shards behind the grain sacks.' },
        { who: 'lyra', text: 'The miller won\'t be needing it tonight.' },
        { who: 'seren', text: 'Lyra.' },
        { who: 'lyra', text: 'Wren.' },
      ] }; } },
      leave([{ who: 'aldric', text: 'We can\'t save everyone. Keep moving.' }]),
    ] },
  bridge: { id: 'bridge', name: 'The North Bridge', set: 'bridge', text: 'Three stone arches over a cold river.',
    intro: run => [
      { text: 'Three stone arches over a cold, fast river. The far bank is quiet.' },
      knows(run, 'bridge')
        ? { who: 'aldric', text: 'This is where they cross. At dusk, with the torches.' }
        : { who: 'lyra', text: 'Quiet. For now.' },
    ],
    options: run => [
      ...(knows(run, 'bridge') ? [{ label: 'Bring it down', desc: 'Aldric loses 8 HP. The soldiers won\'t reach the hill.', go: (r: Run) => {
        damageHero(r, 'knight', 8);
        r.flags!.push('bridgeDown');
        return { lines: [
          { text: 'Aldric goes at the keystone with the flat of his shield.', fx: 'shake' },
          { text: 'It gives on the third blow. The middle arch folds into the river.', fx: 'shake' },
          { who: 'seren', text: 'By dusk they\'ll be standing on the far bank, looking at the water.' },
        ] };
      } }] : []),
      { label: 'Rest by the water', desc: 'Every hero heals 15% of max HP.', go: r => {
        r.heroes.forEach(h => healHero(r, h.id, Math.round(h.maxHp * 0.15)));
        return { lines: [{ text: 'Ten quiet minutes by the river. Nobody talks about the dream.' }] };
      } },
      leave([{ who: 'lyra', text: 'I hate bridges. Let\'s go.' }]),
    ] },
  shrine: { id: 'shrine', name: 'Wayside Shrine', set: 'shrine', text: 'A pillar of crystal on the old pilgrim path.',
    intro: () => [
      { text: 'On the old pilgrim path, a pillar of living crystal hums in a ring of standing stones.' },
      { text: 'The Hourglass in Seren\'s arms hums back.' },
      { who: 'seren', text: 'It knows this place. So do I.' },
    ],
    options: () => [
      { label: 'Pray', desc: 'Every hero heals 25% of max HP.', go: r => {
        r.heroes.forEach(h => healHero(r, h.id, Math.round(h.maxHp * 0.25)));
        return { lines: [{ text: 'Seren kneels. The light comes off the crystal like warmth off a hearth, and the wounds close.' }] };
      } },
      { label: 'Attune', desc: 'Gain an accessory. Every hero loses 6 HP.', go: r => {
        r.heroes.forEach(h => damageHero(r, h.id, 6));
        const acc = withRng(r, x => rollAcc(r, x));
        if (!acc) return { lines: [{ text: 'The crystal flares and dims. It has nothing left to give.' }] };
        addAcc(r, acc);
        return { lines: [
          { text: 'They lay their hands on the pillar. It bites.', fx: 'flash' },
          { who: 'lyra', text: 'Ow. It gave us something, though.' },
        ], follow: { kind: 'acc', acc } };
      } },
      leave([{ who: 'seren', text: 'Not today. It will still be here.' }]),
    ] },
  tower: { id: 'tower', name: 'The Watchtower', set: 'village', text: 'The bell that rings at dusk. Nobody is ringing it yet.',
    intro: () => [
      { text: 'The old watchtower. From the top you can see every road out of Emberfall.' },
      { who: 'lyra', text: 'And every road into it.' },
    ],
    options: () => [
      { label: 'Climb it', desc: 'See the whole map for this attempt.', go: r => {
        r.flags!.push('towerClimbed');
        return { lines: [
          { text: 'From the top, Emberfall is small: the roads, the river, the dark line of the forest, and the hill.' },
          { who: 'aldric', text: 'There. That\'s our way out.' },
        ] };
      } },
      { label: 'Take the signal oil', desc: 'Gain a Bomb Fragment.', go: r => addItem(r, 'bomb')
        ? { lines: [{ who: 'lyra', text: 'Lamp oil and a little powder. I can work with this.' }] }
        : { lines: [{ who: 'lyra', text: 'We\'ve nowhere to carry it. Pity.' }] } },
      leave([{ who: 'aldric', text: 'No time for the view.' }]),
    ] },
  wagon: { id: 'wagon', name: 'The Overturned Wagon', set: 'forest', text: 'The caravan\'s wagon, on its side in the ditch.',
    intro: () => [
      { text: 'The wagon that brought Aldric to Emberfall lies on its side in the ditch. The horses are gone.' },
      { who: 'caravan', text: 'Sir Voss! Thank the Light. Help me with this, would you?' },
      { who: 'aldric', text: 'Just Voss.' },
    ],
    options: () => [
      { label: 'Right the wagon', desc: 'Aldric loses 6 HP. Gain an accessory.', go: r => {
        damageHero(r, 'knight', 6);
        const acc = withRng(r, x => rollAcc(r, x));
        if (acc) addAcc(r, acc);
        return { lines: [
          { text: 'It takes Aldric\'s shoulder and most of his patience.', fx: 'shake' },
          { who: 'caravan', text: 'Here. Take this. The Archbishop\'s clerks will never miss it.' },
        ], follow: acc ? { kind: 'acc', acc } : undefined };
      } },
      { label: 'Take what fell', desc: 'Gain 30 Shards and a Potion.', go: r => {
        r.shards += 30;
        addItem(r, 'potion');
        return { lines: [{ who: 'caravan', text: 'That\'s the Order\'s cargo! ...Oh, take it. Take it and go.' }] };
      } },
      leave([{ who: 'aldric', text: 'Leave the wagon. Get out of Emberfall.' }, { who: 'caravan', text: '...Right. Yes. Good advice.' }]),
    ] },
  deserter: { id: 'deserter', name: 'A Kaldran Deserter', set: 'forest', text: 'A young soldier with his helmet off.',
    intro: () => [
      { text: 'A Kaldran soldier sits against a tree with his helmet in his lap. He can\'t be older than sixteen.', cast: [...PARTY, U('e0', 'soldier')] },
      { who: 'lyra', text: 'He\'s one of them.' },
      { who: 'seren', text: 'He\'s a boy.' },
    ],
    options: () => [
      { label: 'Let him go', desc: 'He tells you where the patrols are: skip the next fight on a road.', go: r => {
        r.flags!.push('patrolsKnown');
        return { lines: [
          { text: 'He draws the patrol routes in the dirt with a stick. Then he runs.', cast: PARTY },
          { who: 'seren', text: 'Go home.' },
        ] };
      } },
      { label: 'Take his purse', desc: 'Gain 35 Shards.', go: r => {
        r.shards += 35;
        return { lines: [
          { text: 'He hands it over without a word, and runs.', cast: PARTY },
          { who: 'seren', text: 'That was unkind.' },
          { who: 'lyra', text: 'That was thirty-five Shards.' },
        ] };
      } },
      leave([{ who: 'aldric', text: 'Walk away, soldier. Before I change my mind.', cast: PARTY }]),
    ] },
  chapel: { id: 'chapel', name: 'The Pilgrims\' Chapel', set: 'shrine', text: 'Candles, and a confessional nobody uses.',
    intro: () => [
      { text: 'A chapel for pilgrims on the road to Luminar. Rows of candles, most of them out.' },
      { who: 'seren', text: 'Light one for the village. They\'d want someone to.' },
    ],
    options: () => [
      { label: 'Confess', desc: 'Remove a card from your deck.', go: () => ({
        lines: [{ text: 'Aldric kneels for a long time. Whatever he says, he leaves it there.' }],
        follow: { kind: 'remove' } }) },
      { label: 'Light a candle', desc: 'Every hero heals 20% of max HP.', go: r => {
        r.heroes.forEach(h => healHero(r, h.id, Math.round(h.maxHp * 0.2)));
        return { lines: [{ text: 'Three candles, side by side. For a moment, nobody is in a hurry.' }] };
      } },
      leave([{ who: 'lyra', text: 'I don\'t pray. Let\'s go.' }]),
    ] },
};

// ───────────────────────── the script ─────────────────────────
export type Speaker = 'aldric' | 'lyra' | 'seren' | 'ashen' | 'caravan' | 'stranger' | 'nell';
export interface Line {
  /** omitted: narration */
  who?: Speaker;
  text: string;
  /** change who's on stage from this line on */
  cast?: StageUnit[];
  fx?: 'flash' | 'shake';
}
export interface Scene { theme: 'ruins' | 'dusk'; set: StageSet; cinematic?: boolean; cast: StageUnit[]; lines: Line[] }

const U = (id: string, sprite: SpriteId, side: 'hero' | 'enemy' = 'enemy'): StageUnit => ({ id, sprite, side });
const ALDRIC = U('knight', 'knight', 'hero'), LYRA = U('bmage', 'bmage', 'hero'), SEREN = U('wmage', 'wmage', 'hero');
const PARTY = [ALDRIC, LYRA, SEREN];
const KNIGHT = U('e0', 'ashknight');

export const PROLOGUE: Scene = { theme: 'dusk', set: 'village', cinematic: true, cast: [], lines: [
  { text: 'Twenty years ago.' },
  { text: 'The crystal that lit the kingdom came apart in a single night, and light fell out of the sky like rain.' },
  { text: 'A boy woke under a fallen roof.' },
  { text: 'Through the smoke came a knight, his armour streaked with crystal, carrying a small body wrapped in a cloak.' },
  { text: 'He set it down, and lifted the boy instead.' },
  { who: 'stranger', text: 'Don\'t look back.' },
  { text: 'The boy looked back anyway. A priest knelt on the cathedral steps, very still. In the street, a little girl held her chest, where something bright had just gone in.' },
  { text: 'When he turned around, the knight had gone back into the fire.' },
] };

export const ARRIVAL: Scene = { theme: 'ruins', set: 'village', cast: [ALDRIC], lines: [
  { text: 'Emberfall, a shrine village at the edge of the Dimming. The days here are already shorter than they should be.' },
  { text: 'Aldric Voss was captain of a princess\'s guard, once. Now he walks beside Order supply wagons for coin.' },
  { who: 'caravan', text: 'Last stop, Sir Voss. Grain for the shrine, lamp oil, and whatever the Archbishop\'s clerks packed that weighs this much.' },
  { who: 'aldric', text: 'Just Voss.' },
  { text: 'The shrine library smells of wax and old paper. Someone is reading at the only table with a lamp.', cast: [ALDRIC, LYRA] },
  { who: 'lyra', text: 'If you\'re from the Order, I\'m a pilgrim. If you\'re not, I\'m still a pilgrim.' },
  { who: 'aldric', text: 'I\'m from the wagons.' },
  { who: 'lyra', text: 'Then I\'m Wren. Pilgrim. Deeply devout.' },
  { text: 'The sleeve of her coat is scorched to the elbow. She doesn\'t hide it quite fast enough.' },
  { who: 'seren', text: 'Lyra, the lamp oil\'s here, if you want some for your reading.', cast: PARTY },
  { who: 'lyra', text: '...Wren.' },
  { who: 'seren', text: 'Of course.' },
  { who: 'seren', text: 'You\'re the escort? Would you help me with something before the weather turns? The shrine\'s relic has to go down to the cellar.' },
  { text: 'It is an hourglass the length of a forearm, cut from a single crystal. There is no sand in it. Only light.' },
  { who: 'aldric', text: 'It\'s heavier than it looks.' },
  { who: 'seren', text: 'It always is.' },
  { text: 'He doesn\'t think about it again.' },
] };

export const DUSK: Scene = { theme: 'dusk', set: 'shrine', cast: [ALDRIC], lines: [
  { text: 'At dusk, the bell in the watchtower starts ringing, and doesn\'t stop.' },
  { text: 'Kaldra\'s soldiers come over the ridge with torches. In front of them walks a knight in grey armour, grown through with crystal.', cast: [ALDRIC, U('e1', 'soldier'), KNIGHT, U('e2', 'soldier')] },
  { who: 'aldric', text: 'Get to the cellar. All of you.' },
  { text: 'The grey knight stops at the foot of the shrine steps and looks up at him for a long moment, as if he were remembering something.' },
] };

export const DAWN: Scene = { theme: 'ruins', set: 'village', cast: [ALDRIC], lines: [
  { text: 'He wakes at dawn.', fx: 'flash' },
  { text: 'The same bed. The same smell of bread from across the square. The same caravan outside, its horses stamping.' },
  { text: 'Seren is in the doorway with the relic in her hands. It is glowing like a sunrise.', cast: [ALDRIC, SEREN] },
  { who: 'seren', text: 'You\'re awake. Good. We don\'t have long.' },
  { who: 'aldric', text: 'I was on the steps. He—' },
  { who: 'seren', text: 'Three strokes. I know. You carried the Hourglass yesterday, so it brought you back with me.' },
  { who: 'aldric', text: 'Back.' },
  { who: 'seren', text: 'To this morning. It gives back a little of what happened after. Hold on to what you remember. It\'s the only thing that comes with us.' },
] };

export const DAWN_AFTER: Scene = { theme: 'ruins', set: 'village', cast: PARTY, lines: [
  { who: 'lyra', text: 'I had the strangest dream. There was a grey knight, and you were on the steps, and—' },
  { who: 'lyra', text: 'You had it too.' },
  { who: 'seren', text: 'They come over the ridge at dusk. We leave before then, with the Hourglass. That\'s all that matters today.' },
  { who: 'lyra', text: 'And the village?' },
  { who: 'seren', text: 'We\'ll warn who we can.' },
  { who: 'aldric', text: 'Then we go now.' },
] };

/** after any later fall */
export const REWIND: Scene = { theme: 'ruins', set: 'village', cast: PARTY, lines: [
  { text: 'Light, everywhere at once.', fx: 'flash' },
  { text: 'Then bread, and horses, and the same grey morning.' },
  { who: 'seren', text: 'Again. Tell me what you saw.' },
] };

export function hillScene(run: Run): Scene {
  const first = !run.story!.seen.includes('hill');
  const escort = flagged(run, 'bridgeDown')
    ? { text: 'Behind him, the road is empty. The soldiers are still on the far side of a river.' }
    : { text: 'Two of Kaldra\'s soldiers come up the path behind him.', cast: [...PARTY, U('e0', 'soldier'), U('e1', 'ashknight'), U('e2', 'soldier')] };
  if (!first) return { theme: 'dusk', set: 'hill', cast: [...PARTY, KNIGHT], lines: [{ text: 'He is waiting on the hill again.' }, escort] };
  return { theme: 'dusk', set: 'hill', cast: PARTY, lines: [
    { text: 'The road over the hill is empty. Then it isn\'t.', cast: [...PARTY, KNIGHT] },
    { text: 'The grey knight is standing in the middle of it, as if he has been waiting since noon.' },
    { who: 'lyra', text: 'That\'s not possible. We came the other way. Nobody knew we\'d come this way.' },
    { who: 'seren', text: 'He did.' },
    { who: 'aldric', text: 'How?' },
    { who: 'seren', text: '...He remembers too.' },
    escort,
  ] };
}

export const ENDING: Scene = { theme: 'dusk', set: 'hill', cast: [...PARTY, KNIGHT], lines: [
  { text: 'They are cornered at the top of the hill, with the village burning below.' },
  { text: 'The grey knight walks past Aldric as if he weren\'t there, and raises his blade over Lyra.' },
  { text: 'And stops.' },
  { text: 'For one breath he doesn\'t move, as if the motion were familiar. As if he had done this before.' },
  { who: 'aldric', text: 'Run!' },
  { text: 'It is enough.', cast: PARTY, fx: 'flash' },
  { text: 'On the far side of the hill, Seren kneels in the grass and holds the Hourglass up over the burning village.' },
  { who: 'seren', text: 'Here. From now on, we start from here.' },
  { text: 'The light inside it turns over once, and settles. The first Anchor.' },
  { who: 'lyra', text: 'Are you going to tell us what that thing is?' },
  { who: 'seren', text: 'When we\'re somewhere safe.' },
  { text: 'Behind them, Emberfall burns. Aldric doesn\'t look back.' },
] };

/** the first night: Aldric alone on the shrine steps (a throwaway run, so nothing carries over) */
export function stepsRun(): Run {
  const run = newRun();
  run.heroes = run.heroes.filter(h => h.id === 'knight');
  run.deck = ['slash', 'slash', 'slash', 'guard', 'guard', 'shieldbash'].map((id, i) => ({ uid: `s${i}`, id, upgraded: false }));
  run.items = [null, null, null];
  return run;
}
