import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { authApi } from '../api/auth';
import { useAuthStore } from '../stores/auth';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';

export function AuthForms() {
  const { login } = useAuthStore();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [loginForm, setLoginForm] = useState({ login: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ login: '', email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [registerError, setRegisterError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoading(true);
    try {
      const data = await authApi.login(loginForm);
      queryClient.clear();
      login(data.accessToken, data.user);
    } catch (err: any) {
      setLoginError(err.response?.data?.error || t('auth.loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setLoading(true);
    try {
      const data = await authApi.register(registerForm);
      login(data.accessToken, data.user);
    } catch (err: any) {
      setRegisterError(err.response?.data?.error || t('auth.registerError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('auth.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="login" className="flex-1">{t('auth.loginTab')}</TabsTrigger>
            <TabsTrigger value="register" className="flex-1">{t('auth.registerTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <Label htmlFor="login-username">{t('auth.login')}</Label>
                <Input
                  id="login-username"
                  value={loginForm.login}
                  onChange={(e) => setLoginForm((f) => ({ ...f, login: e.target.value }))}
                  placeholder={t('auth.loginPlaceholder')}
                  required
                />
              </div>
              <div>
                <Label htmlFor="login-password">{t('auth.password')}</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('auth.passwordPlaceholder')}
                  required
                />
              </div>
              {loginError && <p className="text-sm text-destructive">{loginError}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('auth.loginLoading') : t('auth.loginButton')}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register">
            <form onSubmit={handleRegister} className="space-y-3">
              <div>
                <Label htmlFor="reg-login">{t('auth.login')}</Label>
                <Input
                  id="reg-login"
                  value={registerForm.login}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, login: e.target.value }))}
                  placeholder={t('auth.loginPlaceholderHint')}
                  required
                />
              </div>
              <div>
                <Label htmlFor="reg-email">{t('auth.email')}</Label>
                <Input
                  id="reg-email"
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="your@email.com"
                  required
                />
              </div>
              <div>
                <Label htmlFor="reg-password">{t('auth.password')}</Label>
                <Input
                  id="reg-password"
                  type="password"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder={t('auth.passwordMinHint')}
                  required
                />
              </div>
              {registerError && <p className="text-sm text-destructive">{registerError}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t('auth.registerLoading') : t('auth.registerButton')}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
