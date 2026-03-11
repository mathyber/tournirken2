import React, { useCallback, useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { tournamentsApi } from '../../api/tournaments';
import { Button } from '../../components/ui/button';
import { ArrowLeft } from 'lucide-react';

export const Route = createFileRoute('/tournaments/$id/bracket')({
  component: BracketPage,
});

function BracketPage() {
  const { id } = Route.useParams();
  const tournamentId = parseInt(id);

  const { data: gridData, isLoading } = useQuery({
    queryKey: ['tournament-grid', tournamentId],
    queryFn: () => tournamentsApi.grid(tournamentId),
  });

  const { data: tournament } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
  });

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    if (!gridData?.matches) return;
    const { nodes: n, edges: e } = buildGraphFromMatches(gridData.matches);
    setNodes(n);
    setEdges(e);
  }, [gridData]);

  if (isLoading) return <div className="flex items-center justify-center h-96">Загрузка сетки...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/tournaments/$id" params={{ id }}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            Назад к турниру
          </Button>
        </Link>
        <h1 className="text-xl font-bold">
          Сетка: {tournament?.name}
        </h1>
      </div>

      <div className="border rounded-lg overflow-hidden bg-muted/20" style={{ height: '75vh' }}>
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
      </div>
    </div>
  );
}

function buildGraphFromMatches(matches: any[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Group by round
  const byRound: Record<number, any[]> = {};
  for (const m of matches) {
    const round = m.roundNumber ?? 0;
    if (!byRound[round]) byRound[round] = [];
    byRound[round].push(m);
  }

  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
  const NODE_WIDTH = 220;
  const NODE_HEIGHT = 80;
  const H_GAP = 60;
  const V_GAP = 20;

  rounds.forEach((round, roundIdx) => {
    const roundMatches = byRound[round];
    const x = roundIdx * (NODE_WIDTH + H_GAP);
    const totalHeight = roundMatches.length * (NODE_HEIGHT + V_GAP) - V_GAP;
    const startY = -totalHeight / 2;

    roundMatches.forEach((m, idx) => {
      const y = startY + idx * (NODE_HEIGHT + V_GAP);
      const result = m.results?.[0];

      nodes.push({
        id: String(m.id),
        type: 'default',
        position: { x, y },
        data: {
          label: (
            <div className="text-xs w-full">
              <div className={`flex justify-between items-center px-2 py-1 rounded-t ${m.winner?.user?.id === m.player1?.user?.id ? 'bg-green-100 dark:bg-green-900/30' : ''}`}>
                <span className="font-medium truncate max-w-[120px]">{m.player1?.user?.login ?? '—'}</span>
                <span className="font-mono ml-2">{result ? result.player1Score : '?'}</span>
              </div>
              <div className={`flex justify-between items-center px-2 py-1 rounded-b border-t ${m.winner?.user?.id === m.player2?.user?.id ? 'bg-green-100 dark:bg-green-900/30' : ''}`}>
                <span className="font-medium truncate max-w-[120px]">{m.isBye ? 'BYE' : (m.player2?.user?.login ?? '—')}</span>
                <span className="font-mono ml-2">{result ? result.player2Score : '?'}</span>
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

      // Create edge to next match
      if (m.nextMatchId) {
        edges.push({
          id: `e-${m.id}-${m.nextMatchId}`,
          source: String(m.id),
          target: String(m.nextMatchId),
          type: 'smoothstep',
          animated: !m.isFinished,
          style: { stroke: '#94a3b8' },
        });
      }
    });
  });

  return { nodes, edges };
}
