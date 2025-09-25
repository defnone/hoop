import Header from '@/components/layout/Header';
import { useSession } from '@/lib/auth-client';
import { Outlet } from 'react-router';

export function DashboardLayout() {
  const { data: auth } = useSession();

  if (!auth?.session) {
    return null;
  }

  return (
    <div className='w-full mx-auto flex flex-col'>
      <Header />
      <div className='w-full mx-auto container px-[1%]'>
        <Outlet />
      </div>
    </div>
  );
}
