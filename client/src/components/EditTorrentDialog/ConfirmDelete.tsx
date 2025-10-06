import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '../ui/button';

export default function ConfirmDelete({
  children,
  onDelete,
  files,
}: {
  children: React.ReactNode;
  onDelete: (withFiles: boolean) => void;
  files: string[];
}) {
  return (
    <Popover>
      <PopoverTrigger className='flex' asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className='w-72 bg-card mt-2' side='bottom'>
        <div className='flex flex-col gap-3 '>
          <div className='justify-center gap-2 flex flex-col'>
            <Button
              className='flex w-full font-bold'
              variant='outline'
              onClick={() => onDelete(false)}>
              From Hoop
            </Button>
            <Button
              disabled={files.length === 0}
              className='flex w-full font-bold'
              variant='destructive'
              onClick={() => onDelete(true)}>
              From Hoop and With Files
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
