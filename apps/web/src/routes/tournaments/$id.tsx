import React from 'react';
import { createFileRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Users, Calendar, Trophy, GitBranch, Settings } from 'lucide-react';
import { tournamentsApi } from '../../api/tournaments';
import { useAuthStore } from '../../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { TournamentStatusBadge } from '../../components/tournament/TournamentStatusBadge';
import { Separator } from '../../components/ui/separator';

export const Route = createFileRoute('/tournaments/$id')({
  component: TournamentPage,
});

const formatLabels: Record<string, string> = {
  SINGLE_ELIMINATION: 'Олимпийская система',
  DOUBLE_ELIMINATION: 'Двойное выбывание',
  ROUND_ROBIN: 'Круговая система',
  SWISS: 'Швейцарская система',
  MIXED: 'Смешанная',
};

function TournamentPage() {
  const { id } = Route.useParams();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuthStore();

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
    enabled: !!tournament && ['ROUND_ROBIN', 'MIXED', 'SWISS'].includes(tournament?.format),
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
  if (!tournament) return <div className="text-center py-16 text-muted-foreground">Турнир не найден</div>;

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
                {tournament.season && <span className="text-muted-foreground text-xl font-normal ml-2">Сезон {tournament.season}</span>}
              </h1>
              <p className="text-muted-foreground">{tournament.game?.name}</p>
            </div>
            <TournamentStatusBadge status={tournament.status} />
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span>{formatLabels[tournament.format] ?? tournament.format}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{tournament.participantCount} / {tournament.maxParticipants} участников</span>
            </div>
            <div>
              <span className="text-muted-foreground">Организатор: </span>
              <Link to="/users/$login" params={{ login: tournament.organizer?.login }} className="hover:text-primary">
                @{tournament.organizer?.login}
              </Link>
            </div>
          </div>

          {(tournament.registrationStart || tournament.registrationEnd) && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>
                Регистрация:
                {tournament.registrationStart && ` с ${format(new Date(tournament.registrationStart), 'd MMM yyyy HH:mm', { locale: ru })}`}
                {tournament.registrationEnd && ` до ${format(new Date(tournament.registrationEnd), 'd MMM yyyy HH:mm', { locale: ru })}`}
              </span>
            </div>
          )}

          {tournament.info && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{tournament.info}</p>
          )}

          <div className="flex gap-2 flex-wrap pt-2">
            {isOrganizer ? (
              <Link to="/tournaments/$id/organizer" params={{ id }}>
                <Button className="gap-2"><Settings className="h-4 w-4" />Панель организатора</Button>
              </Link>
            ) : user ? (
              myParticipation ? (
                <Button
                  variant="outline"
                  className="text-red-500 border-red-500 hover:bg-red-50"
                  onClick={() => leaveMutation.mutate()}
                  disabled={leaveMutation.isPending || ['ACTIVE', 'FINISHED'].includes(tournament.status)}
                >
                  {leaveMutation.isPending ? 'Выход...' : 'Покинуть турнир'}
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
                  {joinMutation.isPending ? 'Регистрация...' : isFull ? 'Нет мест' : 'Участвовать'}
                </Button>
              )
            ) : null}

            {(tournament.status === 'ACTIVE' || tournament.status === 'FINISHED') && (
              <Link to="/tournaments/$id/bracket" params={{ id }}>
                <Button variant="outline" className="gap-2"><Trophy className="h-4 w-4" />Турнирная сетка</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs defaultValue="participants">
        <TabsList>
          <TabsTrigger value="participants">Участники ({participants.length})</TabsTrigger>
          {matches.length > 0 && <TabsTrigger value="matches">Матчи ({matches.length})</TabsTrigger>}
          {groups.length > 0 && <TabsTrigger value="groups">Группы</TabsTrigger>}
        </TabsList>

        <TabsContent value="participants" className="mt-4">
          {participants.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Участников пока нет</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {participants.map((p: any) => (
                <Link key={p.id} to="/users/$login" params={{ login: p.user?.login }}>
                  <div className={`p-3 rounded-md border hover:bg-accent transition-colors ${p.user?.id === user?.id ? 'border-green-400 bg-green-50/30' : ''}`}>
                    <p className="font-medium text-sm truncate">@{p.user?.login}</p>
                    {p.finalResult && (
                      <p className="text-xs text-muted-foreground">Место: {p.finalResult}</p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          <MatchesList matches={matches} userId={user?.id} />
        </TabsContent>

        <TabsContent value="groups" className="mt-4">
          <GroupsList groups={groups} tournamentId={tournamentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MatchesList({ matches, userId }: { matches: any[]; userId?: number }) {
  const grouped = matches.reduce((acc: any, m: any) => {
    const key = m.roundNumber ? `Раунд ${m.roundNumber}` : (m.stage?.name ?? 'Другие матчи');
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
  const isMyMatch = match.player1?.user?.id === userId || match.player2?.user?.id === userId;
  const result = match.results?.[0];

  return (
    <Link to="/matches/$id" params={{ id: String(match.id) }}>
      <div className={`flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors ${isMyMatch ? 'border-blue-400' : ''}`}>
        <div className="flex-1 text-right">
          <span className={`text-sm ${match.winner?.user?.id === match.player1?.user?.id ? 'font-bold' : ''}`}>
            {match.player1?.user?.login ?? '—'}
          </span>
        </div>
        <div className="w-20 text-center font-mono font-semibold">
          {match.isBye ? (
            <span className="text-xs text-muted-foreground">BYE</span>
          ) : match.isFinished && result ? (
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
            <Badge variant="secondary" className="text-xs">Завершён</Badge>
          ) : (
            <Badge variant="outline" className="text-xs">Ожидание</Badge>
          )}
        </div>
      </div>
    </Link>
  );
}

function GroupsList({ groups, tournamentId }: { groups: any[]; tournamentId: number }) {
  return (
    <div className="space-y-6">
      {groups.map((group: any) => (
        <Card key={group.id}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{group.name}</CardTitle>
              <Link to="/tournaments/$id/groups/$groupId" params={{ id: String(tournamentId), groupId: String(group.id) }}>
                <Button variant="ghost" size="sm">Подробнее</Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left pb-2 w-8">#</th>
                    <th className="text-left pb-2">Участник</th>
                    <th className="text-center pb-2 w-10">В</th>
                    <th className="text-center pb-2 w-10">Н</th>
                    <th className="text-center pb-2 w-10">П</th>
                    <th className="text-center pb-2 w-16">ГЗ:ГП</th>
                    <th className="text-center pb-2 w-10">О</th>
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
