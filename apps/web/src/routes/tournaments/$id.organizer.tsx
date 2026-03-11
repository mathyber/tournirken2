import React, { useState, useCallback } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { tournamentsApi } from '../../api/tournaments';
import { useAuthStore } from '../../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Save, Play, AlertTriangle } from 'lucide-react';

export const Route = createFileRoute('/tournaments/$id/organizer')({
  component: OrganizerPage,
});

function OrganizerPage() {
  const { id } = Route.useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
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
    enabled: tournament?.status === 'ACTIVE' || tournament?.status === 'FINISHED',
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [finalizeError, setFinalizeError] = useState('');
  const [finalizeLoading, setFinalizeLoading] = useState(false);

  // Check organizer access
  if (!isLoading && tournament && user?.id !== tournament.organizer?.id) {
    if (!useAuthStore.getState().isAdmin()) {
      return <div className="text-center py-16 text-muted-foreground">Нет доступа</div>;
    }
  }

  const saveDraftMutation = useMutation({
    mutationFn: () => tournamentsApi.saveDraftGrid(tournamentId, JSON.stringify({ nodes, edges })),
  });

  const handleFinalize = async () => {
    setFinalizeError('');
    setFinalizeLoading(true);
    try {
      await tournamentsApi.finalizeGrid(tournamentId, {
        gridJson: JSON.stringify({ nodes, edges }),
        participantAssignments: participants.map((p: any, idx: number) => ({
          participantId: p.id,
          seed: idx + 1,
        })),
      });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      navigate({ to: '/tournaments/$id', params: { id } });
    } catch (err: any) {
      setFinalizeError(err.response?.data?.error || 'Ошибка запуска турнира');
    } finally {
      setFinalizeLoading(false);
    }
  };

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  if (!tournament) return <div className="text-center py-16">Турнир не найден</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/tournaments/$id" params={{ id }}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Назад
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Панель организатора: {tournament.name}</h1>
        <Badge variant={tournament.status === 'ACTIVE' ? 'success' : 'secondary'}>
          {tournament.status}
        </Badge>
      </div>

      <Tabs defaultValue="bracket">
        <TabsList>
          <TabsTrigger value="bracket">Турнирная сетка</TabsTrigger>
          <TabsTrigger value="matches">Матчи и группы</TabsTrigger>
        </TabsList>

        <TabsContent value="bracket" className="mt-4">
          {tournament.status === 'ACTIVE' || tournament.status === 'FINISHED' ? (
            <div className="border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
              >
                <Background />
                <Controls />
                <MiniMap />
              </ReactFlow>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Participant list */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Участники ({participants.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  {participants.length < 2 ? (
                    <p className="text-sm text-muted-foreground">Нужно минимум 2 участника для запуска</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {participants.map((p: any, idx: number) => (
                        <div key={p.id} className="p-2 rounded border text-sm flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">{idx + 1}.</span>
                          <span className="truncate">@{p.user?.login}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Bracket editor canvas */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Редактор сетки</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden bg-muted/10" style={{ height: '50vh' }}>
                    <ReactFlow
                      nodes={nodes}
                      edges={edges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      fitView
                    >
                      <Background />
                      <Controls />
                      <Panel position="top-right" className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => saveDraftMutation.mutate()}
                          disabled={saveDraftMutation.isPending}
                        >
                          <Save className="h-3.5 w-3.5" />
                          Сохранить черновик
                        </Button>
                      </Panel>
                    </ReactFlow>
                  </div>
                </CardContent>
              </Card>

              {/* Finalize */}
              <Card className="border-orange-200 bg-orange-50/30 dark:bg-orange-900/10">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">Запустить турнир</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        После запуска регистрация закрывается, автоматически генерируются матчи в соответствии с форматом "{tournament.format}".
                        Это действие необратимо.
                      </p>
                      {finalizeError && (
                        <p className="text-sm text-destructive mt-2">{finalizeError}</p>
                      )}
                    </div>
                    <Button
                      className="gap-2 flex-shrink-0"
                      onClick={handleFinalize}
                      disabled={finalizeLoading || participants.length < 2}
                    >
                      <Play className="h-4 w-4" />
                      {finalizeLoading ? 'Запуск...' : 'Запустить'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          {matches.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">Матчи появятся после запуска турнира</p>
          ) : (
            <div className="space-y-2">
              {matches.map((m: any) => (
                <OrganizerMatchRow key={m.id} match={m} tournamentId={tournamentId} queryClient={queryClient} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OrganizerMatchRow({ match, tournamentId, queryClient }: { match: any; tournamentId: number; queryClient: any }) {
  const { matchesApi } = require('../../api/matches');
  const [score1, setScore1] = useState('');
  const [score2, setScore2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSetResult = async () => {
    if (!score1 || !score2) return;
    setSubmitting(true);
    try {
      await matchesApi.setResult(match.id, {
        player1Score: parseInt(score1),
        player2Score: parseInt(score2),
        isFinal: true,
      });
      queryClient.invalidateQueries({ queryKey: ['tournament-matches', tournamentId] });
    } catch {}
    setSubmitting(false);
  };

  const result = match.results?.[0];

  return (
    <div className="flex items-center gap-3 p-3 rounded-md border">
      <div className="flex-1 text-sm">
        <span className="text-muted-foreground text-xs">{match.stage?.name ?? `Раунд ${match.roundNumber}`}</span>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-medium">{match.player1?.user?.login ?? '—'}</span>
          <span className="text-muted-foreground">vs</span>
          <span className="font-medium">{match.isBye ? 'BYE' : (match.player2?.user?.login ?? '—')}</span>
        </div>
      </div>
      {match.isFinished ? (
        <Badge variant="secondary" className="text-xs">
          {result ? `${result.player1Score}:${result.player2Score}` : 'Завершён'}
        </Badge>
      ) : match.player1Id && match.player2Id && !match.isBye ? (
        <div className="flex items-center gap-2">
          <Input
            className="w-14 h-8 text-center text-sm"
            type="number"
            min="0"
            value={score1}
            onChange={(e) => setScore1(e.target.value)}
            placeholder="0"
          />
          <span>:</span>
          <Input
            className="w-14 h-8 text-center text-sm"
            type="number"
            min="0"
            value={score2}
            onChange={(e) => setScore2(e.target.value)}
            placeholder="0"
          />
          <Button size="sm" onClick={handleSetResult} disabled={submitting || !score1 || !score2}>
            ОК
          </Button>
        </div>
      ) : (
        <Badge variant="outline" className="text-xs">Ожидание</Badge>
      )}
    </div>
  );
}
