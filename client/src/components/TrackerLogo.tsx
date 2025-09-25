import { SquareDot } from 'lucide-react';

const logos = [
  {
    id: 'rutracker',
    logoSrc: '/trackers/rutracker.png',
    hoverText: 'Rutracker',
  },
  {
    id: 'kinozal',
    logoSrc: '/trackers/kinozal.png',
    hoverText: 'Kinozal',
  },
  {
    id: 'nnmClub',
    logoSrc: '/trackers/nnmclub.png',
    hoverText: 'NNM-Club',
  },
  {
    id: 'noname-club', // dublicate for jackett
    logoSrc: '/trackers/nnmclub.png',
    hoverText: 'NNM-Club',
  },
];

export default function TrackerLogo({ tracker }: { tracker: string }) {
  const logo = logos.find((logo) => logo.id === tracker);

  if (!logo) return <SquareDot className='w-5 h-5' />;
  return (
    <img
      src={logo.logoSrc}
      alt={logo.id}
      width={20}
      height={20}
      title={logo.hoverText}
    />
  );
}
