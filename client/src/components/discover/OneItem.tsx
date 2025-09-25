import { TraktWatchedShow } from '@/types/trakt';
import { cn } from '@/lib/utils';
import { Heart, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { SiTrakt } from 'react-icons/si';
import { FaImdb, FaYoutube } from 'react-icons/fa';
import { useNavigate } from 'react-router';

function TopButtons({ item }: { item: TraktWatchedShow }) {
  return (
    <div className='mb-auto z-10 flex w-full justify-between p-5'>
      <div className='flex w-fit items-center gap-2 bg-zinc-700/60 backdrop-blur-sm rounded-full px-4 py-1 font-bold'>
        <Users size={16} />
        {item.watcher_count}
      </div>
      <div className='flex w-fit items-center gap-2 bg-zinc-700/60 backdrop-blur-sm rounded-full px-4 py-1 font-bold'>
        <Heart strokeWidth={3} color='#ff1a1a' size={16} />
        {parseFloat(item.show.rating.toFixed(1))}
      </div>
    </div>
  );
}

function BottomButtons({
  item,
  isHovering,
  isBig,
  isJackettPrepared,
}: {
  item: TraktWatchedShow;
  isHovering: boolean;
  isBig: boolean;
  isJackettPrepared: boolean;
}) {
  const na = useNavigate();
  return (
    <div className='relative flex flex-col w-full p-5'>
      {isHovering && (
        <div
          className={cn(
            'flex flex-row gap-3 pb-2 pt-10 w-full transition-all duration-500 ease-in-out justify-end z-50'
          )}>
          <div className='flex flex-row items-center gap-3 mr-auto '>
            {isJackettPrepared && (
              <Button
                onClick={() => na(`/search?query=${item.show.title}`)}
                variant='ghost'
                size='default'
                className='w-fit border-0 bg-zinc-700/60 backdrop-blur-sm hover:bg-background/70 transition-all duration-300 flex h-9'>
                <Search size={20} strokeWidth={3} />
              </Button>
            )}

            {item.show.trailer && (
              <div className='flex items-center justify-center h-10 gap-2 mr-auto'>
                <a href={item.show.trailer} target='_blank'>
                  <FaYoutube
                    size={50}
                    color='#ff1a1a'
                    className='antialiased'
                  />
                </a>
              </div>
            )}
          </div>

          <a
            href={`https://trakt.tv/shows/${item.show.ids.trakt}`}
            target='_blank'>
            <div className='flex items-center justify-center gap-2'>
              <SiTrakt size={35} color='#ff1a1a' />
            </div>
          </a>
          {item.show.ids.imdb && (
            <a
              href={`https://www.imdb.com/title/${item.show.ids.imdb}`}
              target='_blank'>
              <div className='flex items-center justify-center gap-2'>
                <FaImdb size={35} color='#eaff2e' />
              </div>
            </a>
          )}
        </div>
      )}
      <h1
        className={cn(
          'text-2xl font-black shadow-black/50 z-50',
          isBig ? 'text-3xl' : 'text-2xl'
        )}>
        {item.show.title}
      </h1>
      <div
        className={cn(
          'bg-gradient-to-b from-transparent to-black/50 backdrop-blur-sm p-5 z-0 flex flex-col justify-center absolute top-0 left-0 w-full h-full transition-all duration-500',
          isHovering
            ? '[mask-image:linear-gradient(to_top,red_50%,transparent)]'
            : '[mask-image:linear-gradient(to_top,red_60%,transparent)]'
        )}></div>
    </div>
  );
}

export default function OneItem({
  item,
  isBig,
  isJackettPrepared,
}: {
  item: TraktWatchedShow;
  isBig: boolean;
  isJackettPrepared: boolean;
}) {
  const [isHovering, setIsHovering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const na = useNavigate();

  return (
    <div
      className={cn(
        'flex flex-col gap-2 relative rounded-md overflow-hidden ',
        isBig ? 'row-span-2 h-[400px]' : 'h-[300px]',
        isLoading && 'animate-pulse bg-zinc-900 duration-1000',
        isJackettPrepared && 'cursor-pointer'
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}>
      <img
        src={'https://' + item.show.images.fanart[0]}
        alt={item.show.title}
        onClick={() =>
          isJackettPrepared && na(`/search?query=${item.show.title}`)
        }
        onLoad={() => setIsLoading(false)}
        className={cn(
          'absolute top-0 left-0 w-full h-full object-cover z-0 transition-all duration-500',
          isHovering
            ? 'scale-110'
            : 'scale-100 border border-zinc-900 rounded-lg'
        )}
        sizes={
          isBig
            ? '(max-width: 768px) 100vw, (max-width: 1200px) 100vw'
            : '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
        }
      />

      <TopButtons item={item} />
      <BottomButtons
        item={item}
        isHovering={isHovering}
        isBig={isBig}
        isJackettPrepared={isJackettPrepared}
      />
    </div>
  );
}
