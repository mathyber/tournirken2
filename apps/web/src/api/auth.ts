import { api } from '../lib/api';
import type { RegisterInput, LoginInput } from '@tournirken/shared';

export const authApi = {
  register: (data: RegisterInput) => api.post('/auth/register', data).then((r) => r.data),
  login: (data: LoginInput) => api.post('/auth/login', data).then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  refresh: () => api.post('/auth/refresh').then((r) => r.data),
  me: () => api.get('/users/me').then((r) => r.data),
};
