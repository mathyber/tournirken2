import { z } from 'zod';
import { Role, TournamentFormat, TournamentStatus } from './enums';

// Auth
export const RegisterSchema = z.object({
  login: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Только буквы, цифры и подчёркивание'),
  email: z.string().email(),
  password: z.string().min(6).max(64),
  recaptchaToken: z.string().optional(),
});

export const LoginSchema = z.object({
  login: z.string(),  // может быть логином или email
  password: z.string(),
});

// Users
export const UpdateEmailSchema = z.object({
  email: z.string().email(),
});

export const UpdatePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(6).max(64),
});

// Games
export const CreateGameSchema = z.object({
  name: z.string().min(1).max(100),
  info: z.string().optional(),
});

// Tournaments
export const CreateTournamentSchema = z.object({
  tournamentName: z.string().min(1).max(100),
  gameName: z.string().min(1).max(100),
  season: z.number().int().positive().optional(),
  info: z.string().optional(),
  logo: z.string().url().optional().or(z.literal('')),
  maxParticipants: z.number().int().min(2).max(512),
  onlyOrganizerSetsResults: z.boolean().default(false),
  format: z.nativeEnum(TournamentFormat),
  registrationStart: z.coerce.date().optional().nullable(),
  registrationEnd: z.coerce.date().optional().nullable(),
  swissRounds: z.number().int().min(1).max(20).optional(),
});

export const UpdateTournamentSchema = CreateTournamentSchema.partial();

export const TournamentFiltersSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  name: z.string().optional(),
  game: z.string().optional(),
  status: z.nativeEnum(TournamentStatus).optional(),
});

// Grid
export const SaveDraftGridSchema = z.object({
  gridJson: z.string(),
});

export const FinalizeGridSchema = z.object({
  gridJson: z.string(),
  participantAssignments: z.array(z.object({
    participantId: z.number().int(),
    seed: z.number().int().optional(),
    groupId: z.string().optional(),
  })).optional(),
  groups: z.array(z.object({
    id: z.string(),
    name: z.string(),
    pointsForWin: z.number().default(3),
    pointsForDraw: z.number().default(1),
  })).optional(),
  mixedConfig: z.object({
    numberOfGroups: z.number().int().min(1),
    advancePerGroup: z.number().int().min(1),
  }).optional(),
});

// Matches
export const SetMatchResultSchema = z.object({
  player1Score: z.number().int().min(0),
  player2Score: z.number().int().min(0),
  isFinal: z.boolean().default(false),
  info: z.string().optional(),
});

// Admin
export const UpdateUserRolesSchema = z.object({
  roles: z.array(z.nativeEnum(Role)),
});

// Types inferred from schemas
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateEmailInput = z.infer<typeof UpdateEmailSchema>;
export type UpdatePasswordInput = z.infer<typeof UpdatePasswordSchema>;
export type CreateTournamentInput = z.infer<typeof CreateTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof UpdateTournamentSchema>;
export type TournamentFiltersInput = z.infer<typeof TournamentFiltersSchema>;
export type SaveDraftGridInput = z.infer<typeof SaveDraftGridSchema>;
export type FinalizeGridInput = z.infer<typeof FinalizeGridSchema>;
export type SetMatchResultInput = z.infer<typeof SetMatchResultSchema>;
export type UpdateUserRolesInput = z.infer<typeof UpdateUserRolesSchema>;
