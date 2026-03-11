import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import { useAuthStore } from '../stores/auth';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Trophy, GamepadIcon, Medal, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/profile')({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const { t } = useTranslation();

  const [emailForm, setEmailForm] = useState({ email: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['my-profile'],
    queryFn: usersApi.me,
    enabled: !!user,
  });

  const updateEmailMutation = useMutation({
    mutationFn: () => usersApi.updateEmail(emailForm.email),
    onSuccess: (data) => {
      setEmailSuccess(t('profile.emailChanged'));
      setEmailError('');
      if (user) setUser({ ...user, email: data.email });
    },
    onError: (err: any) => setEmailError(err.response?.data?.error || t('profile.error')),
  });

  const updatePasswordMutation = useMutation({
    mutationFn: () => usersApi.updatePassword(passwordForm.currentPassword, passwordForm.newPassword),
    onSuccess: () => {
      setPasswordSuccess(t('profile.passwordChanged'));
      setPasswordError('');
      setPasswordForm({ currentPassword: '', newPassword: '' });
    },
    onError: (err: any) => setPasswordError(err.response?.data?.error || t('profile.error')),
  });

  if (!user) {
    return <div className="text-center py-16 text-muted-foreground">{t('profile.loginRequired')}</div>;
  }

  const stats = profile?.stats ?? {};

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">{t('profile.title')}</h1>

      {/* Profile info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
              {user.login[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">@{user.login}</h2>
              <p className="text-sm text-muted-foreground">{profile?.email ?? user.email}</p>
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {user.roles?.map((role) => (
                  <Badge key={role} variant="secondary" className="text-xs">{role}</Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 border rounded-lg text-center">
          <GamepadIcon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-xl font-bold">{stats.tournamentsPlayed ?? 0}</p>
          <p className="text-xs text-muted-foreground">{t('profile.statTournaments')}</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <Trophy className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
          <p className="text-xl font-bold">{stats.wins ?? 0}</p>
          <p className="text-xs text-muted-foreground">{t('profile.statWins')}</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <Medal className="h-5 w-5 mx-auto mb-1 text-gray-400" />
          <p className="text-xl font-bold">{stats.secondPlaces ?? 0}</p>
          <p className="text-xs text-muted-foreground">{t('profile.statSilver')}</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <Users className="h-5 w-5 mx-auto mb-1 text-blue-500" />
          <p className="text-xl font-bold">{stats.organized ?? 0}</p>
          <p className="text-xs text-muted-foreground">{t('profile.statOrganized')}</p>
        </div>
      </div>

      <Separator />

      {/* Change email */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('profile.changeEmail')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="new-email">{t('profile.newEmail')}</Label>
            <Input
              id="new-email"
              type="email"
              value={emailForm.email}
              onChange={(e) => setEmailForm({ email: e.target.value })}
              placeholder="new@email.com"
            />
          </div>
          {emailError && <p className="text-sm text-destructive">{emailError}</p>}
          {emailSuccess && <p className="text-sm text-green-600">{emailSuccess}</p>}
          <Button
            onClick={() => updateEmailMutation.mutate()}
            disabled={updateEmailMutation.isPending || !emailForm.email}
          >
            {updateEmailMutation.isPending ? t('btn.saving') : t('btn.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('profile.changePassword')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="curr-pass">{t('profile.currentPassword')}</Label>
            <Input
              id="curr-pass"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="new-pass">{t('profile.newPassword')}</Label>
            <Input
              id="new-pass"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
              placeholder={t('auth.passwordMinHint')}
            />
          </div>
          {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-600">{passwordSuccess}</p>}
          <Button
            onClick={() => updatePasswordMutation.mutate()}
            disabled={updatePasswordMutation.isPending || !passwordForm.currentPassword || !passwordForm.newPassword}
          >
            {updatePasswordMutation.isPending ? t('btn.saving') : t('profile.changePasswordBtn')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
