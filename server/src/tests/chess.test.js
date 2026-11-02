import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChessGame,
  forfeitChessGame,
  generateLegalMoves,
  playChessMove,
  serializeChessGame,
} from '../games/chess.js';
import { RoomManager } from '../rooms/RoomManager.js';

const WHITE = 'white-player';
const BLACK = 'black-player';

function play(game, player, from, to, promotion) {
  return playChessMove(game, player, from, to, promotion);
}

function makePosition(pieces, turn = 'w') {
  const game = createChessGame(WHITE, BLACK);
  game.board.fill('.');
  for (const [square, piece] of Object.entries(pieces)) {
    game.board[squareIndex(square)] = piece;
  }
  game.turn = turn;
  game.castling = '';
  game.enPassant = -1;
  game.history = {};
  game.halfmoveClock = 0;
  game.fullmoveNumber = 1;
  game.finished = false;
  game.winnerId = null;
  game.draw = false;
  game.drawReason = null;
  game.check = false;
  game.checkmate = false;
  game.stalemate = false;
  return game;
}

function squareIndex(square) {
  return (8 - Number(square[1])) * 8 + 'abcdefgh'.indexOf(square[0]);
}

test('starts with the standard position and exposes legal moves to room state', () => {
  const game = createChessGame(WHITE, BLACK);
  assert.equal(generateLegalMoves(game).length, 20);
  const state = serializeChessGame(game);
  assert.equal(state.board.length, 64);
  assert.equal(state.legalMoves.length, 20);
  assert.equal(state.history, undefined);
  assert.equal(serializeChessGame(game, BLACK).legalMoves.length, 0);
});

test('rejects invalid turns, squares, self moves, and illegal movement', () => {
  const game = createChessGame(WHITE, BLACK);
  assert.throws(() => play(game, BLACK, 'e7', 'e5'), /Wait for your turn/);
  assert.throws(() => play(game, WHITE, 'e2', 'e5'), /not a legal chess move/);
  assert.throws(() => play(game, WHITE, 'e2', 'e2'), /different destination/);
  assert.throws(() => play(game, WHITE, 'z2', 'e4'), /valid chess square/);
  assert.throws(() => play(game, 'outsider', 'e2', 'e4'), /not a player/);
});

test('prevents pinned pieces and kings from moving into check', () => {
  const pinned = makePosition({ e1: 'K', e8: 'r', a8: 'k', e2: 'R' });
  assert.throws(() => play(pinned, WHITE, 'e2', 'd2'), /not a legal chess move/);
  const exposedKing = makePosition({ e1: 'K', e8: 'r', a8: 'k' });
  assert.throws(() => play(exposedKing, WHITE, 'e1', 'e2'), /not a legal chess move/);
});

test('detects checkmate and assigns the winner', () => {
  const game = createChessGame(WHITE, BLACK);
  play(game, WHITE, 'f2', 'f3');
  play(game, BLACK, 'e7', 'e5');
  play(game, WHITE, 'g2', 'g4');
  play(game, BLACK, 'd8', 'h4');
  assert.equal(game.finished, true);
  assert.equal(game.check, true);
  assert.equal(game.checkmate, true);
  assert.equal(game.winnerId, BLACK);
  assert.equal(game.draw, false);
});

test('detects stalemate as a draw', () => {
  const game = makePosition({ f7: 'K', g5: 'Q', h8: 'k' });
  play(game, WHITE, 'g5', 'g6');
  assert.equal(game.finished, true);
  assert.equal(game.check, false);
  assert.equal(game.stalemate, true);
  assert.equal(game.drawReason, 'stalemate');
  assert.equal(game.winnerId, null);
});

test('supports castling and moves the rook', () => {
  const game = createChessGame(WHITE, BLACK);
  play(game, WHITE, 'e2', 'e4');
  play(game, BLACK, 'a7', 'a6');
  play(game, WHITE, 'g1', 'f3');
  play(game, BLACK, 'b7', 'b6');
  play(game, WHITE, 'f1', 'e2');
  play(game, BLACK, 'a6', 'a5');
  play(game, WHITE, 'e1', 'g1');
  assert.equal(game.board[squareIndex('g1')], 'K');
  assert.equal(game.board[squareIndex('f1')], 'R');
  assert.equal(game.board[squareIndex('h1')], '.');
  assert.equal(game.castling.includes('K'), false);
});

test('cannot castle through an attacked square', () => {
  const game = makePosition({ e1: 'K', h1: 'R', a8: 'k', f8: 'r' });
  game.castling = 'K';
  assert.equal(
    generateLegalMoves(game).some((move) => move.from === squareIndex('e1') && move.to === squareIndex('g1')),
    false,
  );
});

test('supports en passant and removes the captured pawn', () => {
  const game = createChessGame(WHITE, BLACK);
  play(game, WHITE, 'e2', 'e4');
  play(game, BLACK, 'a7', 'a6');
  play(game, WHITE, 'e4', 'e5');
  play(game, BLACK, 'd7', 'd5');
  assert.ok(generateLegalMoves(game).some((move) => move.enPassant));
  play(game, WHITE, 'e5', 'd6');
  assert.equal(game.board[squareIndex('d6')], 'P');
  assert.equal(game.board[squareIndex('d5')], '.');
});

