import { createFileRoute } from '@tanstack/react-router';
import DashboardHome from '@/components/DashboardHome';

export const Route=createFileRoute('/')({
  head:()=>({meta:[{title:'COANTO — مركز القرار التنافسي'},{name:'description',content:'لوحة قيادة تجمع المنافسين والمراقبة والذكاء والقرار في صورة تنفيذية واحدة.'}]}),
  component:DashboardHome,
});
