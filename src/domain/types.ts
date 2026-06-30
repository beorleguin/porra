export interface Match {
  id: string; // e.g. "MEX-RSA"
  team1: string;
  team2: string;
  group?: string;
  realResult?: string; // e.g. "2-1" or undefined
  date?: string;
  time?: string; // Horario local del partido con offset, por ejemplo: 16:00 UTC-4
  kickoffAtUtc?: string; // Fecha/hora absoluta en UTC para bloquear edición sin depender del país del usuario
  ground?: string;
}

export interface Predictions {
  ganadorFinal: string;
  maxGoleador: string;
  maxAsistente: string;
  mvp: string;
  faseEspana: string;
  matches: Record<string, string>; // match.id -> "2-1"
}

export interface Participant {
  name: string;
  predictions: Predictions;
  password?: string; // Optional password to protect edits
  points: {
    total: number;
    ganadorFinal: number;
    maxGoleador: number;
    maxAsistente: number;
    mvp: number;
    faseEspana: number;
    matches: Record<string, number>;
  };
}

export interface AppState {
  matches: Match[];
  participants: Participant[];
  realResults: {
    ganadorFinal: string;
    maxGoleador: string;
    maxAsistente: string;
    mvp: string;
    faseEspana: string;
    matches: Record<string, string>; // match.id -> "2-1"
  };
  bote?: {
    total: string;
    prizes: {
      first: string;
      second: string;
      third: string;
    };
    payments: { name: string; amount: string }[];
  };
}
