import { useState, useEffect } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { gamesApi, tournamentsApi } from '../../api/tournaments';
import { useAuthStore } from '../../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Switch } from '../../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/tournaments/create')({
  component: CreateTournamentPage,
});

const FORMAT_VALUES = ['SINGLE_ELIMINATION', 'DOUBLE_ELIMINATION', 'ROUND_ROBIN', 'SWISS', 'MIXED', 'CUSTOM'] as const;

function CreateTournamentPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!user) navigate({ to: '/' });
  }, [user, navigate]);

  const [form, setForm] = useState({
    tournamentName: '',
    gameName: '',
    season: '',
    format: 'SINGLE_ELIMINATION',
    maxParticipants: '16',
    info: '',
    logo: '',
    onlyOrganizerSetsResults: false,
    registrationStart: '',
    registrationEnd: '',
    swissRounds: '',
  });
  const [error, setError] = useState('');

  const { data: games = [] } = useQuery({ queryKey: ['games'], queryFn: gamesApi.list });

  const formatOptions = FORMAT_VALUES.map((v) => ({
    value: v,
    label: t(`format.${v}`),
    desc: t(`format.${v}_desc`),
  }));

  const createMutation = useMutation({
    mutationFn: (data: any) => tournamentsApi.create(data),
    onSuccess: (tournament) => navigate({ to: '/tournaments/$id', params: { id: String(tournament.id) } }),
    onError: (err: any) => setError(err.response?.data?.error || t('create.error')),
  });

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">{t('create.loginRequired')}</p>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    createMutation.mutate({
      tournamentName: form.tournamentName,
      gameName: form.gameName,
      season: form.season ? parseInt(form.season) : undefined,
      format: form.format,
      maxParticipants: parseInt(form.maxParticipants),
      info: form.info || undefined,
      logo: form.logo || undefined,
      onlyOrganizerSetsResults: form.onlyOrganizerSetsResults,
      registrationStart: form.registrationStart || undefined,
      registrationEnd: form.registrationEnd || undefined,
      swissRounds: form.swissRounds ? parseInt(form.swissRounds) : undefined,
    });
  };

  const selectedFormat = formatOptions.find((f) => f.value === form.format);

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t('create.title')}</h1>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-0">
          <CardHeader><CardTitle className="text-lg">{t('create.basicInfo')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <Label htmlFor="name">{t('create.tournamentName')}</Label>
                <Input
                  id="name"
                  value={form.tournamentName}
                  onChange={(e) => setForm((f) => ({ ...f, tournamentName: e.target.value }))}
                  placeholder={t('create.tournamentNamePlaceholder')}
                  required
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <Label htmlFor="season">{t('create.season')}</Label>
                <Input
                  id="season"
                  type="number"
                  value={form.season}
                  onChange={(e) => setForm((f) => ({ ...f, season: e.target.value }))}
                  placeholder="1"
                  min="1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="game">{t('create.game')}</Label>
              <Input
                id="game"
                value={form.gameName}
                onChange={(e) => setForm((f) => ({ ...f, gameName: e.target.value }))}
                placeholder={t('create.gamePlaceholder')}
                list="games-list"
                required
              />
              <datalist id="games-list">
                {games.map((g: any) => <option key={g.id} value={g.name} />)}
              </datalist>
            </div>

            <div>
              <Label htmlFor="format">{t('create.format')}</Label>
              <Select value={form.format} onValueChange={(v) => setForm((f) => ({ ...f, format: v }))}>
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formatOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedFormat && (
                <p className="text-xs text-muted-foreground mt-1">{selectedFormat.desc}</p>
              )}
            </div>

            {form.format === 'SWISS' && (
              <div>
                <Label htmlFor="swiss-rounds">{t('create.swissRounds')}</Label>
                <Input
                  id="swiss-rounds"
                  type="number"
                  value={form.swissRounds}
                  onChange={(e) => setForm((f) => ({ ...f, swissRounds: e.target.value }))}
                  placeholder={t('create.swissRoundsPlaceholder')}
                  min="1"
                  max="20"
                />
              </div>
            )}

            <div>
              <Label htmlFor="max">{t('create.maxParticipants')}</Label>
              <Input
                id="max"
                type="number"
                value={form.maxParticipants}
                onChange={(e) => setForm((f) => ({ ...f, maxParticipants: e.target.value }))}
                min="2"
                max="512"
                required
              />
            </div>

            <div>
              <Label htmlFor="logo">{t('create.logo')}</Label>
              <Input
                id="logo"
                type="url"
                value={form.logo}
                onChange={(e) => setForm((f) => ({ ...f, logo: e.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </div>

            <div>
              <Label htmlFor="info">{t('create.description')}</Label>
              <Textarea
                id="info"
                value={form.info}
                onChange={(e) => setForm((f) => ({ ...f, info: e.target.value }))}
                placeholder={t('create.descriptionPlaceholder')}
                rows={4}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-lg">{t('create.dates')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="reg-start">{t('create.registrationStart')}</Label>
                <Input
                  id="reg-start"
                  type="datetime-local"
                  value={form.registrationStart}
                  onChange={(e) => setForm((f) => ({ ...f, registrationStart: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">{t('create.registrationStartHint')}</p>
              </div>
              <div>
                <Label htmlFor="reg-end">{t('create.registrationEnd')}</Label>
                <Input
                  id="reg-end"
                  type="datetime-local"
                  value={form.registrationEnd}
                  onChange={(e) => setForm((f) => ({ ...f, registrationEnd: e.target.value }))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-4">
          <CardHeader><CardTitle className="text-lg">{t('create.settings')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">{t('create.onlyOrganizerResults')}</p>
                <p className="text-xs text-muted-foreground">{t('create.onlyOrganizerResultsHint')}</p>
              </div>
              <Switch
                checked={form.onlyOrganizerSetsResults}
                onCheckedChange={(v) => setForm((f) => ({ ...f, onlyOrganizerSetsResults: v }))}
              />
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{error}</div>
        )}

        <div className="mt-6 flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={() => navigate({ to: '/' })}>
            {t('btn.cancel')}
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? t('create.creating') : t('create.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
