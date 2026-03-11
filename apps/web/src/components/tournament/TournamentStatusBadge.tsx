import { Badge } from '../ui/badge';
import { TournamentStatus } from '@tournirken/shared';

const statusLabels: Record<string, string> = {
  DRAFT: 'Черновик',
  REGISTRATION: 'Регистрация',
  ACTIVE: 'Идёт',
  FINISHED: 'Завершён',
  CANCELLED: 'Отменён',
};

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning'> = {
  DRAFT: 'secondary',
  REGISTRATION: 'warning',
  ACTIVE: 'success',
  FINISHED: 'outline',
  CANCELLED: 'destructive',
};

export function TournamentStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={statusVariants[status] ?? 'secondary'}>
      {statusLabels[status] ?? status}
    </Badge>
  );
}
