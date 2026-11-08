// Campaign data: acts, missions, drills, Paddle School and the Codebook.

export const ACTS = [
  { n: 1, name: 'Boot Camp', blurb: 'Tanks, Infantry, Go, Hold and the closing K.' },
  { n: 2, name: 'The Front', blurb: 'Two units, fog of war, and the reports lose their subtitles.' },
  { n: 3, name: 'Night Ops', blurb: 'Audio-only reports. The ghost track fades.' },
  { n: 4, name: 'Radio Silence', blurb: 'Faster keying, jamming, spoofed orders. No more help.' },
  { n: 5, name: 'Finale', blurb: 'Every unit needs orders.' },
];

const O = {
  reach: (unit, col, text) => ({ type: 'reach', unit, col, text }),
  holdzone: (unit, col, phrases, text) => ({ type: 'holdzone', unit, col, phrases, text }),
  destroy: (kind, text) => ({ type: 'destroy', kind, text }),
  survive: (phrases, units, text) => ({ type: 'survive', phrases, units, text }),
  nobreak: (text) => ({ type: 'nobreak', text }),
  relay: (count, text) => ({ type: 'relay', count, text }),
};

const sq = (t, row, col, hp) => ({ t, row, col, hp });
const en = (k, row, col, hp) => ({ k, row, col, hp });

