import React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Trophy, LogOut, User, Sun, Moon } from 'lucide-react';
import { Button } from './ui/button';
import { useAuthStore } from '../stores/auth';
import { authApi } from '../api/auth';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, isModerator } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [darkMode, setDarkMode] = React.useState(
    () => document.documentElement.classList.contains('dark')
  );
  const [lang, setLang] = React.useState(i18n.language.startsWith('en') ? 'en' : 'ru');

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDarkMode((v) => !v);
  };

  const toggleLang = () => {
    const next = lang === 'ru' ? 'en' : 'ru';
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
    setLang(next);
  };

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    logout();
    navigate({ to: '/' });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="container mx-auto flex h-16 items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl text-primary">
            <Trophy className="h-6 w-6" />
            <span>{t('brand')}</span>
          </Link>

          <nav className="flex-1 flex items-center gap-2 ml-4">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-accent">
              {t('nav.tournaments')}
            </Link>
            {user && (
              <Link to="/tournaments/create" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-accent">
                {t('nav.createTournament')}
              </Link>
            )}
            {isModerator() && (
              <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-accent">
                {t('nav.admin')}
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={toggleLang} className="text-xs font-semibold w-10">
              {lang === 'ru' ? 'EN' : 'RU'}
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleDark}>
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            {user ? (
              <div className="flex items-center gap-2">
                <Link to="/profile">
                  <Button variant="ghost" size="sm" className="gap-2">
                    <User className="h-4 w-4" />
                    {user.login}
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" onClick={handleLogout} title={t('nav.logout')}>
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/">
                  <Button variant="ghost" size="sm">{t('nav.login')}</Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 container mx-auto py-6 px-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        <p>{t('footer', { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
