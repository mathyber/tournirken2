import { useCallback, useEffect, useRef, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  addEdge,
  Connection,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { tournamentsApi } from '../../api/tournaments';
import { Button } from '../../components/ui/button';
import { ArrowLeft, Plus, Trophy, Users, Swords, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/auth';

export const Route = createFileRoute('/tournaments/$id/custom-builder')({
  component: CustomBuilderPage,
});

// ─── Node type components ─────────────────────────────────────────────────────

function BuilderMatchNode({ data, selected }: NodeProps) {
  return (
    <div style={{
      width: 200,
      border: selected ? '2px solid #3b82f6' : '2px solid #e2e8f0',
      borderRadius: 8,
      background: '#fff',
      boxShadow: selected ? '0 0 0 2px #bfdbfe' : '0 1px 4px rgba(0,0,0,0.08)',
      fontSize: 12,
      color: '#0f172a',
    }}>
      <Handle type="target" id="input-1" position={Position.Left} style={{ top: '33%', background: '#94a3b8', width: 10, height: 10 }} />
      <Handle type="target" id="input-2" position={Position.Left} style={{ top: '67%', background: '#94a3b8', width: 10, height: 10 }} />
      <div style={{ padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px 6px 0 0', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Swords size={12} />
        {data.label || 'Матч'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', borderBottom: '1px solid #f1f5f9', minHeight: 28 }}>
        <span style={{ color: '#64748b' }}>Игрок 1</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', minHeight: 28 }}>
        <span style={{ color: '#64748b' }}>Игрок 2</span>
      </div>
      <Handle type="source" id="winner" position={Position.Right} style={{ top: '33%', background: '#22c55e', width: 10, height: 10 }} />
      <Handle type="source" id="loser" position={Position.Right} style={{ top: '67%', background: '#ef4444', width: 10, height: 10 }} />
    </div>
  );
}

function BuilderGroupNode({ data, selected }: NodeProps) {
  const size = data.size || 4;
  const slots = Array.from({ length: size }, (_, i) => i + 1);
  const outputs = Array.from({ length: size }, (_, i) => i + 1);
  return (
    <div style={{
      width: 220,
      border: selected ? '2px solid #8b5cf6' : '2px solid #e2e8f0',
      borderRadius: 8,
      background: '#fff',
      boxShadow: selected ? '0 0 0 2px #ddd6fe' : '0 1px 4px rgba(0,0,0,0.08)',
      fontSize: 12,
      color: '#0f172a',
    }}>
      <div style={{ padding: '6px 10px', background: '#f5f3ff', borderRadius: '6px 6px 0 0', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users size={12} />
        {data.label || 'Группа'}
      </div>
      {slots.map((s, i) => (
        <div key={s} style={{ display: 'flex', alignItems: 'center', padding: '4px 10px', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9', minHeight: 26, justifyContent: 'space-between' }}>
          <Handle type="target" id={`input-${s}`} position={Position.Left} style={{ top: 'auto', position: 'relative', left: -14, background: '#8b5cf6', width: 8, height: 8, marginRight: 4, flexShrink: 0 }} />
          <span style={{ color: '#64748b', flex: 1 }}>Участник {s}</span>
          <Handle type="source" id={`rank-${s}`} position={Position.Right} style={{ top: 'auto', position: 'relative', right: -14, background: '#a78bfa', width: 8, height: 8, marginLeft: 4, flexShrink: 0 }} />
          <span style={{ color: '#94a3b8', fontSize: 10 }}>{s}-е</span>
        </div>
      ))}
    </div>
  );
}

function BuilderStartNode({ data, selected }: NodeProps) {
  return (
    <div style={{
      width: 150,
      border: selected ? '2px solid #f59e0b' : '2px solid #e2e8f0',
      borderRadius: 8,
      background: '#fffbeb',
      boxShadow: selected ? '0 0 0 2px #fde68a' : '0 1px 4px rgba(0,0,0,0.08)',
      fontSize: 12,
      color: '#0f172a',
    }}>
      <div style={{ padding: '7px 10px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Plus size={12} style={{ color: '#f59e0b' }} />
        {data.label || 'Участник #?'}
      </div>
      <Handle type="source" id="output" position={Position.Right} style={{ background: '#f59e0b', width: 10, height: 10 }} />
    </div>
  );
}

function BuilderFinalNode({ data, selected }: NodeProps) {
  return (
    <div style={{
      width: 160,
      border: selected ? '2px solid #f97316' : '2px solid #fdba74',
      borderRadius: 8,
      background: '#fff7ed',
      boxShadow: selected ? '0 0 0 2px #fed7aa' : '0 1px 4px rgba(0,0,0,0.08)',
      fontSize: 12,
      color: '#0f172a',
    }}>
      <Handle type="target" id="input" position={Position.Left} style={{ background: '#f97316', width: 10, height: 10 }} />
      <div style={{ padding: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <Trophy size={16} style={{ color: '#f97316' }} />
        {data.label || 'Победитель'}
      </div>
    </div>
  );
}

// ─── View-mode node (read-only, shows match results) ─────────────────────────

function ViewMatchNode({ data, selected }: NodeProps) {
  const match = data.matchData;
  const result = match?.results?.[0];
  const p1win = match?.winner?.user?.id === match?.player1?.user?.id && match?.winner;
  const p2win = match?.winner?.user?.id === match?.player2?.user?.id && match?.winner;
  const finished = match?.isFinished;

  return (
    <div style={{
      width: 200,
      border: selected ? '2px solid #3b82f6' : finished ? '2px solid #86efac' : '2px solid #e2e8f0',
      borderRadius: 8,
      background: finished ? '#f0fff4' : '#fff',
      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      fontSize: 12,
      color: '#0f172a',
    }}>
      <Handle type="target" id="input-1" position={Position.Left} style={{ top: '33%', background: '#94a3b8', width: 10, height: 10 }} />
      <Handle type="target" id="input-2" position={Position.Left} style={{ top: '67%', background: '#94a3b8', width: 10, height: 10 }} />
      <div style={{ padding: '6px 10px', background: finished ? '#dcfce7' : '#f1f5f9', borderRadius: '6px 6px 0 0', fontWeight: 700, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Swords size={12} />
        {finished ? 'Завершён' : data.label || 'Матч'}
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 10px', borderBottom: '1px solid #f1f5f9', minHeight: 28,
        background: p1win ? '#dcfce7' : 'transparent',
      }}>
        <span style={{ fontWeight: p1win ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {match?.player1?.user?.login ?? '—'}
        </span>
        <span style={{ fontFamily: 'monospace', marginLeft: 6, flexShrink: 0, fontWeight: 700 }}>
          {result ? result.player1Score : '?'}
        </span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 10px', minHeight: 28,
        background: p2win ? '#dcfce7' : 'transparent',
      }}>
        <span style={{ fontWeight: p2win ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {match?.player2?.user?.login ?? '—'}
        </span>
        <span style={{ fontFamily: 'monospace', marginLeft: 6, flexShrink: 0, fontWeight: 700 }}>
          {result ? result.player2Score : '?'}
        </span>
      </div>
      <Handle type="source" id="winner" position={Position.Right} style={{ top: '33%', background: '#22c55e', width: 10, height: 10 }} />
      <Handle type="source" id="loser" position={Position.Right} style={{ top: '67%', background: '#ef4444', width: 10, height: 10 }} />
    </div>
  );
}

const nodeTypes = {
  match: BuilderMatchNode,
  group: BuilderGroupNode,
  start: BuilderStartNode,
  final: BuilderFinalNode,
};

const viewNodeTypes = {
  match: ViewMatchNode,
  group: BuilderGroupNode,
  start: BuilderStartNode,
  final: BuilderFinalNode,
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateSchema(nodes: Node[], edges: Edge[]): string[] {
  const errors: string[] = [];

  const finalNodes = nodes.filter((n) => n.type === 'final');
  if (finalNodes.length === 0) errors.push('Необходимо добавить узел «Победитель» (FinalNode)');
  if (finalNodes.length > 1) errors.push('Может быть только один узел «Победитель»');

  const startNodes = nodes.filter((n) => n.type === 'start');
  for (const sn of startNodes) {
    const hasEdge = edges.some((e) => e.source === sn.id);
    if (!hasEdge) errors.push(`Участник «${sn.data?.label || sn.id}» не подключён`);
  }

  if (finalNodes.length === 1) {
    const finalId = finalNodes[0].id;
    const hasIncoming = edges.some((e) => e.target === finalId);
    if (!hasIncoming) errors.push('Узел «Победитель» должен быть подключён');
  }

  // Cycle detection via DFS
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) adj.get(e.source)?.push(e.target);

  const visited = new Set<string>();
  const inStack = new Set<string>();
  let hasCycle = false;

  function dfs(node: string) {
    if (inStack.has(node)) { hasCycle = true; return; }
    if (visited.has(node)) return;
    visited.add(node);
    inStack.add(node);
    for (const nb of (adj.get(node) ?? [])) dfs(nb);
    inStack.delete(node);
  }

  for (const n of nodes) dfs(n.id);
  if (hasCycle) errors.push('В схеме обнаружен цикл');

  return errors;
}

// ─── Main component ───────────────────────────────────────────────────────────

let nodeIdCounter = 100;
function genId() { return `custom-${++nodeIdCounter}`; }

function CustomBuilderPage() {
  const { id } = Route.useParams();
  const { t } = useTranslation();
  const { user, isAdmin, isModerator } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tournamentId = parseInt(id);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const schemaLoaded = useRef(false);
  const [startNodeCount, setStartNodeCount] = useState(0);

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => tournamentsApi.get(tournamentId),
  });

  const isViewMode = !!(tournament && (tournament.status === 'ACTIVE' || tournament.status === 'FINISHED'));

  // Load existing schema
  const { data: savedSchema } = useQuery({
    queryKey: ['tournament-custom-schema', tournamentId],
    queryFn: () => tournamentsApi.getCustomSchema(tournamentId),
    enabled: !!tournament && tournament.format === 'CUSTOM',
  });

  // Load matches for view mode (to overlay results onto match nodes)
  const { data: matchesData } = useQuery({
    queryKey: ['tournament-matches', tournamentId],
    queryFn: () => tournamentsApi.matches(tournamentId),
    enabled: isViewMode,
  });

  // Bug #3 fix: TanStack Query v5 removed onSuccess — use useEffect instead
  // Bug #4 fix: update nodeIdCounter to avoid ID collisions after reload
  useEffect(() => {
    if (savedSchema?.customSchema && !schemaLoaded.current) {
      schemaLoaded.current = true;
      try {
        const parsed = JSON.parse(savedSchema.customSchema);
        if (parsed.nodes) {
          setNodes(parsed.nodes);
          // Compute max existing ID to prevent collisions on new nodes
          const maxId = parsed.nodes.reduce((max: number, n: any) => {
            const num = parseInt(n.id.replace('custom-', ''));
            return isNaN(num) ? max : Math.max(max, num);
          }, 100);
          nodeIdCounter = maxId;
        }
        if (parsed.edges) setEdges(parsed.edges);
        const sCount = (parsed.nodes || []).filter((n: any) => n.type === 'start').length;
        setStartNodeCount(sCount);
      } catch (_) {}
    }
  }, [savedSchema, setNodes, setEdges]);

  // In view mode, overlay match result data into match nodes once matches are loaded
  useEffect(() => {
    if (!isViewMode || !matchesData || nodes.length === 0) return;
    const dbMatches = matchesData as any[];
    if (dbMatches.length === 0) return;

    // Prefer customNodeMap (nodeId → matchDbId) stored in tournament.gridJson for precise mapping.
    // Fall back to positional index mapping if the metadata is absent (older tournaments).
    let nodeIdToMatchId: Record<string, number> | null = null;
    try {
      if (tournament?.gridJson) {
        const meta = JSON.parse(tournament.gridJson);
        if (meta.customNodeMap && typeof meta.customNodeMap === 'object') {
          nodeIdToMatchId = meta.customNodeMap;
        }
      }
    } catch (_) {}

    const dbMatchById = new Map<number, any>(dbMatches.map((m: any) => [m.id, m]));
    const matchNodes = nodes.filter((n) => n.type === 'match');
    const dbMatchesSorted = [...dbMatches].sort((a: any, b: any) => a.id - b.id);

    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== 'match') return n;
        let dbMatch: any = null;
        if (nodeIdToMatchId && nodeIdToMatchId[n.id] != null) {
          dbMatch = dbMatchById.get(nodeIdToMatchId[n.id]) ?? null;
        } else {
          // Fallback: positional index among match nodes
          const idx = matchNodes.findIndex((mn) => mn.id === n.id);
          dbMatch = dbMatchesSorted[idx] ?? null;
        }
        return { ...n, data: { ...n.data, matchData: dbMatch } };
      })
    );
  }, [isViewMode, matchesData, nodes.length, tournament?.gridJson]);

  const saveMutation = useMutation({
    mutationFn: () => tournamentsApi.saveCustomSchema(tournamentId, nodes, edges),
    onSuccess: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: () => tournamentsApi.finalizeCustom(tournamentId),
    onSuccess: () => {
      navigate({ to: '/tournaments/$id', params: { id } });
    },
  });

  const isOrganizer = !!(user && (tournament?.organizerId === user.id || isAdmin() || isModerator()));

  const onConnect = useCallback((connection: Connection) => {
    // Determine edge type by source handle
    let edgeType = 'participant';
    let edgeStyle: any = { stroke: '#3b82f6', strokeWidth: 2 };
    let animated = false;

    if (connection.sourceHandle === 'winner') {
      edgeType = 'winner';
      edgeStyle = { stroke: '#22c55e', strokeWidth: 2, strokeDasharray: '6 3' };
      animated = true;
    } else if (connection.sourceHandle === 'loser') {
      edgeType = 'loser';
      edgeStyle = { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '6 3' };
    }

    setEdges((eds) => addEdge({
      ...connection,
      type: 'smoothstep',
      animated,
      style: edgeStyle,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { edgeType },
      ...(edgeType !== 'participant' ? { label: edgeType === 'winner' ? 'W' : 'L' } : {}),
    } as Edge, eds));
  }, [setEdges]);

  const addMatchNode = useCallback(() => {
    const id = genId();
    setNodes((nds) => [...nds, {
      id,
      type: 'match',
      position: { x: 300 + Math.random() * 50, y: 200 + Math.random() * 50 },
      data: { label: 'Матч' },
    }]);
  }, [setNodes]);

  const addGroupNode = useCallback(() => {
    const sizeStr = prompt('Размер группы (2-8):', '4');
    const size = Math.min(8, Math.max(2, parseInt(sizeStr ?? '4') || 4));
    const id = genId();
    setNodes((nds) => [...nds, {
      id,
      type: 'group',
      position: { x: 100 + Math.random() * 50, y: 200 + Math.random() * 50 },
      data: { label: 'Группа', size },
    }]);
  }, [setNodes]);

  const addStartNode = useCallback(() => {
    setStartNodeCount((c) => {
      const next = c + 1;
      const id = genId();
      setNodes((nds) => [...nds, {
        id,
        type: 'start',
        position: { x: 50 + Math.random() * 30, y: 100 + next * 80 },
        data: { label: `Участник #${next}` },
      }]);
      return next;
    });
  }, [setNodes]);

  const addFinalNode = useCallback(() => {
    const hasFinal = nodes.some((n) => n.type === 'final');
    if (hasFinal) {
      alert('Узел «Победитель» уже добавлен. Допускается только один.');
      return;
    }
    const id = genId();
    setNodes((nds) => [...nds, {
      id,
      type: 'final',
      position: { x: 700 + Math.random() * 30, y: 200 + Math.random() * 30 },
      data: { label: 'Победитель' },
    }]);
  }, [nodes, setNodes]);

  const handleSave = useCallback(() => {
    const errs = validateSchema(nodes, edges);
    setErrors(errs);
    if (errs.length > 0) return;
    saveMutation.mutate();
  }, [nodes, edges, saveMutation]);

  const handleFinalize = useCallback(() => {
    const errs = validateSchema(nodes, edges);
    setErrors(errs);
    if (errs.length > 0) return;
    if (!confirm('Запустить турнир? Это действие необратимо. Матчи будут созданы согласно схеме.')) return;
    finalizeMutation.mutate();
  }, [nodes, edges, finalizeMutation]);

  if (isLoading) return <div className="flex items-center justify-center h-96">{t('common.loading')}</div>;
  if (!tournament) return <div className="flex items-center justify-center h-96">{t('organizer.notFound')}</div>;
  // Allow everyone to view the schema when tournament is ACTIVE or FINISHED; editing requires organizer
  if (!isOrganizer && !isViewMode) return <div className="flex items-center justify-center h-96">{t('organizer.noAccess')}</div>;
  if (tournament.format !== 'CUSTOM') return <div className="flex items-center justify-center h-96">Турнир не является кастомным</div>;

  const canFinalize = !!tournament.customSchema && ['DRAFT', 'REGISTRATION'].includes(tournament.status);

  return (
    <div className="flex flex-col h-screen">
      {/* View-only banner */}
      {isViewMode && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-blue-50 border-b border-blue-200 text-blue-700 text-sm font-medium">
          <Eye className="h-4 w-4 flex-shrink-0" />
          <span>{t('custom.viewOnlyBanner', { defaultValue: 'Просмотр схемы — только чтение. Турнир запущен.' })}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-background z-10">
        <div className="flex items-center gap-3">
          <Link to="/tournaments/$id" params={{ id }}>
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              {t('match.backToTournament')}
            </Button>
          </Link>
          <h1 className="text-base font-bold">
            {isViewMode ? t('custom.viewTitle', { defaultValue: 'Схема турнира' }) : t('custom.builderTitle')}: {tournament.name}
          </h1>
        </div>
        {!isViewMode && (
          <div className="flex items-center gap-2">
            {errors.length > 0 && (
              <span className="text-sm text-destructive font-medium">
                {errors.length} {t('custom.validationErrors')}
              </span>
            )}
            {saveSuccess && (
              <span className="text-sm text-green-600 font-medium">{t('custom.schemaSaved')}</span>
            )}
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t('btn.saving') : t('custom.saveSchema')}
            </Button>
            {canFinalize && (
              <Button size="sm" onClick={handleFinalize} disabled={finalizeMutation.isPending}>
                {finalizeMutation.isPending ? t('organizer.launching') : t('organizer.launch')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Toolbar — hidden in view mode */}
        {!isViewMode && (
          <div className="w-48 border-r bg-muted/30 p-3 flex flex-col gap-2 overflow-y-auto">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('custom.addNode')}</p>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={addMatchNode}>
              <Swords className="h-4 w-4" />
              {t('custom.addMatch')}
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={addGroupNode}>
              <Users className="h-4 w-4" />
              {t('custom.addGroup')}
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={addStartNode}>
              <Plus className="h-4 w-4" />
              {t('custom.addParticipant')}
            </Button>
            <Button variant="outline" size="sm" className="justify-start gap-2" onClick={addFinalNode}>
              <Trophy className="h-4 w-4" />
              {t('custom.addFinal')}
            </Button>

            {/* Legend */}
            <div className="mt-4 pt-3 border-t space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('custom.legend')}</p>
              <div className="flex items-center gap-2 text-xs">
                <div style={{ width: 20, height: 3, background: '#22c55e' }} />
                <span>{t('custom.winnerEdge')}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div style={{ width: 20, height: 3, background: '#ef4444' }} />
                <span>{t('custom.loserEdge')}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div style={{ width: 20, height: 3, background: '#3b82f6' }} />
                <span>{t('custom.participantEdge')}</span>
              </div>
            </div>

            {/* Handles guide */}
            <div className="mt-3 pt-3 border-t space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('custom.handles')}</p>
              <p className="text-xs text-muted-foreground">{t('custom.handlesDesc')}</p>
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={isViewMode ? undefined : onNodesChange}
            onEdgesChange={isViewMode ? undefined : onEdgesChange}
            onConnect={isViewMode ? undefined : onConnect}
            nodeTypes={isViewMode ? viewNodeTypes : nodeTypes}
            fitView
            deleteKeyCode={isViewMode ? null : 'Delete'}
            nodesDraggable={!isViewMode}
            nodesConnectable={!isViewMode}
            elementsSelectable={!isViewMode}
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>

      {/* Validation errors panel */}
      {!isViewMode && errors.length > 0 && (
        <div className="px-4 py-2 border-t bg-destructive/10">
          <p className="text-sm font-semibold text-destructive mb-1">{t('custom.validationTitle')}:</p>
          <ul className="space-y-0.5">
            {errors.map((e, i) => (
              <li key={i} className="text-sm text-destructive">• {e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
