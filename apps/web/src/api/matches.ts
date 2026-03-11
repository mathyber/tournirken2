import { api } from '../lib/api';
import type { SetMatchResultInput } from '@tournirken/shared';

export const matchesApi = {
  get: (id: number) => api.get(`/matches/${id}`).then((r) => r.data),
  setResult: (id: number, data: SetMatchResultInput) =>
    api.post(`/matches/${id}/result`, data).then((r) => r.data),
};
