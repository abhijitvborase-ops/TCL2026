
export interface Player {
  id: number;
  name: string;
  photoUrl?: string;
  sold?: boolean;
  soldTo?: number | null;
}

export interface Team {
  id: number;
  name: "Warriors" | "Stallions" | "Titans" | "Gladiators" | string;
  owner: string;
  players: Player[];
  color: string;
}

export interface User {
  id: number;
  username: string;
  password?: string; // In a real app, this would not be here
  role: 'admin' | 'team_owner';
  teamId?: number;
}

export interface CompletedAuction {
  id: number;
  date: string;
  teams: Team[];
}
