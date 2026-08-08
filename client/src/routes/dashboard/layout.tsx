import Header from '@/components/layout/Header';
import SuspenseLoader from '@/components/layout/SuspenseLoader';
import { useSession } from '@/lib/auth-client';
import { Suspense } from 'react';
import { Outlet } from 'react-router';

export function DashboardLayout() {
  const { data: auth, isPending } = useSession();

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
    <div className='w-full mx-auto flex flex-col'>
      <Header />
      <div className='w-full mx-auto container px-[1%]'>
        <Suspense fallback={<SuspenseLoader />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  );
}
