import ShiftCalendar from '@/components/admin/ShiftCalendar';

export default function AdminCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Escalas</h2>
        <p className="text-muted-foreground">Visualize e gerencie escalas por mês e setor</p>
      </div>
      <ShiftCalendar />
    </div>
  );
}
