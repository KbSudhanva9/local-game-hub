const FILES = 'abcdefgh';
const STARTING_POSITION = [
  'rnbqkbnr',
  'pppppppp',
  '........',
  '........',
  '........',
  '........',
  'PPPPPPPP',
  'RNBQKBNR',
];
const PROMOTIONS = ['q', 'r', 'b', 'n'];
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9 };
const KNIGHT_STEPS = [
  [-2, -1], [-2, 1], [-1, -2], [-1, 2],
  [1, -2], [1, 2], [2, -1], [2, 1],
];
const KING_STEPS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1],
  [0, 1], [1, -1], [1, 0], [1, 1],
];
const DIAGONALS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHOGONALS = [[-1, 0], [0, -1], [0, 1], [1, 0]];

export function createChessGame(whiteId, blackId) {
  const game = {
    board: STARTING_POSITION.join('').split(''),
    turn: 'w',
    colors: { [whiteId]: 'w', [blackId]: 'b' },
    whiteId,
    blackId,
    castling: 'KQkq',
    enPassant: -1,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: {},
    winnerId: null,
    draw: false,
    drawReason: null,
    check: false,
    checkmate: false,
    stalemate: false,
    finished: false,
    lastMove: null,
    materialLost: {
      [whiteId]: { pieces: 0, points: 0, byType: { p: 0, n: 0, b: 0, r: 0, q: 0 } },
      [blackId]: { pieces: 0, points: 0, byType: { p: 0, n: 0, b: 0, r: 0, q: 0 } },
    },
  };
  game.history[positionKey(game)] = 1;
  return game;
}

export function playChessMove(game, playerId, fromSquare, toSquare, promotion = 'q') {
  if (!game || game.finished) throw new Error('The chess game is already finished.');
  if (!Object.hasOwn(game.colors, playerId)) throw new Error('You are not a player in this chess game.');
  if (game.colors[playerId] !== game.turn) throw new Error('Wait for your turn.');
  const from = parseSquare(fromSquare);
  const to = parseSquare(toSquare);
  if (from === to) throw new Error('Choose a different destination square.');
  if (typeof promotion !== 'string' || !PROMOTIONS.includes(promotion.toLowerCase())) {
    throw new Error('Choose a valid promotion piece.');
  }
  const legalMove = generateLegalMoves(game).find((move) =>
    move.from === from && move.to === to &&
    (move.promotion ? move.promotion === promotion.toLowerCase() : true));
  if (!legalMove) throw new Error('That is not a legal chess move.');

  const movingPiece = game.board[from];
  const capturedPiece = legalMove.enPassant
    ? (game.turn === 'w' ? 'p' : 'P')
    : game.board[to];
  const capture = capturedPiece !== '.';
  if (capture) {
    const capturedPlayerId = colorOf(capturedPiece) === 'w' ? game.whiteId : game.blackId;
    const lost = game.materialLost[capturedPlayerId];
    const pieceType = capturedPiece.toLowerCase();
    lost.pieces += 1;
    lost.points += PIECE_VALUES[pieceType];
    lost.byType[pieceType] += 1;
  }
  applyMove(game, legalMove);
  if (movingPiece.toLowerCase() === 'p' || capture) game.halfmoveClock = 0;
  else game.halfmoveClock += 1;
  if (game.turn === 'b') game.fullmoveNumber += 1;
  game.turn = opposite(game.turn);
  game.lastMove = {
    from: squareName(from),
    to: squareName(to),
    piece: movingPiece,
    captured: capture ? capturedPiece : null,
    promotion: legalMove.promotion ? legalMove.promotion.toUpperCase() : null,
  };

  const key = positionKey(game);
  game.history[key] = (game.history[key] || 0) + 1;
  updateOutcome(game);
  return game;
}

export function forfeitChessGame(game, disconnectedPlayerId) {
  if (!game || game.finished || !Object.hasOwn(game.colors, disconnectedPlayerId)) return false;
  game.winnerId = disconnectedPlayerId === game.whiteId ? game.blackId : game.whiteId;
  game.draw = false;
  game.drawReason = 'disconnect';
  game.finished = true;
  return true;
}

