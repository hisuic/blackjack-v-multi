import { useEffect, useMemo, useState } from "react";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const STARTING_CHIPS = 1000;
const CHIP_VALUES = [10, 25, 50, 100, 250, 500];
const CHIP_COLORS = {
  10: "#e6edf0",
  25: "#4aa3df",
  50: "#e25b4c",
  100: "#49b86e",
  250: "#7d5bd8",
  500: "#f2c356",
};

const emptyDealer = { hand: [], hidden: true };

const createDeck = () => {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const value = rank === "A" ? 11 : ["J", "Q", "K"].includes(rank) ? 10 : Number(rank);
      deck.push({ suit, rank, value });
    }
  }
  return deck;
};

const shuffle = (cards) => {
  const deck = [...cards];
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
};

const drawCard = (deck) => {
  const next = [...deck];
  const card = next.pop();
  return { card, next };
};

const calculateHand = (hand) => {
  let total = hand.reduce((sum, card) => sum + card.value, 0);
  let aces = hand.filter((card) => card.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
};

const isBlackjack = (hand) => hand.length === 2 && calculateHand(hand) === 21;

const formatCard = (card) => `${card.rank}${card.suit}`;

const statusLabel = (status) => {
  switch (status) {
    case "active":
      return "Action";
    case "stand":
      return "Stand";
    case "bust":
      return "Bust";
    case "blackjack":
      return "Blackjack";
    default:
      return "Idle";
  }
};

const resultLabel = (result) => {
  switch (result) {
    case "win":
      return "WIN";
    case "lose":
      return "LOSE";
    case "push":
      return "PUSH";
    case "blackjack":
      return "BLACKJACK";
    default:
      return "";
  }
};

const nextActiveIndex = (players, fromIndex) => {
  for (let i = fromIndex + 1; i < players.length; i += 1) {
    if (players[i].status === "active") return i;
  }
  return -1;
};

export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [phase, setPhase] = useState("betting");
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState([]);
  const [dealer, setDealer] = useState(emptyDealer);
  const [deck, setDeck] = useState(() => shuffle(createDeck()));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [betIndex, setBetIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [round, setRound] = useState(1);
  const [pot, setPot] = useState(0);
  const isMulti = playerCount > 1;

  const totalPot = useMemo(() => pot, [pot]);
  const activeBetIndex = players.length ? Math.min(betIndex, players.length - 1) : 0;
  const activeBetPlayer = players[activeBetIndex];

  const tableTitle = isMulti ? "Multiplayer Table" : "Solo Table";
  const modeBadge = isMulti ? "MULTI" : "SOLO";

  const buildPlayers = (count, existing = []) =>
    Array.from({ length: count }).map((_, index) => ({
      id: index + 1,
      name: `Player ${index + 1}`,
      chips: existing[index]?.chips ?? STARTING_CHIPS,
      roundStartChips: existing[index]?.roundStartChips ?? STARTING_CHIPS,
      bet: 0,
      hand: [],
      status: "idle",
      result: "",
      delta: 0,
    }));

  const handleLobbyStart = () => {
    setPlayers(buildPlayers(playerCount));
    setDealer(emptyDealer);
    setPhase("betting");
    setScreen("table");
    setRound(1);
    setPot(0);
    setBetIndex(0);
    setMessage("Select chips and press Deal to start the round.");
  };

  const ensureDeck = (current) => {
    if (current.length < 15) {
      return shuffle(createDeck());
    }
    return current;
  };

  const dealInitial = (preparedDeck, preparedPlayers) => {
    let nextDeck = ensureDeck(preparedDeck);
    const dealtPlayers = preparedPlayers.map((player) => ({ ...player, hand: [], status: "active", result: "" }));
    let nextDealer = { hand: [], hidden: true };

    for (let i = 0; i < 2; i += 1) {
      for (let p = 0; p < dealtPlayers.length; p += 1) {
        const draw = drawCard(nextDeck);
        nextDeck = draw.next;
        dealtPlayers[p].hand.push(draw.card);
      }
      const dealerDraw = drawCard(nextDeck);
      nextDeck = dealerDraw.next;
      nextDealer.hand.push(dealerDraw.card);
    }

    dealtPlayers.forEach((player) => {
      if (isBlackjack(player.hand)) {
        player.status = "blackjack";
      }
    });

    return { nextDeck, dealtPlayers, nextDealer };
  };

  const handleDeal = () => {
    const invalid = players.some((player) => player.bet <= 0 || player.bet > player.chips);
    if (invalid) {
      setMessage("Each player must bet more than $0 and within their chip balance.");
      return;
    }

    const potIncrease = players.reduce((sum, player) => sum + player.bet, 0);
    const reservedPlayers = players.map((player) => ({
      ...player,
      chips: player.chips - player.bet,
      roundStartChips: player.chips,
      delta: 0,
      result: "",
      hand: [],
      status: "active",
    }));

    const { nextDeck, dealtPlayers, nextDealer } = dealInitial(deck, reservedPlayers);

    setDeck(nextDeck);
    setPlayers(dealtPlayers);
    setDealer(nextDealer);
    setPhase("playing");
    setMessage("Choose your action.");

    if (isMulti) {
      setPot((prev) => prev + potIncrease);
    }

    const nextIndex = nextActiveIndex(dealtPlayers, -1);
    if (nextIndex === -1) {
      const nextPot = isMulti ? pot + potIncrease : pot;
      handleDealerTurn(dealtPlayers, nextDealer, nextDeck, nextPot);
    } else {
      setCurrentIndex(nextIndex);
    }
  };

  const updatePlayer = (index, updates) => {
    setPlayers((prev) => prev.map((player, idx) => (idx === index ? { ...player, ...updates } : player)));
  };

  const advanceTurn = (nextPlayers, nextDealer, nextDeck, nextPot = pot) => {
    const nextIndex = nextActiveIndex(nextPlayers, currentIndex);
    if (nextIndex === -1) {
      handleDealerTurn(nextPlayers, nextDealer, nextDeck, nextPot);
    } else {
      setCurrentIndex(nextIndex);
    }
  };

  const handleHit = () => {
    const player = players[currentIndex];
    if (!player || player.status !== "active") return;

    const draw = drawCard(deck);
    const updatedHand = [...player.hand, draw.card];
    const total = calculateHand(updatedHand);
    const updatedPlayers = players.map((p, idx) =>
      idx === currentIndex ? { ...p, hand: updatedHand } : p
    );

    if (total > 21) {
      updatedPlayers[currentIndex].status = "bust";
    } else if (total === 21) {
      updatedPlayers[currentIndex].status = "stand";
    }

    setDeck(draw.next);
    setPlayers(updatedPlayers);

    if (updatedPlayers[currentIndex].status !== "active") {
      advanceTurn(updatedPlayers, dealer, draw.next);
    }
  };

  const handleStand = () => {
    const updatedPlayers = players.map((player, idx) =>
      idx === currentIndex ? { ...player, status: "stand" } : player
    );
    setPlayers(updatedPlayers);
    advanceTurn(updatedPlayers, dealer, deck);
  };

  const resolveResult = (player, dealerTotal, dealerBlackjack, dealerBust) => {
    const playerTotal = calculateHand(player.hand);
    if (player.status === "bust") return "lose";
    if (isBlackjack(player.hand) && dealerBlackjack) return "push";
    if (dealerBlackjack) return "lose";
    if (isBlackjack(player.hand)) return "blackjack";
    if (dealerBust) return "win";
    if (playerTotal > dealerTotal) return "win";
    if (playerTotal < dealerTotal) return "lose";
    return "push";
  };

  const handleDealerTurn = (currentPlayers, currentDealer, currentDeck, nextPot = pot) => {
    let nextDealer = { ...currentDealer, hidden: false };
    let nextDeck = currentDeck;
    let dealerTotal = calculateHand(nextDealer.hand);
    while (dealerTotal < 17) {
      const draw = drawCard(nextDeck);
      nextDeck = draw.next;
      nextDealer.hand = [...nextDealer.hand, draw.card];
      dealerTotal = calculateHand(nextDealer.hand);
    }

    const dealerBlackjack = isBlackjack(nextDealer.hand);
    const dealerBust = dealerTotal > 21;

    let potPool = nextPot;
    const resolvedPlayers = currentPlayers.map((player) => {
      const result = resolveResult(player, dealerTotal, dealerBlackjack, dealerBust);
      return { ...player, result };
    });

    if (isMulti) {
      const pushes = resolvedPlayers.filter((player) => player.result === "push");
      pushes.forEach((player) => {
        potPool -= player.bet;
      });

      const winners = resolvedPlayers.filter((player) => player.result === "win" || player.result === "blackjack");
      const totalWeight = winners.reduce(
        (sum, player) => sum + player.bet * (player.result === "blackjack" ? 1.5 : 1),
        0
      );

      const payoutMap = new Map();
      winners.forEach((player) => {
        const weight = player.bet * (player.result === "blackjack" ? 1.5 : 1);
        const payout = totalWeight > 0 ? (potPool * weight) / totalWeight : 0;
        payoutMap.set(player.id, Math.round(payout));
      });

      const finalPlayers = resolvedPlayers.map((player) => {
        const refund = player.result === "push" ? player.bet : 0;
        const payout = payoutMap.get(player.id) ?? 0;
        const finalChips = player.chips + refund + payout;
        return {
          ...player,
          chips: finalChips,
          delta: finalChips - player.roundStartChips,
        };
      });

      setPot(totalWeight > 0 ? 0 : potPool);
      setPlayers(finalPlayers);
    } else {
      const payoutPlayers = resolvedPlayers.map((player) => {
        let payout = 0;
        if (player.result === "push") payout = player.bet;
        if (player.result === "win") payout = player.bet * 2;
        if (player.result === "blackjack") payout = player.bet * 2.5;
        const finalChips = player.chips + payout;
        return {
          ...player,
          chips: finalChips,
          delta: finalChips - player.roundStartChips,
        };
      });
      setPlayers(payoutPlayers);
    }

    setDealer(nextDealer);
    setDeck(nextDeck);
    setPhase("roundEnd");
    setMessage("Round complete. Start the next round when ready.");
  };

  const handleNextRound = () => {
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        bet: 0,
        hand: [],
        status: "idle",
        result: "",
        delta: 0,
      }))
    );
    setDealer(emptyDealer);
    setPhase("betting");
    setRound((prev) => prev + 1);
    setBetIndex(0);
    setMessage("Select chips and press Deal to start the round.");
  };

  const handleBetAdd = (index, amount) => {
    setPlayers((prev) =>
      prev.map((player, idx) => {
        if (idx !== index) return player;
        const nextBet = Math.min(player.chips, player.bet + amount);
        return { ...player, bet: nextBet };
      })
    );
  };

  const handleBetClear = (index) => {
    setPlayers((prev) => prev.map((player, idx) => (idx === index ? { ...player, bet: 0 } : player)));
  };

  const handleBetAllIn = (index) => {
    setPlayers((prev) =>
      prev.map((player, idx) => (idx === index ? { ...player, bet: player.chips } : player))
    );
  };

  const formatChips = (value) => `$${value.toFixed(0)}`;

  useEffect(() => {
    if (players.length && betIndex >= players.length) {
      setBetIndex(0);
    }
  }, [betIndex, players.length]);

  return (
    <div className={screen === "table" ? "app app--table" : "app"}>
      <header className="hero">
        <div className="hero__title">
          <span className="hero__label">Blackjack Royale</span>
          <h1>Casino Table Suite</h1>
          <p>Competitive blackjack wrapped in gold light and felt.</p>
        </div>
        <div className="hero__badge">
          <span>{modeBadge}</span>
          <strong>Round {round}</strong>
        </div>
      </header>

      {screen === "lobby" && (
        <section className="panel panel--lobby">
          <div className="panel__header">
            <h2>Select player count</h2>
            <p>Pick how many seats are at the table, then deal in.</p>
          </div>
          <div className="player-count">
            {[1, 2, 3, 4].map((count) => (
              <button
                key={`count-${count}`}
                className={playerCount === count ? "btn btn--primary" : "btn"}
                onClick={() => setPlayerCount(count)}
              >
                {count} Players
              </button>
            ))}
          </div>
          <div className="setup-actions">
            <button className="btn btn--gold" onClick={handleLobbyStart}>
              Open Table
            </button>
          </div>
        </section>
      )}

      {screen === "table" && (
        <section className="table">
          <div className="table__header">
            <div>
              <h2>{tableTitle}</h2>
              <p>Beat the dealer and grow your stack.</p>
            </div>
            <div className="table__info">
              {isMulti && <div className="chip-chip">Pot: {formatChips(totalPot)}</div>}
              <div className="chip-chip">Deck: {deck.length}</div>
            </div>
          </div>

        <div className="dealer">
          <div className="dealer__label">Dealer</div>
          <div className="card-row">
            {dealer.hand.map((card, index) => (
              <div className={dealer.hidden && index === 0 ? "card card--back" : "card"} key={`dealer-${index}`}>
                {dealer.hidden && index === 0 ? "?" : formatCard(card)}
              </div>
            ))}
          </div>
        <div className="dealer__total">
          {dealer.hidden ? "?" : `Total: ${calculateHand(dealer.hand)}`}
        </div>
        </div>

        <div className="players">
          {players.map((player, index) => {
            const isCurrent = index === currentIndex && phase === "playing" && player.status === "active";
            const isBetting = phase === "betting";
            const isFocusedBet = isBetting && index === activeBetIndex;
            const total = calculateHand(player.hand);
            return (
              <div
                className={[
                  "player",
                  isCurrent ? "player--active" : "",
                  isFocusedBet ? "player--betting" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={player.id}
                onClick={isBetting ? () => setBetIndex(index) : undefined}
              >
                {isBetting ? (
                  <>
                    <div className="player__header player__header--betting">
                      <div>
                        <h3>{player.name}</h3>
                        <span className="player__status">Betting</span>
                      </div>
                      <div className="player__chips">Chips: {formatChips(player.chips)}</div>
                    </div>
                    <div className="player__bet">Bet: {formatChips(player.bet)}</div>
                  </>
                ) : (
                  <>
                    <div className="player__header">
                      <div>
                        <h3>{player.name}</h3>
                        <span className="player__status">{statusLabel(player.status)}</span>
                      </div>
                      <div className="player__bank">
                        <div className="player__chips">Chips: {formatChips(player.chips)}</div>
                        {phase === "roundEnd" && player.delta !== 0 && (
                          <div
                            className={`player__delta ${
                              player.delta > 0 ? "player__delta--positive" : "player__delta--negative"
                            }`}
                          >
                            {player.delta > 0
                              ? `+${formatChips(player.delta)}`
                              : `-${formatChips(Math.abs(player.delta))}`}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="card-row">
                      {player.hand.map((card, cardIndex) => (
                        <div className="card" key={`player-${player.id}-${cardIndex}`}>
                          {formatCard(card)}
                        </div>
                      ))}
                    </div>
                    <div className="player__footer">
                      <span className="player__total">Total: {player.hand.length ? total : "-"}</span>
                      <span className="player__bet-value">Bet: {formatChips(player.bet)}</span>
                      <span className="result">{resultLabel(player.result)}</span>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {phase === "betting" && players.length > 0 && (
          <div className="bet-panel bet-panel--shared">
            <div className="bet-panel__label">Active betting seat</div>
            <div className="bet-panel__focus">
              <span>{activeBetPlayer?.name ?? "Player"}</span>
              <span className="bet-panel__amount">{formatChips(activeBetPlayer?.bet ?? 0)}</span>
            </div>
            <div className="chip-row">
              {CHIP_VALUES.map((value) => (
                <button
                  key={`chip-shared-${value}`}
                  className="chip-button"
                  onClick={() => handleBetAdd(activeBetIndex, value)}
                  style={{ "--chip-color": CHIP_COLORS[value] ?? "#d6b36a" }}
                >
                  <span className="chip-button__value">${value}</span>
                </button>
              ))}
            </div>
            <div className="chip-actions">
              <button className="btn btn--ghost" onClick={() => handleBetClear(activeBetIndex)}>
                Clear
              </button>
              <button className="btn btn--ghost" onClick={() => handleBetAllIn(activeBetIndex)}>
                All-in
              </button>
              {players.length > 1 && (
                <button
                  className="btn btn--ghost"
                  onClick={() => setBetIndex((prev) => (players.length ? (prev + 1) % players.length : 0))}
                >
                  Next player
                </button>
              )}
            </div>
          </div>
        )}

        <div className="table__actions">
          {phase === "betting" && (
            <button className="btn btn--primary" onClick={handleDeal}>
              Deal
            </button>
          )}
          {phase === "playing" && (
            <div className="action-row">
              <button className="btn" onClick={handleHit}>
                Hit
              </button>
              <button className="btn" onClick={handleStand}>
                Stand
              </button>
            </div>
          )}
          {phase === "roundEnd" && (
            <button className="btn btn--gold" onClick={handleNextRound}>
              Next round
            </button>
          )}
        </div>

        <div className="message">
          <span>{message}</span>
        </div>
      </section>
      )}
    </div>
  );
}
