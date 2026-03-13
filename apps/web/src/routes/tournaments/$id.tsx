import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { Users, Calendar, Trophy, GitBranch, Settings, Copy } from 'lucide-react';
import { tournamentsApi } from '../../api/tournaments';
import { useAuthStore } from '../../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { TournamentStatusBadge } from '../../components/tournament/TournamentStatusBadge';
import { Separator } from '../../components/ui/separator';
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

export const Route = createFileRoute('/tournaments/$id')({
  component: TournamentPage,
});

function TournamentPage() {
  const { id } = Route.useParams();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { user, isAdmin } = useAuthStore();
  const { t } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? enUS : ru;

  // If a child route is active (organizer, bracket, groups), render it instead
  if (currentPath !== `/tournaments/${id}`) {
    return <Outlet />;
  }
  const queryClient = useQueryClient();
  const tournamentId = parseInt(id);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
  });

  const { data: participants = [] } = useQuery({
    queryKey: ['tournament-participants', tournamentId],
    queryFn: () => tournamentsApi.participants(tournamentId),
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['tournament-matches', tournamentId],
    queryFn: () => tournamentsApi.matches(tournamentId),
    enabled: !!tournament && tournament.status !== 'DRAFT',
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['tournament-groups', tournamentId],
    queryFn: () => tournamentsApi.groups(tournamentId),
    enabled: !!tournament && ['ROUND_ROBIN', 'MIXED', 'SWISS', 'CUSTOM'].includes(tournament?.format),
  });

  const fillRandomMutation = useMutation({
    mutationFn: () => tournamentsApi.fillRandom(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-participants', tournamentId] });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: () => {
      const newName = `${t('tournament.copyPrefix')} ${tournament.name}`;
      return tournamentsApi.copy(tournamentId, newName);
    },
    onSuccess: (copiedTournament) => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      // Optionally navigate to the new tournament
      // router.navigate({ to: `/tournaments/${copiedTournament.id}` });
    },
  });

  const joinMutation = useMutation({
    mutationFn: () => tournamentsApi.join(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-participants', tournamentId] });
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => tournamentsApi.leave(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['tournament-participants', tournamentId] });
    },
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-48 bg-muted rounded-lg" /></div>;
  if (!tournament) return <div className="text-center py-16 text-muted-foreground">{t('tournament.notFoundPage')}</div>;

  const isOrganizer = user?.id === tournament.organizer?.id;
  const myParticipation = participants.find((p: any) => p.user?.id === user?.id);
  const isFull = tournament.participantCount >= tournament.maxParticipants;

  return (
    <div className="space-y-6">
      {/* Tournament Header */}
      <div className="flex flex-col md:flex-row gap-6">
        {tournament.logo && (
          <img
            src={tournament.logo}
            alt={tournament.name}
            className="w-full md:w-48 h-48 object-cover rounded-lg border"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold">
                {tournament.name}
                {tournament.season && <span className="text-muted-foreground text-xl font-normal ml-2">{t('tournament.season', { n: tournament.season })}</span>}
              </h1>
              <p className="text-muted-foreground">{tournament.game?.name}</p>
            </div>
            <TournamentStatusBadge status={tournament.status} />
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span>{t(`format.${tournament.format}`, { defaultValue: tournament.format })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{t('tournament.participants', { count: tournament.participantCount, max: tournament.maxParticipants })}</span>
              {isAdmin() && tournament.status === 'REGISTRATION' && !isFull && (
                <button
                  onClick={() => fillRandomMutation.mutate()}
                  disabled={fillRandomMutation.isPending}
                  title="[dev] заполнить случайными юзерами"
                  className="ml-1 text-[10px] text-muted-foreground/40 hover:text-muted-foreground cursor-pointer select-none"
                >
                  {fillRandomMutation.isPending ? '...' : '⚄'}
                </button>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">{t('tournament.organizer')} </span>
              <Link to="/users/$login" params={{ login: tournament.organizer?.login }} className="hover:text-primary">
                @{tournament.organizer?.login}
              </Link>
            </div>
          </div>

          {(tournament.registrationStart || tournament.registrationEnd) && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                {t('tournament.registrationPeriod')}
                {tournament.registrationStart && ` ${t('tournament.registrationFrom', { date: format(new Date(tournament.registrationStart), 'd MMM yyyy HH:mm', { locale: dateLocale }) })}`}
                {tournament.registrationEnd && ` ${t('tournament.registrationTo', { date: format(new Date(tournament.registrationEnd), 'd MMM yyyy HH:mm', { locale: dateLocale }) })}`}
              </span>
            </div>
          )}

          {tournament.info && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{tournament.info}</p>
          )}

          <div className="flex gap-2 flex-wrap pt-2">
            {isOrganizer && (
              <Link to="/tournaments/$id/organizer" params={{ id }}>
                <Button className="gap-2"><Settings className="h-4 w-4" />{t('btn.organizerPanel')}</Button>
              </Link>
            )}
            {isOrganizer && (
              <Button
                variant="outline"
                className="gap-2"
                onClick={async () => {
                  const res = await cloneMutation.mutateAsync();
                  if (res?.id) {
                    window.location.href = `/tournaments/${res.id}`;
                  }
                }}
                disabled={cloneMutation.isPending}
                title={t('tournament.copyTooltip')}
              >
                <Copy className="h-4 w-4" />{t('tournament.copy')}
              </Button>
            )}
            {user && (
              myParticipation ? (
                <Button
                  variant="outline"
                  className="text-red-500 border-red-500 hover:bg-red-50"
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending || ['ACTIVE', 'FINISHED'].includes(tournament.status)}
                >
                  {leaveMutation.isPending ? t('btn.leaving') : t('btn.leave')}
                </Button>
              ) : (
                <Button
                  onClick={() => joinMutation.mutate()}
                  disabled={
                    joinMutation.isPending ||
                    tournament.status !== 'REGISTRATION' ||
                    isFull
                  }
                >
                  {joinMutation.isPending ? t('btn.joining') : isFull ? t('btn.full') : t('btn.join')}
                </Button>
              )
            )}

            {isOrganizer && tournament.format === 'CUSTOM' && ['DRAFT', 'REGISTRATION'].includes(tournament.status) && (
              <Link to="/tournaments/$id/custom-builder" params={{ id }}>
                <Button variant="outline" className="gap-2"><GitBranch className="h-4 w-4" />{t('custom.openBuilder')}</Button>
              </Link>
            )}

            {tournament.format === 'CUSTOM' && (tournament.status === 'ACTIVE' || tournament.status === 'FINISHED') && (
              <Link to="/tournaments/$id/custom-builder" params={{ id }}>
                <Button variant="outline" className="gap-2"><Trophy className="h-4 w-4" />{t('custom.viewSchema')}</Button>
              </Link>
            )}

            {tournament.format !== 'CUSTOM' && (tournament.status === 'ACTIVE' || tournament.status === 'FINISHED') && (
              <Link to="/tournaments/$id/bracket" params={{ id }}>
                <Button variant="outline" className="gap-2"><Trophy className="h-4 w-4" />{t('tournament.bracketBtn')}</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Podium for finished tournaments */}
      {tournament.status === 'FINISHED' && (() => {
        const top3 = [1, 2, 3]
          .map((place) => ({
            place,
            participants: (participants as any[]).filter((p) => p.finalResult === String(place)),
          }))
          .filter((x) => x.participants.length > 0);
        if (top3.length === 0) return null;
        const podiumOrder = [
          top3.find((x) => x.place === 2),
          top3.find((x) => x.place === 1),
          top3.find((x) => x.place === 3),
        ].filter(Boolean) as typeof top3;
        const heights = { 1: 'h-24', 2: 'h-16', 3: 'h-12' };
        const colors = { 1: 'text-yellow-500', 2: 'text-slate-400', 3: 'text-amber-600' };
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        return (
          <Card className="border-yellow-200 bg-gradient-to-b from-yellow-50/40 dark:from-yellow-900/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                {t('tournament.podium')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-center gap-3 pt-2">
                {podiumOrder.map((item) => (
                  <div key={item.place} className="flex flex-col items-center gap-1">
                    <span className="text-2xl">{(medals as any)[item.place]}</span>
                    <div className="flex flex-col items-center gap-0.5">
                      {item.participants.map((p: any) => (
                        <Link key={p.id} to="/users/$login" params={{ login: p.user?.login }}>
                          <span className={`text-sm font-semibold hover:underline ${(colors as any)[item.place]}`}>
                            @{p.user?.login}
                          </span>
                        </Link>
                      ))}
                    </div>
                    <div className={`w-20 ${(heights as any)[item.place]} rounded-t-md flex items-center justify-center ${
                      item.place === 1 ? 'bg-yellow-400/80' : item.place === 2 ? 'bg-slate-300/80' : 'bg-amber-600/60'
                    }`}>
                      <span className="text-white font-bold text-lg">{item.place}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Tabs */}
      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">{t('tournament.tabParticipants', { count: participants.length })}</TabsTrigger>
          {matches.length > 0 && <TabsTrigger value="matches">{t('tournament.tabMatches', { count: matches.length })}</TabsTrigger>}
          {groups.length > 0 && <TabsTrigger value="groups">{t('tournament.tabGroups')}</TabsTrigger>}
        </TabsList>

        <TabsContent value="participants" className="mt-4">
          {participants.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">{t('tournament.noParticipants')}</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {participants.map((p: any) => (
                <Link key={p.id} to="/users/$login" params={{ login: p.user?.login }}>
                  <div className={`p-3 rounded-md border hover:bg-accent transition-colors ${p.user?.id === user?.id ? 'border-green-400 bg-green-50/30' : ''}`}>
                    <p className="font-medium text-sm truncate">@{p.user?.login}</p>
                    {p.finalResult && (
                      <p className="text-xs text-muted-foreground">{t('tournament.place', { n: p.finalResult })}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          <MatchesList matches={matches as any[]} userId={user?.id} />
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          <GroupsList groups={groups} tournamentId={tournamentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MatchesList({ matches, userId }: { matches: any[]; userId?: number }) {
  const { t } = useTranslation();
  // Filter out dead matches (isBye with no players at all — phantom bracket slots)
  const visible = matches.filter((m: any) => !(m.isBye && !m.player1 && !m.player2));

  const grouped = visible.reduce((acc: any, m: any) => {
    const key = m.stage?.name ?? (m.roundNumber ? t('match.round', { n: m.roundNumber }) : 'Other matches');
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([round, roundMatches]: [string, any]) => (
        <div key={round}>
          <h3 className="font-semibold text-sm text-muted-foreground mb-3">{round}</h3>
          <div className="space-y-2">
            {roundMatches.map((m: any) => (
              <MatchCard key={m.id} match={m} userId={userId} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchCard({ match, userId }: { match: any; userId?: number }) {
  const { t } = useTranslation();

  // BYE with exactly one player — show auto-advance chip, no link
  if (match.isBye && match.winner) {
    const login = match.winner.user?.login;
    const isMe = match.winner.user?.id === userId;
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md border border-dashed text-sm text-muted-foreground ${isMe ? 'border-blue-300 bg-blue-50/30' : 'bg-muted/20'}`}>
        <span className="font-medium text-foreground">@{login}</span>
        <span>{t('match.advancesAuto')}</span>
      </div>
    );
  }

  const isMyMatch = match.player1?.user?.id === userId || match.player2?.user?.id === userId;
  const result = match.results?.find((r: any) => r.isAccepted) ?? match.results?.[0];

  return (
    <Link to="/matches/$id" params={{ id: String(match.id) }}>
      <div className={`flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors ${isMyMatch ? 'border-blue-400' : ''}`}>
        <div className="flex-1 text-right">
          <span className={`text-sm ${match.winner?.user?.id === match.player1?.user?.id ? 'font-bold' : ''}`}>
            {match.player1?.user?.login ?? '—'}
          </span>
        </div>
        <div className="w-20 text-center font-mono font-semibold">
          {match.isFinished && result ? (
            <span>{result.player1Score} : {result.player2Score}</span>
          ) : (
            <span className="text-muted-foreground text-xs">vs</span>
          )}
        </div>
        <div className="flex-1 text-left">
          <span className={`text-sm ${match.winner?.user?.id === match.player2?.user?.id ? 'font-bold' : ''}`}>
            {match.player2?.user?.login ?? '—'}
          </span>
        </div>
        <div className="w-20 text-right">
          {match.isFinished ? (
            <Badge variant="secondary" className="text-xs">{t('match.finished')}</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">{t('match.waiting')}</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function GroupsList({ groups, tournamentId }: { groups: any[]; tournamentId: number }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {groups.map((group: any) => (
        <Card key={group.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{group.name}</CardTitle>
              <Link to="/tournaments/$id/groups/$groupId" params={{ id: String(tournamentId), groupId: String(group.id) }}>
                <Button variant="ghost" size="sm">{t('btn.details')}</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2 w-8">{t('group.rank')}</th>
                    <th className="text-left pb-2">{t('group.participant')}</th>
                    <th className="text-center pb-2 w-10">{t('group.wins')}</th>
                    <th className="text-center pb-2 w-10">{t('group.draws')}</th>
                    <th className="text-center pb-2 w-10">{t('group.losses')}</th>
                    <th className="text-center pb-2 w-16">{t('group.goals')}</th>
                    <th className="text-center pb-2 w-10">{t('group.points')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.standings ?? []).map((s: any) => (
                    <tr key={s.participantId} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 text-muted-foreground">{s.rank}</td>
                      <td className="py-2">
                        <Link to="/users/$login" params={{ login: s.participant?.user?.login }} className="hover:text-primary">
                          {s.participant?.user?.login}
                        </Link>
                      </td>
                      <td className="py-2 text-center text-green-600">{s.wins}</td>
                      <td className="py-2 text-center text-yellow-600">{s.draws}</td>
                      <td className="py-2 text-center text-red-500">{s.losses}</td>
                      <td className="py-2 text-center">{s.goalsFor}:{s.goalsAgainst}</td>
                      <td className="py-2 text-center font-bold">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
