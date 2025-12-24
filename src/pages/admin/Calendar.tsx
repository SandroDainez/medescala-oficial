import ShiftCalendar from '@/components/admin/ShiftCalendar';

export default function AdminCalendar() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Calendário de Plantões</h2>
        <p className="text-muted-foreground">Visualize e gerencie plantões por mês e setor</p>
      </div>
      <ShiftCalendar />
    </div>
  );
}