export function serializeChessGame(game, viewerId = null) {
  if (!game) return null;
  return {
    ...game,
    board: [...game.board],
    colors: { ...game.colors },
    materialLost: Object.fromEntries(Object.entries(game.materialLost).map(([playerId, lost]) => [playerId, {
      ...lost,
      byType: { ...lost.byType },
    }])),
    history: undefined,
    legalMoves: !game.finished && (viewerId === null || game.colors[viewerId] === game.turn)
      ? generateLegalMoves(game).map((move) => ({
        from: squareName(move.from),
        to: squareName(move.to),
        promotion: move.promotion ? move.promotion.toUpperCase() : null,
      }))
      : [],
    lastMove: game.lastMove ? { ...game.lastMove } : null,
  };
}

export function generateLegalMoves(game) {
  const pseudoMoves = [];
  for (let from = 0; from < 64; from += 1) {
    const piece = game.board[from];
    if (piece === '.' || colorOf(piece) !== game.turn) continue;
    generatePieceMoves(game, from, piece, pseudoMoves);
  }
  return pseudoMoves.filter((move) => {
    const next = clonePosition(game);
    applyMove(next, move);
    return !isKingAttacked(next, game.turn);
  });
}

export function isSquareAttacked(game, square, byColor) {
  const target = parseSquare(square);
  return isAttacked(game, target, byColor);
}

function generatePieceMoves(game, from, piece, moves) {
  const type = piece.toLowerCase();
  const color = colorOf(piece);
  const [row, col] = coordinates(from);
  if (type === 'p') {
    const direction = color === 'w' ? -1 : 1;
    const promotionRow = color === 'w' ? 0 : 7;
    const nextRow = row + direction;
    if (inside(nextRow, col) && game.board[index(nextRow, col)] === '.') {
      addPawnMove(moves, from, index(nextRow, col), promotionRow);
      const startRow = color === 'w' ? 6 : 1;
      const doubleRow = row + direction * 2;
      if (row === startRow && game.board[index(doubleRow, col)] === '.') {
        moves.push({ from, to: index(doubleRow, col), doublePawn: true });
      }
    }
    for (const targetCol of [col - 1, col + 1]) {
      if (!inside(nextRow, targetCol)) continue;
      const to = index(nextRow, targetCol);
      const target = game.board[to];
      if (target !== '.' && colorOf(target) !== color && target.toLowerCase() !== 'k') {
        addPawnMove(moves, from, to, promotionRow);
      } else if (to === game.enPassant) {
        moves.push({ from, to, enPassant: true });
      }
    }
    return;
  }

  if (type === 'n' || type === 'k') {
    for (const [rowStep, colStep] of type === 'n' ? KNIGHT_STEPS : KING_STEPS) {
      const targetRow = row + rowStep;
      const targetCol = col + colStep;
      if (!inside(targetRow, targetCol)) continue;
      const to = index(targetRow, targetCol);
      const target = game.board[to];
      if (target === '.' || (colorOf(target) !== color && target.toLowerCase() !== 'k')) {
        moves.push({ from, to });
      }
    }
    if (type === 'k') addCastlingMoves(game, from, color, moves);
    return;
  }

  const directions = type === 'b' ? DIAGONALS
    : type === 'r' ? ORTHOGONALS
      : [...DIAGONALS, ...ORTHOGONALS];
  for (const [rowStep, colStep] of directions) {
    let targetRow = row + rowStep;
    let targetCol = col + colStep;
    while (inside(targetRow, targetCol)) {
      const to = index(targetRow, targetCol);
      const target = game.board[to];
      if (target === '.') {
        moves.push({ from, to });
      } else {
        if (colorOf(target) !== color && target.toLowerCase() !== 'k') moves.push({ from, to });
        break;
      }
      targetRow += rowStep;
      targetCol += colStep;
    }
  }
}

