import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AddDownloadDialog from './AddDownloadDialog';

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { addTorrentMock, customSonnerMock } = vi.hoisted(() => ({
  addTorrentMock: vi.fn(),
  customSonnerMock: vi.fn(),
}));

vi.mock('@/lib/rpc', () => ({
  rpc: {
    api: {
      'torrent-client': {
        add: {
          $post: addTorrentMock,
        },
      },
    },
  },
}));

vi.mock('@/components/CustomSonner', () => ({
  default: customSonnerMock,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  addTorrentMock.mockResolvedValue(successResponse());
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('AddDownloadDialog', () => {
  it('matches the New Torrent dialog header and footer framing', async () => {
    await renderDialog({});

    const content = document.body.querySelector<HTMLElement>(
      '[data-slot="dialog-content"]',
    );
    const title = document.body.querySelector<HTMLElement>(
      '[data-slot="dialog-title"]',
    );
    const footer = document.body.querySelector<HTMLElement>(
      '[data-slot="dialog-footer"]',
    );
    const description = document.body.querySelector<HTMLElement>(
      '[data-slot="dialog-description"]',
    );
    const torrentFileLabel = document.body.querySelector<HTMLLabelElement>(
      'label[for="torrent-file"]',
    );

    expect(content?.className).toContain('gap-0');
    expect(content?.className).toContain('p-0');
    expect(title?.className).toContain('border-b');
    expect(title?.className).toContain('px-6');
    expect(title?.className).toContain('py-4');
    expect(footer?.className).toContain('border-t');
    expect(footer?.className).toContain('px-6');
    expect(footer?.className).toContain('py-4');
    expect(description?.className).toContain('sr-only');
    expect(description?.contains(torrentFileLabel ?? null)).toBe(false);
  });

  it('uses an accessible custom file picker trigger', async () => {
    await renderDialog({});

    const fileInput = getInput('torrent-file');
    const pickerButton = getButton('Choose file');
    const clickSpy = vi.spyOn(fileInput, 'click');

    expect(fileInput.className).toContain('sr-only');
    expect(pickerButton.getAttribute('aria-controls')).toBe('torrent-file');

    await act(async () => pickerButton.click());

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('submits a magnet link with the configured directory', async () => {
    const onAdded = vi.fn();
    const onOpenChange = vi.fn();
    await renderDialog({ onAdded, onOpenChange });

    const magnet = 'magnet:?xt=urn:btih:0123456789abcdef';
    setInputValue(getInput('magnet-link'), magnet);
    clickButton('Add download');

    await act(async () => {
      await vi.waitFor(() => {
        expect(addTorrentMock).toHaveBeenCalledWith({
          form: { magnet, downloadDir: '/downloads' },
        });
      });
    });
    expect(onAdded).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(customSonnerMock).toHaveBeenCalledWith({
      text: 'Torrent added to client',
    });
  });

  it('submits a selected torrent file', async () => {
    await renderDialog({ defaultDownloadDir: '/configured' });
    const file = new File(['torrent data'], 'linux.torrent', {
      type: 'application/x-bittorrent',
    });
    selectFile(getInput('torrent-file'), file);

    expect(document.body.textContent).toContain('linux.torrent');
    clickButton('Add download');

    await act(async () => {
      await vi.waitFor(() => {
        expect(addTorrentMock).toHaveBeenCalledWith({
          form: { torrentFile: file, downloadDir: '/configured' },
        });
      });
    });
  });

  it('clears the other source when switching between magnet and file', async () => {
    await renderDialog({});
    const magnetInput = getInput('magnet-link');
    setInputValue(magnetInput, 'magnet:?xt=urn:btih:abc');

    const file = new File(['torrent data'], 'switch.torrent');
    const fileInput = getInput('torrent-file');
    selectFile(fileInput, file);
    expect(magnetInput.value).toBe('');
    expect(document.body.textContent).toContain('switch.torrent');

    setInputValue(magnetInput, 'magnet:?xt=urn:btih:def');
    expect(document.body.textContent).not.toContain('switch.torrent');
    expect(fileInput.value).toBe('');
  });

  it('clears a selected file explicitly', async () => {
    await renderDialog({});
    const file = new File(['torrent data'], 'clear.torrent');
    selectFile(getInput('torrent-file'), file);
    expect(document.body.textContent).toContain('clear.torrent');

    await act(async () => clickButton('Clear'));

    expect(document.body.textContent).not.toContain('clear.torrent');
    expect(getInput('torrent-file').value).toBe('');
  });

  it('shows an API error and keeps the dialog open', async () => {
    const onOpenChange = vi.fn();
    addTorrentMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        message: 'Torrent client is unavailable',
      }),
    });
    await renderDialog({ onOpenChange });
    setInputValue(getInput('magnet-link'), 'magnet:?xt=urn:btih:error');
    clickButton('Add download');

    await act(async () => {
      await vi.waitFor(() => {
        expect(customSonnerMock).toHaveBeenCalledWith({
          variant: 'error',
          text: 'Torrent client is unavailable',
        });
      });
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('resets all fields after closing and reopening', async () => {
    await renderDialog({ defaultDownloadDir: '/downloads' });
    setInputValue(getInput('magnet-link'), 'magnet:?xt=urn:btih:old');
    setInputValue(getInput('torrent-download-directory'), '/custom');
    const file = new File(['torrent data'], 'old.torrent');
    selectFile(getInput('torrent-file'), file);

    await renderDialog({ open: false, defaultDownloadDir: '/downloads' });
    await renderDialog({ open: true, defaultDownloadDir: '/new-default' });

    expect(getInput('magnet-link').value).toBe('');
    expect(getInput('torrent-download-directory').value).toBe('/new-default');
    expect(document.body.textContent).not.toContain('old.torrent');
    expect(getInput('torrent-file').value).toBe('');
  });

  it('does not submit without a directory', async () => {
    await renderDialog({ defaultDownloadDir: '' });
    setInputValue(getInput('magnet-link'), 'magnet:?xt=urn:btih:no-dir');

    expect(getButton('Add download').disabled).toBe(true);
    expect(addTorrentMock).not.toHaveBeenCalled();
  });
});

async function renderDialog(
  props: Partial<React.ComponentProps<typeof AddDownloadDialog>> = {},
): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <AddDownloadDialog
          open
          onOpenChange={vi.fn()}
          defaultDownloadDir='/downloads'
          clientName='qBittorrent'
          onAdded={vi.fn()}
          {...props}
        />
      </QueryClientProvider>,
    );
  });
}

function getInput(id: string): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`Input not found: ${id}`);
  return input;
}

function getButton(label: string): HTMLButtonElement {
  const button = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('button'),
  ).find((item) => item.textContent?.includes(label));
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function clickButton(label: string): void {
  getButton(label).click();
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [file],
  });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function successResponse(): {
  ok: true;
  json: () => Promise<{ success: true; message: string }>;
} {
  return {
    ok: true,
    json: async () => ({ success: true, message: 'Torrent added to client' }),
  };
}
