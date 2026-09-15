import { createFileRoute } from '@tanstack/react-router';
import CoantoPulseExperience from '@/components/CoantoPulseExperience';

// @ts-expect-error TanStack file-route type map is generated during build.
export const Route = createFileRoute('/trends-pulse')({
  head:()=>({meta:[
    {title:'COANTO — شو صار اليوم وبيهمك فعلًا؟'},
    {name:'description',content:'كوانتو يراقب الترندات والأخبار والإشارات التي تهم نشاطك ويحولها إلى قرار وفعل.'},
  ]}),
  component:CoantoPulseExperience,
});
