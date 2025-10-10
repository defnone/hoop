import { useId } from 'react';
import { ButtonGroup } from '../ui/button-group';
import { Button } from '../ui/button';
import { cn } from '@/lib/utils';

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
  );
}
