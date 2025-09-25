import { useEffect } from 'react';

export default function NotFound() {
  useEffect(() => {
    document.title = '404 Not Found';
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', 'Page not found');
  }, []);
  return (
    <div className='h-screen w-full flex items-center justify-center text-3xl font-extrabold'>
      404
    </div>
  );
}
