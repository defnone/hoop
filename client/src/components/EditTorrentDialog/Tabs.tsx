import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PopcornIcon, FileVideo } from 'lucide-react';

export default function DataTabs({
  torrents,
  files,
  filesData,
}: {
  torrents: React.ReactNode;
  files: React.ReactNode;
  filesData: string[];
}) {
  return (
    <Tabs defaultValue='tab-1'>
      <ScrollArea>
        <TabsList className='relative mb-3 h-auto w-full justify-start gap-0.5 bg-transparent p-0 before:absolute before:inset-x-0 before:bottom-[1px] before:h-px before:bg-border'>
          <TabsTrigger
            value='tab-1'
            className='overflow-hidden rounded-b-none border-x border-t border-border bg-zinc-900 py-2 data-[state=active]:z-10 data-[state=active]:shadow-none cursor-pointer'>
            <PopcornIcon
              className='-ms-0.5 me-1.5 opacity-60'
              size={16}
              strokeWidth={2}
              aria-hidden='true'
            />
            Episodes
          </TabsTrigger>
          <TabsTrigger
            disabled={filesData.length === 0}
            value='tab-2'
            className='overflow-hidden rounded-b-none border-x border-t border-border bg-zinc-900 py-2 data-[state=active]:z-10 data-[state=active]:shadow-none cursor-pointer'>
            <FileVideo
              className='-ms-0.5 me-1.5 opacity-60'
              size={16}
              strokeWidth={2}
              aria-hidden='true'
            />
            Files
          </TabsTrigger>
        </TabsList>
        <ScrollBar orientation='horizontal' />
      </ScrollArea>

      <TabsContent value='tab-1'>{torrents}</TabsContent>
      <TabsContent value='tab-2'>{files}</TabsContent>
    </Tabs>
  );
}
