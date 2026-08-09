import { createFileRoute } from "@tanstack/react-router";
import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/games")({
  ssr: false,
  component: TicTacToe,
});

type Cell = "X" | "O" | null;

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

function evaluate(board: Cell[]): { winner: Cell; line: [number, number, number] | null; draw: boolean } {
  for (const line of LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line, draw: false };
    }
  }
  return { winner: null, line: null, draw: board.every(Boolean) };
}

function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [xNext, setXNext] = useState<boolean>(() => Math.random() < 0.5);
  const [lastWinner, setLastWinner] = useState<Cell>(null);
  const [scores, setScores] = useState({ X: 0, O: 0, draw: 0 });

  const result = useMemo(() => evaluate(board), [board]);
  const winnerSet = new Set(result.line ?? []);

  const status = result.winner
    ? `${result.winner} wins!`
    : result.draw
      ? "It's a draw."
      : `${xNext ? "X" : "O"}'s turn`;

  function play(i: number) {
    if (board[i] || result.winner || result.draw) return;
    const next = board.slice();
    next[i] = xNext ? "X" : "O";
    const r = evaluate(next);
    if (r.winner) {
      setScores((s) => ({ ...s, [r.winner as "X" | "O"]: s[r.winner as "X" | "O"] + 1 }));
      setLastWinner(r.winner);
    } else if (r.draw) {
      setScores((s) => ({ ...s, draw: s.draw + 1 }));
      setLastWinner(null);
    }
    setBoard(next);
    setXNext(!xNext);
  }

  function resetRound() {
    setBoard(Array(9).fill(null));
    // Winner of the previous round starts; on a draw or first round, pick randomly.
    setXNext(lastWinner ? lastWinner === "X" : Math.random() < 0.5);
  }

  function resetAll() {
    setBoard(Array(9).fill(null));
    setXNext(Math.random() < 0.5);
    setLastWinner(null);
    setScores({ X: 0, O: 0, draw: 0 });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Tic-Tac-Toe</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Two-player · take turns tapping a square.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <ScoreCard label="X wins" value={scores.X} active={xNext && !result.winner && !result.draw} />
        <ScoreCard label="Draws" value={scores.draw} />
        <ScoreCard label="O wins" value={scores.O} active={!xNext && !result.winner && !result.draw} />
      </div>

      <div
        className={`rounded-3xl border border-border bg-card p-4 text-center text-sm font-medium ${
          result.winner ? "text-primary" : "text-foreground"
        }`}
        aria-live="polite"
      >
        {status}
      </div>

      <div className="grid grid-cols-3 gap-2 aspect-square max-w-sm mx-auto">
        {board.map((cell, i) => {
          const isWin = winnerSet.has(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => play(i)}
              disabled={!!cell || !!result.winner || result.draw}
              className={`aspect-square rounded-2xl border border-border bg-secondary/60 text-4xl font-bold tracking-tight flex items-center justify-center transition
                ${isWin ? "bg-primary/15 text-primary border-primary/40" : ""}
                ${cell === "X" ? "text-foreground" : ""}
                ${cell === "O" ? "text-muted-foreground" : ""}
                ${!cell && !result.winner && !result.draw ? "hover:bg-accent active:scale-[0.98]" : ""}
                disabled:cursor-not-allowed`}
              aria-label={`Cell ${i + 1}${cell ? `, ${cell}` : ""}`}
            >
              {cell}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={resetRound}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition"
        >
          <RotateCcw className="h-4 w-4" />
          New round
        </button>
        <button
          type="button"
          onClick={resetAll}
          className="rounded-full bg-secondary text-foreground px-4 py-3 text-sm font-medium hover:bg-accent transition"
        >
          Reset scores
        </button>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, active }: { label: string; value: number; active?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center transition ${
        active ? "border-primary/50 bg-primary/10" : "border-border bg-card"
      }`}
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}