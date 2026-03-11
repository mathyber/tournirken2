import { useEffect } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Handle,
  Position,
  NodeProps,
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

// ─── Custom nodes (must be defined outside component for stable reference) ────

// Group color palette (index → hue)
const GROUP_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#10b981', '#f97316', '#ec4899'];

// Shared GroupNode dimension constants (used both in the component and buildGraph)
const GN = { WIDTH: 280, HEADER: 32, THEAD: 20, ROW: 28 };

function GroupBadge({ label, colorIdx }: { label: string; colorIdx: number }) {
  const color = GROUP_COLORS[colorIdx % GROUP_COLORS.length];
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: '#fff',
      background: color, borderRadius: 3,
      padding: '1px 4px', marginRight: 4, flexShrink: 0,
      letterSpacing: 0.3,
    }}>{label}</span>
  );
}

function MatchNode({ data }: NodeProps) {
  const { match, p1GroupLabel, p1GroupIdx, p2GroupLabel, p2GroupIdx } = data;
  const result = match.results?.[0];
  const p1win = match.winner?.user?.id === match.player1?.user?.id;
  const p2win = match.winner?.user?.id === match.player2?.user?.id;
  return (
    <div style={{
      width: 240, height: 80, fontSize: 12, borderRadius: 8, overflow: 'hidden',
      border: match.isFinished ? '1px solid #86efac' : '1px solid #e2e8f0',
      background: match.isFinished ? '#f0fff4' : '#fff',
    }}>
      {/* Generic target (match→match advances) */}
      <Handle type="target" position={Position.Left} style={{ background: '#94a3b8' }} />
      {/* Per-slot targets for group→match edges */}
      <Handle type="target" id="p1" position={Position.Left} style={{ top: 20, background: 'transparent', border: 'none' }} />
      <Handle type="target" id="p2" position={Position.Left} style={{ top: 60, background: 'transparent', border: 'none' }} />
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 8px', height: '50%',
        background: p1win ? '#dcfce7' : 'transparent',
        borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
          {p1GroupLabel != null && <GroupBadge label={p1GroupLabel} colorIdx={p1GroupIdx} />}
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.player1?.user?.login ?? '—'}
          </span>
        </div>
        <span style={{ fontFamily: 'monospace', marginLeft: 6, flexShrink: 0 }}>
          {result ? result.player1Score : (match.isBye ? '' : '?')}
        </span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 8px', height: '50%',
        background: p2win ? '#dcfce7' : 'transparent',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
          {p2GroupLabel != null && <GroupBadge label={p2GroupLabel} colorIdx={p2GroupIdx} />}
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {match.isBye ? 'BYE' : (match.player2?.user?.login ?? '—')}
          </span>
        </div>
        <span style={{ fontFamily: 'monospace', marginLeft: 6, flexShrink: 0 }}>
          {result ? result.player2Score : (match.isBye ? '' : '?')}
        </span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#94a3b8' }} />
    </div>
  );
}

function GroupNode({ data }: NodeProps) {
  const { group, groupColorIdx } = data;
  const standings: any[] = group.standings ?? [];
  const color = GROUP_COLORS[groupColorIdx % GROUP_COLORS.length];

  return (
    <div style={{
      width: GN.WIDTH, fontSize: 11, borderRadius: 8,
      overflow: 'visible',  // allow handles to protrude
      border: `2px solid ${color}`, background: '#fff', position: 'relative',
    }}>
      {/* Header */}
      <div style={{
        height: GN.HEADER, display: 'flex', alignItems: 'center',
        padding: '0 12px', fontWeight: 700, fontSize: 12,
        background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        borderRadius: '6px 6px 0 0',
      }}>
        {group.name}
      </div>
      {/* Column headers */}
      <div style={{
        height: GN.THEAD, display: 'flex', alignItems: 'center',
        padding: '0 8px', color: '#94a3b8', fontSize: 10,
        background: '#fafafa', borderBottom: '1px solid #f1f5f9',
      }}>
        <span style={{ width: 18 }}>#</span>
        <span style={{ flex: 1 }}>Участник</span>
        <span style={{ width: 22, textAlign: 'center' }}>В</span>
        <span style={{ width: 22, textAlign: 'center' }}>Н</span>
        <span style={{ width: 22, textAlign: 'center' }}>П</span>
        <span style={{ width: 28, textAlign: 'center' }}>О</span>
      </div>
      {/* Participant rows */}
      {standings.map((s: any, idx: number) => (
        <div key={s.participantId} style={{
          height: GN.ROW, display: 'flex', alignItems: 'center',
          padding: '0 8px',
          borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9',
        }}>
          <span style={{ width: 18, color: '#94a3b8' }}>{s.rank}</span>
          <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.participant?.user?.login}
          </span>
          <span style={{ width: 22, textAlign: 'center', color: '#16a34a' }}>{s.wins}</span>
          <span style={{ width: 22, textAlign: 'center', color: '#ca8a04' }}>{s.draws}</span>
          <span style={{ width: 22, textAlign: 'center', color: '#dc2626' }}>{s.losses}</span>
          <span style={{ width: 28, textAlign: 'center', fontWeight: 700 }}>{s.points}</span>
          {/* Per-row source handle — top is relative to node root */}
          <Handle
            type="source"
            position={Position.Right}
            id={`p-${s.participantId}`}
            style={{
              top: GN.HEADER + GN.THEAD + idx * GN.ROW + GN.ROW / 2,
              background: color,
              width: 8, height: 8, border: '2px solid #fff',
            }}
          />
        </div>
      ))}
    </div>
  );
}

