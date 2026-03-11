import React from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { tournamentsApi } from '../../api/tournaments';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../../components/ui/badge';

export const Route = createFileRoute('/tournaments/$id/groups/$groupId')({
  component: GroupPage,
});

function GroupPage() {
  const { id, groupId } = Route.useParams();
  const tournamentId = parseInt(id);

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['tournament-groups', tournamentId],
    queryFn: () => tournamentsApi.groups(tournamentId),
  });

  const { data: tournament } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
  });

  const group = groups.find((g: any) => String(g.id) === groupId);

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  if (!group) return <div className="text-center py-16 text-muted-foreground">Группа не найдена</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/tournaments/$id" params={{ id }}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Назад к турниру
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{group.name}</h1>
        {group.isFinished && <Badge variant="success">Завершена</Badge>}
      </div>

      {/* Standings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Турнирная таблица</CardTitle>
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
                  <th className="text-center pb-2 w-10">РМ</th>
                  <th className="text-center pb-2 w-10">О</th>
                </tr>
              </thead>
              <tbody>
                {(group.standings ?? []).map((s: any) => (
                  <tr key={s.participantId} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 text-muted-foreground">{s.rank}</td>
                    <td className="py-2">
                      <Link to="/users/$login" params={{ login: s.participant?.user?.login }} className="hover:text-primary font-medium">
                        @{s.participant?.user?.login}
                      </Link>
                    </td>
                    <td className="py-2 text-center text-green-600">{s.wins}</td>
                    <td className="py-2 text-center text-yellow-600">{s.draws}</td>
                    <td className="py-2 text-center text-red-500">{s.losses}</td>
                    <td className="py-2 text-center">{s.goalsFor}:{s.goalsAgainst}</td>
                    <td className="py-2 text-center text-muted-foreground">
                      {s.goalsFor - s.goalsAgainst > 0 ? '+' : ''}{s.goalsFor - s.goalsAgainst}
                    </td>
                    <td className="py-2 text-center font-bold">{s.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            За победу: {group.pointsForWin} очка · За ничью: {group.pointsForDraw} очка
          </div>
        </CardContent>
      </Card>

      {/* Matches */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Матчи группы</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {group.matches?.length === 0 ? (
            <p className="text-sm text-muted-foreground">Матчей пока нет</p>
          ) : (
            group.matches?.map((m: any) => {
              const result = m.results?.[0];
              return (
                <Link key={m.id} to="/matches/$id" params={{ id: String(m.id) }}>
                  <div className="flex items-center gap-3 p-3 rounded-md border hover:bg-accent transition-colors">
                    <div className="flex-1 text-right">
                      <span className={`text-sm ${m.winner?.id === m.player1Id ? 'font-bold' : ''}`}>
                        {m.player1?.user?.login ?? '—'}
                      </span>
                    </div>
                    <div className="w-16 text-center font-mono font-semibold text-sm">
                      {m.isFinished && result ? `${result.player1Score}:${result.player2Score}` : 'vs'}
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`text-sm ${m.winner?.id === m.player2Id ? 'font-bold' : ''}`}>
                        {m.player2?.user?.login ?? '—'}
                      </span>
                    </div>
                    <div>
                      {m.isFinished
                        ? <Badge variant="secondary" className="text-xs">Завершён</Badge>
                        : <Badge variant="outline" className="text-xs">Ожидание</Badge>
                      }
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
