// Chapter 1 — Emberfall (see STORY.md): the map, the Memories, the village's events and the script.
// Fail, and Seren's Hourglass returns the party to dawn with a new Memory; reach the hill, and the chapter ends.
import type { Battle } from './battle';
import type { StageSet, StageUnit } from '../render/api';
import { EMBERFALL } from './enemies';
import { EVENTS, addAcc, addItem, damageHero, healHero, newRun, rollAcc, rollCards, withRng, type EventDef, type Run } from './run';
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
export interface Story {
  chapter: 1; attempt: number; memories: string[]; seen: string[];
  /** places reached in earlier attempts (or revealed by a Memory): they stay on the map */
  known: number[];
  /** each earlier attempt's route, and where it ended */
  trails: number[][];
  falls: { attempt: number; from: number; to: number }[];
}
/** things done this attempt (they're undone by a rewind) */
export type Flag = 'bridgeDown' | 'nellSaved';

export const knows = (run: Run, id: string) => !!run.story?.memories.includes(id);
export const flagged = (run: Run, f: Flag) => !!run.flags?.includes(f);
export function nextMemory(story: Story): Memory | null { return MEMORIES.find(m => !story.memories.includes(m.id)) ?? null; }

/** A new chapter: the first night is attempt 1 (scripted); the escape starts at dawn. */
export function newStory(): Story { return { chapter: 1, attempt: 1, memories: [], seen: [], known: [START], trails: [], falls: [] }; }

