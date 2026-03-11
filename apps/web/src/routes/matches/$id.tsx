import React, { useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { matchesApi } from '../../api/matches';
import { useAuthStore } from '../../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Trophy } from 'lucide-react';

export const Route = createFileRoute('/matches/$id')({
  component: MatchPage,
});

function MatchPage() {
  const { id } = Route.useParams();
  const { user, isAdmin, isModerator } = useAuthStore();
  const queryClient = useQueryClient();
  const matchId = parseInt(id);

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matchesApi.get(matchId),
  });

  const [score1, setScore1] = useState('0');
  const [score2, setScore2] = useState('0');
  const [isFinal, setIsFinal] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  const setResultMutation = useMutation({
    mutationFn: () => matchesApi.setResult(matchId, {
      player1Score: parseInt(score1),
      player2Score: parseInt(score2),
      isFinal,
      info: info || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['match', matchId] });
      setError('');
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Ошибка сохранения результата'),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  if (!match) return <div className="text-center py-16 text-muted-foreground">Матч не найден</div>;

  const confirmedResult = match.results?.find((r: any) => r.isFinal);
  const isOrganizer = match.tournament?.organizerId === user?.id || isAdmin() || isModerator();

  // Can the user set a result?
  const isPlayer1 = match.player1?.user?.id === user?.id;
  const isPlayer2 = match.player2?.user?.id === user?.id;
  const isParticipant = isPlayer1 || isPlayer2;
  const canSetResult = user && !match.isFinished && !match.isBye && match.player1Id && match.player2Id
    && (isOrganizer || isParticipant)
    && (!match.tournament?.onlyOrganizerSetsResults || isOrganizer);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link to="/tournaments/$id" params={{ id: String(match.tournamentId) }}>
        <Button variant="ghost" size="sm" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          К турниру
        </Button>
      </Link>

      {/* Match header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {match.stage?.name ?? (match.roundNumber ? `Раунд ${match.roundNumber}` : 'Матч')}
            </CardTitle>
            {match.isFinished
              ? <Badge variant="success">Завершён</Badge>
              : match.isBye
              ? <Badge variant="secondary">BYE</Badge>
              : <Badge variant="outline">Ожидание</Badge>
            }
          </div>
        </CardHeader>
        <CardContent>
          {/* Scoreboard */}
          <div className="flex items-center gap-4">
            <div className="flex-1 text-center">
              <Link to="/users/$login" params={{ login: match.player1?.user?.login }}>
                <div className={`p-4 rounded-lg border-2 ${match.winner?.id === match.player1Id ? 'border-green-400 bg-green-50/30' : 'border-transparent'}`}>
                  {match.winner?.id === match.player1Id && <Trophy className="h-4 w-4 text-green-500 mx-auto mb-1" />}
                  <p className="font-bold text-lg">{match.player1?.user?.login ?? '—'}</p>
                </div>
              </Link>
            </div>

            <div className="text-center min-w-[80px]">
              {confirmedResult ? (
                <div>
                  <span className="text-3xl font-mono font-bold">{confirmedResult.player1Score}</span>
                  <span className="text-2xl text-muted-foreground mx-2">:</span>
                  <span className="text-3xl font-mono font-bold">{confirmedResult.player2Score}</span>
                </div>
              ) : match.isBye ? (
                <span className="text-sm text-muted-foreground">BYE</span>
              ) : (
                <span className="text-2xl text-muted-foreground">vs</span>
              )}
            </div>

            <div className="flex-1 text-center">
              <Link to="/users/$login" params={{ login: match.player2?.user?.login }}>
                <div className={`p-4 rounded-lg border-2 ${match.winner?.id === match.player2Id ? 'border-green-400 bg-green-50/30' : 'border-transparent'}`}>
                  {match.winner?.id === match.player2Id && <Trophy className="h-4 w-4 text-green-500 mx-auto mb-1" />}
                  <p className="font-bold text-lg">{match.isBye ? 'BYE' : (match.player2?.user?.login ?? '—')}</p>
                </div>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Set result form */}
      {canSetResult && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ввести результат</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>Счёт {match.player1?.user?.login ?? 'Игрок 1'}</Label>
                <Input
                  type="number"
                  min="0"
                  value={score1}
                  onChange={(e) => setScore1(e.target.value)}
                  className="text-center"
                />
              </div>
              <span className="text-xl text-muted-foreground mt-6">:</span>
              <div className="flex-1">
                <Label>Счёт {match.player2?.user?.login ?? 'Игрок 2'}</Label>
                <Input
                  type="number"
                  min="0"
                  value={score2}
                  onChange={(e) => setScore2(e.target.value)}
                  className="text-center"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="match-info">Комментарий (необязательно)</Label>
              <Textarea
                id="match-info"
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                placeholder="Дополнительная информация..."
                rows={2}
              />
            </div>

            {isOrganizer && (
              <div className="flex items-center gap-2">
                <Switch id="is-final" checked={isFinal} onCheckedChange={setIsFinal} />
                <Label htmlFor="is-final">Финальный результат</Label>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={() => setResultMutation.mutate()}
              disabled={setResultMutation.isPending}
            >
              {setResultMutation.isPending ? 'Сохранение...' : 'Сохранить результат'}
            </Button>

            {!isFinal && (
              <p className="text-xs text-muted-foreground text-center">
                Матч завершится автоматически, когда оба участника введут одинаковый счёт
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Result history */}
      {match.results?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">История результатов</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {match.results.map((r: any) => (
              <div key={r.id} className={`flex items-center justify-between p-3 rounded-md border ${r.isFinal ? 'bg-green-50/30 border-green-400' : ''}`}>
                <div>
                  <span className="font-mono font-semibold">{r.player1Score} : {r.player2Score}</span>
                  {r.info && <p className="text-xs text-muted-foreground mt-0.5">{r.info}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">@{r.setByUser?.login}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.createdAt), 'd MMM HH:mm', { locale: ru })}</p>
                  {r.isFinal && <Badge variant="success" className="text-xs mt-1">Подтверждён</Badge>}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
