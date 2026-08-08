import { Loader2 } from 'lucide-react';
import { useLocation } from 'react-router';
import { DiscoverPageSkeleton } from '@/components/discover/DiscoverSkeleton';

export default function SuspenseLoader() {
  const location = useLocation();

  if (location.pathname === '/discover') {
    return <DiscoverPageSkeleton />;
  }

  return (
    <div className='flex flex-col items-center justify-center w-full h-full'>
      <div className='flex justify-center items-center w-full h-[80vh]'>
        <Loader2 className='w-10 h-10 animate-spin ' />
      </div>
    </div>
  );
}
