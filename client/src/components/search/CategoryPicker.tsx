import { useId } from 'react';
import { ButtonGroup } from '../ui/button-group';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';
import { BadgeQuestionMark } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export default function CategoryPicker({
  category,
  setCategory,
}: {
  category: number;
  setCategory: React.Dispatch<React.SetStateAction<number>>;
}) {
  const id = useId();

  const items = [
    { value: 5000, label: 'All' },
    { value: 5030, label: 'SD' },
    { value: 5040, label: 'HD' },
    { value: 5045, label: '4K' },
  ];

  return (
    <ButtonGroup className='items-center'>
      <ButtonGroup>
        {items.map((item) => (
          <Button
            className={cn(
              'font-bold',
              category === item.value && 'border border-border'
            )}
            variant={category === item.value ? 'secondary' : 'outline'}
            key={`${id}-${item.value}`}
            onClick={() => setCategory(item.value)}>
            {item.label}
          </Button>
        ))}
      </ButtonGroup>
      <ButtonGroup>
        <Popover>
          <PopoverTrigger>
            <Button size={'icon-sm'} variant={'ghost'} className='rounded-full'>
              <BadgeQuestionMark />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            sideOffset={10}
            align='start'
            className='text-sm shadow-lg'>
            These are the categories sent to Jackett for searching on trackers.
            They don’t always work effectively for category-based searches. It’s
            usually best to use “All” and then filter the search results using
            the filters below.
          </PopoverContent>
        </Popover>
      </ButtonGroup>
    </ButtonGroup>
  );
}
