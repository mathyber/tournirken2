import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Search, SlidersHorizontal } from 'lucide-react';
import { tournamentsApi, usersApi } from '../api/tournaments';
import { TournamentCard } from '../components/tournament/TournamentCard';
import { AuthForms } from '../components/AuthForms';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useAuthStore } from '../stores/auth';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

function IndexPage() {
  const { user } = useAuthStore();
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [gameSearch, setGameSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['tournaments', { search, gameSearch, status, page }],
    queryFn: () =>
      tournamentsApi.list({
        name: search || undefined,
        game: gameSearch || undefined,
        status: (status as any) || undefined,
        page,
        limit: 12,
      }),
  });

  // Get user's participations for green highlighting
  const { data: myParticipations } = useQuery({
    queryKey: ['my-participations'],
    queryFn: () => usersApi.myParticipations(),
    enabled: !!user,
  });

  const tournaments = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const statusOptions = [
    { value: 'REGISTRATION', label: t('status.REGISTRATION') },
    { value: 'ACTIVE', label: t('status.ACTIVE') },
    { value: 'FINISHED', label: t('status.FINISHED') },
    { value: 'DRAFT', label: t('status.DRAFT') },
  ];

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 space-y-4">
        {!user && <AuthForms />}

        {/* Filters */}
        <div className="space-y-3 p-4 border rounded-lg bg-card">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            {t('tournament.filters')}
          </h3>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('tournament.searchByName')}</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t('tournament.namePlaceholder')}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('tournament.game')}</label>
            <Input
              placeholder={t('tournament.gamePlaceholder')}
              value={gameSearch}
              onChange={(e) => { setGameSearch(e.target.value); setPage(1); }}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">{t('tournament.status')}</label>
            <Select value={status} onValueChange={(v) => { setStatus(v === '_all' ? '' : v); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder={t('tournament.allStatuses')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t('tournament.allStatuses')}</SelectItem>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t('tournament.title')}</h1>
          {data && (
            <span className="text-sm text-muted-foreground">{t('tournament.found', { count: data.total })}</span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : tournaments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">{t('tournament.notFound')}</p>
            <p className="text-sm mt-1">{t('tournament.notFoundHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {tournaments.map((tournament: any) => (
              <TournamentCard
                key={tournament.id}
                tournament={tournament}
                isParticipant={myParticipations?.includes(tournament.id)}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('tournament.prev')}
            </Button>
            <span className="flex items-center px-3 text-sm">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('tournament.next')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
