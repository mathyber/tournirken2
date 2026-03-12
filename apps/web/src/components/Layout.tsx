import React from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Trophy, LogOut, User, Sun, Moon, BookOpen } from 'lucide-react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import ReactCountryFlag from 'react-country-flag';
import { useAuthStore } from '../stores/auth';
import { authApi } from '../api/auth';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { useQueryClient } from '@tanstack/react-query';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { user, logout, isModerator } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [darkMode, setDarkMode] = React.useState(
    () => document.documentElement.classList.contains('dark')
  );
  const [lang, setLang] = React.useState(() => {
    const saved = localStorage.getItem('language') || 'ru';
    return ['ru', 'en', 'uk', 'be', 'es'].includes(saved) ? saved : 'ru';
  });

  const toggleDark = () => {
    document.documentElement.classList.toggle('dark');
    setDarkMode((v) => !v);
  };

  const changeLang = (next: string) => {
    i18n.changeLanguage(next);
    localStorage.setItem('language', next);
    setLang(next);
  };

  const LANGS = [
    { value: 'ru', countryCode: 'RU', label: 'RU' },
    { value: 'en', countryCode: 'GB', label: 'EN' },
    { value: 'uk', countryCode: 'UA', label: 'UA' },
    { value: 'be', countryCode: 'BY', label: 'BY' },
    { value: 'es', countryCode: 'ES', label: 'ES' },
  ];

  const handleLogout = async () => {
    try { await authApi.logout(); } catch {}
    logout();
    queryClient.clear();
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
            <Link to="/guide" className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2 rounded-md hover:bg-accent flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5" />
              {t('nav.guide')}
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Select value={lang} onValueChange={changeLang}>
              <SelectTrigger className="h-8 w-20 text-xs border-0 bg-transparent shadow-none focus:ring-0 gap-1 px-2">
                <SelectValue asChild>
                  <span className="flex items-center gap-2">
                    {(() => { const l = LANGS.find((l) => l.value === lang); return l ? <><ReactCountryFlag countryCode={l.countryCode} svg style={{ width: '1.1em', height: '1.1em' }} />{l.label}</> : null; })()}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                {LANGS.map((l) => (
                  <SelectItem key={l.value} value={l.value} className="text-xs">
                    <span className="flex items-center gap-2.5">
                      <ReactCountryFlag countryCode={l.countryCode} svg style={{ width: '1.1em', height: '1.1em' }} />
                      {l.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
