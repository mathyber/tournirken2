"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateUserRolesSchema = exports.SetMatchResultSchema = exports.FinalizeGridSchema = exports.SaveDraftGridSchema = exports.TournamentFiltersSchema = exports.UpdateTournamentSchema = exports.CreateTournamentSchema = exports.CreateGameSchema = exports.UpdatePasswordSchema = exports.UpdateEmailSchema = exports.LoginSchema = exports.RegisterSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
// Auth
exports.RegisterSchema = zod_1.z.object({
    login: zod_1.z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, 'Только буквы, цифры и подчёркивание'),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6).max(64),
    recaptchaToken: zod_1.z.string().optional(),
});
exports.LoginSchema = zod_1.z.object({
    login: zod_1.z.string(), // может быть логином или email
    password: zod_1.z.string(),
});
// Users
exports.UpdateEmailSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.UpdatePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string(),
    newPassword: zod_1.z.string().min(6).max(64),
});
// Games
exports.CreateGameSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100),
    info: zod_1.z.string().optional(),
});
// Tournaments
exports.CreateTournamentSchema = zod_1.z.object({
    tournamentName: zod_1.z.string().min(1).max(100),
    gameName: zod_1.z.string().min(1).max(100),
    season: zod_1.z.number().int().positive().optional(),
    info: zod_1.z.string().max(10000).optional(),
    logo: zod_1.z.string().url('Логотип должен быть корректным http/https URL').refine((v) => v.startsWith('http://') || v.startsWith('https://'), { message: 'Логотип должен быть корректным http/https URL' }).optional().or(zod_1.z.literal('')),
    maxParticipants: zod_1.z.number().int().min(2).max(512),
    onlyOrganizerSetsResults: zod_1.z.boolean().default(false),
    format: zod_1.z.nativeEnum(enums_1.TournamentFormat),
    registrationStart: zod_1.z.coerce.date().optional().nullable(),
    registrationEnd: zod_1.z.coerce.date().optional().nullable(),
    swissRounds: zod_1.z.number().int().min(1).max(20).optional(),
}).refine((data) => data.format !== 'SWISS' || (data.swissRounds !== undefined && data.swissRounds !== null), { message: 'Для формата Swiss укажите количество раундов', path: ['swissRounds'] });
exports.UpdateTournamentSchema = exports.CreateTournamentSchema.innerType().partial();
exports.TournamentFiltersSchema = zod_1.z.object({
    page: zod_1.z.coerce.number().int().positive().default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    name: zod_1.z.string().optional(),
    game: zod_1.z.string().optional(),
    status: zod_1.z.nativeEnum(enums_1.TournamentStatus).optional(),
});
// Grid
exports.SaveDraftGridSchema = zod_1.z.object({
    gridJson: zod_1.z.string(),
});
exports.FinalizeGridSchema = zod_1.z.object({
    gridJson: zod_1.z.string(),
    participantAssignments: zod_1.z.array(zod_1.z.object({
        participantId: zod_1.z.number().int(),
        seed: zod_1.z.number().int().optional(),
        groupId: zod_1.z.string().optional(),
    })).optional(),
    groups: zod_1.z.array(zod_1.z.object({
        id: zod_1.z.string(),
        name: zod_1.z.string(),
        pointsForWin: zod_1.z.number().default(3),
        pointsForDraw: zod_1.z.number().default(1),
    })).optional(),
    mixedConfig: zod_1.z.object({
        numberOfGroups: zod_1.z.number().int().min(1),
        advancePerGroup: zod_1.z.number().int().min(1),
    }).optional(),
});
// Matches
exports.SetMatchResultSchema = zod_1.z.object({
    player1Score: zod_1.z.number().int().min(0),
    player2Score: zod_1.z.number().int().min(0),
    isFinal: zod_1.z.boolean().default(false),
    info: zod_1.z.string().optional(),
});
// Admin
exports.UpdateUserRolesSchema = zod_1.z.object({
    roles: zod_1.z.array(zod_1.z.nativeEnum(enums_1.Role)),
});
//# sourceMappingURL=schemas.js.map