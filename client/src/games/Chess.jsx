import { useEffect, useState } from 'react';

const PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};
const PIECE_NAMES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };
const PROMOTIONS = [
  { value: 'q', label: 'Queen', symbol: '♕' },
  { value: 'r', label: 'Rook', symbol: '♖' },
  { value: 'b', label: 'Bishop', symbol: '♗' },
  { value: 'n', label: 'Knight', symbol: '♘' },
];

export function Chess({ room, playerId, connected, error, onMove, onRematch, onLeave, onRemovePlayer }) {
  const game = room.chess;
  const players = room.players;
  const isHost = room.hostId === playerId;
  const color = game.colors[playerId];
  const myPlayer = players.find((player) => player.id === playerId);
  const opponent = players.find((player) => player.id !== playerId);
  const myColorLabel = color === 'w' ? 'White' : 'Black';
  const opponentColorLabel = color === 'w' ? 'Black' : 'White';
  const myTurn = room.status === 'playing' && game.turn === color;
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [promotionMove, setPromotionMove] = useState(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    setSelectedSquare(null);
    setPromotionMove(null);
  }, [game.lastMove, game.turn, room.status]);
  const legalMoves = game.legalMoves || [];
  const destinations = new Set(legalMoves.filter((move) => move.from === selectedSquare).map((move) => move.to));
  const winner = players.find((player) => player.id === game.winnerId);
  const turnPlayer = players.find((player) => game.colors[player.id] === game.turn);
  const colorLabel = (playerId) => game.colors[playerId] === 'w' ? 'White' : 'Black';

  const submitMove = async (from, to, promotion) => {
    setPending(true);
    setSelectedSquare(null);
    setPromotionMove(null);
    try {
      await onMove(from, to, promotion);
    } finally {
      setPending(false);
    }
  };

  const chooseSquare = (square) => {
    if (!myTurn || pending || promotionMove) return;
    if (selectedSquare && destinations.has(square)) {
      const piece = game.board[squareIndex(selectedSquare)];
      const isPromotion = piece.toLowerCase() === 'p' && (square.endsWith('8') || square.endsWith('1'));
      if (isPromotion) setPromotionMove({ from: selectedSquare, to: square });
      else void submitMove(selectedSquare, square, 'q');
      return;
    }
    const piece = game.board[squareIndex(square)];
    if (piece !== '.' && pieceColor(piece) === color) setSelectedSquare(square);
    else setSelectedSquare(null);
  };

  const statusMessage = room.status === 'playing'
    ? myTurn ? game.check ? 'Your king is in check — move to safety.' : 'Your move.' : `${turnPlayer?.nickname || colorLabel(turnPlayer?.id)} to move.`
    : game.checkmate
      ? winner?.id === playerId ? 'Checkmate — you win!' : `Checkmate — ${winner?.nickname || 'your opponent'} wins.`
      : game.stalemate
        ? 'Draw by stalemate.'
        : game.draw
          ? drawMessage(game.drawReason)
          : game.drawReason === 'disconnect'
            ? winner?.id === playerId ? 'Your opponent disconnected — you win.' : 'You disconnected — your opponent wins.'
            : 'Waiting for the host to start.';
  const boardRows = color === 'b' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const boardCols = color === 'b' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <section className="chess-page">
      <header className="chess-header">
        <div>
          <div className="eyebrow">CHESS · ROOM {room.code}</div>
          <h1>{room.status === 'finished' ? 'Game complete.' : 'Make your move.'}</h1>
        </div>
        <div className={`connection-pill ${connected ? 'online' : 'offline'}`}>
          <span className="status-dot" />{connected ? 'Connected' : 'Reconnecting'}
        </div>
      </header>

      {!connected && <div className="alert error-alert" role="alert">Connection lost. We’re trying to restore your game.</div>}
      {error && <div className="alert error-alert" role="alert">{error}</div>}

      <div className="chess-layout">
        <div className="chess-board-column">
          <div className="chess-player-strip chess-opponent-strip">
            <PlayerChip player={opponent} color={opponentColorLabel} active={room.status === 'playing' && game.turn !== color} />
            <span className="chess-move-count">MOVE {game.fullmoveNumber}</span>
          </div>
          <div className={`chess-board-frame ${game.check && room.status === 'playing' ? 'king-in-check' : ''}`}>
            <div className="chess-board" role="grid" aria-label="Chess board">
              {boardRows.flatMap((row) => boardCols.map((col) => {
                const square = `${'abcdefgh'[col]}${8 - row}`;
                const piece = game.board[row * 8 + col];
                const isLight = (row + col) % 2 === 0;
                const selected = square === selectedSquare;
                const legalTarget = destinations.has(square);
                const lastMove = game.lastMove?.from === square || game.lastMove?.to === square;
                const checkedKing = game.check && game.turn === color &&
                  piece === (color === 'w' ? 'K' : 'k');
                return (
                  <button
                    type="button"
                    role="gridcell"
                    key={square}
                    className={[
                      'chess-square',
                      isLight ? 'chess-light' : 'chess-dark',
                      selected ? 'chess-selected' : '',
                      legalTarget ? piece === '.' ? 'chess-legal-empty' : 'chess-legal-capture' : '',
                      lastMove ? 'chess-last-move' : '',
                      checkedKing ? 'chess-checked-king' : '',
                    ].filter(Boolean).join(' ')}
                    aria-label={`${square}, ${piece === '.' ? 'empty' : `${pieceColor(piece) === 'w' ? 'white' : 'black'} ${PIECE_NAMES[piece.toLowerCase()]}`}`}
                    aria-selected={selected}
                    disabled={!connected || room.status !== 'playing' || !myTurn || pending || Boolean(promotionMove)}
                    onClick={() => chooseSquare(square)}
                  >
                    {col === boardCols[0] && <span className="chess-rank-label">{8 - row}</span>}
                    {row === boardRows[7] && <span className="chess-file-label">{'abcdefgh'[col]}</span>}
                    {piece !== '.' && <span className={`chess-piece ${pieceColor(piece) === 'w' ? 'white-piece' : 'black-piece'}`}>{PIECES[piece]}</span>}
                    {legalTarget && piece === '.' && <span className="chess-move-dot" />}
                  </button>
                );
              }))}
            </div>
            {promotionMove && (
              <div className="chess-promotion-backdrop" role="dialog" aria-modal="true" aria-label="Choose promotion piece">
                <div className="chess-promotion-dialog">
                  <strong>Promote your pawn</strong>
                  <div>
                    {PROMOTIONS.map((choice) => (
                      <button
                        type="button"
                        key={choice.value}
                        aria-label={choice.label}
                        onClick={() => submitMove(promotionMove.from, promotionMove.to, choice.value)}
                      >
                        {choice.symbol}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="chess-player-strip chess-self-strip">
            <PlayerChip player={myPlayer} color={myColorLabel} active={room.status === 'playing' && game.turn === color} />
            <span className="chess-turn-status" role="status">{statusMessage}</span>
          </div>
          {room.status === 'finished' && (
            <div className="chess-actions">
              {isHost && (
                <button className="button primary" onClick={onRematch}>
                  {players.length === 2 && players.every((player) => player.connected) ? 'Play again' : 'Return to lobby'} <span>→</span>
                </button>
              )}
              {!isHost && <p className="wait-host">Waiting for the host to start a rematch.</p>}
              <button className="button secondary" onClick={onLeave}>Leave room</button>
            </div>
          )}
        </div>

        <aside className="chess-sidebar">
          <section className="chess-player-panel">
            <div className="panel-heading">
              <div><h2>Players</h2><span>{players.filter((player) => player.connected).length} / 2 connected</span></div>
              <span className="panel-live"><i /> LIVE</span>
            </div>
            <ul className="player-list">
              {players.map((player, index) => (
                <li key={player.id} className={!player.connected ? 'player-offline' : ''}>
                  <span className={`avatar avatar-${index}`}>{game.colors[player.id] === 'w' ? '♔' : '♚'}</span>
                  <span className="player-name">{player.nickname}{player.id === playerId && <small>YOU</small>}</span>
                  <span className="chess-color-tag">{colorLabel(player.id)}</span>
                  {player.id === room.hostId && <span className="host-tag">HOST ✦</span>}
                  {!player.connected && isHost && (
                    <button className="remove-player-button" type="button" onClick={() => onRemovePlayer(player.id)} aria-label={`Remove ${player.nickname} from room`}>Remove</button>
                  )}
                  {!player.connected && <span className="player-state">Disconnected</span>}
                </li>
              ))}
            </ul>
          </section>
          <div className="chess-rules-card">
            <div className="eyebrow">HOW TO PLAY</div>
            <p>Select one of your pieces, then choose a highlighted legal square. Capture the opposing king’s position to deliver checkmate.</p>
            {game.check && room.status === 'playing' && <strong className="chess-check-note">Check! The king must be protected.</strong>}
            {game.drawReason && <strong className="chess-draw-note">{drawMessage(game.drawReason)}</strong>}
          </div>
        </aside>
      </div>
    </section>
  );
}

function PlayerChip({ player, color, active }) {
  if (!player) return <div className="chess-player-chip"><strong>Waiting for player</strong></div>;
  return (
    <div className={`chess-player-chip ${active ? 'chess-active-player' : ''}`}>
      <span className={`chess-color-indicator ${color.toLowerCase()}`} />
      <div><small>{color.toUpperCase()}</small><strong>{player.nickname}</strong></div>
      {active && <span className="chess-turn-pill">TO MOVE</span>}
      {!player.connected && <span className="chess-offline-label">OFFLINE</span>}
    </div>
  );
}

function squareIndex(square) {
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = Number(square[1]);
  return (8 - rank) * 8 + file;
}

function pieceColor(piece) {
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function drawMessage(reason) {
  return ({
    stalemate: 'Draw by stalemate.',
    'insufficient-material': 'Draw by insufficient material.',
    'fifty-move-rule': 'Draw by the fifty-move rule.',
    'threefold-repetition': 'Draw by threefold repetition.',
    disconnect: 'Game awarded due to a disconnect.',
  })[reason] || 'The game is a draw.';
}
