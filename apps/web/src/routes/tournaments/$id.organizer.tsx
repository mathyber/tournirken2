import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tournamentsApi, gamesApi } from '../../api/tournaments';
import { matchesApi } from '../../api/matches';
import { useAuthStore } from '../../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/badge';
import { ArrowLeft, Play, AlertTriangle, Users, Save, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/tournaments/$id/organizer')({
  component: OrganizerPage,
});

type GroupDef = { id: string; name: string; pointsForWin: number; pointsForDraw: number };

function makeDefaultGroups(n: number): GroupDef[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `grp-${i}`,
    name: `Группа ${String.fromCharCode(65 + i)}`,
    pointsForWin: 3,
    pointsForDraw: 1,
  }));
}

function OrganizerPage() {
  const { id } = Route.useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
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

  // MIXED format state
  const [mixedGroups, setMixedGroups] = useState<GroupDef[]>(makeDefaultGroups(2));
  const [advancePerGroup, setAdvancePerGroup] = useState(1);
  // participantId → groupId (null = unassigned)
  const [participantGroupMap, setParticipantGroupMap] = useState<Record<number, string | null>>({});

  // ROUND_ROBIN format state
  const [rrConfig, setRrConfig] = useState({ name: 'Основная группа', pointsForWin: 3, pointsForDraw: 1 });

  const [finalizeError, setFinalizeError] = useState('');
  const [finalizeLoading, setFinalizeLoading] = useState(false);

  // Check organizer access
  if (!isLoading && tournament && user?.id !== tournament.organizer?.id) {
    if (!useAuthStore.getState().isAdmin()) {
      return <div className="text-center py-16 text-muted-foreground">{t('organizer.noAccess')}</div>;
    }
  }

  const handleFinalize = async () => {
    setFinalizeError('');
    setFinalizeLoading(true);
    try {
      const payload: any = { gridJson: '{}' };

      if (tournament?.format === 'MIXED') {
        // Validate: check all participants are assigned
        const unassigned = (participants as any[]).filter((p) => !participantGroupMap[p.id]);
        if (unassigned.length > 0) {
          setFinalizeError(t('organizer.unassignedParticipants', { count: unassigned.length }));
          setFinalizeLoading(false);
          return;
        }
        payload.groups = mixedGroups;
        payload.mixedConfig = { numberOfGroups: mixedGroups.length, advancePerGroup };
        payload.participantAssignments = (participants as any[]).map((p) => ({
          participantId: p.id,
          groupId: participantGroupMap[p.id] ?? undefined,
        }));
      } else if (tournament?.format === 'ROUND_ROBIN') {
        payload.groups = [{ id: 'rr-0', ...rrConfig }];
        payload.participantAssignments = (participants as any[]).map((p: any, idx: number) => ({
          participantId: p.id,
          seed: idx + 1,
        }));
      } else {
        payload.participantAssignments = (participants as any[]).map((p: any, idx: number) => ({
          participantId: p.id,
          seed: idx + 1,
        }));
      }

      await tournamentsApi.finalizeGrid(tournamentId, payload);
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      navigate({ to: '/tournaments/$id', params: { id } });
    } catch (err: any) {
      setFinalizeError(err.response?.data?.error || t('organizer.launchError'));
    } finally {
      setFinalizeLoading(false);
    }
  };

  if (isLoading) return <div className="animate-pulse h-96 bg-muted rounded-lg" />;
  if (!tournament) return <div className="text-center py-16">{t('organizer.notFound')}</div>;

  const isPreLaunch = tournament.status === 'DRAFT' || tournament.status === 'REGISTRATION';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link to="/tournaments/$id" params={{ id }}>
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('organizer.back')}
          </Button>
        </Link>
        <h1 className="text-xl font-bold">{t('organizer.title', { name: tournament.name })}</h1>
        <Badge variant={tournament.status === 'ACTIVE' ? 'success' : 'secondary'}>
          {tournament.status}
        </Badge>
      </div>

      <Tabs defaultValue={isPreLaunch ? 'bracket' : 'matches'}>
        <TabsList>
          <TabsTrigger value="bracket">{t('organizer.tabBracket')}</TabsTrigger>
          <TabsTrigger value="matches">{t('organizer.tabMatches')}</TabsTrigger>
          {isPreLaunch && (
            <TabsTrigger value="settings">{t('organizer.tabSettings')}</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="bracket" className="mt-4">
          {isPreLaunch ? (
            <div className="space-y-4">
              {/* Participants */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t('organizer.participants', { count: participants.length })}</CardTitle>
                </CardHeader>
                <CardContent>
                  {participants.length < 2 ? (
                    <p className="text-sm text-muted-foreground">{t('organizer.minParticipants')}</p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {(participants as any[]).map((p, idx) => (
                        <div key={p.id} className="p-2 rounded border text-sm flex items-center gap-2">
                          <span className="text-muted-foreground text-xs">{idx + 1}.</span>
                          <span className="truncate">@{p.user?.login}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* MIXED setup */}
              {tournament.format === 'MIXED' && (
                <MixedSetupCard
                  participants={participants as any[]}
                  groups={mixedGroups}
                  advancePerGroup={advancePerGroup}
                  participantGroupMap={participantGroupMap}
                  onGroupsChange={setMixedGroups}
                  onAdvanceChange={setAdvancePerGroup}
                  onAssign={(participantId, groupId) =>
                    setParticipantGroupMap((m) => ({ ...m, [participantId]: groupId }))
                  }
                  onUnassign={(participantId) =>
                    setParticipantGroupMap((m) => ({ ...m, [participantId]: null }))
                  }
                />
              )}

              {/* ROUND_ROBIN setup */}
              {tournament.format === 'ROUND_ROBIN' && (
                <Card>
                  <CardHeader><CardTitle className="text-base">{t('organizer.groupSettings')}</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-3 md:col-span-1">
                        <Label>{t('organizer.groupName')}</Label>
                        <Input value={rrConfig.name} onChange={(e) => setRrConfig((c) => ({ ...c, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label>{t('organizer.pointsForWin')}</Label>
                        <Input type="number" min="0" value={rrConfig.pointsForWin} onChange={(e) => setRrConfig((c) => ({ ...c, pointsForWin: parseInt(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <Label>{t('organizer.pointsForDraw')}</Label>
                        <Input type="number" min="0" value={rrConfig.pointsForDraw} onChange={(e) => setRrConfig((c) => ({ ...c, pointsForDraw: parseInt(e.target.value) || 0 }))} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Launch */}
              <Card className="border-orange-200 bg-orange-50/30 dark:bg-orange-900/10">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium">{t('organizer.launchTitle')}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {t('organizer.launchDesc', { format: tournament.format })}
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
                      {finalizeLoading ? t('organizer.launching') : t('organizer.launch')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground space-y-3">
              <p>{t('organizer.bracketOnTournamentPage')}</p>
              <Link to="/tournaments/$id" params={{ id }}>
                <Button variant="outline">{t('tournament.bracketBtn')}</Button>
              </Link>
            </div>
          )}
        </TabsContent>

        <TabsContent value="matches" className="mt-4">
          {matches.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">{t('organizer.noMatches')}</p>
          ) : (
            <div className="space-y-2">
              {(matches as any[]).map((m) => (
                <OrganizerMatchRow key={m.id} match={m} tournamentId={tournamentId} queryClient={queryClient} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
          {tournament.status === 'DRAFT' && (
            <OpenRegistrationCard tournamentId={tournamentId} queryClient={queryClient} />
          )}
          <EditTournamentCard tournament={tournament} tournamentId={tournamentId} queryClient={queryClient} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── MIXED Setup ─────────────────────────────────────────────────────────────

function MixedSetupCard({
  participants,
  groups,
  advancePerGroup,
  participantGroupMap,
  onGroupsChange,
  onAdvanceChange,
  onAssign,
  onUnassign,
}: {
  participants: any[];
  groups: GroupDef[];
  advancePerGroup: number;
  participantGroupMap: Record<number, string | null>;
  onGroupsChange: (g: GroupDef[]) => void;
  onAdvanceChange: (n: number) => void;
  onAssign: (participantId: number, groupId: string) => void;
  onUnassign: (participantId: number) => void;
}) {
  const { t } = useTranslation();

  const unassigned = participants.filter((p) => !participantGroupMap[p.id]);

  const changeNumberOfGroups = (n: number) => {
    const clamped = Math.max(1, Math.min(8, n));
    if (clamped > groups.length) {
      const extra = Array.from({ length: clamped - groups.length }, (_, i) => ({
        id: `grp-${groups.length + i}`,
        name: `Группа ${String.fromCharCode(65 + groups.length + i)}`,
        pointsForWin: 3,
        pointsForDraw: 1,
      }));
      onGroupsChange([...groups, ...extra]);
    } else {
      // Unassign participants from removed groups
      const removedIds = groups.slice(clamped).map((g) => g.id);
      participants.forEach((p) => {
        if (participantGroupMap[p.id] && removedIds.includes(participantGroupMap[p.id]!)) {
          onUnassign(p.id);
        }
      });
      onGroupsChange(groups.slice(0, clamped));
    }
  };

  const updateGroup = (idx: number, field: keyof GroupDef, value: any) => {
    const next = groups.map((g, i) => (i === idx ? { ...g, [field]: value } : g));
    onGroupsChange(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('organizer.mixedGroupConfig')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Global config */}
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label>{t('organizer.numberOfGroups')}</Label>
            <Input
              type="number"
              min="1"
              max="8"
              className="w-24"
              defaultValue={groups.length}
              key={groups.length}
              onBlur={(e) => { const n = parseInt(e.target.value); if (n >= 1) changeNumberOfGroups(n); }}
            />
          </div>
          <div>
            <Label>{t('organizer.advancePerGroup')}</Label>
            <Input
              type="number"
              min="1"
              className="w-24"
              value={advancePerGroup}
              onChange={(e) => onAdvanceChange(Math.max(1, parseInt(e.target.value) || 1))}
            />
          </div>
          {unassigned.length > 0 && (
            <p className="text-sm text-amber-600">
              {t('organizer.unassignedCount', { count: unassigned.length })}
            </p>
          )}
        </div>

        {/* Groups grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {groups.map((g, idx) => {
            const groupParticipants = participants.filter((p) => participantGroupMap[p.id] === g.id);
            const availableToAdd = unassigned;

            return (
              <div key={g.id} className="border rounded-lg p-3 space-y-2">
                {/* Group name */}
                <Input
                  className="h-7 text-sm font-semibold"
                  value={g.name}
                  onChange={(e) => updateGroup(idx, 'name', e.target.value)}
                />

                {/* Points */}
                <div className="flex gap-2 text-xs items-center">
                  <span className="text-muted-foreground">{t('organizer.win')}:</span>
                  <Input
                    type="number"
                    min="0"
                    className="h-6 w-12 text-xs px-1"
                    value={g.pointsForWin}
                    onChange={(e) => updateGroup(idx, 'pointsForWin', parseInt(e.target.value) || 0)}
                  />
                  <span className="text-muted-foreground">{t('organizer.draw')}:</span>
                  <Input
                    type="number"
                    min="0"
                    className="h-6 w-12 text-xs px-1"
                    value={g.pointsForDraw}
                    onChange={(e) => updateGroup(idx, 'pointsForDraw', parseInt(e.target.value) || 0)}
                  />
                </div>

                {/* Assigned participants */}
                <div className="space-y-1">
                  {groupParticipants.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-muted/50 rounded px-2 py-1 text-sm">
                      <span>@{p.user?.login}</span>
                      <button
                        onClick={() => onUnassign(p.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add participant */}
                {availableToAdd.length > 0 && (
                  <select
                    className="w-full text-xs h-7 rounded border border-input bg-background px-2 text-muted-foreground"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) onAssign(parseInt(e.target.value), g.id);
                    }}
                  >
                    <option value="">{t('organizer.addParticipant')}</option>
                    {availableToAdd.map((p) => (
                      <option key={p.id} value={p.id}>@{p.user?.login}</option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Open Registration ────────────────────────────────────────────────────────

function OpenRegistrationCard({ tournamentId, queryClient }: { tournamentId: number; queryClient: any }) {
  const { t } = useTranslation();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => tournamentsApi.openRegistration(tournamentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      setError('');
    },
    onError: (err: any) => setError(err.response?.data?.error || t('organizer.openRegistrationError')),
  });

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-900/10">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <Users className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium">{t('organizer.openRegistrationTitle')}</p>
            <p className="text-sm text-muted-foreground mt-1">{t('organizer.openRegistrationDesc')}</p>
            {error && <p className="text-sm text-destructive mt-2">{error}</p>}
          </div>
          <Button
            className="gap-2 flex-shrink-0"
            variant="outline"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('organizer.openingRegistration') : t('organizer.openRegistration')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Edit Tournament ──────────────────────────────────────────────────────────

function EditTournamentCard({ tournament, tournamentId, queryClient }: { tournament: any; tournamentId: number; queryClient: any }) {
  const { t } = useTranslation();
  const { data: games = [] } = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });
  const [form, setForm] = useState({
    tournamentName: tournament.name ?? '',
    gameName: tournament.game?.name ?? '',
    maxParticipants: String(tournament.maxParticipants ?? 16),
    info: tournament.info ?? '',
    registrationStart: tournament.registrationStart ? new Date(tournament.registrationStart).toISOString().slice(0, 16) : '',
    registrationEnd: tournament.registrationEnd ? new Date(tournament.registrationEnd).toISOString().slice(0, 16) : '',
  });
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => tournamentsApi.update(tournamentId, {
      tournamentName: form.tournamentName || undefined,
      gameName: form.gameName || undefined,
      maxParticipants: parseInt(form.maxParticipants),
      info: form.info || undefined,
      registrationStart: form.registrationStart ? new Date(form.registrationStart) : null,
      registrationEnd: form.registrationEnd ? new Date(form.registrationEnd) : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      setSuccess(true);
      setError('');
      setTimeout(() => setSuccess(false), 2000);
    },
    onError: (err: any) => setError(err.response?.data?.error || t('organizer.editError')),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t('organizer.editTitle')}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('create.tournamentName')}</Label>
            <Input value={form.tournamentName} onChange={(e) => setForm((f) => ({ ...f, tournamentName: e.target.value }))} />
          </div>
          <div>
            <Label>{t('create.game')}</Label>
            <Input value={form.gameName} onChange={(e) => setForm((f) => ({ ...f, gameName: e.target.value }))} list="edit-games-list" />
            <datalist id="edit-games-list">
              {(games as any[]).map((g) => <option key={g.id} value={g.name} />)}
            </datalist>
          </div>
          <div>
            <Label>{t('create.maxParticipants')}</Label>
            <Input type="number" min="2" max="512" value={form.maxParticipants} onChange={(e) => setForm((f) => ({ ...f, maxParticipants: e.target.value }))} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('create.registrationStart')}</Label>
            <Input type="datetime-local" value={form.registrationStart} onChange={(e) => setForm((f) => ({ ...f, registrationStart: e.target.value }))} />
          </div>
          <div>
            <Label>{t('create.registrationEnd')}</Label>
            <Input type="datetime-local" value={form.registrationEnd} onChange={(e) => setForm((f) => ({ ...f, registrationEnd: e.target.value }))} />
          </div>
        </div>
        <div>
          <Label>{t('create.description')}</Label>
          <Textarea rows={3} value={form.info} onChange={(e) => setForm((f) => ({ ...f, info: e.target.value }))} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-green-600">{t('organizer.editSuccess')}</p>}
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          {mutation.isPending ? t('btn.saving') : t('btn.save')}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Match Row ────────────────────────────────────────────────────────────────

function OrganizerMatchRow({ match, tournamentId, queryClient }: { match: any; tournamentId: number; queryClient: any }) {
  const { t } = useTranslation();
  const [score1, setScore1] = useState('0');
  const [score2, setScore2] = useState('0');
  const [submitting, setSubmitting] = useState(false);

  const handleSetResult = async () => {
    setSubmitting(true);
    try {
      await matchesApi.setResult(match.id, {
        player1Score: parseInt(score1) || 0,
        player2Score: parseInt(score2) || 0,
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
        <span className="text-muted-foreground text-xs">
          {match.stage?.name ?? (match.roundNumber ? t('match.round', { n: match.roundNumber }) : '')}
          {match.group?.name ? ` · ${match.group.name}` : ''}
        </span>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-medium">{match.player1?.user?.login ?? '—'}</span>
          <span className="text-muted-foreground">vs</span>
          <span className="font-medium">{match.isBye ? t('match.bye') : (match.player2?.user?.login ?? '—')}</span>
        </div>
      </div>
      {match.isFinished ? (
        <Badge variant="secondary" className="text-xs">
          {result ? `${result.player1Score}:${result.player2Score}` : t('match.finished')}
        </Badge>
      ) : match.player1Id && match.player2Id && !match.isBye ? (
        <div className="flex items-center gap-2">
          <Input className="w-14 h-8 text-center text-sm" type="number" min="0" value={score1} onChange={(e) => setScore1(e.target.value)} placeholder="0" />
          <span>:</span>
          <Input className="w-14 h-8 text-center text-sm" type="number" min="0" value={score2} onChange={(e) => setScore2(e.target.value)} placeholder="0" />
          <Button size="sm" onClick={handleSetResult} disabled={submitting}>ОК</Button>
        </div>
      ) : (
        <Badge variant="outline" className="text-xs">{t('match.waiting')}</Badge>
      )}
    </div>
  );
}
