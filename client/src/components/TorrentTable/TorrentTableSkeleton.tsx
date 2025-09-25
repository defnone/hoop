export function TorrentTableSkeleton() {
  return (
    <div className='w-full space-y-3'>
      {[...Array(5)].map((_, i) => (
        <div key={i} className='flex w-full gap-4 rounded-lg'>
          <div className='w-[30%] h-5 bg-zinc-800 rounded-md animate-pulse' />
          <div className='w-[10%] h-5 bg-zinc-800 rounded-md animate-pulse' />
          <div className='w-[10%] h-5 bg-zinc-800 rounded-md animate-pulse' />
          <div className='w-[25%] h-5 bg-zinc-800 rounded-md animate-pulse' />
          <div className='w-[25%] h-5 bg-zinc-800 rounded-md animate-pulse' />
        </div>
      ))}
    </div>
  );
}