export const MISSIONS = [
  // ---------------- Act 1: Boot Camp ----------------
  {
    n: 1, act: 1, title: 'First Contact', song: 'boot', bpm: 90,
    newLetters: ['T', 'G', 'K'],
    drill: [['T'], ['G'], ['K'], ['T'], ['G'], ['K']],
    setup: { squads: [sq('T', 1, 0)], enemies: [] },
    objectives: [O.reach('T', 4, 'Get the Tanks to zone 5')],
    maxPhrases: 7,
    briefing: [
      "Lieutenant Sparks? Corporal Ada Vance, signals. HQ has gone dark — you're in command now.",
      'All we have is this telegraph key. A short tap is a dit (·), a hold three times as long is a dah (—).',
      'Every order is WHO, WHAT, OVER. Tanks are T (—), Go is G (——·), and we close with K (—·—).',
      'Spacing matters too. Inside a letter, leave one tick of silence. Between letters, wait three ticks.',
      'After you let go, green marks scroll toward the key line: "NEXT LETTER" is where the next letter starts. Avoid the red patch — that gap is neither.',
      'Watch the tape. Key what it shows, right on the beat.',
    ],
  },
  {
    n: 2, act: 1, title: 'Hold the Line', song: 'boot', bpm: 95,
    newLetters: ['H'],
    drill: [['H'], ['H'], ['T', 'H', 'K']],
    setup: { squads: [sq('T', 1, 2)], enemies: [en('rifle', 1, 5), en('rifle', 1, 4)] },
    objectives: [O.survive(4, ['T'], 'Keep the Tanks in the fight')],
    maxPhrases: 4,
    briefing: [
      'Enemy rifles are coming down the road toward our Tanks.',
      'H is Hold: four quick dits (····). Holding halves the damage we take.',
      'Tanks can also Go straight into them — they ram whatever is in front.',
    ],
  },
  {
    n: 3, act: 1, title: 'New Recruits', song: 'boot', bpm: 100,
    newLetters: ['I'],
    drill: [['I'], ['I'], ['I', 'G', 'K'], ['I', 'H', 'K']],
    setup: { squads: [sq('I', 1, 0)], enemies: [en('rifle', 1, 5)] },
    objectives: [O.holdzone('I', 2, 2, 'Infantry hold the crossroads (zone 3)')],
    maxPhrases: 6,
    briefing: [
      'Infantry have joined us. Their call sign is I: two dits (··).',
      'Infantry take and hold ground. Get them to the crossroads and keep them there two phrases.',
      'Careful — I (··) and H (····) are cousins. Count your dits.',
    ],
  },
  {
    n: 4, act: 1, title: 'Decode: Orders from HQ', song: 'boot', bpm: 105, decode: true,
    newLetters: [],
    setup: { squads: [sq('T', 1, 0), sq('I', 0, 0)], enemies: [en('rifle', 1, 5), en('rifle', 0, 4)] },
    objectives: [O.relay(4, 'Relay HQ orders correctly')],
    maxPhrases: 6,
    briefing: [
      "HQ is back on the line — but they're sending orders in Morse, no subtitles.",
      'Listen to the incoming report, work out the two letters, and relay it to the right unit.',
      "You know T, I, G and H. If you're not sure, watch the lamp: it flashes the message too.",
    ],
  },

  // ---------------- Act 2: The Front ----------------
  {
    n: 5, act: 2, title: 'Eyes Forward', song: 'front', bpm: 110,
    newLetters: ['S'],
    drill: [['S'], ['S'], ['S', 'G', 'K'], ['S', 'H', 'K']],
    setup: { fog: true, squads: [sq('S', 0, 0), sq('I', 1, 0)], enemies: [en('rifle', 1, 4), en('post', 0, 5)] },
    objectives: [O.reach('S', 3, 'Scouts reach zone 4')],
    maxPhrases: 7,
    briefing: [
      'The front. Fog everywhere — we only see a zone ahead of our units.',
      'Scouts are S: three dits (···). They see three zones ahead.',
      'From now on, two units answer to you. Pick who gets the order.',
    ],
  },
  {
    n: 6, act: 2, title: 'Open Fire', song: 'front', bpm: 115,
    newLetters: ['F'],
    drill: [['F'], ['F'], ['T', 'F', 'K'], ['I', 'F', 'K']],
    setup: { fog: true, squads: [sq('T', 1, 0), sq('I', 2, 0)], enemies: [en('rifle', 1, 3), en('rifle', 2, 4)] },
    objectives: [O.destroy('rifle', 'Knock out the enemy rifles')],
    maxPhrases: 9,
    briefing: [
      'F is Fire: dit-dit-dah-dit (··—·). Units fire at the nearest target they can see in their lane.',
      'A Crisp order hits half again as hard. Sloppy ones arrive late.',
    ],
  },
  {
    n: 7, act: 2, title: 'Fall Back', song: 'front', bpm: 118,
    newLetters: ['R'],
    drill: [['R'], ['R'], ['I', 'R', 'K'], ['S', 'R', 'K']],
    setup: { fog: true, squads: [sq('I', 1, 3, 60), sq('S', 0, 3, 70)], enemies: [en('armor', 1, 5), en('rifle', 0, 5), en('rifle', 1, 4)] },
    objectives: [O.survive(5, ['I', 'S'], 'Bring both units through')],
    maxPhrases: 5,
    briefing: [
      "We pushed too far. Armour is coming and we can't stop it yet.",
      'R is Retreat: dit-dah-dit (·—·). Fall back a zone, patch up, live to fight.',
      'Watch it: hold the dah too short and ·—· becomes ··· — the Scouts answer instead.',
    ],
  },
  {
    n: 8, act: 2, title: 'Big Guns', song: 'front', bpm: 120,
    newLetters: ['A'],
    drill: [['A'], ['A'], ['A', 'F', 'K'], ['A', 'G', 'K']],
    setup: { fog: true, squads: [sq('A', 2, 1), sq('S', 0, 1)], enemies: [en('gun', 0, 5), en('rifle', 1, 4)] },
    objectives: [O.destroy('gun', 'Silence the enemy battery')],
    maxPhrases: 9,
    briefing: [
      'Artillery, call sign A (·—). They fire on any marked target up to four zones ahead, in any lane.',
      "But they can't hit what we can't see. Scouts mark the targets; Artillery does the rest.",
    ],
  },
  {
    n: 9, act: 2, title: 'Pincer', song: 'front', bpm: 125,
    newLetters: [], subtitles: 'partial',
    setup: { fog: true, squads: [sq('T', 1, 0), sq('I', 0, 0)], enemies: [en('rifle', 0, 3), en('armor', 1, 4)] },
    objectives: [O.destroy(null, 'Clear the valley')],
    maxPhrases: 10,
    briefing: [
      'Two lanes, two enemies, two units. No new letters — just you and the beat.',
      "Reports are getting harder to read. I'll still suggest an order.",
    ],
  },
  {
    n: 10, act: 2, title: 'Decode: Ridge Report', song: 'front', bpm: 128, decode: true,
    newLetters: [],
    setup: { fog: true, squads: [sq('S', 0, 1), sq('A', 2, 0), sq('I', 1, 1)], enemies: [en('gun', 0, 5), en('rifle', 1, 4)] },
    objectives: [O.relay(4, 'Relay HQ orders correctly')],
    maxPhrases: 6,
    briefing: [
      'HQ again. Faster now, and the alphabet is bigger: T, I, S, A and G, H, F, R.',
      'Decode the call sign and the order, then send it on with K.',
    ],
  },

  // ---------------- Act 3: Night Ops ----------------
  {
    n: 11, act: 3, title: 'Field Hospital', song: 'night', bpm: 130,
    newLetters: ['M'],
    drill: [['M'], ['M'], ['M', 'F', 'K'], ['M', 'H', 'K']],
    setup: { fog: true, squads: [sq('M', 1, 0), sq('I', 1, 2, 55), sq('T', 2, 1)], enemies: [en('rifle', 1, 4), en('rifle', 2, 5)] },
    objectives: [O.survive(5, ['I', 'M'], 'Keep Infantry and Medics alive')],
    maxPhrases: 5,
    briefing: [
      'Night falls. From here the reports are audio only — no lamp, no subtitles.',
      'Medics are M (——). Medics, Fire means "treat the most wounded unit nearby".',
      "I'll only suggest an order if you hesitate.",
    ],
  },
  {
    n: 12, act: 3, title: 'Dig In', song: 'night', bpm: 134,
    newLetters: ['D'],
    drill: [['D'], ['D'], ['I', 'D', 'K'], ['T', 'D', 'K']],
    setup: {
      fog: true,
      squads: [sq('I', 1, 2), sq('T', 0, 2), sq('M', 2, 1)],
      enemies: [en('rifle', 1, 5), en('rifle', 0, 5)],
      waves: [
        { turn: 2, enemies: [en('armor', 1, 5)] },
        { turn: 3, enemies: [en('rifle', 2, 5), en('rifle', 0, 5)] },
      ],
    },
    objectives: [O.survive(6, [], 'Hold until dawn'), O.nobreak('Nobody gets past')],
    maxPhrases: 6,
    briefing: [
      'They are throwing everything at the line tonight.',
      "D is Dig in (—··). Huge protection, but the unit can't move next phrase.",
    ],
  },
  {
    n: 13, act: 3, title: 'Smoke Screen', song: 'night', bpm: 138,
    newLetters: ['C'],
    drill: [['C'], ['C'], ['S', 'C', 'K'], ['C']],
    setup: { fog: true, squads: [sq('S', 0, 0), sq('A', 2, 0)], enemies: [en('gun', 0, 5), en('post', 2, 5)] },
    objectives: [O.reach('S', 4, 'Scouts reach the far bank (zone 5)')],
    maxPhrases: 9,
    briefing: [
      "A battery covers the Scouts' lane. Walking in plain sight is suicide.",
      'C is Cover: dah-dit-dah-dit (—·—·). A unit in smoke cannot be targeted for one phrase.',
      'Or find another way to silence that gun.',
    ],
  },
  {
    n: 14, act: 3, title: 'Mayday', song: 'night', bpm: 142,
    newLetters: ['SOS'],
    drill: [['SOS'], ['SOS']],
    setup: {
      fog: true,
      squads: [sq('I', 1, 1, 45), sq('T', 0, 1, 50), sq('M', 2, 1, 40)],
      enemies: [en('rifle', 1, 3), en('rifle', 0, 4), en('armor', 2, 4)],
    },
    objectives: [O.survive(5, ['I', 'T', 'M'], 'Everyone survives the night')],
    maxPhrases: 5,
    briefing: [
      "We're surrounded and hurting. Time for the oldest signal there is.",
      'SOS: ···———··· in one run, no gaps between letters. Reinforcements, once per mission.',
      'No K needed — just get it out clean.',
    ],
  },
  {
    n: 15, act: 3, title: 'Night Raid', song: 'night', bpm: 146,
    newLetters: [],
    setup: {
      fog: true,
      squads: [sq('T', 1, 0), sq('I', 0, 0), sq('S', 0, 1), sq('A', 2, 0)],
      enemies: [en('gun', 0, 5), en('armor', 1, 4), en('rifle', 2, 4)],
    },
    objectives: [O.destroy('gun', 'Destroy the battery'), O.reach('I', 3, 'Infantry take zone 4')],
    maxPhrases: 13,
    briefing: [
      'Four units, one raid. The battery on the ridge has to go before dawn.',
      'You know every order now. Choose well.',
    ],
  },
  {
    n: 16, act: 3, title: 'Decode: Night Signal', song: 'night', bpm: 150, decode: true,
    newLetters: [],
    setup: {
      fog: true,
      squads: [sq('T', 1, 1), sq('M', 2, 0), sq('S', 0, 1), sq('A', 2, 1)],
      enemies: [en('rifle', 1, 4), en('gun', 0, 5), en('armor', 2, 5)],
    },
    objectives: [O.relay(5, 'Relay HQ orders correctly')],
    maxPhrases: 7,
    briefing: [
      'HQ, by ear only. Fast. Five orders to relay.',
      "Trust your ears, Lieutenant. I've stopped worrying about you.",
    ],
  },

  // ---------------- Act 4: Radio Silence ----------------
  {
    n: 17, act: 4, title: 'All Stations', song: 'silence', bpm: 100, unitDiv: 4,
    newLetters: ['Q'],
    drill: [['Q'], ['C', 'Q'], ['C', 'Q', 'G', 'K']],
    setup: { squads: [sq('T', 0, 0), sq('I', 1, 0), sq('S', 2, 0)], enemies: [] },
    objectives: [O.reach('ALL', 3, 'Every unit reaches zone 4')],
    maxPhrases: 5,
    briefing: [
      "The enemy is listening to every signal now. We key faster — a dit is a sixteenth note.",
      'CQ (—·—· ——·—) instead of a call sign means ALL units. Long and risky, but powerful.',
      "Five phrases, three units, three zones. Do the maths. And from now on — no hints.",
    ],
  },
  {
    n: 18, act: 4, title: 'Over and Out', song: 'silence', bpm: 104, unitDiv: 4,
    newLetters: ['AR'],
    drill: [['AR'], ['AR'], ['AR']],
    setup: {
      fog: true,
      squads: [sq('T', 1, 0), sq('A', 2, 0), sq('I', 0, 0)],
      enemies: [en('rifle', 0, 3), en('rifle', 1, 4), en('post', 2, 5)],
    },
    objectives: [O.destroy(null, 'Clear the sector')],
    maxPhrases: 12,
    signoff: true,
    briefing: [
      'AR (·—·—·) is "end of message". Clear the sector, then close the line with AR for a bonus.',
    ],
  },
  {
    n: 19, act: 4, title: 'Jammed', song: 'silence', bpm: 108, unitDiv: 4,
    tempos: [108, 116, 100, 114, 104, 120, 110, 118, 106, 112],
    swing: [0, 0, 0.6, 0, 0.62, 0, 0.6, 0, 0, 0.6],
    newLetters: [],
    setup: {
      fog: true,
      squads: [sq('T', 1, 0), sq('I', 0, 1), sq('M', 2, 0)],
      enemies: [en('armor', 1, 4), en('rifle', 0, 4)],
    },
    objectives: [O.destroy(null, 'Clear the sector')],
    maxPhrases: 10,
    signoff: true,
    briefing: [
      "They're jamming us. The tempo will shift between phrases and the music may swing.",
      'The grid under your key stays straight. Listen to the beat, not the noise.',
    ],
  },
  {
    n: 20, act: 4, title: 'Spoofed', song: 'silence', bpm: 112, unitDiv: 4, decode: true,
    spoof: [1, 3, 5],
    newLetters: [],
    setup: {
      fog: true,
      squads: [sq('T', 1, 1), sq('S', 0, 1), sq('I', 2, 1)],
      enemies: [en('gun', 0, 5), en('rifle', 1, 4), en('rifle', 2, 5)],
    },
    objectives: [O.relay(5, 'Relay real orders, ignore fakes')],
    maxPhrases: 7,
    briefing: [
      'The enemy is spoofing HQ. Some incoming orders are fakes, built to walk us into fire.',
      "Their operator is sloppy — fake orders wobble off the beat. Real HQ keys dead on the grid.",
      "Relay the real ones. For a fake, send anything else: Hold is safe.",
    ],
  },
  {
    n: 21, act: 4, title: 'Five Squads', song: 'silence', bpm: 116, unitDiv: 4,
    tempos: [116, 116, 122, 110, 116, 124, 112, 118, 120, 116, 124, 114],
    newLetters: [],
    setup: {
      fog: true,
      squads: [sq('T', 1, 0), sq('I', 0, 1), sq('S', 0, 0), sq('M', 2, 0), sq('A', 2, 1)],
      enemies: [en('gun', 0, 5), en('armor', 1, 4), en('rifle', 0, 4), en('rifle', 2, 3)],
      waves: [{ turn: 4, enemies: [en('rifle', 1, 5)] }],
    },
    objectives: [O.destroy(null, 'Break the enemy line')],
    maxPhrases: 12,
    signoff: true,
    briefing: [
      'Every unit we have, every letter you know. This is the push.',
    ],
  },
  {
    n: 22, act: 4, title: 'Decode: The Last Message', song: 'silence', bpm: 120, unitDiv: 4, decode: true,
    tempos: [120, 112, 124, 116, 120, 110, 126],
    spoof: [2, 4],
    newLetters: [],
    setup: {
      fog: true,
      squads: [sq('T', 1, 1), sq('S', 0, 1), sq('M', 2, 0), sq('A', 2, 1)],
      enemies: [en('gun', 0, 5), en('armor', 1, 4), en('rifle', 2, 4)],
    },
    objectives: [O.relay(5, 'Relay real orders, ignore fakes')],
    maxPhrases: 7,
    briefing: [
      'Jamming and spoofing together. HQ says this is the last order set before the ceasefire talks.',
      "Real orders are clean. Fakes wobble. You know the difference now.",
    ],
  },

  // ---------------- Finale ----------------
  {
    n: 23, act: 5, title: 'Peace Signal', song: 'finale', bpm: 108, unitDiv: 4,
    tempos: [108, 112, 116, 120, 112, 124, 116, 120, 110, 118],
    newLetters: ['P', 'E'],
    drill: [['P'], ['E'], ['P', 'E', 'A', 'C', 'E']],
    setup: {
      fog: true,
      squads: [sq('T', 1, 0), sq('I', 0, 1), sq('S', 0, 0), sq('M', 2, 0), sq('A', 2, 1)],
      enemies: [en('gun', 0, 5), en('armor', 1, 4), en('rifle', 2, 4), en('rifle', 0, 4)],
      waves: [{ turn: 3, enemies: [en('armor', 2, 5)] }],
    },
    objectives: [O.destroy('gun', 'Silence the last battery'), O.survive(5, [], 'Hold for five phrases')],
    maxPhrases: 12,
    finale: true,
    briefing: [
      'This is it, Lieutenant. One last song.',
      "Silence the last battery and hold. Then — and I've waited the whole war to say this — we send something different.",
      'P is ·——·, E is a single dit. You will know what to do.',
    ],
  },
];

