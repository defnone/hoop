import { Outlet, useLocation, useNavigate } from 'react-router';
import '@fontsource-variable/mulish';
import QueryProvider from './providers/queryProvider';
import { routes } from './routes';
import { useEffect, useRef } from 'react';
import { useSession } from './lib/auth-client';
import customSonner from '@/components/CustomSonner';
import { Toaster } from 'sonner';

export default function App() {
  const location = useLocation();
  const { data: auth, isPending, error } = useSession();
  const navigate = useNavigate();
  const hadSessionRef = useRef(false);

  useEffect(() => {
    if (isPending) return;

    const onAuthPage =
      location.pathname === '/login' || location.pathname === '/sign-up';

    const unauthorized =
      (error as { code?: string })?.code === 'UNAUTHORIZED' ||
      (error as { code?: string })?.code === 'FORBIDDEN' ||
      (error as { status?: number })?.status === 401 ||
      (error as { status?: number })?.status === 403;

    if (!auth?.session) {
      if (!onAuthPage) {
        if (hadSessionRef.current || unauthorized) {
          customSonner({
            variant: 'error',
            text: error?.message ?? 'Session expired. Please log in again',
            delayDuration: 8000,
          });
        }
        navigate('/login', { replace: true });
      }
      return;
    }

    // Mark that session has existed to detect future loss
    hadSessionRef.current = true;
  }, [auth?.session, isPending, location.pathname, error, navigate]);

  useEffect(() => {
    const currentRoute = routes.find(
      (route) => route.path === location.pathname
    );
    if (currentRoute && currentRoute.meta) {
      document.title = currentRoute.meta.title || 'Default Title';
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute(
          'content',
          currentRoute.meta.description || 'Default Description'
        );
    }
  }, [location.pathname]);

  return (
    <div className='font-sans min-h-screen text-white antialiased'>
      <QueryProvider>
        <Outlet />
        <Toaster position='top-center' richColors />
      </QueryProvider>
    </div>
  );
}
