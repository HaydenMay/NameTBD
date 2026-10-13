// Contracts on the guild boards. Data only; rules live in core/rules.js.
// skill: attribute that counts toward party strength. difficulty: party strength needed for a 50% chance.
// danger: 0 none, 1 low (injuries only), 2 serious (death possible), 3 deadly. Separate from difficulty.
// referable: can be recommended to an independent adventurer.

export const CONTRACTS = {
  granary_rats: {
    town: 'oakvale', title: 'Rats in the Granary', giver: 'Hollis, granary keeper',
    description: 'Something has been chewing through the grain sacks at the east granary. Probably rats, possibly a lot of them. Hollis wants it dealt with before the harvest comes in.',
    skill: 'wits', difficulty: 6, danger: 0, hours: 4, reward: 25, xp: 20, referable: true,
    success: 'It was rats, plus one very offended badger. The granary is clear and Hollis paid without arguing.',
    failure: 'They found the runs but not the nest, which seems to be under a floor Hollis won\'t let anyone lift. No pay.',
  },
  harrow_wolves: {
    town: 'oakvale', title: 'Wolves at Harrow Farm', giver: 'the Harrow family',
    description: 'Wolves have taken two sheep from Harrow Farm this month. The family wants them driven off the near hills. It means a long night out, and wolves bite.',
    skill: 'might', difficulty: 13, danger: 1, hours: 8, reward: 55, xp: 40,
    success: 'They found the pack at dawn and made enough noise to move it two valleys over. Old Harrow shook everyone\'s hand twice.',
    failure: 'A cold night and no wolves, until the party had given up and was walking back. They lost the pack in the bracken.',
  },
  watchtower: {
    town: 'oakvale', title: 'Bandits in the Old Watchtower', giver: 'Oakvale town council',
    description: 'A group of bandits has moved into the ruined watchtower on the north road and has been stopping carts. The council wants them gone. Nobody knows how many there are; at least six, probably.',
    skill: 'might', difficulty: 20, danger: 2, hours: 12, reward: 110, xp: 70, referable: true,
    success: 'There were seven. After a long, ugly morning the tower is empty and the council has its road back.',
    failure: 'The bandits had the stairs and the high ground. After an hour of getting nowhere, the party pulled back.',
  },
  assayer_escort: {
    town: 'stonehaven', title: 'Walk the Assayer Home', giver: 'Master Quill, assayer',
    description: 'Master Quill is carrying a month\'s silver samples across town after dark and would like someone large standing next to him.',
    skill: 'might', difficulty: 9, danger: 0, hours: 3, reward: 20, xp: 15,
    success: 'An uneventful walk. Quill talked about ore grades the entire way and tipped well.',
    failure: 'Quill took one look at the escort, decided he didn\'t like the route, and went home another way on his own. No pay.',
  },
  quarry_survey: {
    town: 'stonehaven', title: 'Survey the Flooded Cut', giver: 'Stonehaven quarry office',
    description: 'The old north cut flooded in the spring. The quarry office needs someone to wade in, mark the safe ledges and check the props. Tricky, cold work; more pairs of eyes help.',
    skill: 'wits', difficulty: 15, danger: 1, hours: 6, reward: 50, xp: 40,
    success: 'Every ledge marked, two rotten props flagged, and the map is better than the one the office had.',
    failure: 'The water was higher than anyone said. They marked half the cut before calling it.',
  },
};