const nodeTypes = { match: MatchNode, group: GroupNode };

// ─── Page ─────────────────────────────────────────────────────────────────────

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
  const allMatches: any[] = gridData?.matches ?? [];
  const playoffMatches = allMatches.filter((m: any) => !m.groupId);

  if (isLoading) return <div className="flex items-center justify-center h-96">{t('common.loading')}</div>;

  // ROUND_ROBIN: no bracket, just group cards
  if (format === 'ROUND_ROBIN') {
    return (
      <BracketLayout id={id} name={tournament?.name ?? ''} t={t}>
        <div className={`grid gap-4 ${(groups as any[]).length > 1 ? 'md:grid-cols-2' : 'grid-cols-1'}`}>
          {(groups as any[]).map((g: any) => (
            <GroupCard key={g.id} group={g} tournamentId={tournamentId} t={t} />
          ))}
        </div>
      </BracketLayout>
    );
  }

  return (
    <BracketLayout id={id} name={tournament?.name ?? ''} t={t}>
      <div className="border rounded-lg overflow-hidden bg-muted/20" style={{ height: '75vh' }}>
        <FlowCanvas
          matches={playoffMatches}
          groups={format === 'MIXED' ? (groups as any[]) : []}
        />
      </div>
    </BracketLayout>
  );
}

function BracketLayout({ id, name, t, children }: { id: string; name: string; t: any; children: any }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/tournaments/$id" params={{ id }}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('match.backToTournament')}
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{t('organizer.bracketEditor')}: {name}</h1>
      </div>
      {children}
    </div>
  );
}

// ─── ReactFlow canvas ─────────────────────────────────────────────────────────

function FlowCanvas({ matches, groups }: { matches: any[]; groups: any[] }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(matches, groups);
    setNodes(n);
    setEdges(e);
  }, [matches, groups]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      nodesDraggable={false}
      nodesConnectable={false}
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
}

// ─── GroupCard (ROUND_ROBIN fallback) ─────────────────────────────────────────