/** Dawn: a fresh party, deck and purse, and everything they remember. */
export function beginAttempt(story: Story, seed?: number): Run {
  const run = newRun(seed);
  run.story = story;
  run.flags = [];
  run.map = [];
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

/**
 * The party fell (on the road from `from` to `to`, or at a place when they're equal): back to dawn,
 * remembering one more thing. The route they took stays on the map. Returns the Memory gained (if any).
 */
export function rewind(run: Run, from = here(run), to = here(run)): { run: Run; memory: Memory | null } {
  const story = run.story!;
  for (const id of run.path) if (!story.known.includes(id)) story.known.push(id);
  if (run.path.length > 1) story.trails.push([...run.path]);
  story.falls.push({ attempt: story.attempt, from, to });
  story.attempt++;
  const memory = nextMemory(story);
  if (memory) {
    story.memories.push(memory.id);
    const reveals = REVEALS[memory.id];
    if (reveals !== undefined && !story.known.includes(reveals)) story.known.push(reveals);
  }
  return { run: beginAttempt(story), memory };
}

// ───────────────────────── the map ─────────────────────────
/**
 * Emberfall as a place: locations joined by roads (coordinates on a 1320×900 map). Fights happen on roads;
 * places hold the events, the market, rest, the elite and the hill. Side trips are dead ends you walk back from.
 */
export type PlaceKind = 'start' | 'crossroads' | 'event' | 'shop' | 'inn' | 'elite' | 'boss';
export interface Place { id: number; name: string; x: number; y: number; kind: PlaceKind; text: string; event?: string; spur?: boolean; far?: boolean; set: StageSet }
export interface Road { from: number; to: number; ambush?: string }

export const START = 0;
export const PLACES: Place[] = [
  { id: 0, name: 'The Anchorlight', x: 640, y: 800, kind: 'start', text: 'Seren\'s shrine. Every attempt starts here.', set: 'shrine' },
  { id: 1, name: 'Shrine Library', x: 420, y: 760, kind: 'event', event: 'library', spur: true, text: 'Pilgrim records, weather almanacs, and Lyra.', set: 'shrine' },
  { id: 2, name: 'Village Square', x: 660, y: 630, kind: 'crossroads', text: 'The heart of the village. Roads lead north and into the forest.', set: 'village' },
  { id: 3, name: 'The Mill', x: 950, y: 720, kind: 'event', event: 'mill', spur: true, text: 'The wheel still turns. Nobody is working it.', set: 'village' },
  { id: 4, name: 'Emberfall Market', x: 900, y: 560, kind: 'shop', spur: true, text: 'Stalls, and a merchant who takes Shards.', set: 'village' },
  { id: 5, name: 'The North Bridge', x: 420, y: 420, kind: 'event', event: 'bridge', far: true, text: 'Three stone arches over a cold river.', set: 'bridge' },
  { id: 6, name: 'Wayside Shrine', x: 190, y: 290, kind: 'event', event: 'shrine', spur: true, far: true, text: 'A pillar of crystal on the old pilgrim path.', set: 'shrine' },
  { id: 7, name: 'Forest Edge', x: 900, y: 420, kind: 'crossroads', far: true, text: 'Where the trees close over the road.', set: 'forest' },
  { id: 8, name: 'Woodcutter\'s Camp', x: 1160, y: 320, kind: 'elite', spur: true, far: true, text: 'Kaldra\'s vanguard has made camp here.', set: 'forest' },
  { id: 9, name: 'Shepherd\'s Hut', x: 840, y: 250, kind: 'inn', far: true, text: 'Empty. A cold hearth, and a door that locks.', set: 'forest' },
  { id: 10, name: 'The Hill', x: 600, y: 110, kind: 'boss', far: true, text: 'The way out of Emberfall.', set: 'hill' },
];
export const ROADS: Road[] = [
  { from: 0, to: 1 },
  { from: 0, to: 2, ambush: 'Kaldran scouts' },
  { from: 2, to: 3, ambush: 'Something in the mill lane' },
  { from: 2, to: 4 },
  { from: 2, to: 5, ambush: 'The north road' },
  { from: 5, to: 6, ambush: 'The old pilgrim path' },
  { from: 5, to: 10, ambush: 'The ridge path' },
  { from: 2, to: 7, ambush: 'The forest road' },
  { from: 7, to: 8 },
  { from: 7, to: 9, ambush: 'Deep in the forest' },
  { from: 9, to: 10, ambush: 'The hill road' },
];
/** Pathfinding and People Memories put a place on the map */
const REVEALS: Record<string, number> = { bridge: 5, well: 3 };

export const here = (run: Run) => run.at ?? START;
/** the further from the village, the later it gets */
export const storyTheme = (run: Run): 'ruins' | 'dusk' => (PLACES[here(run)].far ? 'dusk' : 'ruins');
/** where it happens: the set of the place the party is at (or walking to) */
export const storySet = (run: Run): StageSet => PLACES[here(run)].set;

/** Where the party can go: onward to places not yet visited this attempt, or back the way they came from a side trip. */
export function exits(run: Run): { road: Road; to: Place; back: boolean }[] {
  const at = here(run);
  if (PLACES[at].spur) {
    const road = ROADS.find(r => r.to === at)!;
    return [{ road, to: PLACES[road.from], back: true }];
  }
  return ROADS.filter(r => r.from === at && !run.path.includes(r.to)).map(road => ({ road, to: PLACES[road.to], back: false }));
}

/** Walk to a place. Returns whether the road is ambushed (first time only) and whether the place is new. */
export function travel(run: Run, to: number): { road: Road; place: Place; ambush: boolean; arrive: boolean } {
  const x = exits(run).find(e => e.to.id === to);
  if (!x) throw new Error(`can't go to ${to} from ${here(run)}`);
  const arrive = !run.path.includes(to);
  run.at = to;
  run.path.push(to);
  return { road: x.road, place: x.to, ambush: !x.back && !!x.road.ambush, arrive };
}

/** who waits on a road, or at a place */
export function roadEnemies(run: Run, road: Road): string[] {
  return [...withRng(run, r => r.pick(PLACES[road.to].far ? EMBERFALL.normal : EMBERFALL.easy))];
}
export function placeEnemies(run: Run, place: Place): string[] {
  if (place.kind === 'boss') return flagged(run, 'bridgeDown') ? ['ashknight'] : ['soldier', 'ashknight', 'soldier'];
  return [...withRng(run, r => r.pick(EMBERFALL.elite))];
}

// ───────────────────────── events ─────────────────────────
const leave = { label: 'Leave', desc: 'Keep moving. Dusk won\'t wait.', go: () => ({ text: 'You move on.' }) };

export const EMBERFALL_EVENTS: Record<string, EventDef> = {
  mill: { id: 'mill', title: 'The Mill', sprite: 'fountain',
    text: 'The mill wheel still turns, but nobody is working it. Flour on the floor, a bucket by the well, its rope still swinging.',
    options: run => [
      knows(run, 'well')
        ? { label: 'Look in the well', desc: 'Save the miller\'s daughter.', go: r => {
          r.flags!.push('nellSaved');
          r.shards += 40;
          addItem(r, 'potion');
          addItem(r, 'ether');
          const acc = withRng(r, x => rollAcc(r, x));
          if (acc) addAcc(r, acc);
          return { text: 'Nell is curled on a ledge above the water, exactly where you knew she would be. By the time you have her out, half the lane has come running. The village sends you off with its best: bread, a pouch of shards, a flask of ether, and her father\'s gift.', follow: acc ? { kind: 'acc', acc } : undefined };
        } }
        : { label: 'Call out', desc: 'Is anyone here?', go: () => ({ text: 'No answer. Only the wheel, and the rope, still swinging.' }) },
      { label: 'Search the mill', desc: 'Gain a few Shards.', go: r => { r.shards += 20; return { text: 'A tin of crystal shards behind the grain sacks. The miller won\'t be needing it tonight.' }; } },
      leave,
    ] },
  library: { id: 'library', title: 'Shrine Library', sprite: 'book',
    text: 'Pilgrim records and weather almanacs going back three hundred years. Lyra runs a finger along a spine she has clearly read before.',
    options: () => [
      { label: 'Read', desc: 'Choose 1 of 3 cards.', go: r => ({ text: '"Here," Lyra says, pulling down three books without looking. "These are the only useful ones."', follow: { kind: 'cards', cards: withRng(r, x => rollCards(x, 3, { common: 40, uncommon: 45, rare: 15 })) } }) },
      { label: 'Study', desc: 'Upgrade a card.', go: () => ({ text: 'Lyra reads over your shoulder and corrects you twice.', follow: { kind: 'upgrade' } }) },
      leave,
    ] },
  bridge: { id: 'bridge', title: 'The North Bridge', sprite: 'dummy',
    text: 'Three stone arches over a cold, fast river. The far bank is quiet. For now.',
    options: run => [
      ...(knows(run, 'bridge') ? [{ label: 'Bring it down', desc: 'Aldric loses 8 HP. Kaldra\'s soldiers won\'t cross here at dusk.', go: (r: Run) => {
        damageHero(r, 'knight', 8);
        r.flags!.push('bridgeDown');
        return { text: 'The keystone gives on the third blow. By dusk, Kaldra\'s soldiers will be standing on the far bank, looking at the river.' };
      } }] : []),
      { label: 'Rest by the water', desc: 'Every hero heals 15% of max HP.', go: r => { r.heroes.forEach(h => healHero(r, h.id, Math.round(h.maxHp * 0.15))); return { text: 'Ten quiet minutes by the river. Nobody talks about the dream.' }; } },
      leave,
    ] },
  shrine: EVENTS.find(e => e.id === 'shrine')!,
};

// ───────────────────────── the script ─────────────────────────
export type Speaker = 'aldric' | 'lyra' | 'seren' | 'ashen' | 'caravan' | 'stranger';
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