function addPawnMove(moves, from, to, promotionRow) {
  if (coordinates(to)[0] === promotionRow) {
    for (const promotion of PROMOTIONS) moves.push({ from, to, promotion });
  } else {
    moves.push({ from, to });
  }
}

function addCastlingMoves(game, from, color, moves) {
  const homeRow = color === 'w' ? 7 : 0;
  const opponent = opposite(color);
  if (from !== index(homeRow, 4) || isAttacked(game, from, opponent)) return;
  const kingSide = color === 'w' ? 'K' : 'k';
  const queenSide = color === 'w' ? 'Q' : 'q';
  if (game.castling.includes(kingSide) &&
      game.board[index(homeRow, 5)] === '.' && game.board[index(homeRow, 6)] === '.' &&
      game.board[index(homeRow, 7)] === (color === 'w' ? 'R' : 'r') &&
      !isAttacked(game, index(homeRow, 5), opponent) &&
      !isAttacked(game, index(homeRow, 6), opponent)) {
    moves.push({ from, to: index(homeRow, 6), castle: 'king' });
  }
  if (game.castling.includes(queenSide) &&
      game.board[index(homeRow, 1)] === '.' && game.board[index(homeRow, 2)] === '.' &&
      game.board[index(homeRow, 3)] === '.' &&
      game.board[index(homeRow, 0)] === (color === 'w' ? 'R' : 'r') &&
      !isAttacked(game, index(homeRow, 3), opponent) &&
      !isAttacked(game, index(homeRow, 2), opponent)) {
    moves.push({ from, to: index(homeRow, 2), castle: 'queen' });
  }
}

function applyMove(game, move) {
  const piece = game.board[move.from];
  const color = colorOf(piece);
  const [fromRow, fromCol] = coordinates(move.from);
  const [toRow, toCol] = coordinates(move.to);
  if (piece.toLowerCase() === 'k') {
    game.castling = game.castling.replace(color === 'w' ? /[KQ]/g : /[kq]/g, '');
    if (move.castle) {
      const rookFrom = index(fromRow, move.castle === 'king' ? 7 : 0);
      const rookTo = index(fromRow, move.castle === 'king' ? 5 : 3);
      game.board[rookTo] = game.board[rookFrom];
      game.board[rookFrom] = '.';
    }
  }
  if (piece.toLowerCase() === 'r') removeRookRight(game, move.from);
  if (game.board[move.to].toLowerCase() === 'r') removeRookRight(game, move.to);
  if (move.enPassant) game.board[index(fromRow, toCol)] = '.';
  game.board[move.to] = move.promotion
    ? color === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase()
    : piece;
  game.board[move.from] = '.';
  game.enPassant = move.doublePawn ? index((fromRow + toRow) / 2, fromCol) : -1;
}

function removeRookRight(game, square) {
  const rightsBySquare = {
    63: 'K',
    56: 'Q',
    7: 'k',
    0: 'q',
  };
  const right = rightsBySquare[square];
  if (right) game.castling = game.castling.replace(right, '');
}

function isKingAttacked(game, color) {
  const king = game.board.findIndex((piece) => piece === (color === 'w' ? 'K' : 'k'));
  return king < 0 || isAttacked(game, king, opposite(color));
}