// Letters the player knows at each mission (cumulative).
const BASE_KNOWN = [];
for (const m of MISSIONS) {
  for (const l of m.newLetters) if (!BASE_KNOWN.includes(l)) BASE_KNOWN.push(l);
  m.known = new Set(BASE_KNOWN);
  m.id = 'm' + m.n;
  m.unitDiv = m.unitDiv || 2;
}

export const PADDLE_LESSONS = [
  {
    id: 'p1', n: 1, title: 'Two Paddles', bpm: 96, unitDiv: 2,
    text: 'Left paddle = dit, right paddle = dah. The keyer sizes every element for you.',
    items: [['E'], ['T'], ['I'], ['M'], ['A'], ['N'], ['E'], ['T'], ['A'], ['N']],
  },
  {
    id: 'p2', n: 2, title: 'Let the Keyer Time It', bpm: 104, unitDiv: 2,
    text: "Hold a paddle and the keyer repeats perfect elements. You're judged on when each starts and on your gaps.",
    items: [['S'], ['H'], ['O'], ['I'], ['M'], ['S'], ['O'], ['S']],
  },
  {
    id: 'p3', n: 3, title: 'Squeeze Keying', bpm: 104, unitDiv: 2,
    text: 'Hold both paddles and the keyer alternates dit-dah. The fast way to send C, K, R and A.',
    items: [['A'], ['R'], ['K'], ['C'], ['C', 'Q'], ['K']],
  },
  {
    id: 'p4', n: 4, title: 'Double Time', bpm: 108, unitDiv: 4,
    text: 'Act 2 orders, but each dit is a sixteenth note.',
    items: [['S', 'G', 'K'], ['A', 'F', 'K'], ['I', 'R', 'K'], ['T', 'F', 'K'], ['S', 'H', 'K']],
  },
  {
    id: 'p5', n: 5, title: 'Final Exam', mission: 6,
    text: 'Replay "Open Fire" entirely on paddles. Clear it for the Paddle medal.',
  },
];

