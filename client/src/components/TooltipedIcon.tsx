import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export function TooltipedIcon({
  icon,
  text,
  action,
}: {
  icon: React.ReactNode;
  text: string;
  action?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger>{icon}</TooltipTrigger>
      <TooltipContent onClick={action} className='text-xs'>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  );
}
