import crypto from 'crypto';

export interface Card {
  suit: '♠' | '♥' | '♦' | '♣';
  value: string;
  weight: number;
}

export interface BlackjackHand {
  cards: Card[];
  score: number;
  isBlackjack: boolean;
  isBusted: boolean;
}

export interface BlackjackGameSession {
  id: string;
  userId: string;
  bet: number;
  deck: Card[];
  playerHand: BlackjackHand;
  dealerHand: BlackjackHand;
  status: 'playing' | 'player_won' | 'dealer_won' | 'push' | 'blackjack';
  payout: number;
  serverSeed: string;
}

const SUITS: Array<'♠' | '♥' | '♦' | '♣'> = ['♠', '♥', '♦', '♣'];
const VALUES = [
  { val: '2', weight: 2 },
  { val: '3', weight: 3 },
  { val: '4', weight: 4 },
  { val: '5', weight: 5 },
  { val: '6', weight: 6 },
  { val: '7', weight: 7 },
  { val: '8', weight: 8 },
  { val: '9', weight: 9 },
  { val: '10', weight: 10 },
  { val: 'J', weight: 10 },
  { val: 'Q', weight: 10 },
  { val: 'K', weight: 10 },
  { val: 'A', weight: 11 },
];

export class BlackjackEngine {
  createDeck(decks: number = 2): Card[] {
    const deck: Card[] = [];
    for (let d = 0; d < decks; d++) {
      for (const suit of SUITS) {
        for (const v of VALUES) {
          deck.push({ suit, value: v.val, weight: v.weight });
        }
      }
    }
    // Fisher-Yates cryptographically secure shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const randInt = crypto.randomInt(0, i + 1);
      [deck[i], deck[randInt]] = [deck[randInt], deck[i]];
    }
    return deck;
  }

  calculateScore(cards: Card[]): { score: number; isBlackjack: boolean; isBusted: boolean } {
    let score = 0;
    let aces = 0;

    for (const card of cards) {
      score += card.weight;
      if (card.value === 'A') aces++;
    }

    while (score > 21 && aces > 0) {
      score -= 10;
      aces--;
    }

    const isBlackjack = cards.length === 2 && score === 21;
    const isBusted = score > 21;

    return { score, isBlackjack, isBusted };
  }

  startSession(userId: string, bet: number): BlackjackGameSession {
    const serverSeed = crypto.randomBytes(16).toString('hex');
    const deck = this.createDeck(2);

    const playerHandCards = [deck.pop()!, deck.pop()!];
    const dealerHandCards = [deck.pop()!, deck.pop()!];

    const playerEvaluation = this.calculateScore(playerHandCards);
    const dealerEvaluation = this.calculateScore(dealerHandCards);

    const playerHand: BlackjackHand = {
      cards: playerHandCards,
      score: playerEvaluation.score,
      isBlackjack: playerEvaluation.isBlackjack,
      isBusted: playerEvaluation.isBusted,
    };

    const dealerHand: BlackjackHand = {
      cards: dealerHandCards,
      score: dealerEvaluation.score,
      isBlackjack: dealerEvaluation.isBlackjack,
      isBusted: dealerEvaluation.isBusted,
    };

    let status: BlackjackGameSession['status'] = 'playing';
    let payout = 0;

    // Check immediate blackjacks
    if (playerHand.isBlackjack && dealerHand.isBlackjack) {
      status = 'push';
      payout = bet;
    } else if (playerHand.isBlackjack) {
      status = 'blackjack';
      payout = Math.floor(bet * 2.5); // 3:2 payout
    } else if (dealerHand.isBlackjack) {
      status = 'dealer_won';
      payout = 0;
    }

    return {
      id: crypto.randomUUID(),
      userId,
      bet,
      deck,
      playerHand,
      dealerHand,
      status,
      payout,
      serverSeed,
    };
  }

  hit(session: BlackjackGameSession): BlackjackGameSession {
    if (session.status !== 'playing') return session;

    const nextCard = session.deck.pop();
    if (!nextCard) return session;

    session.playerHand.cards.push(nextCard);
    const evalResult = this.calculateScore(session.playerHand.cards);
    session.playerHand.score = evalResult.score;
    session.playerHand.isBusted = evalResult.isBusted;

    if (session.playerHand.isBusted) {
      session.status = 'dealer_won';
      session.payout = 0;
    }

    return session;
  }

  stand(session: BlackjackGameSession): BlackjackGameSession {
    if (session.status !== 'playing') return session;

    // Dealer draws to at least 17
    let dealerEval = this.calculateScore(session.dealerHand.cards);
    while (dealerEval.score < 17 && session.deck.length > 0) {
      const c = session.deck.pop()!;
      session.dealerHand.cards.push(c);
      dealerEval = this.calculateScore(session.dealerHand.cards);
    }

    session.dealerHand.score = dealerEval.score;
    session.dealerHand.isBusted = dealerEval.isBusted;

    if (session.dealerHand.isBusted) {
      session.status = 'player_won';
      session.payout = session.bet * 2;
    } else if (session.playerHand.score > session.dealerHand.score) {
      session.status = 'player_won';
      session.payout = session.bet * 2;
    } else if (session.playerHand.score < session.dealerHand.score) {
      session.status = 'dealer_won';
      session.payout = 0;
    } else {
      session.status = 'push';
      session.payout = session.bet;
    }

    return session;
  }
}

export const blackjackEngine = new BlackjackEngine();
