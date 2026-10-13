// World data for the first journey: start values, classes, cast, towns, route, upgrades.
// Data only. Text placeholders: {merchant} {comp_a} {comp_b} {indep} become character names.

export const START = { time: 8, gold: 30, provisions: 12, town: 'oakvale' };   // time: hours since Day 1, 00:00

export const COMPANY = {
  baseCapacity: 2,        // traveling companions the wagon sleeps (plus the merchant)
  joinTrust: 35,          // trust an independent adventurer needs before agreeing to travel with you
  mealHours: 12,          // each traveller eats one ration every 12 hours on the road
  injuryHours: 36,        // how long an injury keeps someone off contracts
};

export const CLASSES = {
  knight: { label: 'Knight', outfit: 'knight', attrs: { might: 5, wits: 2, grit: 5 }, traits: [] },
  cleric: { label: 'Cleric', outfit: 'cleric', attrs: { might: 2, wits: 4, grit: 3 }, traits: ['healer'] },
  scout: { label: 'Scout', outfit: 'guard', attrs: { might: 3, wits: 5, grit: 3 }, traits: [] },
};
export const ATTRIBUTES = { might: 'Might', wits: 'Wits', grit: 'Grit' };
export const TRAITS = { healer: 'Healer: other party members are 25% less likely to be injured' };

export const NAMES = {
  m: ['Tobin', 'Garrick', 'Emmett', 'Bram', 'Osric', 'Davin', 'Halvard', 'Ned', 'Corin', 'Willem', 'Aldo', 'Fenwick'],
  f: ['Wren', 'Maren', 'Isolde', 'Petra', 'Hazel', 'Elsbeth', 'Nell', 'Ada', 'Brisa', 'Linnea', 'Tess', 'Odile'],
};

// The starting cast. Sexes: comp_a and comp_b are always one man and one woman (order random).
export const CAST = [
  { key: 'merchant', role: 'merchant', outfit: 'guard', status: 'traveling', label: 'Merchant' },
  { key: 'comp_a', cls: 'knight', level: 3, status: 'traveling', trust: 50, tag: 'Steady', traits: ['hill_roads'],
    bio: 'Grew up in the hill country near Stonehaven. Has walked this road more times than anyone.' },
  { key: 'comp_b', cls: 'cleric', level: 2, status: 'traveling', trust: 45, tag: 'Cheerful',
    bio: 'Travels to visit the small chapels along the trade roads. Patches people up along the way.' },
  { key: 'indep', cls: 'scout', level: 2, status: 'independent', trust: 10, tag: 'Cautious',
    town: 'oakvale', heading: 'stonehaven', prefs: { minChance: 0.55, maxRisk: 0.3 },
    bio: 'Takes guild work where there is any. Careful about the jobs they take.' },
];

export const DELIVERY = {
  town: 'stonehaven', label: 'Wool for Mistress Aldine', client: 'Mistress Aldine, Fuller\'s Row',
  pay: 40, bonus: 15, deadline: 68,   // 68 = Day 3, 20:00
};

export const UPGRADES = {
  bedroll: {
    label: 'Extra bedroll', cost: 35, capacity: 1,
    description: 'A proper bedroll, blanket and a spot under the wagon cover. Your wagon sleeps you and two companions; this makes room for one more traveller.',
  },
};

export const PLACES = {
  center: { label: 'Town Center', icon: '⌂' },
  guild: { label: 'Adventurers\' Guild', icon: '✦' },
  market: { label: 'Market', icon: '⚖' },
  caravan: { label: 'Caravan', icon: '⛟' },
};

