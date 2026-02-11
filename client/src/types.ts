export type Card = string;

export type NewGameResponse = {
  gameId: string;
  userCards: Card[];
};

export type SubmitHandRequest = {
  gameId: string;
  front: Card[];
  middle: Card[];
  back: Card[];
};

export type HandInfo = {
  cards: Card[];
  rank: string;
};

export type SuggestHandResponse = {
  gameId: string;
  ev: number;
  suggestion: {
    front: HandInfo;
    middle: HandInfo;
    back: HandInfo;
  };
};

export type SubmitHandResponse = {
  gameId: string;
  userFoul: boolean;
  userEv: number;
  userHands: { front: HandInfo; middle: HandInfo; back: HandInfo };
  computerHands: { front: HandInfo; middle: HandInfo; back: HandInfo };
  perHand: { front: number; middle: number; back: number };
  total: number;
  scoop: boolean;
  royalties: { user: number; computer: number; net: number };
  explanation: string;
};