test('records captured piece counts and standard lost-material points', () => {
  const game = createChessGame(WHITE, BLACK);
  play(game, WHITE, 'e2', 'e4');
  play(game, BLACK, 'd7', 'd5');
  play(game, WHITE, 'e4', 'd5');
  assert.deepEqual(game.materialLost[BLACK], {
    pieces: 1,
    points: 1,
    byType: { p: 1, n: 0, b: 0, r: 0, q: 0 },
  });
  assert.equal(serializeChessGame(game).materialLost[BLACK].points, 1);
});

test('supports choosing a promotion piece', () => {
  const game = makePosition({ e1: 'K', e8: 'k', a7: 'P' });
  play(game, WHITE, 'a7', 'a8', 'n');
  assert.equal(game.board[squareIndex('a8')], 'N');
  assert.equal(game.lastMove.promotion, 'N');
});

test('detects the fifty-move rule and threefold repetition', () => {
  const fiftyMoveGame = makePosition({ e1: 'K', e8: 'k', a1: 'R' });
  fiftyMoveGame.halfmoveClock = 99;
  play(fiftyMoveGame, WHITE, 'a1', 'a2');
  assert.equal(fiftyMoveGame.drawReason, 'fifty-move-rule');

  const repetitionGame = createChessGame(WHITE, BLACK);
  const cycle = [
    [WHITE, 'g1', 'f3'], [BLACK, 'g8', 'f6'],
    [WHITE, 'f3', 'g1'], [BLACK, 'f6', 'g8'],
  ];
  for (let count = 0; count < 2; count += 1) {
    for (const [player, from, to] of cycle) play(repetitionGame, player, from, to);
  }
  assert.equal(repetitionGame.finished, true);
  assert.equal(repetitionGame.drawReason, 'threefold-repetition');
});

test('detects insufficient material', () => {
  const game = makePosition({ e1: 'K', e8: 'k', b1: 'N' });
  play(game, WHITE, 'b1', 'c3');
  assert.equal(game.finished, true);
  assert.equal(game.drawReason, 'insufficient-material');
});

test('forfeits a disconnected player exactly once', () => {
  const game = createChessGame(WHITE, BLACK);
  assert.equal(forfeitChessGame(game, BLACK), true);
  assert.equal(game.winnerId, WHITE);
  assert.equal(game.drawReason, 'disconnect');
  assert.equal(forfeitChessGame(game, BLACK), false);
});

test('Chess rooms enforce capacity, host-only start, legal moves, rematches, and disconnect forfeits', () => {
  const manager = new RoomManager();
  const host = manager.createRoom('Host', 'host-session-123456', 'socket-host', 'chess');
  assert.equal(host.room.maxPlayers, 2);
  assert.throws(
    () => manager.startChess(host.code, host.playerId, 'socket-host'),
    /Two connected players/,
  );
  const guest = manager.joinRoom(host.code, 'Guest', 'guest-session-123456', 'socket-guest');
  assert.throws(
    () => manager.joinRoom(host.code, 'Third', 'third-session-123456', 'socket-third'),
    /maximum 2 players/,
  );
  assert.throws(
    () => manager.startChess(host.code, guest.playerId, 'socket-guest'),
    /Only the host/,
  );

  const started = manager.startChess(host.code, host.playerId, 'socket-host');
  assert.equal(started.status, 'playing');
  assert.equal(started.chess.whiteId, host.playerId);
  assert.equal(started.chess.legalMoves.length, 20);
  assert.throws(
    () => manager.playChessMove(host.code, guest.playerId, 'socket-guest', { from: 'e7', to: 'e5' }),
    /Wait for your turn/,
  );
  assert.throws(
    () => manager.playChessMove(host.code, host.playerId, 'wrong-socket', { from: 'e2', to: 'e4' }),
    /no longer connected/,
  );
  manager.playChessMove(host.code, host.playerId, 'socket-host', { from: 'e2', to: 'e4' });
  manager.disconnect('socket-guest');
  const pendingRoom = manager.getRoom(host.code);
  assert.equal(pendingRoom.status, 'playing');
  assert.equal(pendingRoom.chess.finished, false);
  assert.equal(pendingRoom.players.find((player) => player.id === guest.playerId).connected, false);
  manager.reconnectRoom(host.code, 'guest-session-123456', 'socket-guest-new');
  const resumed = manager.getRoom(host.code);
  assert.equal(resumed.status, 'playing');
  assert.equal(resumed.chess.turn, 'b');
  assert.equal(resumed.chess.board[squareIndex('e4')], 'P');
  assert.equal(resumed.hostId, host.playerId);
  manager.disconnect('socket-guest-new');
  const reconnectSequence = manager.getRoom(host.code).players.find((player) => player.id === guest.playerId).reconnectSequence;
  manager.expireDisconnection(host.code, guest.playerId, reconnectSequence);
  const forfeited = manager.getRoom(host.code);
  assert.equal(forfeited.status, 'finished');
  assert.equal(forfeited.chess.winnerId, host.playerId);
  assert.equal(forfeited.chess.drawReason, 'disconnect');

  const returnedToLobby = manager.resetChess(host.code, host.playerId, 'socket-host');
  assert.equal(returnedToLobby.status, 'lobby');
  assert.equal(returnedToLobby.chess, null);
  assert.equal(returnedToLobby.hostId, host.playerId);
  manager.reconnectRoom(host.code, 'guest-session-123456', 'socket-guest-final');
  const rematch = manager.startChess(host.code, host.playerId, 'socket-host');
  assert.equal(rematch.chess.whiteId, guest.playerId);
  manager.deleteRoom(host.code);
});
