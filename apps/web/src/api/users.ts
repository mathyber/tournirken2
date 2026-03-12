import { api } from '../lib/api';

export const usersApi = {
  getProfile: (login: string) => api.get(`/users/${login}`).then((r) => r.data),
  me: () => api.get('/users/me').then((r) => r.data),
  updateEmail: (email: string) => api.patch('/users/me/email', { email }).then((r) => r.data),
  updatePassword: (currentPassword: string, newPassword: string) =>
    api.patch('/users/me/password', { currentPassword, newPassword }).then((r) => r.data),
};

export const adminApi = {
  users: (params: { search?: string; page?: number; limit?: number } = {}) =>
    api.get('/admin/users', { params }).then((r) => r.data),
  tournaments: (params: { search?: string; page?: number; limit?: number } = {}) =>
    api.get('/admin/tournaments', { params }).then((r) => r.data),
  updateRoles: (id: number, roles: string[]) =>
    api.patch(`/admin/users/${id}/roles`, { roles }).then((r) => r.data),
  cancelTournament: (id: number) => api.delete(`/admin/tournaments/${id}`).then((r) => r.data),
};
