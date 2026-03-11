import React from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Trophy, Users, GamepadIcon, Medal } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export const Route = createFileRoute('/users/$login')({
  component: UserProfilePage,
});

const roleLabels: Record<string, string> = {
  USER: 'Пользователь',
  MODERATOR: 'Модератор',
  ADMIN: 'Администратор',
};

const roleVariants: Record<string, any> = {
  USER: 'secondary',
  MODERATOR: 'warning',
  ADMIN: 'destructive',
};

function UserProfilePage() {
  const { login } = Route.useParams();

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['user-profile', login],
    queryFn: () => usersApi.getProfile(login),
  });

  if (isLoading) return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  if (error || !user) return <div className="text-center py-16 text-muted-foreground">Пользователь не найден</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Profile header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
              {user.login[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">@{user.login}</h1>
              <p className="text-sm text-muted-foreground">
                С нами с {format(new Date(user.createdAt), 'd MMMM yyyy', { locale: ru })}
              </p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {user.roles?.map((role: string) => (
                  <Badge key={role} variant={roleVariants[role] ?? 'secondary'} className="text-xs">
                    {roleLabels[role] ?? role}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<GamepadIcon className="h-5 w-5" />} label="Турниров сыграно" value={user.stats?.tournamentsPlayed ?? 0} />
        <StatCard icon={<Trophy className="h-5 w-5 text-yellow-500" />} label="Победы" value={user.stats?.wins ?? 0} />
        <StatCard icon={<Medal className="h-5 w-5 text-gray-400" />} label="Серебро" value={user.stats?.secondPlaces ?? 0} />
        <StatCard icon={<Users className="h-5 w-5 text-orange-500" />} label="Организовано" value={user.stats?.organized ?? 0} />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-4 text-center">
        <div className="flex justify-center mb-2 text-muted-foreground">{icon}</div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
