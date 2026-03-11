import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: number;
  login: string;
  email: string;
  roles: string[];
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  isAdmin: () => boolean;
  isModerator: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      setAccessToken: (token) => set({ accessToken: token }),
      setUser: (user) => set({ user }),
      login: (token, user) => set({ accessToken: token, user }),
      logout: () => set({ accessToken: null, user: null }),
      isAdmin: () => get().user?.roles.includes('ADMIN') ?? false,
      isModerator: () =>
        (get().user?.roles.includes('ADMIN') || get().user?.roles.includes('MODERATOR')) ?? false,
    }),
    {
      name: 'tournirken-auth',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
