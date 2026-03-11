import { api } from '../lib/api';
import type { CreateTournamentInput, UpdateTournamentInput, TournamentFiltersInput } from '@tournirken/shared';

export const tournamentsApi = {
  list: (filters: Partial<TournamentFiltersInput> = {}) =>
    api.get('/tournaments', { params: filters }).then((r) => r.data),

  get: (id: number) => api.get(`/tournaments/${id}`).then((r) => r.data),

  create: (data: CreateTournamentInput) =>
    api.post('/tournaments', data).then((r) => r.data),

  update: (id: number, data: UpdateTournamentInput) =>
    api.patch(`/tournaments/${id}`, data).then((r) => r.data),

  delete: (id: number) => api.delete(`/tournaments/${id}`).then((r) => r.data),

  join: (id: number) => api.post(`/tournaments/${id}/join`).then((r) => r.data),

  leave: (id: number) => api.delete(`/tournaments/${id}/leave`).then((r) => r.data),

  participants: (id: number) =>
    api.get(`/tournaments/${id}/participants`).then((r) => r.data),

  matches: (id: number) => api.get(`/tournaments/${id}/matches`).then((r) => r.data),

  groups: (id: number) => api.get(`/tournaments/${id}/groups`).then((r) => r.data),

  grid: (id: number) => api.get(`/tournaments/${id}/grid`).then((r) => r.data),

  saveDraftGrid: (id: number, gridJson: string) =>
    api.post(`/tournaments/${id}/grid/draft`, { gridJson }).then((r) => r.data),

  finalizeGrid: (id: number, data: any) =>
    api.post(`/tournaments/${id}/grid/finalize`, data).then((r) => r.data),
};

export const gamesApi = {
  list: () => api.get('/games').then((r) => r.data),
};

export const usersApi = {
  myParticipations: (): Promise<number[]> =>
    api.get('/users/me/participations').then((r) => r.data),
};
