const cards: ReadonlyMap<bigint, string> = (() => {
  const m = new Map();
  const suits = 'CDHS';
  const ranks = '23456789TJQKA';
  let c = 1n;
  for (let suit = 0; suit < 4; suit++) {
    for (let rank = 0; rank < 13; rank++) {
      m.set(c, ranks[rank] + suits[suit]);
      c <<= 1n;
    }
  }
  return m;
})();

function cardsToString(hand: bigint): string {
  const groups: string[] = [];
  const suits = 'CDHS';
  const ranks = '23456789TJQKA';
  for (let s = 0; s < 4; s++) {
    let suit = [];
    for (let r = 0; r < 13; r++) {
      if (hand & (1n << BigInt(13 * s + r))) {
        suit.unshift(ranks[r]);
      }
    }
    if (suit.length) groups.unshift(suits[s] + suit.join(''));
  }
  return groups.join(' ');
}

const suits: readonly bigint[] = [
  0x1FFFn, 0x1FFFn << 13n, 0x1FFFn << 26n, 0x1FFFn << 39n];
const ranks: readonly bigint[] = (() => {
  const out = [];
  let mask = 1n | 1n << 13n | 1n << 26n | 1n << 39n;
  for (let i = 0n; i < 13n; i++) {
    out.push(mask << i);
  }
  return out;
})();
const eights = ranks[6];

const match: ReadonlyMap<bigint, bigint> = (() => {
  const m = new Map();
  for (let i = 0n; i < 52n; i++) {
    const c = 1n << i;
    let mask = eights;
    for (const s of suits) {
      if (c & s) mask |= s;
    }
    for (const r of ranks) {
      if (c & r) mask |= r;
    }
    m.set(c, mask);
  }
  return m;
})();

const players = 4;
let deck = 0xFFFFFFFFFFFFFn;
let discard = 0n;
let lastDiscard = 0n;
let lastPlay = 0n;
let reshuffles = 0;
let hands = new Array(players).fill(0n);

function countBits(v: bigint): number {
  if (!v) return 0;
  const a =  v - ((v >> 1n) & 0x5555555555555555n);
  const b = (a & 0x3333333333333333n) + ((a >> 2n) & 0x3333333333333333n);
  const c = (b + (b >> 4n)) & 0x0f0f0f0f0f0f0f0fn;
  const d = (c + (c >> 8n)) & 0x00ff00ff00ff00ffn;
  const e = (d + (d >> 16n)) & 0x0000ffff0000ffffn;
  return Number((e + (e >> 32n)) & 127n);
}

function randomBit(v: bigint): bigint {
  if (!v) return v;
  const a =  v - ((v >> 1n) & 0x5555555555555555n);
  const b = (a & 0x3333333333333333n) + ((a >> 2n) & 0x3333333333333333n);
  const c = (b + (b >> 4n)) & 0x0f0f0f0f0f0f0f0fn;
  const d = (c + (c >> 8n)) & 0x00ff00ff00ff00ffn;
  const e = (d + (d >> 16n)) & 0x0000ffff0000ffffn;
  const f = (e + (e >> 32n)) & 127n;
  let r = BigInt(Math.floor(Math.random() * Number(f)));
  let s = 0n;
  let t = e & 0xffffn;
  if (r >= t) { s += 32n; r -= t; }
  t = (d >> s) & 0xffn;
  if (r >= t) { s += 16n; r -= t; }
  t = (c >> s) & 0xfn;
  if (r >= t) { s += 8n; r -= t; }
  t = (b >> s) & 0xfn;
  if (r >= t) { s += 4n; r -= t; }
  t = (a >> s) & 3n;
  if (r >= t) { s += 2n; r -= t; }
  t = (v >> s) & 1n;
  if (r >= t) s++;
  return 1n << s;
}

function deal(): bigint {
  if (!deck) {
    deck = discard & ~lastDiscard;
    discard = lastDiscard;
    reshuffles++;
  }
  const bit = randomBit(deck);
  if (!(bit & deck)) throw new Error(`got ${bit.toString(16)} from ${deck.toString(16)}`);
  deck &= ~bit;
  return bit;
}

function play(card: bigint) {
  discard |= card;
  lastDiscard = card;
  lastPlay = match.get(card);
}

