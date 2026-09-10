import { createStart } from '@tanstack/react-start';
import { attachAuth } from '@/lib/auth-attacher';

export const startInstance = createStart(() => ({
  functionMiddleware: [attachAuth],
}));
