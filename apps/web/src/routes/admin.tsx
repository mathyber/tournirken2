import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/users';
import { tournamentsApi } from '../api/tournaments';
import { useAuthStore } from '../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { TournamentStatusBadge } from '../components/tournament/TournamentStatusBadge';
import { format } from 'date-fns';
import { ru, enUS } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

export const Route = createFileRoute('/admin')({
  component: AdminPage,
});

const ROLES = ['USER', 'MODERATOR', 'ADMIN'];

function AdminPage() {
  const { user, isModerator } = useAuthStore();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  if (!user || !isModerator()) {
    return <div className="text-center py-16 text-muted-foreground">{t('admin.noAccess')}</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('admin.title')}</h1>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">{t('admin.tabUsers')}</TabsTrigger>
          <TabsTrigger value="tournaments">{t('admin.tabTournaments')}</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTable queryClient={queryClient} isAdmin={useAuthStore.getState().isAdmin()} />
        </TabsContent>

        <TabsContent value="tournaments" className="mt-4">
          <TournamentsTable queryClient={queryClient} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UsersTable({ queryClient, isAdmin }: { queryClient: any; isAdmin: boolean }) {
  const { t } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? enUS : ru;
  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminApi.users,
  });

  const updateRolesMutation = useMutation({
    mutationFn: ({ id, roles }: { id: number; roles: string[] }) => adminApi.updateRoles(id, roles),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg" />;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t('admin.usersCount', { count: users.length })}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left pb-2 pr-4">{t('admin.colLogin')}</th>
                <th className="text-left pb-2 pr-4">{t('admin.colEmail')}</th>
                <th className="text-left pb-2 pr-4">{t('admin.colRoles')}</th>
                <th className="text-left pb-2">{t('admin.colDate')}</th>
                {isAdmin && <th className="text-left pb-2">{t('admin.colActions')}</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-2 pr-4 font-medium">@{u.login}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{u.email}</td>
                  <td className="py-2 pr-4">
                    <div className="flex gap-1 flex-wrap">
                      {u.roles.map((r: string) => (
                        <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-muted-foreground text-xs">
                    {format(new Date(u.createdAt), 'd MMM yyyy', { locale: dateLocale })}
                  </td>
                  {isAdmin && (
                    <td className="py-2">
                      <RoleEditor
                        currentRoles={u.roles}
                        onUpdate={(roles) => updateRolesMutation.mutate({ id: u.id, roles })}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function RoleEditor({ currentRoles, onUpdate }: {
  currentRoles: string[];
  onUpdate: (roles: string[]) => void;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string[]>(currentRoles);
  const [changed, setChanged] = useState(false);

  const toggleRole = (role: string) => {
    setSelected((prev) => {
      const next = prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role];
      setChanged(JSON.stringify(next.sort()) !== JSON.stringify([...currentRoles].sort()));
      return next;
    });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {ROLES.map((r) => (
          <button
            key={r}
            onClick={() => toggleRole(r)}
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${selected.includes(r) ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-input hover:bg-accent'}`}
          >
            {r}
          </button>
        ))}
      </div>
      {changed && (
        <Button size="sm" className="h-6 text-xs" onClick={() => { onUpdate(selected); setChanged(false); }}>
          {t('btn.save')}
        </Button>
      )}
    </div>
  );
}

function TournamentsTable({ queryClient }: { queryClient: any }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: () => tournamentsApi.list({ limit: 100 }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => adminApi.cancelTournament(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] }),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg" />;

  const tournaments = data?.data ?? [];

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t('admin.tournamentsCount', { count: tournaments.length })}</CardTitle></CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left pb-2 pr-4">{t('admin.colName')}</th>
                <th className="text-left pb-2 pr-4">{t('admin.colGame')}</th>
                <th className="text-left pb-2 pr-4">{t('admin.colOrganizer')}</th>
                <th className="text-left pb-2 pr-4">{t('admin.colStatus')}</th>
                <th className="text-left pb-2">{t('admin.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((tournament: any) => (
                <tr key={tournament.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-2 pr-4 font-medium">{tournament.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">{tournament.game?.name}</td>
                  <td className="py-2 pr-4 text-muted-foreground">@{tournament.organizer?.login}</td>
                  <td className="py-2 pr-4"><TournamentStatusBadge status={tournament.status} /></td>
                  <td className="py-2">
                    {tournament.status !== 'CANCELLED' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          if (confirm(t('admin.cancelConfirm', { name: tournament.name }))) cancelMutation.mutate(tournament.id);
                        }}
                        disabled={cancelMutation.isPending}
                      >
                        {t('admin.cancelBtn')}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
