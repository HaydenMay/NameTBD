// Conversations and authored responses. Data only.
// Lines are [speaker, text]; speakers are cast keys ('merchant', 'comp_a', 'comp_b', 'indep').
// Conditions (all optional): town, place, status (of `with`), flag, notFlag, seen, notSeen.
// place 'center' = topics in the talk panel; ambient: true = said out loud in the scene as speech bubbles, no choices.
// effects use the same format as road events (core/events.js applyEffects).

export const CONVERSATIONS = [
  // ---- the independent adventurer, Oakvale ----
  { id: 'indep_intro', with: 'indep', town: 'oakvale', place: 'center', status: 'independent', once: true,
    label: 'Introduce yourself',
    lines: [
      ['indep', 'Morning. Is that your wagon by the well?'],
      ['merchant', 'It is. I\'m {merchant}. Wool, mostly, and whatever else needs carrying.'],
      ['indep', '{indep}. I take guild work when there\'s any going. There hasn\'t been much this week.'],
    ],
    effects: [{ trust: { who: 'indep', amount: 5, reason: 'Introduced yourself in Oakvale' } }] },
  { id: 'indep_plans', with: 'indep', town: 'oakvale', place: 'center', status: 'independent', once: true, seen: 'indep_intro',
    label: 'Ask about their plans',
    lines: [
      ['indep', 'I\'m heading east. Stonehaven has the quarries, and quarries always need someone to go down a hole first.'],
      ['merchant', 'We\'re going to Stonehaven too.'],
      ['indep', 'Then I\'ll probably see you there. I\'ll walk, though. I don\'t like paying for a seat.'],
    ],
    effects: [{ trust: { who: 'indep', amount: 5, reason: 'Took an interest in their plans' } }] },
  { id: 'indep_watchtower', with: 'indep', town: 'oakvale', place: 'center', status: 'independent', once: true, seen: 'indep_intro',
    notFlag: 'referred_watchtower', label: 'Mention the watchtower job',
    lines: [
      ['indep', 'The watchtower? I\'ve been looking at that one. The money\'s good.'],
      ['merchant', 'From what I\'ve heard, it\'s work for four or five people, not one.'],
      ['indep', 'Yes. That\'s what I was afraid of. Thanks for saying so.'],
    ],
    effects: [{ trust: { who: 'indep', amount: 5, reason: 'Gave honest advice about the watchtower' } }] },
  { id: 'indep_baker', with: 'indep', town: 'oakvale', place: 'center', status: 'independent', seen: 'indep_intro',
    label: 'Small talk',
    lines: [
      ['indep', 'The baker on the corner sells out by nine. I found that out yesterday.'],
      ['merchant', 'The one with the blue door?'],
      ['indep', 'That one. The pies are worth getting up for.'],
    ] },

  // ---- the independent adventurer, Stonehaven ----
  { id: 'indep_sh_hello', with: 'indep', town: 'stonehaven', place: 'center', status: 'independent', once: true,
    label: 'Catch up',
    lines: [
      ['indep', 'You made it. How was the road?'],
      ['merchant', 'Long. The weir bridge was in a bad way.'],
      ['indep', 'I took the ferry at Lowmere. Cost me two silver, but I kept my boots dry.'],
    ],
    effects: [{ trust: { who: 'indep', amount: 5, reason: 'Caught up in Stonehaven' } }] },
  { id: 'indep_sh_town', with: 'indep', town: 'stonehaven', place: 'center', status: 'independent',
    label: 'Small talk',
    lines: [
      ['indep', 'Everyone here talks about stone like other people talk about the weather.'],
      ['merchant', 'Is there much else to talk about?'],
      ['indep', 'The weather, apparently.'],
    ] },

  // ---- traveling companions: ambient small talk in town (speech bubbles) ----
  { id: 'oak_breakfast', with: 'comp_b', town: 'oakvale', place: 'town', ambient: true, once: true, status: 'traveling', label: 'Chat',
    lines: [
      ['comp_b', 'Is there anywhere to get breakfast?'],
      ['comp_a', 'The bakery on the corner, if they haven\'t sold out.'],
    ] },
  { id: 'sh_grey', with: 'comp_b', town: 'stonehaven', place: 'town', ambient: true, once: true, status: 'traveling', label: 'Chat',
    lines: [
      ['comp_b', 'Everything here is grey.'],
      ['comp_a', 'You get used to it.'],
    ] },
  { id: 'compa_road', with: 'comp_a', town: 'oakvale', place: 'town', ambient: true, once: true, status: 'traveling', label: 'Ask about the road',
    lines: [
      ['comp_a', 'Two days, if the weather holds. There\'s a bridge at the weir that\'s been half rotten since I was a boy. We\'ll see how it\'s doing.'],
    ] },
  { id: 'compb_socks', with: 'comp_b', town: 'oakvale', place: 'town', ambient: true, once: true, status: 'traveling', label: 'Chat',
    lines: [
      ['comp_b', 'I bought new socks. Three pairs.'],
      ['merchant', 'That\'s a lot of socks.'],
      ['comp_b', 'It\'s a long road.'],
    ] },
  { id: 'compa_home_ok', with: 'comp_a', town: 'stonehaven', place: 'town', ambient: true, once: true, status: 'traveling', flag: 'drovers_ok', label: 'Chat',
    lines: [
      ['comp_a', 'The old track held. I wasn\'t completely sure it would.'],
      ['merchant', 'You didn\'t look unsure.'],
      ['comp_a', 'That\'s the trick of it.'],
    ] },
  { id: 'compa_home_bad', with: 'comp_a', town: 'stonehaven', place: 'town', ambient: true, once: true, status: 'traveling', flag: 'drovers_bad', label: 'Chat',
    lines: [
      ['comp_a', 'Sorry again about the track. It used to be better than that.'],
      ['merchant', 'We got here.'],
    ] },
  { id: 'compa_home', with: 'comp_a', town: 'stonehaven', place: 'town', ambient: true, once: true, status: 'traveling', notFlag: ['drovers_ok', 'drovers_bad'], label: 'Chat',
    lines: [
      ['comp_a', 'Good to see the walls again. I grew up two valleys over.'],
    ] },
  { id: 'compb_chapel', with: 'comp_b', town: 'stonehaven', place: 'town', ambient: true, once: true, status: 'traveling', label: 'Chat',
    lines: [
      ['comp_b', 'There\'s a proper chapel here. I\'d like an hour there before we do anything else, if that\'s all right.'],
      ['merchant', 'Take two.'],
    ] },
  { id: 'indep_traveling', with: 'indep', place: 'town', ambient: true, once: true, status: 'traveling', label: 'Chat',
    lines: [
      ['indep', 'The bedroll\'s better than the ones at the guild house. Don\'t tell them I said that.'],
    ] },
];