export const TOWNS = {
  oakvale: {
    name: 'Oakvale',
    blurb: 'A market town built around an enormous oak. Wool, cheese and gossip are its main exports.',
    art: { sky: ['#a9d3ea', '#e9f1df'], hills: ['#9cbf73', '#7ea65a'], ground: '#cdb98a', walls: '#efe3c6',
      roofs: ['#a4553a', '#8b6a3c', '#b56d43', '#7d4b32'], landmark: 'oak' },
    places: {
      center: 'The square around the old oak. Market stalls, a well, a noticeboard and a bench nobody ever seems to leave.',
      guild: 'A narrow room above the cooper\'s, with a clerk and a board of contracts.',
      market: 'Stalls along the square. Bread, rope, lamp oil, the usual.',
      caravan: 'Your wagon is parked by the well, the wool bales roped down under the cover.',
    },
    prices: { ration: 1 },
    departures: ['oakvale-stonehaven'],
    notices: [
      { id: 'carter_note', title: 'A carter\'s note', flag: 'heard_ford',
        text: 'Pinned under a nail, in pencil: "Weir bridge on the Stonehaven road worse than last year. I\'ve been crossing at the old ford below Millbrook. Knee deep, firm bottom. — Pell"' },
      { id: 'wool_notice', title: 'Wanted in Stonehaven',
        text: 'Mistress Aldine, Fuller\'s Row, Stonehaven, is buying good fleece. Your wool is already promised to her, which is why you\'re going.' },
    ],
    locals: [
      { name: 'Hollis, granary keeper', lines: [
        'If you\'re heading for the guild, the rat job\'s mine. Honest work, and no one gets hurt. Probably.',
        'Wool for Stonehaven? Aldine will haggle you down to nothing and then give you lunch. Every time.',
      ] },
    ],
  },
  stonehaven: {
    name: 'Stonehaven',
    blurb: 'A grey stone town on the edge of the quarries. Everything here is built to last, including the arguments.',
    art: { sky: ['#b8c7d6', '#ece8de'], hills: ['#9aa39a', '#7d877f'], ground: '#bdb3a2', walls: '#cfc8bb',
      roofs: ['#5f6b77', '#6e5d52', '#4f5b66', '#7a6a5c'], landmark: 'tower' },
    places: {
      center: 'A paved square below the watch tower. The fountain works, mostly.',
      guild: 'The guild hall shares a building with the quarry office. The contracts are mostly about holes.',
      market: 'A covered market. Prices are higher here; everything has come up the same road you did.',
      caravan: 'The wagon is in the yard behind the Lantern inn, finally empty of wool.',
    },
    prices: { ration: 2 },
    departures: [],
    notices: [
      { id: 'quarry_notice', title: 'Quarry office',
        text: 'Surveyors and steady hands wanted for the old cuts. Enquire at the guild. No cats.' },
    ],
    locals: [
      { name: 'Dunstan, at the fountain', lines: [
        'Wool, is it? Aldine\'s been watching the road for a week.',
      ], flagLines: { repaired_bridge: 'A carter came through saying someone\'s mended the weir bridge. About time somebody did.' } },
    ],
  },
};

export const ROUTES = {
  'oakvale-stonehaven': {
    from: 'oakvale', to: 'stonehaven', hours: 30,
    blurb: 'East along the river and up into the hills. About 30 hours on the road at the wagon\'s pace.',
    events: [{ id: 'weir_bridge', at: 0.45 }],
    chatter: [
      { id: 'wheel', at: 0.08, lines: [
        ['comp_b', 'Is the wheel meant to sound like that?'],
        ['merchant', 'It\'s sounded like that since spring.'],
        ['comp_b', 'That isn\'t really an answer.'],
      ] },
      { id: 'weather', at: 0.25, lines: [
        ['comp_a', 'Weather\'s holding.'],
        ['comp_b', 'Good. I only packed the one coat.'],
      ] },
      { id: 'indep_pace', at: 0.58, requires: { traveling: 'indep' }, lines: [
        ['indep', 'Do you always travel this slowly?'],
        ['comp_a', 'Only when we\'re carrying wool.'],
      ] },
      { id: 'caraway', at: 0.72, lines: [
        ['comp_a', 'They put caraway in the bread in Stonehaven.'],
        ['merchant', 'Is that good?'],
        ['comp_a', 'Depends who you ask.'],
      ] },
      { id: 'walls', at: 0.93, lines: [
        ['merchant', 'There are the walls.'],
        ['comp_b', 'Finally. I could sleep for a week.'],
      ] },
    ],
  },
};
