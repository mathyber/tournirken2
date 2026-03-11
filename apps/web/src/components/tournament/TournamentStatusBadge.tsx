import { Badge } from '../ui/badge';
import { TournamentStatus } from '@tournirken/shared';
import { useTranslation } from 'react-i18next';

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  DRAFT: 'secondary',
  REGISTRATION: 'warning',
  ACTIVE: 'success',
  FINISHED: 'outline',
  CANCELLED: 'destructive',
};

export function TournamentStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <Badge variant={statusVariants[status] ?? 'secondary'}>
      {t(`status.${status}`, { defaultValue: status })}
    </Badge>
  );
}