// Said when you tap a companion who has nothing new to talk about.
export const IDLE_LINES = {
  merchant: ['Right. What next?'],
  comp_a: ['Ready when you are.', 'I\'ll keep an eye on the wagon.'],
  comp_b: ['I\'m fine, thanks.', 'Nice enough day for it.'],
  indep: ['Something you need?', 'I\'m listening.'],
};

// The independent adventurer's answer to a recommendation.
// reason: accept | too_hard | too_dangerous; honest = you told it straight.
export const REFERRAL_RESPONSES = {
  accept_honest: [['indep', '{contract}? I can manage that. Thanks for thinking of me.']],
  accept_easy: [['indep', 'If you say it\'s an easy one, I\'ll take it. Thanks.']],
  too_hard: [['indep', 'On my own? I don\'t think I\'d pull that off. Thanks, though.']],
  too_dangerous: [['indep', 'That\'s more danger than I take on alone. I\'ll pass on that one.']],
};

// Report when you next meet. Keys: success/fail + clean/hurt.
export const REFERRAL_REPORTS = {
  success_clean: [['indep', 'The {contract} job went fine. Paid what they said, too. That was a good tip.']],
  success_hurt: [['indep', 'I finished the {contract} job. It was rougher than I expected. I\'ll be stiff for a few days.']],
  fail_clean: [['indep', 'The {contract} job didn\'t work out. Nobody got hurt, at least. These things happen.']],
  fail_hurt: [['indep', 'I nearly didn\'t walk away from the {contract} job. I\'m still not sure how I did.']],
};
export const REFERRAL_REPORT_EASY = {   // extra line when you made a job sound easier than it was and it went badly
  success_hurt: ['indep', 'You made it sound a lot easier than it was.'],
  fail_clean: ['indep', 'It was nothing like you described.'],
  fail_hurt: ['indep', 'You told me it was an easy one. I\'ll remember that.'],
};

export const INVITE_RESPONSES = {
  accept: [
    ['merchant', 'There\'s room on the wagon, if you\'d like to travel with us.'],
    ['indep', 'I\'d like that. I\'ve been thinking about it, honestly. Where do I put my things?'],
  ],
  no_room: [
    ['merchant', 'Would you want to travel with us?'],
    ['indep', 'Maybe. But where would I sleep? You\'ve barely room for the people you\'ve got. If that changes, ask me again.'],
  ],
  low_trust: [
    ['merchant', 'Would you want to travel with us?'],
    ['indep', 'I appreciate it. I think I\'d like to know you a bit better first.'],
  ],
};

export const INTRO = 'You trade wool and odds and ends along the river towns. This season your wagon is loaded with fleece promised to Mistress Aldine in Stonehaven, two days east. Two adventurers travel with you. They aren\'t hired hands. They come along because it suits them, and they take guild work in the towns you pass through.';
