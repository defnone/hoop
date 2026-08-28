import Header from '@/components/layout/Header';
import SuspenseLoader from '@/components/layout/SuspenseLoader';
import { useSession } from '@/lib/auth-client';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';

export function DashboardLayout() {
  const { data: auth, isPending } = useSession();
  const { pathname } = useLocation();
  const isFileManager = pathname === '/files';

  if (isPending) {
    return (
      <div className='w-full mx-auto flex flex-col'>
        <div className='mb-10 h-[70px] w-full border-b border-border' />
        <div className='w-full mx-auto container px-[1%]'>
          <SuspenseLoader />
        </div>
      </div>
    );
  }

  if (!auth?.session) {
    return null;
  }

  return (
    <div className='w-full min-h-screen mx-auto flex flex-col'>
      <Header />
      <div
        className={
          isFileManager
            ? 'w-full flex-1 min-h-0 -mt-10'
            : 'w-full mx-auto container px-[1%]'
        }
      >
        <Suspense fallback={<SuspenseLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
