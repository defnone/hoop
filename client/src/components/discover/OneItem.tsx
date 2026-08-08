import { TmdbDiscoverItem } from '@/types/tmdb';
import { cn } from '@/lib/utils';
import { Heart, ImageOff, Search, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../ui/button';
import { SiThemoviedatabase } from 'react-icons/si';
import { FaImdb, FaYoutube } from 'react-icons/fa';
import { useNavigate } from 'react-router';

function TopButtons({ item }: { item: TmdbDiscoverItem }) {
  return (
    <div className='mb-auto z-10 flex w-full justify-between p-5'>
      <div className='flex w-fit items-center gap-2 bg-zinc-700/60 backdrop-blur-sm rounded-full px-4 py-1 font-bold'>
        <TrendingUp size={16} aria-label='Popularity' />
        <span>{item.popularity.toFixed(1)}</span>
      </div>
      <div className='flex w-fit items-center gap-2 bg-zinc-700/60 backdrop-blur-sm rounded-full px-4 py-1 font-bold'>
        <Heart strokeWidth={3} color='#ff1a1a' size={16} />
        {item.rating.toFixed(1)}
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
  item: TmdbDiscoverItem;
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
            'flex flex-row gap-3 pb-2 pt-10 w-full transition-all duration-500 ease-in-out justify-end z-50',
          )}
        >
          <div className='flex flex-row items-center gap-3 mr-auto '>
            {isJackettPrepared && (
              <Button
                onClick={() => na(`/search?query=${item.title}`)}
                variant='ghost'
                size='default'
                aria-label={`Search torrents for ${item.title}`}
                className='w-fit border-0 bg-zinc-700/60 backdrop-blur-sm hover:bg-background/70 transition-all duration-300 flex h-9'
              >
                <Search size={20} strokeWidth={3} />
              </Button>
            )}

            {item.trailerUrl && (
              <div className='flex items-center justify-center h-10 gap-2 mr-auto'>
                <a
                  href={item.trailerUrl}
                  target='_blank'
                  rel='noreferrer'
                  aria-label={`Watch ${item.title} trailer`}
                >
                  <FaYoutube
                    size={50}
                    color='#ff1a1a'
                    className='antialiased'
                  />
                </a>
              </div>
            )}
          </div>

          {item.detailsUrl && (
            <a
              href={item.detailsUrl}
              target='_blank'
              rel='noreferrer'
              aria-label={`Open ${item.title} on TMDB`}
            >
              <div className='flex items-center justify-center gap-2'>
                <SiThemoviedatabase size={35} color='#01b4e4' />
              </div>
            </a>
          )}
          {item.imdbId && (
            <a
              href={`https://www.imdb.com/title/${item.imdbId}`}
              target='_blank'
              rel='noreferrer'
              aria-label={`Open ${item.title} on IMDb`}
            >
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
          isBig ? 'text-3xl' : 'text-2xl',
        )}
      >
        {item.title}
      </h1>
      <div
        className={cn(
          'bg-gradient-to-b from-transparent to-black/50 backdrop-blur-sm p-5 z-0 flex flex-col justify-center absolute top-0 left-0 w-full h-full transition-all duration-500',
          isHovering
            ? '[mask-image:linear-gradient(to_top,red_50%,transparent)]'
            : '[mask-image:linear-gradient(to_top,red_60%,transparent)]',
        )}
      ></div>
    </div>
  );
}

export default function OneItem({
  item,
  isBig,
  isJackettPrepared,
}: {
  item: TmdbDiscoverItem;
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
        isLoading &&
          item.backdropUrl &&
          'animate-pulse bg-zinc-900 duration-1000',
        isJackettPrepared && 'cursor-pointer',
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <button
        type='button'
        disabled={!isJackettPrepared}
        aria-label={`Search ${item.title}`}
        className={cn(
          'absolute top-0 left-0 w-full h-full z-0 overflow-hidden transition-all duration-500 disabled:cursor-default',
          isHovering
            ? 'scale-110'
            : 'scale-100 border border-zinc-900 rounded-lg',
        )}
        onClick={() => na(`/search?query=${item.title}`)}
      >
        {item.backdropUrl ? (
          <img
            src={item.backdropUrl}
            alt={item.title}
            onLoad={() => setIsLoading(false)}
            className='h-full w-full object-cover'
            sizes={
              isBig
                ? '(max-width: 768px) 100vw, (max-width: 1200px) 100vw'
                : '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
            }
          />
        ) : (
          <div className='flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 text-muted-foreground'>
            <ImageOff size={40} aria-hidden='true' />
            <span>No backdrop available</span>
          </div>
        )}
      </button>

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
