import { useParams } from 'react-router-dom';
import ShiftCalendar from '@/components/admin/ShiftCalendar';

export default function AdminCalendar() {
  const { sectorId } = useParams<{ sectorId?: string }>();
  
  return (
    <div className="space-y-4">
      <ShiftCalendar initialSectorId={sectorId} />
    </div>
  );
}
