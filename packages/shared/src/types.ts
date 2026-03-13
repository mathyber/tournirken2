import { Role, TournamentFormat, TournamentStatus } from './enums';

export interface UserPublic {
  id: number;
  login: string;
  createdAt: string;
  roles: Role[];
  stats: {
    tournamentsPlayed: number;
    wins: number;
    secondPlaces: number;
    thirdPlaces: number;
    organized: number;
  };
}

export interface UserMe extends UserPublic {
  email: string;
}

export interface Game {
  id: number;
  name: string;
  info?: string | null;
}

export interface Tournament {
  id: number;
  name: string;
  game: Game;
  season?: string | null;
  organizer: { id: number; login: string };
  info?: string | null;
  logo?: string | null;
  maxParticipants: number;
  participantCount: number;
  onlyOrganizerSetsResults: boolean;
  format: TournamentFormat;
  status: TournamentStatus;
  registrationStart?: string | null;
  registrationEnd?: string | null;
  tournamentStart?: string | null;
  tournamentEnd?: string | null;
  gridJson?: string | null;
  swissRounds?: number | null;
}

export interface TournamentParticipant {
  id: number;
  user: { id: number; login: string };
  finalResult?: string | null;
  joinedAt: string;
}

export interface TournamentGroup {
  id: number;
  name: string;
  pointsForWin: number;
  pointsForDraw: number;
  isFinished: boolean;
  standings: GroupStanding[];
}

export interface GroupStanding {
  rank: number;
  participant: { id: number; user: { id: number; login: string } };
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  buchholz?: number;
}

export interface Stage {
  id: number;
  name: string;
}

export interface Match {
  id: number;
  tournamentId: number;
  stage?: Stage | null;
  group?: { id: number; name: string } | null;
  roundNumber?: number | null;
  player1?: { id: number; user: { id: number; login: string } } | null;
  player2?: { id: number; user: { id: number; login: string } } | null;
  isFinished: boolean;
  winner?: { id: number; user: { id: number; login: string } } | null;
  isBye: boolean;
  confirmedResult?: MatchResult | null;
}

export interface MatchResult {
  id: number;
  matchId: number;
  setByUser: { id: number; login: string };
  player1Score: number;
  player2Score: number;
  info?: string | null;
  isFinal: boolean;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message?: string;
}
