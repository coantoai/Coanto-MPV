import { createFileRoute } from '@tanstack/react-router';
import DashboardHome from '@/components/DashboardHome';

// @ts-expect-error TanStack file-route type map is generated without declarations in this project template.
export const Route=createFileRoute('/')({
  head:()=>({meta:[{title:'COANTO — مركز القرار التنافسي'},{name:'description',content:'لوحة قيادة تجمع المنافسين والمراقبة والذكاء والقرار في صورة تنفيذية واحدة.'}]}),
  component:DashboardHome,
});
