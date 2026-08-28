import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FileEntry } from './types';
import { BATCH_RENAME_MAX_TEXT_LENGTH } from './utils';
import type {
  BatchRenameFormat,
  BatchRenameForm,
  BatchRenameMode,
  BatchRenamePosition,
  BatchRenamePreview,
} from './utils';

export type BatchRenameFormState = BatchRenameForm;

export type FileManagerDialogsProps = {
  deleteTargets: FileEntry[];
  renameTarget: FileEntry | null;
  renameName: string;
  batchRenameTargets: FileEntry[];
  batchRenameForm: BatchRenameFormState;
  batchRenamePreview: BatchRenamePreview[];
  batchRenameValidationMessage: string | null;
  newFolderOpen: boolean;
  newFolderName: string;
  isPending: boolean;
  onCloseDelete: () => void;
  onDelete: () => void;
  onCloseRename: () => void;
  onRenameNameChange: (value: string) => void;
  onRename: () => void;
  onCloseBatchRename: () => void;
  onBatchRenameFormChange: (form: BatchRenameFormState) => void;
  onBatchRename: () => void;
  onCloseNewFolder: () => void;
  onNewFolderNameChange: (value: string) => void;
  onNewFolder: () => void;
};

export function FileManagerDialogs({
  deleteTargets,
  renameTarget,
  renameName,
  batchRenameTargets,
  batchRenameForm,
  batchRenamePreview,
  batchRenameValidationMessage,
  newFolderOpen,
  newFolderName,
  isPending,
  onCloseDelete,
  onDelete,
  onCloseRename,
  onRenameNameChange,
  onRename,
  onCloseBatchRename,
  onBatchRenameFormChange,
  onBatchRename,
  onCloseNewFolder,
  onNewFolderNameChange,
  onNewFolder,
}: FileManagerDialogsProps) {
  return (
    <>
      <Dialog
        open={deleteTargets.length > 0}
        onOpenChange={(open) => !open && onCloseDelete()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deleteTargets.length === 1
                ? `Delete “${deleteTargets[0]?.name}”?`
                : `Delete ${deleteTargets.length} items?`}
            </DialogTitle>
            <DialogDescription>
              This permanently removes the item from disk. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={onCloseDelete}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={isPending}
              onClick={onDelete}
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batchRenameTargets.length > 1}
        onOpenChange={(open) => !open && onCloseBatchRename()}
      >
        <DialogContent className='max-w-2xl'>
          <form
            className='grid gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              if (!batchRenameValidationMessage && !isPending) {
                onBatchRename();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>
                Rename {batchRenameTargets.length} items
              </DialogTitle>
              <DialogDescription>
                Choose how to rename the selected items. File extensions stay
                unchanged except Replace Pattern can include or change them.
              </DialogDescription>
            </DialogHeader>

            <label className='grid gap-1.5 text-sm'>
              <span className='font-medium'>Rename mode</span>
              <Select
                value={batchRenameForm.mode}
                onValueChange={(value) =>
                  onBatchRenameFormChange({
                    ...batchRenameForm,
                    mode: value as BatchRenameMode,
                  })
                }
              >
                <SelectTrigger aria-label='Rename mode' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='replace'>Replace Text</SelectItem>
                  <SelectItem value='replace-pattern'>
                    Replace Pattern
                  </SelectItem>
                  <SelectItem value='add'>Add Text</SelectItem>
                  <SelectItem value='format'>Format</SelectItem>
                </SelectContent>
              </Select>
            </label>

            {batchRenameForm.mode === 'replace' ||
            batchRenameForm.mode === 'replace-pattern' ? (
              <div className='grid gap-3 sm:grid-cols-2'>
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>
                    {batchRenameForm.mode === 'replace-pattern'
                      ? 'Pattern'
                      : 'Find'}
                  </span>
                  <Input
                    aria-label={
                      batchRenameForm.mode === 'replace-pattern'
                        ? 'Pattern'
                        : 'Find text'
                    }
                    maxLength={BATCH_RENAME_MAX_TEXT_LENGTH}
                    value={batchRenameForm.replaceFind}
                    onChange={(event) =>
                      onBatchRenameFormChange({
                        ...batchRenameForm,
                        replaceFind: event.target.value,
                      })
                    }
                  />
                </label>
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>Replace with</span>
                  <Input
                    aria-label='Replacement text'
                    maxLength={BATCH_RENAME_MAX_TEXT_LENGTH}
                    value={batchRenameForm.replaceReplacement}
                    onChange={(event) =>
                      onBatchRenameFormChange({
                        ...batchRenameForm,
                        replaceReplacement: event.target.value,
                      })
                    }
                  />
                </label>
                <p className='text-xs text-muted-foreground sm:col-span-2'>
                  {batchRenameForm.mode === 'replace-pattern' ? (
                    <>
                      <code>%%</code> matches digits; <code>$1…$9</code> reuse
                      matches. Pattern includes the file extension. Example:{' '}
                      <code>some.text.%%.video</code> → <code>E$1</code>
                    </>
                  ) : (
                    'Literal, case-insensitive replacement. File extension stays unchanged.'
                  )}
                </p>
              </div>
            ) : null}

            {batchRenameForm.mode === 'add' ? (
              <div className='grid gap-3 sm:grid-cols-[1fr_auto]'>
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>Text to add</span>
                  <Input
                    aria-label='Text to add'
                    maxLength={BATCH_RENAME_MAX_TEXT_LENGTH}
                    value={batchRenameForm.addText}
                    onChange={(event) =>
                      onBatchRenameFormChange({
                        ...batchRenameForm,
                        addText: event.target.value,
                      })
                    }
                  />
                </label>
                <label className='grid gap-1.5 text-sm'>
                  <span className='font-medium'>Position</span>
                  <Select
                    value={batchRenameForm.addPosition}
                    onValueChange={(value) =>
                      onBatchRenameFormChange({
                        ...batchRenameForm,
                        addPosition: value as BatchRenamePosition,
                      })
                    }
                  >
                    <SelectTrigger aria-label='Add position' className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='before'>Before name</SelectItem>
                      <SelectItem value='after'>After name</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
            ) : null}

            {batchRenameForm.mode === 'format' ? (
              <div className='grid gap-3'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='grid gap-1.5 text-sm'>
                    <span className='font-medium'>Name format</span>
                    <Select
                      value={batchRenameForm.format}
                      onValueChange={(value) =>
                        onBatchRenameFormChange({
                          ...batchRenameForm,
                          format: value as BatchRenameFormat,
                        })
                      }
                    >
                      <SelectTrigger
                        aria-label='Name format'
                        className='w-full'
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='name-index'>
                          Name and Index
                        </SelectItem>
                        <SelectItem value='index'>Index</SelectItem>
                        <SelectItem value='name-counter'>
                          Name and Counter
                        </SelectItem>
                        <SelectItem value='counter'>Counter</SelectItem>
                      </SelectContent>
                    </Select>
                  </label>
                  {isNameBatchRenameFormat(batchRenameForm.format) ? (
                    <label className='grid gap-1.5 text-sm'>
                      <span className='font-medium'>Custom format</span>
                      <Input
                        aria-label='Custom format'
                        maxLength={BATCH_RENAME_MAX_TEXT_LENGTH}
                        value={batchRenameForm.formatName}
                        onChange={(event) =>
                          onBatchRenameFormChange({
                            ...batchRenameForm,
                            formatName: event.target.value,
                          })
                        }
                      />
                    </label>
                  ) : null}
                </div>
                <div className='grid gap-3 sm:grid-cols-2'>
                  {isNameBatchRenameFormat(batchRenameForm.format) ? (
                    <label className='grid gap-1.5 text-sm'>
                      <span className='font-medium'>Position</span>
                      <Select
                        value={batchRenameForm.formatPosition}
                        onValueChange={(value) =>
                          onBatchRenameFormChange({
                            ...batchRenameForm,
                            formatPosition: value as BatchRenamePosition,
                          })
                        }
                      >
                        <SelectTrigger
                          aria-label='Format position'
                          className='w-full'
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='before'>Before name</SelectItem>
                          <SelectItem value='after'>After name</SelectItem>
                        </SelectContent>
                      </Select>
                    </label>
                  ) : null}
                  <label className='grid gap-1.5 text-sm'>
                    <span className='font-medium'>Start numbers at</span>
                    <Input
                      aria-label='Start numbers at'
                      type='number'
                      min={0}
                      step={1}
                      value={batchRenameForm.startNumber}
                      onChange={(event) =>
                        onBatchRenameFormChange({
                          ...batchRenameForm,
                          startNumber: parseStartNumber(event.target.value),
                        })
                      }
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <BatchRenamePreviewList preview={batchRenamePreview} />
            {batchRenameValidationMessage ? (
              <p className='text-sm text-red-500' role='alert'>
                {batchRenameValidationMessage}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={onCloseBatchRename}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={isPending || Boolean(batchRenameValidationMessage)}
              >
                {isPending ? 'Renaming…' : 'Rename items'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => !open && onCloseRename()}
      >
        <DialogContent>
          <form
            className='grid gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              if (
                renameName.trim() &&
                renameName.trim() !== renameTarget?.name &&
                !isPending
              ) {
                onRename();
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename item</DialogTitle>
              <DialogDescription>
                Enter a new name for “{renameTarget?.name}”.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              aria-label='New name'
              value={renameName}
              onChange={(event) => onRenameNameChange(event.target.value)}
            />
            <DialogFooter>
              <Button type='button' variant='outline' onClick={onCloseRename}>
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={
                  isPending ||
                  !renameName.trim() ||
                  renameName.trim() === renameTarget?.name
                }
              >
                {isPending ? 'Renaming…' : 'Rename'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={newFolderOpen}
        onOpenChange={(open) => !open && onCloseNewFolder()}
      >
        <DialogContent>
          <form
            className='grid gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              if (newFolderName.trim() && !isPending) onNewFolder();
            }}
          >
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
              <DialogDescription>
                Enter a name for the new folder.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              aria-label='New folder name'
              value={newFolderName}
              onChange={(event) => onNewFolderNameChange(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
            <DialogFooter>
              <Button
                type='button'
                variant='outline'
                onClick={onCloseNewFolder}
              >
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={isPending || !newFolderName.trim()}
              >
                {isPending ? 'Creating…' : 'Create folder'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BatchRenamePreviewList({
  preview,
}: {
  preview: BatchRenamePreview[];
}) {
  const visiblePreview = preview.slice(0, 8);
  return (
    <div
      data-testid='batch-rename-preview'
      className='rounded-md border border-white/10 bg-black/15 p-3'
    >
      <div className='mb-2 text-xs font-bold uppercase tracking-wide text-zinc-500'>
        Preview
      </div>
      <div className='grid gap-1 text-sm'>
        {visiblePreview.map((item) => (
          <div
            key={item.path}
            data-testid='batch-rename-preview-row'
            className='grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2'
          >
            <span className='truncate text-zinc-500' title={item.originalName}>
              {item.originalName}
            </span>
            <span className='text-zinc-600'>→</span>
            <span className='truncate text-zinc-200' title={item.newName}>
              {item.newName}
            </span>
          </div>
        ))}
      </div>
      {preview.length > visiblePreview.length ? (
        <p className='mt-2 text-xs text-zinc-600'>
          +{preview.length - visiblePreview.length} more items
        </p>
      ) : null}
    </div>
  );
}

function isNameBatchRenameFormat(
  format: BatchRenameFormat,
): format is 'name-index' | 'name-counter' {
  return format === 'name-index' || format === 'name-counter';
}

function parseStartNumber(value: string): number {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}
