import { useState, useEffect, useRef } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
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
import { useTranslation } from 'react-i18next';
import i18n from '../../i18n';

export const Route = createFileRoute('/matches/$id')({
  component: MatchPage,
});

function MatchPage() {
  const { id } = Route.useParams();
  const { user, isAdmin, isModerator } = useAuthStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? enUS : ru;
  const matchId = parseInt(id);

  const { data: match, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: () => matchesApi.get(matchId),
    refetchInterval: (query) => query.state.data?.isFinished ? false : 5000,
  });

  const [score1, setScore1] = useState('0');
  const [score2, setScore2] = useState('0');
  const [isFinal, setIsFinal] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  // Default isFinal=true for organizers once match data loads
  const isFinalInitialized = useRef(false);
  useEffect(() => {
    if (match?.id && !isFinalInitialized.current) {
      isFinalInitialized.current = true;
      const isOrg = match.tournament?.organizerId === user?.id || isAdmin() || isModerator();
      if (isOrg) setIsFinal(true);
    }
  }, [match?.id]);

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
    onError: (err: any) => setError(err.response?.data?.error || t('match.saveError')),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  if (!match) return <div className="text-center py-16 text-muted-foreground">{t('match.notFound')}</div>;

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
          {t('match.backToTournament')}
        </Button>
      </Link>

      {/* Match header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {match.stage?.name ?? (match.roundNumber ? t('match.round', { n: match.roundNumber }) : 'Match')}
            </CardTitle>
            {match.isFinished
              ? <Badge variant="success">{t('match.finished')}</Badge>
              : match.isBye
              ? <Badge variant="secondary">{t('match.bye')}</Badge>
              : <Badge variant="outline">{t('match.waiting')}</Badge>
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
                <span className="text-sm text-muted-foreground">{t('match.bye')}</span>
              ) : (
                <span className="text-2xl text-muted-foreground">vs</span>
              )}
            </div>

            <div className="flex-1 text-center">
              <Link to="/users/$login" params={{ login: match.player2?.user?.login }}>
                <div className={`p-4 rounded-lg border-2 ${match.winner?.id === match.player2Id ? 'border-green-400 bg-green-50/30' : 'border-transparent'}`}>
                  {match.winner?.id === match.player2Id && <Trophy className="h-4 w-4 text-green-500 mx-auto mb-1" />}
                  <p className="font-bold text-lg">{match.isBye ? t('match.bye') : (match.player2?.user?.login ?? '—')}</p>
                </div>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Set result form */}
      {canSetResult && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('match.enterResult')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label>{t('match.score', { player: match.player1?.user?.login ?? 'P1' })}</Label>
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
                <Label>{t('match.score', { player: match.player2?.user?.login ?? 'P2' })}</Label>
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
              <Label htmlFor="match-info">{t('match.comment')}</Label>
              <Textarea
                id="match-info"
                value={info}
                onChange={(e) => setInfo(e.target.value)}
                placeholder={t('match.commentPlaceholder')}
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch id="is-final" checked={isFinal} onCheckedChange={setIsFinal} />
              <Label htmlFor="is-final">
                {isOrganizer ? t('match.finalResult') : t('match.finalResultPlayer')}
              </Label>
            </div>

            {isFinal && !isOrganizer && (
              <p className="text-xs text-amber-600">
                {t('match.finalResultPlayerHint')}
              </p>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={() => setResultMutation.mutate()}
              disabled={setResultMutation.isPending}
            >
              {setResultMutation.isPending ? t('match.savingResult') : t('match.saveResult')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result history */}
      {match.results?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('match.history')}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {match.results.map((r: any) => (
              <div key={r.id} className={`flex items-center justify-between p-3 rounded-md border ${r.isFinal ? 'bg-green-50/30 border-green-400' : ''}`}>
                <div>
                  <span className="font-mono font-semibold">{r.player1Score} : {r.player2Score}</span>
                  {r.info && <p className="text-xs text-muted-foreground mt-0.5">{r.info}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">@{r.setByUser?.login}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(r.createdAt), 'd MMM HH:mm', { locale: dateLocale })}</p>
                  {r.isAccepted ? (
                    <Badge variant="success" className="text-xs mt-1">{t('match.confirmed')}</Badge>
                  ) : r.isFinal ? (
                    <Badge variant="outline" className="text-xs mt-1">{t('match.markedFinal')}</Badge>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
