import { Loader2 } from 'lucide-react';

export default function SuspenseLoader() {
  return (
    <div className='flex flex-col items-center justify-center w-full h-full'>
      <div className='flex justify-center items-center w-full h-[80vh]'>
        <Loader2 className='w-10 h-10 animate-spin ' />
      </div>
    </div>
  );
}
