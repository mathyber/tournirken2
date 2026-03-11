import { Link } from '@tanstack/react-router';
import { Users, Calendar, Gamepad2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Card, CardContent, CardHeader } from '../ui/card';
import { Button } from '../ui/button';
import { TournamentStatusBadge } from './TournamentStatusBadge';
import { useAuthStore } from '../../stores/auth';
import { tournamentsApi } from '../../api/tournaments';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

interface TournamentCardProps {
  tournament: any;
  isParticipant?: boolean;
}

export function TournamentCard({ tournament, isParticipant }: TournamentCardProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? enUS : ru;

  const joinMutation = useMutation({
    mutationFn: () => tournamentsApi.join(tournament.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      queryClient.invalidateQueries({ queryKey: ['my-participations'] });
    },
  });

  const isOrganizer = user?.id === tournament.organizer?.id;
  const isFull = tournament.participantCount >= tournament.maxParticipants;

  const getJoinButton = () => {
    if (!user) return (
      <Button variant="outline" size="sm" disabled>{t('btn.loginToJoin')}</Button>
    );
    if (isOrganizer) return (
      <Link to="/tournaments/$id/organizer" params={{ id: String(tournament.id) }}>
        <Button variant="secondary" size="sm">{t('btn.organizerPanel')}</Button>
      </Link>
    );
    if (isParticipant) return (
      <Button variant="outline" size="sm" disabled className="text-green-600 border-green-600">{t('btn.joined')}</Button>
    );
    if (tournament.status === 'FINISHED') return (
      <Button variant="outline" size="sm" disabled>{t('btn.finished')}</Button>
    );
    if (tournament.status === 'CANCELLED') return (
      <Button variant="outline" size="sm" disabled>{t('btn.cancelled')}</Button>
    );
    if (tournament.status === 'ACTIVE') return (
      <Button variant="outline" size="sm" disabled>{t('btn.active')}</Button>
    );
    if (tournament.status !== 'REGISTRATION') return (
      <Button variant="outline" size="sm" disabled>{t('btn.registrationClosed')}</Button>
    );
    if (isFull) return (
      <Button variant="outline" size="sm" disabled>{t('btn.full')}</Button>
    );
    return (
      <Button size="sm" onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending}>
        {joinMutation.isPending ? t('btn.joining') : t('btn.join')}
      </Button>
    );
  };

  return (
    <Card className={cn(
      'hover:shadow-md transition-shadow',
      isParticipant && 'border-green-400 bg-green-50/30 dark:bg-green-900/10'
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <Link to="/tournaments/$id" params={{ id: String(tournament.id) }}>
              <h3 className="font-semibold text-lg truncate hover:text-primary transition-colors">
                {tournament.name}
                {tournament.season && <span className="text-muted-foreground font-normal ml-2">{t('tournament.season', { n: tournament.season })}</span>}
              </h3>
            </Link>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <Gamepad2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{tournament.game?.name}</span>
              <span className="text-xs opacity-50">·</span>
              <span className="text-xs">{t(`format.${tournament.format}_short`, { defaultValue: tournament.format })}</span>
            </div>
          </div>
          <TournamentStatusBadge status={tournament.status} />
        </div>

        {tournament.logo && (
          <img
            src={tournament.logo}
            alt={tournament.name}
            className="w-full h-32 object-cover rounded-md mt-2"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span>{t('tournament.participants', { count: tournament.participantCount, max: tournament.maxParticipants })}</span>
          </div>
          <Link to="/users/$login" params={{ login: tournament.organizer?.login }}>
            <span className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              @{tournament.organizer?.login}
            </span>
          </Link>
        </div>

        {tournament.registrationEnd && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{t('tournament.registrationUntil', { date: format(new Date(tournament.registrationEnd), 'd MMM yyyy', { locale: dateLocale }) })}</span>
          </div>
        )}

        {tournament.info && (
          <p className="text-sm text-muted-foreground line-clamp-2">{tournament.info}</p>
        )}

        <div className="flex justify-end">
          {getJoinButton()}
        </div>
      </CardContent>
    </Card>
  );
}
