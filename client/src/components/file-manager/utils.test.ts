import { describe, expect, it } from 'vitest';
import type { FileEntry } from './types';
import type { BatchRenameOptions } from './utils';
import {
  BATCH_RENAME_MAX_ITEMS,
  BATCH_RENAME_MAX_TEXT_LENGTH,
  BATCH_RENAME_MAX_WILDCARDS,
  formatSelectedSizeSummary,
  getBatchRenamePreview,
  getBatchRenameValidationMessage,
  getSelectedSizeSummary,
  isValidBatchRenameName,
} from './utils';

describe('selected size utilities', () => {
  it('sums file sizes and ready directory sizes once per path', () => {
    const entries = [
      createFile('movie.mkv', 1_500_000_000),
      createDirectory('series'),
      createFile('movie.mkv', 1_500_000_000),
    ];

    const summary = getSelectedSizeSummary(
      entries,
      new Map([['series', { size: 3_000_000_000, status: 'ready' }]]),
    );

    expect(summary).toEqual({
      selectedCount: 2,
      knownCount: 2,
      knownBytes: 4_500_000_000,
      pendingCount: 0,
      unavailableCount: 0,
    });
    expect(formatSelectedSizeSummary(summary)).toBe(
      '2 items selected · 4.2 GB',
    );
  });

  it('keeps known total partial while pending or unavailable sizes remain', () => {
    const summary = getSelectedSizeSummary(
      [
        createFile('known.mkv', 2_000_000_000),
        createDirectory('pending'),
        createDirectory('denied'),
        createFile('unknown.mkv', null),
      ],
      new Map([['denied', { size: null, status: 'permission-denied' }]]),
    );

    expect(summary).toEqual({
      selectedCount: 4,
      knownCount: 1,
      knownBytes: 2_000_000_000,
      pendingCount: 1,
      unavailableCount: 2,
    });
    expect(formatSelectedSizeSummary(summary)).toBe(
      '4 items selected · At least 1.9 GB · Calculating… · Size unavailable for 2 items',
    );
  });

  it('reports unavailable sizes without treating them as zero', () => {
    const summary = getSelectedSizeSummary(
      [createDirectory('too-large'), createFile('restricted.mkv', null)],
      new Map([['too-large', { size: null, status: 'too-large' }]]),
    );

    expect(formatSelectedSizeSummary(summary)).toBe(
      '2 items selected · Size unavailable for 2 items',
    );
  });

  it('formats bytes with compact human-readable units', () => {
    const summary = getSelectedSizeSummary(
      [createFile('clip.mkv', 1_073_741_824)],
      new Map(),
    );

    expect(formatSelectedSizeSummary(summary)).toBe('1 item selected · 1.0 GB');
  });
});

