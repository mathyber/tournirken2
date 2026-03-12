import { createFileRoute, Link } from '@tanstack/react-router';
import { Trophy, Users, Swords, BarChart3, Settings, CheckCircle, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/guide')({
  component: GuidePage,
});

function Section({ id, icon: Icon, title, children }: {
  id: string;
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <figure className="my-4">
      <img src={src} alt={alt} className="w-full rounded-lg border shadow-sm" />
      {caption && (
        <figcaption className="text-sm text-muted-foreground text-center mt-2">{caption}</figcaption>
      )}
    </figure>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-3">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {n}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}

function Html({ text }: { text: string }) {
  return <span dangerouslySetInnerHTML={{ __html: text }} />;
}

export default function GuidePage() {
  const { t } = useTranslation();

  const TOC = [
    { id: 'overview', label: t('guide.toc.overview') },
    { id: 'register', label: t('guide.toc.register') },
    { id: 'browse', label: t('guide.toc.browse') },
    { id: 'create', label: t('guide.toc.create') },
    { id: 'manage', label: t('guide.toc.manage') },
    { id: 'formats', label: t('guide.toc.formats') },
    { id: 'results', label: t('guide.toc.results') },
    { id: 'profile', label: t('guide.toc.profile') },
  ];

  const lifecycle = [
    t('status.DRAFT'), '→',
    t('status.REGISTRATION'), '→',
    t('status.ACTIVE'), '→',
    t('status.FINISHED'),
  ];

  return (
    <div className="flex gap-8 max-w-6xl mx-auto">
      {/* Table of contents */}
      <aside className="hidden lg:block w-56 flex-shrink-0">
        <div className="sticky top-24 space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t('guide.toc')}
          </p>
          {TOC.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block text-sm text-muted-foreground hover:text-foreground transition-colors py-1 px-2 rounded-md hover:bg-accent"
            >
              {item.label}
            </a>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 space-y-12 min-w-0">
        {/* Hero */}
        <div className="flex items-center gap-4 pb-4 border-b">
          <div className="p-3 rounded-xl bg-primary/10">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('guide.title')}</h1>
            <p className="text-muted-foreground">{t('guide.subtitle')}</p>
          </div>
        </div>

        {/* 1. Overview */}
        <Section id="overview" icon={Trophy} title={t('guide.overview.title')}>
          <p className="text-muted-foreground mb-4">{t('guide.overview.desc')}</p>
          <Screenshot
            src="/guide/02-home-logged.png"
            alt={t('guide.overview.screenshot')}
            caption={t('guide.overview.screenshotCaption')}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            {(['feat1', 'feat2', 'feat3', 'feat4'] as const).map((k, i) => (
              <Card key={k} className="text-center p-3">
                <div className="text-2xl mb-1">{['🏆', '👥', '⚔️', '📊'][i]}</div>
                <p className="text-xs font-medium">{t(`guide.overview.${k}`)}</p>
              </Card>
            ))}
          </div>
        </Section>

        {/* 2. Register */}
        <Section id="register" icon={Users} title={t('guide.register.title')}>
          <p className="text-muted-foreground mb-4">{t('guide.register.desc')}</p>
          <Screenshot
            src="/guide/01-home.png"
            alt={t('guide.register.screenshot')}
            caption={t('guide.register.screenshotCaption')}
          />
          <div className="space-y-1 mt-4">
            <p className="font-medium text-sm mb-2">{t('guide.register.stepsTitle')}</p>
            <Step n={1}><Html text={t('guide.register.step1')} /></Step>
            <Step n={2}><Html text={t('guide.register.step2')} /></Step>
            <Step n={3}><Html text={t('guide.register.step3')} /></Step>
          </div>
        </Section>

        {/* 3. Browse */}
        <Section id="browse" icon={BarChart3} title={t('guide.browse.title')}>
          <p className="text-muted-foreground mb-4">{t('guide.browse.desc')}</p>
          <Screenshot
            src="/guide/08-search.png"
            alt={t('guide.browse.screenshot')}
            caption={t('guide.browse.screenshotCaption')}
          />
          <p className="text-sm font-medium mt-3 mb-2">{t('guide.browse.filtersTitle')}</p>
          <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
            <li><Html text={t('guide.browse.filterName')} /></li>
            <li><Html text={t('guide.browse.filterGame')} /></li>
            <li><Html text={t('guide.browse.filterStatus')} /></li>
          </ul>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
            {(['DRAFT', 'REGISTRATION', 'ACTIVE', 'FINISHED'] as const).map((s) => {
              const variantMap = { DRAFT: 'secondary', REGISTRATION: 'warning', ACTIVE: 'default', FINISHED: 'success' } as const;
              return (
                <div key={s} className="text-center">
                  <Badge variant={variantMap[s] as any}>{t(`status.${s}`)}</Badge>
                </div>
              );
            })}
          </div>
        </Section>

        {/* 4. Create */}
        <Section id="create" icon={Trophy} title={t('guide.create.title')}>
          <p className="text-muted-foreground mb-4"><Html text={t('guide.create.desc')} /></p>
          <Screenshot
            src="/guide/03-create-top.png"
            alt={t('guide.create.screenshotTop')}
            caption={t('guide.create.screenshotTopCaption')}
          />
          <Screenshot
            src="/guide/03-create-bottom.png"
            alt={t('guide.create.screenshotBottom')}
            caption={t('guide.create.screenshotBottomCaption')}
          />
          <div className="space-y-1 mt-2">
            <p className="font-medium text-sm mb-2">{t('guide.create.requiredTitle')}</p>
            <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
              {(['req1', 'req2', 'req3', 'req4'] as const).map((k) => (
                <li key={k}><Html text={t(`guide.create.${k}`)} /></li>
              ))}
            </ul>
            <p className="font-medium text-sm mt-3 mb-2">{t('guide.create.optionalTitle')}</p>
            <ul className="space-y-1 text-sm text-muted-foreground list-disc list-inside">
              {(['opt1', 'opt2', 'opt3', 'opt4', 'opt5'] as const).map((k) => (
                <li key={k}><Html text={t(`guide.create.${k}`)} /></li>
              ))}
            </ul>
          </div>
        </Section>

        {/* 5. Manage */}
        <Section id="manage" icon={Settings} title={t('guide.manage.title')}>
          <p className="text-muted-foreground mb-4">{t('guide.manage.desc')}</p>
          <Screenshot
            src="/guide/05-organizer.png"
            alt={t('guide.manage.screenshot')}
            caption={t('guide.manage.screenshotCaption')}
          />
          <p className="text-sm font-medium mb-2">{t('guide.manage.lifecycleTitle')}</p>
          <div className="flex flex-wrap gap-2 items-center mb-4">
            {lifecycle.map((s, i) => (
              s === '→'
                ? <span key={i} className="text-muted-foreground">→</span>
                : <Badge key={i} variant="outline">{s}</Badge>
            ))}
          </div>
          <div className="space-y-1">
            {(['step1', 'step2', 'step3', 'step4'] as const).map((k, i) => (
              <Step key={k} n={i + 1}>
                <strong>{t(`guide.manage.${k}Title`)}</strong>{' '}{t(`guide.manage.${k}`)}
              </Step>
            ))}
          </div>
          <Screenshot
            src="/guide/04-tournament.png"
            alt={t('guide.manage.screenshot2')}
            caption={t('guide.manage.screenshot2Caption')}
          />
        </Section>

        {/* 6. Formats */}
        <Section id="formats" icon={Swords} title={t('guide.formats.title')}>
          <div className="grid gap-4">
            {[
              { badge: 'Single Elimination', subtitle: t('guide.formats.seSubtitle'), desc: t('guide.formats.seDesc') },
              { badge: 'Double Elimination', subtitle: t('guide.formats.deSubtitle'), desc: t('guide.formats.deDesc') },
              { badge: 'Round Robin', subtitle: t('guide.formats.rrSubtitle'), desc: t('guide.formats.rrDesc') },
              { badge: 'Swiss', subtitle: t('guide.formats.swSubtitle'), desc: t('guide.formats.swDesc') },
              { badge: 'Mixed', subtitle: null, desc: t('guide.formats.mixDesc') },
            ].map((f) => (
              <Card key={f.badge}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge>{f.badge}</Badge>
                    {f.subtitle && <span className="text-muted-foreground font-normal text-sm">{f.subtitle}</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
              </Card>
            ))}
          </div>
          <Screenshot
            src="/guide/06-bracket.png"
            alt={t('guide.formats.screenshot')}
            caption={t('guide.formats.screenshotCaption')}
          />
        </Section>

        {/* 7. Results */}
        <Section id="results" icon={CheckCircle} title={t('guide.results.title')}>
          <p className="text-muted-foreground mb-4">{t('guide.results.desc')}</p>
          <p className="text-sm font-medium mb-2">{t('guide.results.howTitle')}</p>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside mb-4">
            <li><Html text={t('guide.results.rule1')} /></li>
            <li><Html text={t('guide.results.rule2')} /></li>
            <li>{t('guide.results.rule3')}</li>
          </ul>
          <p className="text-sm text-muted-foreground">{t('guide.results.auto')}</p>
        </Section>

        {/* 8. Profile */}
        <Section id="profile" icon={Users} title={t('guide.profile.title')}>
          <Screenshot
            src="/guide/07-profile.png"
            alt={t('guide.profile.screenshot')}
            caption={t('guide.profile.screenshotCaption')}
          />
          <p className="text-muted-foreground mt-2">{t('guide.profile.desc')}</p>
        </Section>

        {/* Footer nav */}
        <div className="pt-6 border-t text-center">
          <p className="text-muted-foreground text-sm mb-3">{t('guide.ready')}</p>
          <Link to="/" className="inline-flex items-center gap-2 text-primary font-medium hover:underline">
            <Trophy className="h-4 w-4" />
            {t('guide.goToTournaments')}
          </Link>
        </div>
      </div>
    </div>
  );
}
