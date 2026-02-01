import { useMemo, useState } from "react";

const SUITS = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const STARTING_CHIPS = 1000;
const CHIP_VALUES = [10, 25, 50, 100, 250, 500];

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
      return "行動中";
    case "stand":
      return "スタンド";
    case "bust":
      return "バースト";
    case "blackjack":
      return "ブラックジャック";
    default:
      return "待機";
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
  const [message, setMessage] = useState("");
  const [round, setRound] = useState(1);
  const [pot, setPot] = useState(0);
  const isMulti = playerCount > 1;

  const totalPot = useMemo(() => pot, [pot]);

  const tableTitle = isMulti ? "マルチテーブル" : "ソロテーブル";
  const modeBadge = isMulti ? "MULTI" : "SOLO";

  const buildPlayers = (count, existing = []) =>
    Array.from({ length: count }).map((_, index) => ({
      id: index + 1,
      name: `Player ${index + 1}`,
      chips: existing[index]?.chips ?? STARTING_CHIPS,
      bet: 0,
      hand: [],
      status: "idle",
      result: "",
    }));

  const handleLobbyStart = () => {
    setPlayers(buildPlayers(playerCount));
    setDealer(emptyDealer);
    setPhase("betting");
    setScreen("table");
    setRound(1);
    setPot(0);
    setMessage("チップを選んでディールを開始してください");
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
      setMessage("全員のベットを0より大きく、所持チップ以下で入力してください");
      return;
    }

    const potIncrease = players.reduce((sum, player) => sum + player.bet, 0);
    const reservedPlayers = players.map((player) => ({
      ...player,
      chips: player.chips - player.bet,
      result: "",
      hand: [],
      status: "active",
    }));

    const { nextDeck, dealtPlayers, nextDealer } = dealInitial(deck, reservedPlayers);

    setDeck(nextDeck);
    setPlayers(dealtPlayers);
    setDealer(nextDealer);
    setPhase("playing");
    setMessage("アクションを選んでください");

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
        return {
          ...player,
          chips: player.chips + refund + payout,
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
        return {
          ...player,
          chips: player.chips + payout,
        };
      });
      setPlayers(payoutPlayers);
    }

    setDealer(nextDealer);
    setDeck(nextDeck);
    setPhase("roundEnd");
    setMessage("ラウンド終了。次のラウンドを開始できます");
  };

  const handleNextRound = () => {
    setPlayers((prev) =>
      prev.map((player) => ({
        ...player,
        bet: 0,
        hand: [],
        status: "idle",
        result: "",
      }))
    );
    setDealer(emptyDealer);
    setPhase("betting");
    setRound((prev) => prev + 1);
    setMessage("チップを選んでディールを開始してください");
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

  return (
    <div className="app">
      <header className="hero">
        <div className="hero__title">
          <span className="hero__label">Blackjack Royale</span>
          <h1>Casino Table Suite</h1>
          <p>ゴールドの光とフェルトの香りに包まれた、対戦型ブラックジャック。</p>
        </div>
        <div className="hero__badge">
          <span>{modeBadge}</span>
          <strong>Round {round}</strong>
        </div>
      </header>

      {screen === "lobby" && (
        <section className="panel panel--lobby">
          <div className="panel__header">
            <h2>プレイヤー人数を選択</h2>
            <p>チップを置くテーブル人数を決めて、すぐにディールへ。</p>
          </div>
          <div className="player-count">
            {[1, 2, 3, 4].map((count) => (
              <button
                key={`count-${count}`}
                className={playerCount === count ? "btn btn--primary" : "btn"}
                onClick={() => setPlayerCount(count)}
              >
                {count} 人
              </button>
            ))}
          </div>
          <div className="setup-actions">
            <button className="btn btn--gold" onClick={handleLobbyStart}>
              テーブルを開く
            </button>
          </div>
        </section>
      )}

      {screen === "table" && (
        <section className="table">
        <div className="table__header">
          <div>
            <h2>{tableTitle}</h2>
            <p>ディーラーに勝ってチップを増やしましょう。</p>
          </div>
          <div className="table__info">
            {isMulti && <div className="chip-chip">Pot: {formatChips(totalPot)}</div>}
            <div className="chip-chip">Deck: {deck.length}</div>
          </div>
        </div>

        <div className="dealer">
          <div className="dealer__label">ディーラー</div>
          <div className="card-row">
            {dealer.hand.map((card, index) => (
              <div className={dealer.hidden && index === 0 ? "card card--back" : "card"} key={`dealer-${index}`}>
                {dealer.hidden && index === 0 ? "?" : formatCard(card)}
              </div>
            ))}
          </div>
          <div className="dealer__total">
            {dealer.hidden ? "?" : `合計: ${calculateHand(dealer.hand)}`}
          </div>
        </div>

        <div className="players">
          {players.map((player, index) => {
            const isCurrent = index === currentIndex && phase === "playing" && player.status === "active";
            const total = calculateHand(player.hand);
            return (
              <div className={isCurrent ? "player player--active" : "player"} key={player.id}>
                <div className="player__header">
                  <div>
                    <h3>{player.name}</h3>
                    <span className="player__status">{statusLabel(player.status)}</span>
                  </div>
                  <div className="player__chips">Chips: {formatChips(player.chips)}</div>
                </div>
                <div className="card-row">
                  {player.hand.map((card, cardIndex) => (
                    <div className="card" key={`player-${player.id}-${cardIndex}`}>
                      {formatCard(card)}
                    </div>
                  ))}
                </div>
                <div className="player__footer">
                  <span>合計: {player.hand.length ? total : "-"}</span>
                  <span>ベット: {formatChips(player.bet)}</span>
                  <span className="result">{resultLabel(player.result)}</span>
                </div>
                {phase === "betting" && (
                  <div className="bet-panel">
                    <div className="bet-panel__label">チップを置く</div>
                    <div className="chip-row">
                      {CHIP_VALUES.map((value) => (
                        <button
                          key={`chip-${player.id}-${value}`}
                          className="chip-button"
                          onClick={() => handleBetAdd(index, value)}
                        >
                          ${value}
                        </button>
                      ))}
                    </div>
                    <div className="chip-actions">
                      <button className="btn btn--ghost" onClick={() => handleBetClear(index)}>
                        クリア
                      </button>
                      <button className="btn btn--ghost" onClick={() => handleBetAllIn(index)}>
                        オールイン
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="table__actions">
          {phase === "betting" && (
            <button className="btn btn--primary" onClick={handleDeal}>
              ディール
            </button>
          )}
          {phase === "playing" && (
            <div className="action-row">
              <button className="btn" onClick={handleHit}>
                ヒット
              </button>
              <button className="btn" onClick={handleStand}>
                スタンド
              </button>
            </div>
          )}
          {phase === "roundEnd" && (
            <button className="btn btn--gold" onClick={handleNextRound}>
              次のラウンド
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
