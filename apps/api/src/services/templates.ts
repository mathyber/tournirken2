import { TournamentFormat } from '@tournirken/shared';

export interface TournamentTemplate {
  format: TournamentFormat;
  name: string;
  description: string;
  generateSchema: (participantCount: number) => { nodes: any[]; edges: any[] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Single Elimination Template
// ─────────────────────────────────────────────────────────────────────────────

function generateSingleEliminationTemplate(participantCount: number): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  // Calculate rounds needed
  const rounds = Math.ceil(Math.log2(participantCount));
  const totalSlots = Math.pow(2, rounds);

  // Create start nodes
  for (let i = 0; i < participantCount; i++) {
    nodes.push({
      id: `start-${i + 1}`,
      type: 'start',
      position: { x: 50, y: 100 + i * 80 },
      data: { label: `Участник #${i + 1}` },
    });
  }

  // Create match nodes and wire them
  let matchId = 1;
  let currentRoundMatches: string[] = [];

  // First round matches
  for (let i = 0; i < totalSlots; i += 2) {
    const matchNodeId = `match-${matchId++}`;
    nodes.push({
      id: matchNodeId,
      type: 'match',
      position: { x: 300, y: 100 + (i / 2) * 160 },
      data: { label: 'Матч' },
    });
    currentRoundMatches.push(matchNodeId);

    // Connect participants to first round matches
    if (i < participantCount) {
      edges.push({
        id: `edge-start-${i + 1}-to-${matchNodeId}-1`,
        source: `start-${i + 1}`,
        target: matchNodeId,
        targetHandle: 'input-1',
        data: { edgeType: 'participant' },
      });
    }
    if (i + 1 < participantCount) {
      edges.push({
        id: `edge-start-${i + 2}-to-${matchNodeId}-2`,
        source: `start-${i + 2}`,
        target: matchNodeId,
        targetHandle: 'input-2',
        data: { edgeType: 'participant' },
      });
    }
  }

  // Subsequent rounds
  let prevRoundMatches = currentRoundMatches;
  for (let round = 2; round <= rounds; round++) {
    const nextRoundMatches: string[] = [];
    for (let i = 0; i < prevRoundMatches.length; i += 2) {
      const matchNodeId = `match-${matchId++}`;
      nodes.push({
        id: matchNodeId,
        type: 'match',
        position: { x: 300 + (round - 1) * 250, y: 100 + (i / 2) * 160 * Math.pow(2, round - 1) },
        data: { label: round === rounds ? 'Финал' : `Раунд ${round}` },
      });
      nextRoundMatches.push(matchNodeId);

      // Connect winners from previous round
      edges.push({
        id: `edge-${prevRoundMatches[i]}-winner-to-${matchNodeId}-1`,
        source: prevRoundMatches[i],
        sourceHandle: 'winner-1',
        target: matchNodeId,
        targetHandle: 'input-1',
        data: { edgeType: 'winner-1' },
      });
      edges.push({
        id: `edge-${prevRoundMatches[i]}-winner-to-${matchNodeId}-2`,
        source: prevRoundMatches[i],
        sourceHandle: 'winner-2',
        target: matchNodeId,
        targetHandle: 'input-1',
        data: { edgeType: 'winner-2' },
      });

      if (i + 1 < prevRoundMatches.length) {
        edges.push({
          id: `edge-${prevRoundMatches[i + 1]}-winner-to-${matchNodeId}-2`,
          source: prevRoundMatches[i + 1],
          sourceHandle: 'winner-1',
          target: matchNodeId,
          targetHandle: 'input-2',
          data: { edgeType: 'winner-1' },
        });
        edges.push({
          id: `edge-${prevRoundMatches[i + 1]}-winner-to-${matchNodeId}-1`,
          source: prevRoundMatches[i + 1],
          sourceHandle: 'winner-2',
          target: matchNodeId,
          targetHandle: 'input-2',
          data: { edgeType: 'winner-2' },
        });
      }
    }
    prevRoundMatches = nextRoundMatches;
  }

  // Create final node and connect the last match winner
  const finalMatchId = prevRoundMatches[0];
  nodes.push({
    id: 'final',
    type: 'final',
    position: { x: 300 + rounds * 250, y: 200 },
    data: { label: 'Победитель' },
  });

  edges.push({
    id: 'edge-final-winner-1',
    source: finalMatchId,
    sourceHandle: 'winner-1',
    target: 'final',
    targetHandle: 'input',
    data: { edgeType: 'winner-1' },
  });
  edges.push({
    id: 'edge-final-winner-2',
    source: finalMatchId,
    sourceHandle: 'winner-2',
    target: 'final',
    targetHandle: 'input',
    data: { edgeType: 'winner-2' },
  });

  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Double Elimination Template
// ─────────────────────────────────────────────────────────────────────────────

function generateDoubleEliminationTemplate(participantCount: number): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  if (participantCount === 2) {
    // Simple case: just one final match
    nodes.push(
      { id: 'start-1', type: 'start', position: { x: 50, y: 100 }, data: { label: 'Участник #1' } },
      { id: 'start-2', type: 'start', position: { x: 50, y: 180 }, data: { label: 'Участник #2' } },
      { id: 'final', type: 'match', position: { x: 300, y: 140 }, data: { label: 'Гранд-финал' } },
      { id: 'winner', type: 'final', position: { x: 550, y: 140 }, data: { label: 'Победитель' } }
    );

    edges.push(
      { id: 'edge-start-1-to-final-1', source: 'start-1', target: 'final', targetHandle: 'input-1', data: { edgeType: 'participant' } },
      { id: 'edge-start-2-to-final-2', source: 'start-2', target: 'final', targetHandle: 'input-2', data: { edgeType: 'participant' } },
      { id: 'edge-final-winner-1', source: 'final', sourceHandle: 'winner-1', target: 'winner', targetHandle: 'input', data: { edgeType: 'winner-1' } },
      { id: 'edge-final-winner-2', source: 'final', sourceHandle: 'winner-2', target: 'winner', targetHandle: 'input', data: { edgeType: 'winner-2' } }
    );

    return { nodes, edges };
  }

  // For more complex double elimination, we'd need a more sophisticated implementation
  // For now, fall back to single elimination
  return generateSingleEliminationTemplate(participantCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Round Robin Template
// ─────────────────────────────────────────────────────────────────────────────

function generateRoundRobinTemplate(participantCount: number): { nodes: any[]; edges: any[] } {
  const nodes: any[] = [];
  const edges: any[] = [];

  // Create start nodes
  for (let i = 0; i < participantCount; i++) {
    nodes.push({
      id: `start-${i + 1}`,
      type: 'start',
      position: { x: 50, y: 100 + i * 80 },
      data: { label: `Участник #${i + 1}` },
    });
  }

  // Create a single group node
  nodes.push({
    id: 'group-1',
    type: 'group',
    position: { x: 300, y: 100 },
    data: { label: 'Групповой этап', size: participantCount },
  });

  // Connect all participants to the group
  for (let i = 0; i < participantCount; i++) {
    edges.push({
      id: `edge-start-${i + 1}-to-group-${i + 1}`,
      source: `start-${i + 1}`,
      target: 'group-1',
      targetHandle: `input-${i + 1}`,
      data: { edgeType: 'participant' },
    });
  }

  // Create final node - winner is the 1st place from group
  nodes.push({
    id: 'final',
    type: 'final',
    position: { x: 600, y: 200 },
    data: { label: 'Победитель' },
  });

  edges.push({
    id: 'edge-group-1-to-final',
    source: 'group-1',
    sourceHandle: 'rank-1',
    target: 'final',
    targetHandle: 'input',
    data: { edgeType: 'rank' },
  });

  return { nodes, edges };
}

// ─────────────────────────────────────────────────────────────────────────────
// Template Registry
// ─────────────────────────────────────────────────────────────────────────────

export const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
  {
    format: TournamentFormat.SINGLE_ELIMINATION,
    name: 'Одиночный выбывание',
    description: 'Классический формат с выбыванием после поражения',
    generateSchema: generateSingleEliminationTemplate,
  },
  {
    format: TournamentFormat.DOUBLE_ELIMINATION,
    name: 'Двойное выбывание',
    description: 'Игроки выбывают только после двух поражений',
    generateSchema: generateDoubleEliminationTemplate,
  },
  {
    format: TournamentFormat.ROUND_ROBIN,
    name: 'Круговой турнир',
    description: 'Каждый играет со всеми участниками',
    generateSchema: generateRoundRobinTemplate,
  },
  {
    format: TournamentFormat.SWISS,
    name: 'Швейцарская система',
    description: 'Парные матчи с учётом рейтинга',
    generateSchema: generateRoundRobinTemplate, // Simplified for now
  },
  {
    format: TournamentFormat.MIXED,
    name: 'Смешанный формат',
    description: 'Групповой этап + плей-офф',
    generateSchema: generateRoundRobinTemplate, // Simplified for now
  },
];

export function getTemplateForFormat(format: TournamentFormat): TournamentTemplate | undefined {
  return TOURNAMENT_TEMPLATES.find(t => t.format === format);
}