// ---------------- Codebook ----------------
export const CODEBOOK = [
  { key: 'T', title: 'T  —', text: 'The longest single element in Morse is also one of the most common letters. Early operators called a lone dah a "dash"; hams say "dah".' },
  { key: 'E', title: 'E  ·', text: "E gets the shortest code because it is the most common letter in English. Alfred Vail reportedly counted type in a printer's case to decide." },
  { key: 'I', title: 'I  ··', text: 'Two dits. With E, I, S, H and 5 you can hear the "dit ladder": one to five dits.' },
  { key: 'G', title: 'G  ——·', text: 'In ham shorthand "GM", "GA" and "GE" mean good morning, good afternoon and good evening.' },
  { key: 'H', title: 'H  ····', text: 'Four dits. At speed, H and 5 (·····) are the classic beginner mix-ups — count carefully.' },
  { key: 'K', title: 'K  —·—', text: 'K means "over — go ahead". KN means "go ahead, only the station I called".' },
  { key: 'S', title: 'S  ···', text: 'Three dits. Half of the most famous signal ever sent.' },
  { key: 'F', title: 'F  ··—·', text: 'F starts the same as U (··—) but adds a final dit. Many learners hear it as "di-di-dah-dit".' },
  { key: 'R', title: 'R  ·—·', text: 'R also means "received, understood". A quick "R R" is a nod over the air.' },
  { key: 'A', title: 'A  ·—', text: 'A is the "a" in "AR", the end-of-message prosign. One of the first letters most courses teach.' },
  { key: 'M', title: 'M  ——', text: 'Two dahs. M and T are the "dah ladder": T, M, O, then 0 at five dahs.' },
  { key: 'D', title: 'D  —··', text: 'The mirror image of U (··—). Learners often memorise Morse in mirror pairs.' },
  { key: 'C', title: 'C  —·—·', text: 'C has a famous rhythm: "dah-di-dah-dit", like "Char-lie Char-lie".' },
  { key: 'Q', title: 'Q  ——·—', text: 'Q starts the Q-codes: three-letter shorthand like QTH (location) and QSL (I confirm receipt).' },
  { key: 'P', title: 'P  ·——·', text: 'P sounds like "di-dah-dah-dit". Some learners hear the word "pa-SHOO-ter".' },
  { key: 'N', title: 'N  —·', text: 'The reverse of A. "N" alone often means "no".' },
  { key: 'O', title: 'O  ———', text: 'Three dahs — the middle of SOS.' },
  { key: 'SOS', title: 'SOS  ···———···', text: 'Adopted internationally in 1906 because it is easy to send and impossible to mistake. It never stood for "save our souls" — the letters were chosen for the sound.' },
  { key: 'AR', title: 'AR  ·—·—·', text: 'A prosign: two letters run together without a gap. It means "end of message".' },
  { key: 'CQ', title: 'CQ  —·—· ——·—', text: '"Calling any station." Hams still send "CQ CQ CQ" today when looking for a contact.' },
  { key: 'Q-QRM', mission: 4, title: 'QRM / QRN', text: 'QRM means man-made interference (like jamming); QRN means natural static. Both are Q-codes.' },
  { key: 'Q-QTH', mission: 10, title: 'QTH', text: '"My location is…" One of the most-used Q-codes on the air.' },
  { key: 'Q-QSL', mission: 16, title: 'QSL', text: '"I confirm receipt." Hams still mail each other QSL cards to confirm a contact.' },
  { key: 'Q-73', mission: 22, title: '73', text: '"Best regards." Operators sign off with 73. "88" means love and kisses.' },
  { key: 'Q-WPM', mission: 1, title: 'Words per minute', text: 'Speed is measured with the word PARIS (50 units). WPM = 1200 ÷ the length of a dit in milliseconds.' },
  { key: 'Q-PEACE', mission: 23, title: 'PEACE', text: '·——· · ·— —·—· ·  — the last message of the war, sent to both sides.' },
];