function isAttacked(game, target, byColor) {
  const [row, col] = coordinates(target);
  const pawnSourceRow = row + (byColor === 'w' ? 1 : -1);
  for (const sourceCol of [col - 1, col + 1]) {
    if (inside(pawnSourceRow, sourceCol) &&
        game.board[index(pawnSourceRow, sourceCol)] === (byColor === 'w' ? 'P' : 'p')) return true;
  }
  for (const [rowStep, colStep] of KNIGHT_STEPS) {
    const sourceRow = row + rowStep;
    const sourceCol = col + colStep;
    if (inside(sourceRow, sourceCol) &&
        game.board[index(sourceRow, sourceCol)] === (byColor === 'w' ? 'N' : 'n')) return true;
  }
  for (const [rowStep, colStep] of KING_STEPS) {
    const sourceRow = row + rowStep;
    const sourceCol = col + colStep;
    if (inside(sourceRow, sourceCol) &&
        game.board[index(sourceRow, sourceCol)] === (byColor === 'w' ? 'K' : 'k')) return true;
  }
  for (const [directions, pieces] of [
    [DIAGONALS, byColor === 'w' ? 'BQ' : 'bq'],
    [ORTHOGONALS, byColor === 'w' ? 'RQ' : 'rq'],
  ]) {
    for (const [rowStep, colStep] of directions) {
      let sourceRow = row + rowStep;
      let sourceCol = col + colStep;
      while (inside(sourceRow, sourceCol)) {
        const piece = game.board[index(sourceRow, sourceCol)];
        if (piece !== '.') {
          if (pieces.includes(piece)) return true;
          break;
        }
        sourceRow += rowStep;
        sourceCol += colStep;
      }
    }
  }
  return false;
}

function updateOutcome(game) {
  game.check = isKingAttacked(game, game.turn);
  const moves = generateLegalMoves(game);
  game.checkmate = game.check && moves.length === 0;
  game.stalemate = !game.check && moves.length === 0;
  if (game.checkmate) {
    game.winnerId = game.turn === 'w' ? game.blackId : game.whiteId;
    game.finished = true;
    return;
  }
  if (game.stalemate) {
    setDraw(game, 'stalemate');
    return;
  }
  if (insufficientMaterial(game.board)) {
    setDraw(game, 'insufficient-material');
  } else if (game.halfmoveClock >= 100) {
    setDraw(game, 'fifty-move-rule');
  } else if (game.history[positionKey(game)] >= 3) {
    setDraw(game, 'threefold-repetition');
  }
}

function setDraw(game, reason) {
  game.draw = true;
  game.drawReason = reason;
  game.finished = true;
}

function insufficientMaterial(board) {
  const pieces = board.filter((piece) => piece !== '.');
  if (pieces.some((piece) => 'prq'.includes(piece.toLowerCase()))) return false;
  const minors = pieces.filter((piece) => 'bn'.includes(piece.toLowerCase()));
  if (minors.length <= 1) return true;
  if (minors.every((piece) => piece.toLowerCase() === 'b')) {
    const bishopSquares = board
      .map((piece, square) => piece.toLowerCase() === 'b' ? square : -1)
      .filter((square) => square >= 0);
    return bishopSquares.every((square) => {
      const [row, col] = coordinates(square);
      return (row + col) % 2 === (coordinates(bishopSquares[0])[0] + coordinates(bishopSquares[0])[1]) % 2;
    });
  }
  return false;
}

function positionKey(game) {
  const legalEnPassant = game.enPassant >= 0 &&
    generateLegalMoves(game).some((move) => move.enPassant)
    ? squareName(game.enPassant)
    : '-';
  return `${game.board.join('')}:${game.turn}:${game.castling || '-'}:${legalEnPassant}`;
}

function clonePosition(game) {
  return {
    board: [...game.board],
    turn: game.turn,
    castling: game.castling,
    enPassant: game.enPassant,
  };
}

function parseSquare(square) {
  if (typeof square !== 'string' || !/^[a-h][1-8]$/.test(square)) {
    throw new Error('Choose a valid chess square.');
  }
  return index(8 - Number(square[1]), FILES.indexOf(square[0]));
}

function squareName(square) {
  const [row, col] = coordinates(square);
  return `${FILES[col]}${8 - row}`;
}

function coordinates(square) {
  return [Math.floor(square / 8), square % 8];
}

function index(row, col) {
  return row * 8 + col;
}

function inside(row, col) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function colorOf(piece) {
  return piece === piece.toUpperCase() ? 'w' : 'b';
}

function opposite(color) {
  return color === 'w' ? 'b' : 'w';
}
