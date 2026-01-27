export type GameState = {
  gameId: string;
  userCards: string[];
  computerCards: string[];
  createdAt: number;
};

export const gameStore = new Map<string, GameState>();