export const ADA_LINES = {
  crisp: ['Crisp as frost, sir.', 'Textbook.', 'Clean signal!', 'Beautiful fist, Lieutenant.', 'Right on the beat.'],
  clear: ['Clear copy.', 'Received.', 'Good signal.', 'They heard you.'],
  static: ['Bit of static there.', "A touch off the beat — they'll be late.", 'Readable… just.'],
  garbled: ['That came out garbled!', 'Say again?', "They didn't get that one.", "Count it out, sir."],
  silent: ['No transmission? The men are waiting.', 'Key something, sir!', 'Silence on the line…'],
  nok: ['Close with K or they wait for more.', "Don't forget the K!"],
  win: ['Objective secured. Good work, Sparks.', "That's how it's done.", 'HQ will hear about this.'],
  lose: ["We lost that one. Shake it off and go again.", "Not our night. Let's run it back."],
};

export const ENDING = [
  'The last battery falls silent. For a while, so does the radio.',
  'Then Ada slides the key across the table. "Both sides are listening, sir. Send it."',
  'You key five letters, slow and clean: P — E — A — C — E.',
  'Somewhere across the valley, an enemy operator keys back two letters: R. K.',
  'Received. Go ahead.',
  'THE END — thank you for playing Dit-Dah Command.',
];
