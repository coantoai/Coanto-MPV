import { createFileRoute } from '@tanstack/react-router';
import CoantoApp from '@/components/CoantoApp';

export const Route=createFileRoute('/analysis')({
  head:()=>({meta:[{title:'COANTO — تحليل جديد'},{name:'description',content:'تشغيل تحليل تنافسي جديد مع بوابة الأدلة.'}]}),
  component:CoantoApp,
});
