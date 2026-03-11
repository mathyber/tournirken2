import { useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Position,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { tournamentsApi } from '../../api/tournaments';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/tournaments/$id/bracket')({
  component: BracketPage,
});

function BracketPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const tournamentId = parseInt(id);

  const { data: gridData, isLoading } = useQuery({
    queryKey: ['tournament-grid', tournamentId],
    queryFn: () => tournamentsApi.grid(tournamentId),
  });

  const { data: tournament } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ['tournament-groups', tournamentId],
    queryFn: () => tournamentsApi.groups(tournamentId),
    enabled: tournament?.format === 'MIXED' || tournament?.format === 'ROUND_ROBIN',
  });

  const format = tournament?.format;
  const isGroupBased = format === 'MIXED' || format === 'ROUND_ROBIN';

  // For bracket: only playoff matches (no groupId)
  const playoffMatches = (gridData?.matches ?? []).filter((m: any) => !m.groupId);
  const showBracket = format !== 'ROUND_ROBIN' && playoffMatches.length > 0;

  if (isLoading) return <div className="flex items-center justify-center h-96">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/tournaments/$id" params={{ id }}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('match.backToTournament')}
          </Button>
        </Link>
        <h1 className="text-xl font-bold">
          {t('organizer.bracketEditor')}: {tournament?.name}
        </h1>
      </div>

      {/* Group standings for MIXED / ROUND_ROBIN */}
      {isGroupBased && (groups as any[]).length > 0 && (
        <div className="space-y-4">
          {format === 'MIXED' && (
            <h2 className="text-base font-semibold text-muted-foreground">{t('tournament.tabGroups')}</h2>
          )}
          <div className={`grid gap-4 ${(groups as any[]).length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
            {(groups as any[]).map((group: any) => (
              <GroupTable key={group.id} group={group} tournamentId={tournamentId} t={t} />
            ))}
          </div>
        </div>
      )}

      {/* Playoff bracket */}
      {showBracket && (
        <div className="space-y-2">
          {format === 'MIXED' && (
            <h2 className="text-base font-semibold text-muted-foreground">Плей-офф</h2>
          )}
          <div className="border rounded-lg overflow-hidden bg-muted/20" style={{ height: format === 'MIXED' ? '55vh' : '75vh' }}>
            <PlayoffBracket matches={playoffMatches} />
          </div>
        </div>
      )}

      {/* ROUND_ROBIN: no bracket, just groups above */}
      {format === 'ROUND_ROBIN' && (groups as any[]).length === 0 && (
        <p className="text-center py-8 text-muted-foreground">{t('organizer.noMatches')}</p>
      )}
    </div>
  );
}

function GroupTable({ group, tournamentId, t }: { group: any; tournamentId: number; t: any }) {
  return (
    <Card>
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
  );
}

function PlayoffBracket({ matches }: { matches: any[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!matches.length) return;
    const { nodes: n, edges: e } = buildGraphFromMatches(matches);
    setNodes(n);
    setEdges(e);
  }, [matches]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      fitView
      nodesDraggable={false}
      nodesConnectable={false}
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}

function buildGraphFromMatches(matches: any[]): { nodes: Node[]; edges: Edge[] } {
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 80;
  const H_GAP = 80;
  const LEAF_GAP = 24; // gap between first-round nodes

  // Group by round
  const byRound: Record<number, any[]> = {};
  for (const m of matches) {
    const r = m.roundNumber ?? 0;
    if (!byRound[r]) byRound[r] = [];
    byRound[r].push(m);
  }
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  // Build reverse map: matchId → feeders (matches whose nextMatchId points here)
  const feedersOf = new Map<number, any[]>();
  for (const m of matches) {
    if (m.nextMatchId) {
      if (!feedersOf.has(m.nextMatchId)) feedersOf.set(m.nextMatchId, []);
      feedersOf.get(m.nextMatchId)!.push(m);
    }
  }

  // Assign Y via tree layout:
  // 1. Leaf round (round[0]): evenly spaced
  // 2. Each subsequent round: parent Y = midpoint of its feeders' Y values
  const yPos = new Map<number, number>();
  const firstRound = rounds[0];
  byRound[firstRound].forEach((m, idx) => {
    yPos.set(m.id, idx * (NODE_HEIGHT + LEAF_GAP));
  });
  for (let ri = 1; ri < rounds.length; ri++) {
    for (const m of byRound[rounds[ri]]) {
      const feeders = feedersOf.get(m.id) ?? [];
      if (feeders.length === 0) {
        yPos.set(m.id, 0);
      } else {
        const ys = feeders.map((f) => yPos.get(f.id) ?? 0);
        yPos.set(m.id, (Math.min(...ys) + Math.max(...ys)) / 2);
      }
    }
  }

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  rounds.forEach((round, roundIdx) => {
    const x = roundIdx * (NODE_WIDTH + H_GAP);
    for (const m of byRound[round]) {
      const y = yPos.get(m.id) ?? 0;
      const result = m.results?.[0];

      nodes.push({
        id: String(m.id),
        type: 'default',
        position: { x, y },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: (
            <div className="text-xs w-full">
              <div className={`flex justify-between items-center px-2 py-1 rounded-t ${m.winner?.user?.id === m.player1?.user?.id ? 'bg-green-100 dark:bg-green-900/30' : ''}`}>
                <span className="font-medium truncate max-w-[120px]">{m.player1?.user?.login ?? '—'}</span>
                <span className="font-mono ml-2">{result ? result.player1Score : (m.isBye ? '' : '?')}</span>
              </div>
              <div className={`flex justify-between items-center px-2 py-1 rounded-b border-t ${m.winner?.user?.id === m.player2?.user?.id ? 'bg-green-100 dark:bg-green-900/30' : ''}`}>
                <span className="font-medium truncate max-w-[120px]">{m.isBye ? 'BYE' : (m.player2?.user?.login ?? '—')}</span>
                <span className="font-mono ml-2">{result ? result.player2Score : (m.isBye ? '' : '?')}</span>
              </div>
            </div>
          ),
        },
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          padding: 0,
          background: m.isFinished ? '#f0fff4' : '#fff',
          border: m.isFinished ? '1px solid #86efac' : '1px solid #e2e8f0',
          borderRadius: 8,
          fontSize: 12,
        },
      });

      if (m.nextMatchId) {
        edges.push({
          id: `e-${m.id}-${m.nextMatchId}`,
          source: String(m.id),
          target: String(m.nextMatchId),
          type: 'smoothstep',
          animated: !m.isFinished,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        });
      }
    }
  });

  return { nodes, edges };
}
