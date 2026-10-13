// Authored road events. New events are data only: add an entry here and list it in a route's `events`.
// requires: { flag } | { traveling: castKey } | { provisions: n }
// outcomes: one entry, or several with `chance` (must sum to 1).
// effects: { delay: hours stopped } { distance: extra road hours } { provisions: ±n } { gold: ±n }
//          { trust: { who: castKey, amount, reason } } { flag: name }
// chronicle: short past-tense line for the Caravan Chronicle.

export const EVENTS = {
  weir_bridge: {
    title: 'The Weir Bridge',
    text: 'The road drops down to the River Wend. The bridge at the weir is still standing, but two planks are missing and a third has split along its length. It won\'t take the wagon as it is.',
    choices: [
      {
        id: 'repair', label: 'Repair the bridge',
        detail: 'About 5 hours of work, and it uses up 3 provisions\' worth of rope, pegs and spare timber.',
        outcomes: [{
          effects: [{ delay: 5 }, { provisions: -3 }, { flag: 'repaired_bridge' }],
          text: 'It takes most of the afternoon. {comp_a} does the heavy lifting, {comp_b} ties knots, and the wagon rolls across with only a little creaking. The next carter will have an easier time of it.',
          chronicle: 'Repaired the weir bridge on the Stonehaven road and crossed safely.',
        }],
      },
      {
        id: 'detour', label: 'Go round by Millbrook',
        detail: 'The long way, by the Millbrook bridge. Safe, but about 12 more hours on the road.',
        outcomes: [{
          effects: [{ distance: 12 }],
          text: 'You turn the wagon around and take the valley road. It\'s pleasant enough, and very long.',
          chronicle: 'Found the weir bridge broken and took the long road round by Millbrook.',
        }],
      },
      {
        id: 'ford', label: 'Use the ford from the carter\'s note', requires: { flag: 'heard_ford' },
        detail: 'Pell\'s note said the old ford below Millbrook was knee deep with a firm bottom. About 5 more hours.',
        outcomes: [{
          effects: [{ distance: 5 }],
          text: 'The ford is exactly where Pell said and exactly as deep. Wet boots all round, but the wagon crosses easily.',
          chronicle: 'Crossed the Wend at the old ford, thanks to a note on the Oakvale noticeboard.',
        }],
      },
      {
        id: 'drovers', label: 'Ask {comp_a} about the old drovers\' track', requires: { traveling: 'comp_a' },
        detail: '{comp_a} grew up near here and says there used to be a track over the hill. Probably about 3 more hours, if it\'s still passable.',
        outcomes: [
          {
            chance: 0.7,
            effects: [{ distance: 3 }, { flag: 'drovers_ok' }, { trust: { who: 'comp_a', amount: 5, reason: 'Trusted their knowledge of the hill roads' } }],
            text: 'The track is overgrown at the bottom but firm higher up. {comp_a} walks ahead the whole way and is quietly pleased when the road comes back into view.',
            chronicle: 'Took {comp_a}\'s old drovers\' track over the hill when the weir bridge was out.',
          },
          {
            chance: 0.3,
            effects: [{ distance: 9 }, { flag: 'drovers_bad' }, { trust: { who: 'comp_a', amount: 2, reason: 'Trusted their knowledge of the hill roads' } }],
            text: 'The track is there, but nobody has driven a cart up it in years. Clearing fallen branches takes hours. {comp_a} apologises more than once.',
            chronicle: 'Tried {comp_a}\'s old drovers\' track over the hill. It was slow going.',
          },
        ],
      },
    ],
  },
};
