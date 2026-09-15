import { createFileRoute } from '@tanstack/react-router';
import CoantoPulseFast from '@/components/CoantoPulseFast';

// @ts-expect-error TanStack file-route type map is generated during build.
export const Route = createFileRoute('/trends-pulse')({
  head:()=>({meta:[
    {title:'COANTO — Pulse Line'},
    {name:'description',content:'كوانتو يرصد ما يتحرك الآن ويشرح لماذا يهمك وما الذي تفعله.'},
  ]}),
  component:CoantoPulseFast,
});