function GroupCard({ group, tournamentId, t }: { group: any; tournamentId: number; t: any }) {
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
              <tr key={s.participantId} className="border-b last:border-0">
                <td className="py-2 text-muted-foreground">{s.rank}</td>
                <td className="py-2">{s.participant?.user?.login}</td>
                <td className="py-2 text-center text-green-600">{s.wins}</td>
                <td className="py-2 text-center text-yellow-600">{s.draws}</td>
                <td className="py-2 text-center text-red-500">{s.losses}</td>
                <td className="py-2 text-center">{s.goalsFor}:{s.goalsAgainst}</td>
                <td className="py-2 text-center font-bold">{s.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

// ─── Graph builder ────────────────────────────────────────────────────────────

function buildGraph(playoffMatches: any[], groups: any[]): { nodes: Node[]; edges: Edge[] } {
  const GROUP_W = GN.WIDTH;
  const MATCH_W = 240;
  const MATCH_H = 80;
  const H_GAP = 90;
  const LEAF_GAP = 28;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const hasMixed = groups.length > 0;

  // Build participantId → { groupLabel, groupIdx } for badge display in match nodes
  const participantGroupMap = new Map<number, { label: string; idx: number }>();
  if (hasMixed) {
    groups.forEach((group, idx) => {
      // Use short label: first letter(s) before space, e.g. "Группа A" → "A"
      const label = group.name.split(' ').pop() ?? group.name;
      for (const s of (group.standings ?? [])) {
        participantGroupMap.set(s.participantId, { label, idx });
      }
    });
  }

  // ── Playoff tree layout ──
  const byRound: Record<number, any[]> = {};
  for (const m of playoffMatches) {
    const r = m.roundNumber ?? 0;
    if (!byRound[r]) byRound[r] = [];
    byRound[r].push(m);
  }
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);

  // reverse map: matchId → feeders
  const feedersOf = new Map<number, any[]>();
  for (const m of playoffMatches) {
    if (m.nextMatchId) {
      if (!feedersOf.has(m.nextMatchId)) feedersOf.set(m.nextMatchId, []);
      feedersOf.get(m.nextMatchId)!.push(m);
    }
  }

  // y positions via tree layout
  const yPos = new Map<number, number>();
  if (rounds.length > 0) {
    byRound[rounds[0]].forEach((m, idx) => {
      yPos.set(m.id, idx * (MATCH_H + LEAF_GAP));
    });
    for (let ri = 1; ri < rounds.length; ri++) {
      for (const m of byRound[rounds[ri]]) {
        const feeders = feedersOf.get(m.id) ?? [];
        const ys = feeders.map((f) => yPos.get(f.id) ?? 0);
        yPos.set(m.id, ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0);
      }
    }
  }

  const xStart = hasMixed ? GROUP_W + H_GAP : 0;
  rounds.forEach((round, ri) => {
    const x = xStart + ri * (MATCH_W + H_GAP);
    for (const m of byRound[round]) {
      const p1g = participantGroupMap.get(m.player1?.id);
      const p2g = participantGroupMap.get(m.player2?.id);
      nodes.push({
        id: String(m.id),
        type: 'match',
        position: { x, y: yPos.get(m.id) ?? 0 },
        data: {
          match: m,
          p1GroupLabel: p1g?.label ?? null,
          p1GroupIdx: p1g?.idx ?? 0,
          p2GroupLabel: p2g?.label ?? null,
          p2GroupIdx: p2g?.idx ?? 0,
        },
      });
      if (m.nextMatchId) {
        edges.push({
          id: `m-${m.id}-${m.nextMatchId}`,
          source: String(m.id),
          target: String(m.nextMatchId),
          type: 'bezier',
          animated: !m.isFinished,
          style: { stroke: '#94a3b8', strokeWidth: 2 },
        });
      }
    }
  });

  // ── Group nodes (MIXED only) ──
  if (!hasMixed) return { nodes, edges };

  const firstRoundMatches = rounds.length > 0 ? byRound[rounds[0]] : [];
  const V_GROUP_GAP = 16;

  // 1. Calculate preferred center Y for each group
  const groupData = groups.map((group) => {
    const participantIds = new Set((group.standings ?? []).map((s: any) => s.participantId));
    const connected = firstRoundMatches.filter(
      (m) => (m.player1?.id && participantIds.has(m.player1.id)) ||
              (m.player2?.id && participantIds.has(m.player2.id))
    );
    let centerY = 0;
    if (connected.length > 0) {
      const ys = connected.map((m) => (yPos.get(m.id) ?? 0) + MATCH_H / 2);
      centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
    const groupH = GN.HEADER + GN.THEAD + (group.standings?.length ?? 0) * GN.ROW + 8;
    return { group, connected, centerY, groupH };
  });

  // 2. Sort by preferred Y, then resolve overlaps top-to-bottom
  groupData.sort((a, b) => a.centerY - b.centerY);
  for (let i = 1; i < groupData.length; i++) {
    const prev = groupData[i - 1];
    const curr = groupData[i];
    const prevBottom = prev.centerY + prev.groupH / 2;
    const currTop = curr.centerY - curr.groupH / 2;
    if (currTop < prevBottom + V_GROUP_GAP) {
      curr.centerY = prevBottom + V_GROUP_GAP + curr.groupH / 2;
    }
  }

  // Build participantId → { matchId, slot } lookup for edges
  const participantToMatch = new Map<number, { matchId: number; slot: 'p1' | 'p2' }>();
  for (const m of firstRoundMatches) {
    if (m.player1?.id) participantToMatch.set(m.player1.id, { matchId: m.id, slot: 'p1' });
    if (m.player2?.id) participantToMatch.set(m.player2.id, { matchId: m.id, slot: 'p2' });
  }

  // 3. Create group nodes + per-participant edges
  for (const { group, centerY, groupH } of groupData) {
    const groupIdx = groups.indexOf(group);
    const color = GROUP_COLORS[groupIdx % GROUP_COLORS.length];

    nodes.push({
      id: `group-${group.id}`,
      type: 'group',
      position: { x: 0, y: centerY - groupH / 2 },
      data: { group, groupColorIdx: groupIdx },
      style: { height: groupH },
    });

    for (const s of (group.standings ?? [])) {
      const target = participantToMatch.get(s.participantId);
      if (target != null) {
        edges.push({
          id: `g-${group.id}-p-${s.participantId}`,
          source: `group-${group.id}`,
          sourceHandle: `p-${s.participantId}`,
          target: String(target.matchId),
          targetHandle: target.slot,
          type: 'bezier',
          style: { stroke: color, strokeWidth: 1.5, opacity: 0.7 },
        });
      }
    }
  }

  return { nodes, edges };
}