describe('batch rename utilities', () => {
  it('replaces text case-insensitively with safe regex escaping', () => {
    const preview = getBatchRenamePreview(
      [
        createFile('Episode [01].mkv', 1),
        createFile('EPISODE [02].mp4', 1),
        createDirectory('Episode [03]'),
      ],
      { mode: 'replace', find: 'episode [', replacement: 'Show [' },
    );

    expect(preview.map((item) => item.newName)).toEqual([
      'Show [01].mkv',
      'Show [02].mp4',
      'Show [03]',
    ]);

    const literalReplacement = getBatchRenamePreview(
      [createFile('Episode [01].mkv', 1)],
      { mode: 'replace', find: '[01]', replacement: '$1' },
    );
    expect(literalReplacement[0]?.newName).toBe('Episode $1.mkv');

    const literalWildcard = getBatchRenamePreview(
      [createFile('Episode %%.mkv', 1)],
      { mode: 'replace', find: '%%', replacement: '$1' },
    );
    expect(literalWildcard[0]?.newName).toBe('Episode $1.mkv');
  });

  it('matches digit wildcards and reuses captures in replacement text', () => {
    const preview = getBatchRenamePreview(
      [
        createFile('S01E02.mkv', 1),
        createFile('S3E004.mp4', 1),
        createFile('S[05]E006.mkv', 1),
      ],
      { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$2x$1' },
    );

    expect(preview.map((item) => item.newName)).toEqual([
      '02x01.mkv',
      '004x3.mp4',
      'S[05]E006.mkv',
    ]);

    const repeatedWildcard = getBatchRenamePreview(
      [createFile('S01E02-S03E04.mkv', 1)],
      { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$2x$1' },
    );
    expect(repeatedWildcard[0]?.newName).toBe('02x01-04x03.mkv');

    const escapedWildcard = getBatchRenamePreview(
      [createFile('S[05]E006.mkv', 1)],
      { mode: 'replace-pattern', find: 'S[%%]E%%', replacement: '$1x$2' },
    );
    expect(escapedWildcard[0]?.newName).toBe('05x006.mkv');

    const literalDollar = getBatchRenamePreview([createFile('S01E02.mkv', 1)], {
      mode: 'replace-pattern',
      find: 'S%%E%%',
      replacement: 'Price $1 $$',
    });
    expect(literalDollar[0]?.newName).toBe('Price 01 $$.mkv');
  });

  it('replaces filename patterns across extensions and directories', () => {
    const preview = getBatchRenamePreview(
      [
        createFile('some.text.01.video', 1),
        createFile('some.text.01.video.mkv', 1),
        createDirectory('some.text.02.video'),
      ],
      {
        mode: 'replace-pattern',
        find: 'some.text.%%.video',
        replacement: 'E$1',
      },
    );

    expect(preview.map((item) => item.newName)).toEqual([
      'E01',
      'E01.mkv',
      'E02',
    ]);

    const changedExtension = getBatchRenamePreview(
      [createFile('some.text.03.video.mkv', 1)],
      {
        mode: 'replace-pattern',
        find: 'some.text.%%.video.mkv',
        replacement: 'E$1.mp4',
      },
    );
    expect(changedExtension[0]?.newName).toBe('E03.mp4');
  });

  it('rejects replacement references without captures and always rejects $0', () => {
    const entries = [
      createFile('some.text.01.video', 1),
      createFile('some.text.02.video', 1),
    ];
    const noCaptureOptions = {
      mode: 'replace-pattern' as const,
      find: 'some.text',
      replacement: '$1',
    };
    const noCapturePreview = getBatchRenamePreview(entries, noCaptureOptions);
    expect(
      getBatchRenameValidationMessage(noCapturePreview, noCaptureOptions),
    ).toBe('Use $1…$9 only with a %% capture');

    const zeroCaptureOptions = {
      mode: 'replace-pattern' as const,
      find: 'some.text.%%.video',
      replacement: '$0',
    };
    const zeroCapturePreview = getBatchRenamePreview(
      entries,
      zeroCaptureOptions,
    );
    expect(
      getBatchRenameValidationMessage(zeroCapturePreview, zeroCaptureOptions),
    ).toBe('Use $1 for the captured digits');
  });

  it('validates generated names against the server basename contract', () => {
    const entries = [
      createFile('some.text.01.video', 1),
      createFile('some.text.02.video', 1),
    ];
    for (const replacement of ['/$1', '\\$1']) {
      const options = createPatternOptions(replacement);
      const preview = getBatchRenamePreview(entries, options);
      expect(getBatchRenameValidationMessage(preview, options)).toBe(
        'Names must be a single non-empty basename',
      );
    }

    for (const replacement of ['.$1', '..$1']) {
      const options = createPatternOptions(replacement);
      const preview = getBatchRenamePreview(entries, options);
      expect(getBatchRenameValidationMessage(preview, options)).toBeNull();
    }

    for (const replacement of ['.', '..']) {
      const options = createPatternOptions(replacement);
      const preview = getBatchRenamePreview(entries, options);
      expect(getBatchRenameValidationMessage(preview, options)).toBe(
        'Names must be a single non-empty basename',
      );
    }

    expect(isValidBatchRenameName('01')).toBe(true);
    expect(isValidBatchRenameName('.01')).toBe(true);
    expect(isValidBatchRenameName('..01')).toBe(true);
    expect(isValidBatchRenameName('.')).toBe(false);
    expect(isValidBatchRenameName('..')).toBe(false);
  });

  it('uses shortest captures before digit literals and stays bounded', () => {
    const separatedDigits = getBatchRenamePreview(
      [createFile('1231456.mkv', 1)],
      { mode: 'replace-pattern', find: '%%1%%', replacement: '$1-$2' },
    );
    expect(separatedDigits[0]?.newName).toBe('123-456.mkv');

    const adversarialFind = `${'%%1'.repeat(9)}X`;
    const adversarialName = `${'1'.repeat(200)}.mkv`;
    const adversarialPreview = getBatchRenamePreview(
      [createFile(adversarialName, 1), createFile('other.mkv', 1)],
      {
        mode: 'replace-pattern',
        find: adversarialFind,
        replacement: '$1',
      },
    );
    expect(adversarialPreview.map((item) => item.newName)).toEqual([
      adversarialName,
      'other.mkv',
    ]);
  });

  it('matches Unicode literals without shifting wildcard indexes', () => {
    const prefixPreview = getBatchRenamePreview([createFile('İ123.mkv', 1)], {
      mode: 'replace-pattern',
      find: 'İ%%',
      replacement: '$1',
    });
    const suffixPreview = getBatchRenamePreview([createFile('123É.mkv', 1)], {
      mode: 'replace-pattern',
      find: '%%é',
      replacement: '$1',
    });
    const surroundingPreview = getBatchRenamePreview(
      [createFile('İ123É.mkv', 1)],
      { mode: 'replace-pattern', find: 'İ%%é', replacement: '$1' },
    );

    expect(prefixPreview[0]?.newName).toBe('123.mkv');
    expect(suffixPreview[0]?.newName).toBe('123.mkv');
    expect(surroundingPreview[0]?.newName).toBe('123.mkv');
  });

  it('rejects unsafe wildcard patterns before building a preview regex', () => {
    const entries = [
      createFile('Episode 01.mkv', 1),
      createFile('Episode 02.mkv', 1),
    ];
    const tenTokenFind = 'A%%B%%C%%D%%E%%F%%G%%H%%I%%J%%';
    const tenTokenPreview = getBatchRenamePreview(entries, {
      mode: 'replace-pattern',
      find: tenTokenFind,
      replacement: '$1',
    });

    expect(tenTokenPreview.map((item) => item.newName)).toEqual([
      'Episode 01.mkv',
      'Episode 02.mkv',
    ]);
    expect(
      getBatchRenameValidationMessage(tenTokenPreview, {
        mode: 'replace-pattern',
        find: tenTokenFind,
        replacement: '$1',
      }),
    ).toBe(`Use at most ${BATCH_RENAME_MAX_WILDCARDS} %% tokens`);

    const adjacentFind = 'S%%%%E';
    const adjacentPreview = getBatchRenamePreview(entries, {
      mode: 'replace-pattern',
      find: adjacentFind,
      replacement: '$1',
    });
    expect(
      getBatchRenameValidationMessage(adjacentPreview, {
        mode: 'replace-pattern',
        find: adjacentFind,
        replacement: '$1',
      }),
    ).toBe('Separate adjacent %% tokens');

    const veryLongFind = '%%'.repeat(10_000);
    const veryLongPreview = getBatchRenamePreview(entries, {
      mode: 'replace-pattern',
      find: veryLongFind,
      replacement: '$1',
    });
    expect(veryLongPreview[0]?.newName).toBe('Episode 01.mkv');
    expect(
      getBatchRenameValidationMessage(veryLongPreview, {
        mode: 'replace-pattern',
        find: veryLongFind,
        replacement: '$1',
      }),
    ).toBe(
      `Pattern must be ${BATCH_RENAME_MAX_TEXT_LENGTH} characters or fewer`,
    );
  });

  it('adds text before or after names without changing extensions', () => {
    const before = getBatchRenamePreview([createFile('clip.tar.gz', 1)], {
      mode: 'add',
      text: 'draft-',
      position: 'before',
    });
    const after = getBatchRenamePreview([createFile('clip.tar.gz', 1)], {
      mode: 'add',
      text: '-final',
      position: 'after',
    });

    expect(before[0]?.newName).toBe('draft-clip.tar.gz');
    expect(after[0]?.newName).toBe('clip.tar-final.gz');
  });

  it('formats names with indexes and five-digit counters', () => {
    const entries = [createFile('one.mkv', 1), createFile('two.mkv', 1)];

    expect(
      getBatchRenamePreview(entries, {
        mode: 'format',
        customName: 'Season',
        format: 'name-index',
        position: 'after',
        startNumber: 7,
      }).map((item) => item.newName),
    ).toEqual(['Season 7.mkv', 'Season 8.mkv']);
    expect(
      getBatchRenamePreview(entries, {
        mode: 'format',
        customName: 'Season',
        format: 'name-counter',
        position: 'before',
        startNumber: 7,
      }).map((item) => item.newName),
    ).toEqual(['00007 Season.mkv', '00008 Season.mkv']);
    expect(
      getBatchRenamePreview(entries, {
        mode: 'format',
        customName: 'Ignored',
        format: 'index',
        position: 'before',
        startNumber: 7,
      }).map((item) => item.newName),
    ).toEqual(['7.mkv', '8.mkv']);
    expect(
      getBatchRenamePreview(entries, {
        mode: 'format',
        customName: 'Ignored',
        format: 'counter',
        position: 'after',
        startNumber: 7,
      }).map((item) => item.newName),
    ).toEqual(['00007.mkv', '00008.mkv']);
  });

  it('uses original stem when format custom name is blank', () => {
    const preview = getBatchRenamePreview(
      [createFile('Episode 01.mkv', 1), createFile('Episode 02.mkv', 1)],
      {
        mode: 'format',
        customName: '   ',
        format: 'name-index',
        position: 'after',
        startNumber: 1,
      },
    );

    expect(preview.map((item) => item.newName)).toEqual([
      'Episode 01 1.mkv',
      'Episode 02 2.mkv',
    ]);
    expect(
      getBatchRenameValidationMessage(preview, {
        mode: 'format',
        customName: '   ',
        format: 'name-index',
        position: 'after',
        startNumber: 1,
      }),
    ).toBeNull();
  });

  it('keeps format position when blank custom name falls back to the stem', () => {
    const preview = getBatchRenamePreview(
      [createFile('Episode 01.mkv', 1), createFile('Episode 02.mkv', 1)],
      {
        mode: 'format',
        customName: '',
        format: 'name-counter',
        position: 'before',
        startNumber: 7,
      },
    );

    expect(preview.map((item) => item.newName)).toEqual([
      '00007 Episode 01.mkv',
      '00008 Episode 02.mkv',
    ]);
    expect(
      getBatchRenameValidationMessage(preview, {
        mode: 'format',
        customName: '',
        format: 'name-counter',
        position: 'before',
        startNumber: 7,
      }),
    ).toBeNull();
  });

  it('reports empty, duplicate, and unchanged batch names', () => {
    expect(
      getBatchRenameValidationMessage([
        { path: 'one', originalName: 'one', newName: '' },
        { path: 'two', originalName: 'two', newName: 'two' },
      ]),
    ).toBe('Names cannot be empty');
    expect(
      getBatchRenameValidationMessage([
        { path: 'one', originalName: 'one', newName: 'same' },
        { path: 'two', originalName: 'two', newName: 'SAME' },
      ]),
    ).toBe('Each item must have a unique name');
    expect(
      getBatchRenameValidationMessage([
        { path: 'one', originalName: 'one', newName: 'one' },
        { path: 'two', originalName: 'two', newName: 'two' },
      ]),
    ).toBe('Choose a different name pattern');
    expect(getBatchRenameValidationMessage([])).toBe(
      'Select at least two items',
    );
  });

  it('requires input for active rename mode', () => {
    const preview = [
      { path: 'one', originalName: 'one', newName: 'one' },
      { path: 'two', originalName: 'two', newName: 'two' },
    ];

    expect(
      getBatchRenameValidationMessage(preview, {
        mode: 'replace',
        find: '',
        replacement: 'new',
      }),
    ).toBe('Enter text to find');
    expect(
      getBatchRenameValidationMessage(preview, {
        mode: 'add',
        text: '',
        position: 'after',
      }),
    ).toBe('Enter text to add');

    const wildcardPreview = getBatchRenamePreview(
      [createFile('S01E02.mkv', 1), createFile('S03E04.mkv', 1)],
      { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$3' },
    );
    expect(
      getBatchRenameValidationMessage(wildcardPreview, {
        mode: 'replace-pattern',
        find: 'S%%E%%',
        replacement: '$3',
      }),
    ).toBe('Use $1 to $2 for captured digits');
    expect(
      getBatchRenameValidationMessage(
        getBatchRenamePreview(
          [createFile('S01E02.mkv', 1), createFile('S03E04.mkv', 1)],
          { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$0' },
        ),
        { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$0' },
      ),
    ).toBe('Use $1 to $2 for captured digits');
    expect(
      getBatchRenameValidationMessage(
        getBatchRenamePreview(
          [createFile('S01E02.mkv', 1), createFile('S03E04.mkv', 1)],
          { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$1$' },
        ),
        { mode: 'replace-pattern', find: 'S%%E%%', replacement: '$1$' },
      ),
    ).toBeNull();
  });

  it('rejects batches over local item limit', () => {
    const preview = Array.from(
      { length: BATCH_RENAME_MAX_ITEMS + 1 },
      (_, index) => ({
        path: `item-${index}`,
        originalName: `item-${index}`,
        newName: `renamed-${index}`,
      }),
    );

    expect(getBatchRenameValidationMessage(preview)).toBe(
      `Cannot rename more than ${BATCH_RENAME_MAX_ITEMS} items`,
    );
  });
});

function createPatternOptions(replacement: string): BatchRenameOptions {
  return {
    mode: 'replace-pattern',
    find: 'some.text.%%.video',
    replacement,
  };
}

function createFile(name: string, size: number | null): FileEntry {
  return {
    name,
    path: name,
    type: 'file',
    size,
    modifiedAt: null,
    permissions: { readWrite: true, rename: true },
    isTorrentLinked: false,
  };
}

function createDirectory(name: string): FileEntry {
  return {
    name,
    path: name,
    type: 'directory',
    size: null,
    modifiedAt: null,
    permissions: { readWrite: true, rename: true },
    isTorrentLinked: false,
  };
}
