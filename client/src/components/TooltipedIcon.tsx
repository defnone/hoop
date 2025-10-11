import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function TooltipedIcon({
  icon,
  text,
  action,
  align,
}: {
  icon: React.ReactNode;
  text: string;
  action?: () => void;
  align?: 'start' | 'center' | 'end' | undefined;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>{icon}</TooltipTrigger>
      <TooltipContent align={align} onClick={action} className='text-xs'>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