interface Logger {
  start?(card: bigint);
  draw?(active: number, card: bigint);
  play?(active: number, card: bigint);
  wild?(suit: bigint);
  win?(active: number, turns: number, reshuffles: number);
  quit?();
}

const consoleLogger: Logger = {
  start(card: bigint) {
    console.log(`Game start: ${cards.get(card)}`);
  },
  draw(active: number, card: bigint) {
    console.log(`Player ${active} draws ${cards.get(card)} (${countBits(deck)} left)`);
  },
  play(active: number, card: bigint) {
    console.log(`Player ${active} plays ${cards.get(card)}`);
  },
  wild(suit: bigint) {
    console.log(`Wild: ${cards.get(suit ^ (suit & (suit - 1n))).substring(1)}`);
  },
  win(active: number, turns: number, reshuffles: number) {
    console.log(`Player ${active} wins after ${turns} turns, ${reshuffles} reshuffles`)
  },
  quit() {
    console.log(`Quit\n  Deck: ${cardsToString(deck)}\n  Discard: ${cardsToString(discard)}\n  Hands: ${hands.map(cardsToString).join(', ')}`);
  },
};

function game(logger = consoleLogger) {
  deck = 0xFFFFFFFFFFFFFn;
  discard = 0n;
  lastDiscard = 0n;
  lastPlay = 0n;
  reshuffles = 0;
  hands.fill(0n);

  // deal out the hands.
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < players; j++) {
      hands[j] |= deal();
    }
  }
  play(deal());
  logger.start?.(lastDiscard);
  // now loop until someone wins.
  let active = 0;
  for (let turn = 0;; turn++) {
    while (true) {
      let eligible = lastPlay & hands[active];
      if (!eligible) {
        const d = deal();
        logger.draw?.(active, d);
        hands[active] |= d;
        continue;
      }
      if (!cards.has(eligible)) {
        // need to pick between multiple possible options
        // 1. don't play eights if we don't need to
        if (eligible & ~eights) eligible &= ~eights;
        // 2. otherwise pick something at random
        eligible = randomBit(eligible);
      }
      play(eligible);
      hands[active] &= ~eligible;
      logger.play?.(active, eligible);
      if (eligible & eights) {
        // need to select a suit - pick the one we have the most of
        let suit = 0x1fffn;
        let big = 0;
        let mask = 0x1fffn;
        for (let i = 0; i < 4; i++) {
          const c = countBits(hands[active] & mask);
          if (c > big) {
            big = c;
            suit = mask;
          }
          mask <<= 13n;
        }
        lastPlay = eights | suit;
        logger.wild?.(suit);
      }
      active = (active + 1) % players;
      break;
    }
    if (!hands[active]) {
      logger.win?.(active, turn, reshuffles);
      break;
    }
    if (turn > 10000) {
      logger.quit?.();
      break;
    }
  }
}

// while (deck) {
//   console.log(`deal: ${cards.get(deal())}`);
// }
let distro = [];
let n = 0;
let sum = 0;
let sum2 = 0;
let quits = 0;
for (let i = 0; i < 10000; i++) {
  game(/*);(/**/{
    win(active, turns, reshuffles) {
      // console.log(`win ${i} after ${turns} turns`);
      while (distro.length <= turns) distro.push(0);
      distro[turns]++;
      n++;
      sum += turns;
      sum2 += turns ** 2;
    },
    // wild(suit) {
    //   console.log(`Wild\n  ${cardsToString(suit)}̱\n  ${cardsToString(lastPlay)}`);
    // },
    quit() {
      quits++;
      //   console.log(`Quit\n  Deck: ${cardsToString(deck)}\n  Discard: ${cardsToString(discard)}\n  Hands: ${hands.map(cardsToString).join(', ')}`);
    },
  });
}

const mean = sum / n;
const variance = sum2 / n - mean ** 2;
console.log(`Game length: ${mean} ± ${Math.sqrt(variance)} (${quits / n} quit)`);

// let started = false;
// for (let i = 0; i < distro.length; i++) {
//   if (!started && !distro[i]) continue;
//   started = true;
//   console.log(String(i).padStart(4, ' ') + ' ' + '*'.repeat(distro[i]));
// }
