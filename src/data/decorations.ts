export interface DecorDef {
  id: string;
  name: string;
  emoji: string;
  cost: number;
}

/** Cosmetic items the player can buy and place on owned grass tiles. */
export const DECOR: DecorDef[] = [
  { id: "flowers", name: "Flowers", emoji: "🌷", cost: 40 },
  { id: "sunflower", name: "Sunflower", emoji: "🌻", cost: 55 },
  { id: "mushroom", name: "Mushrooms", emoji: "🍄", cost: 50 },
  { id: "rock", name: "Rock", emoji: "🪨", cost: 35 },
  { id: "bush", name: "Bush", emoji: "🌳", cost: 80 },
  { id: "pine", name: "Pine Tree", emoji: "🌲", cost: 110 },
  { id: "chicken", name: "Chicken", emoji: "🐔", cost: 140 },
  { id: "sheep", name: "Sheep", emoji: "🐑", cost: 220 },
  { id: "fountain", name: "Fountain", emoji: "⛲", cost: 350 },
  { id: "cottage", name: "Cottage", emoji: "🏡", cost: 600 },
];

export const DECOR_BY_ID: Record<string, DecorDef> = Object.fromEntries(DECOR.map((d) => [d.id, d]));
