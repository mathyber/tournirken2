import { z } from 'zod';
import { Role, TournamentFormat, TournamentStatus } from './enums';
export declare const RegisterSchema: z.ZodObject<{
    login: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    recaptchaToken: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    login: string;
    email: string;
    password: string;
    recaptchaToken?: string | undefined;
}, {
    login: string;
    email: string;
    password: string;
    recaptchaToken?: string | undefined;
}>;
export declare const LoginSchema: z.ZodObject<{
    login: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    login: string;
    password: string;
}, {
    login: string;
    password: string;
}>;
export declare const UpdateEmailSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const UpdatePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export declare const CreateGameSchema: z.ZodObject<{
    name: z.ZodString;
    info: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    info?: string | undefined;
}, {
    name: string;
    info?: string | undefined;
}>;
export declare const CreateTournamentSchema: z.ZodEffects<z.ZodObject<{
    tournamentName: z.ZodString;
    gameName: z.ZodString;
    season: z.ZodOptional<z.ZodNumber>;
    info: z.ZodOptional<z.ZodString>;
    logo: z.ZodUnion<[z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>, z.ZodLiteral<"">]>;
    maxParticipants: z.ZodNumber;
    onlyOrganizerSetsResults: z.ZodDefault<z.ZodBoolean>;
    format: z.ZodNativeEnum<typeof TournamentFormat>;
    registrationStart: z.ZodNullable<z.ZodOptional<z.ZodDate>>;
    registrationEnd: z.ZodNullable<z.ZodOptional<z.ZodDate>>;
    swissRounds: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    tournamentName: string;
    gameName: string;
    maxParticipants: number;
    onlyOrganizerSetsResults: boolean;
    format: TournamentFormat;
    info?: string | undefined;
    season?: number | undefined;
    logo?: string | undefined;
    registrationStart?: Date | null | undefined;
    registrationEnd?: Date | null | undefined;
    swissRounds?: number | undefined;
}, {
    tournamentName: string;
    gameName: string;
    maxParticipants: number;
    format: TournamentFormat;
    info?: string | undefined;
    season?: number | undefined;
    logo?: string | undefined;
    onlyOrganizerSetsResults?: boolean | undefined;
    registrationStart?: Date | null | undefined;
    registrationEnd?: Date | null | undefined;
    swissRounds?: number | undefined;
}>, {
    tournamentName: string;
    gameName: string;
    maxParticipants: number;
    onlyOrganizerSetsResults: boolean;
    format: TournamentFormat;
    info?: string | undefined;
    season?: number | undefined;
    logo?: string | undefined;
    registrationStart?: Date | null | undefined;
    registrationEnd?: Date | null | undefined;
    swissRounds?: number | undefined;
}, {
    tournamentName: string;
    gameName: string;
    maxParticipants: number;
    format: TournamentFormat;
    info?: string | undefined;
    season?: number | undefined;
    logo?: string | undefined;
    onlyOrganizerSetsResults?: boolean | undefined;
    registrationStart?: Date | null | undefined;
    registrationEnd?: Date | null | undefined;
    swissRounds?: number | undefined;
}>;
export declare const UpdateTournamentSchema: z.ZodObject<{
    tournamentName: z.ZodOptional<z.ZodString>;
    gameName: z.ZodOptional<z.ZodString>;
    season: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    info: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    logo: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>, z.ZodLiteral<"">]>>;
    maxParticipants: z.ZodOptional<z.ZodNumber>;
    onlyOrganizerSetsResults: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    format: z.ZodOptional<z.ZodNativeEnum<typeof TournamentFormat>>;
    registrationStart: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodDate>>>;
    registrationEnd: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodDate>>>;
    swissRounds: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    info?: string | undefined;
    tournamentName?: string | undefined;
    gameName?: string | undefined;
    season?: number | undefined;
    logo?: string | undefined;
    maxParticipants?: number | undefined;
    onlyOrganizerSetsResults?: boolean | undefined;
    format?: TournamentFormat | undefined;
    registrationStart?: Date | null | undefined;
    registrationEnd?: Date | null | undefined;
    swissRounds?: number | undefined;
}, {
    info?: string | undefined;
    tournamentName?: string | undefined;
    gameName?: string | undefined;
    season?: number | undefined;
    logo?: string | undefined;
    maxParticipants?: number | undefined;
    onlyOrganizerSetsResults?: boolean | undefined;
    format?: TournamentFormat | undefined;
    registrationStart?: Date | null | undefined;
    registrationEnd?: Date | null | undefined;
    swissRounds?: number | undefined;
}>;
export declare const TournamentFiltersSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    name: z.ZodOptional<z.ZodString>;
    game: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodNativeEnum<typeof TournamentStatus>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: TournamentStatus | undefined;
    name?: string | undefined;
    game?: string | undefined;
}, {
    status?: TournamentStatus | undefined;
    name?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    game?: string | undefined;
}>;
export declare const SaveDraftGridSchema: z.ZodObject<{
    gridJson: z.ZodString;
}, "strip", z.ZodTypeAny, {
    gridJson: string;
}, {
    gridJson: string;
}>;
export declare const FinalizeGridSchema: z.ZodObject<{
    gridJson: z.ZodString;
    participantAssignments: z.ZodOptional<z.ZodArray<z.ZodObject<{
        participantId: z.ZodNumber;
        seed: z.ZodOptional<z.ZodNumber>;
        groupId: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        participantId: number;
        seed?: number | undefined;
        groupId?: string | undefined;
    }, {
        participantId: number;
        seed?: number | undefined;
        groupId?: string | undefined;
    }>, "many">>;
    groups: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        pointsForWin: z.ZodDefault<z.ZodNumber>;
        pointsForDraw: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        pointsForWin: number;
        pointsForDraw: number;
    }, {
        name: string;
        id: string;
        pointsForWin?: number | undefined;
        pointsForDraw?: number | undefined;
    }>, "many">>;
    mixedConfig: z.ZodOptional<z.ZodObject<{
        numberOfGroups: z.ZodNumber;
        advancePerGroup: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        numberOfGroups: number;
        advancePerGroup: number;
    }, {
        numberOfGroups: number;
        advancePerGroup: number;
    }>>;
}, "strip", z.ZodTypeAny, {
    gridJson: string;
    participantAssignments?: {
        participantId: number;
        seed?: number | undefined;
        groupId?: string | undefined;
    }[] | undefined;
    groups?: {
        name: string;
        id: string;
        pointsForWin: number;
        pointsForDraw: number;
    }[] | undefined;
    mixedConfig?: {
        numberOfGroups: number;
        advancePerGroup: number;
    } | undefined;
}, {
    gridJson: string;
    participantAssignments?: {
        participantId: number;
        seed?: number | undefined;
        groupId?: string | undefined;
    }[] | undefined;
    groups?: {
        name: string;
        id: string;
        pointsForWin?: number | undefined;
        pointsForDraw?: number | undefined;
    }[] | undefined;
    mixedConfig?: {
        numberOfGroups: number;
        advancePerGroup: number;
    } | undefined;
}>;
export declare const SetMatchResultSchema: z.ZodObject<{
    player1Score: z.ZodNumber;
    player2Score: z.ZodNumber;
    isFinal: z.ZodDefault<z.ZodBoolean>;
    info: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    player1Score: number;
    player2Score: number;
    isFinal: boolean;
    info?: string | undefined;
}, {
    player1Score: number;
    player2Score: number;
    info?: string | undefined;
    isFinal?: boolean | undefined;
}>;
export declare const UpdateUserRolesSchema: z.ZodObject<{
    roles: z.ZodArray<z.ZodNativeEnum<typeof Role>, "many">;
}, "strip", z.ZodTypeAny, {
    roles: Role[];
}, {
    roles: Role[];
}>;
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
