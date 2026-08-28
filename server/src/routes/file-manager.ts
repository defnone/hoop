import type { Context, Env, TypedResponse, ValidationTargets } from 'hono';
import { Hono } from 'hono/tiny';
import {
  sValidator,
  type Hook as StandardHook,
} from '@hono/standard-validator';
import { z } from 'zod';
import type { ApiResponse } from '@shared/types';
import logger from '@server/lib/logger';
import {
  FileManagerError,
  FileManagerService,
  FILE_MANAGER_BATCH_RENAME_MAX_ITEMS,
  fileManagerRoots,
  type FileManagerEntry,
  type FileManagerBatchRenameItem,
  type FileManagerErrorOutcome,
  type FileManagerErrorStatus,
  type FileManagerLocation,
  type FileManagerListing,
  isValidRenameName,
  normalizeRelativePath,
} from '@server/features/file-management/file-manager.service';
import { DIRECTORY_SIZE_MAX_LOCATIONS } from '@server/features/file-management/file-manager-size.service';

const rootSchema = z.enum(fileManagerRoots);
const locationSchema = z.strictObject({
  root: rootSchema,
  path: z.string(),
});

const listQuerySchema = z.strictObject({
  root: rootSchema,
  path: z.string().default(''),
});

const copyMoveSchema = z.strictObject({
  source: locationSchema,
  destination: locationSchema,
});

const deleteSchema = z.strictObject({
  target: locationSchema,
});

const renameSchema = z.strictObject({
  target: locationSchema,
  name: z.string().refine(isValidRenameName, {
    message: 'Name must be a single non-empty basename',
  }),
});

const renameBatchSchema = z.strictObject({
  root: rootSchema,
  items: z
    .array(
      z.strictObject({
        path: z.string(),
        name: z.string().refine(isValidRenameName, {
          message: 'Name must be a single non-empty basename',
        }),
      }),
    )
    .min(1)
    .max(FILE_MANAGER_BATCH_RENAME_MAX_ITEMS),
});

const directorySchema = z.strictObject({
  location: locationSchema,
  name: z.string().refine(isValidRenameName, {
    message: 'Name must be a single non-empty basename',
  }),
});

const directorySizesSchema = z.strictObject({
  locations: z.array(locationSchema).min(1).max(DIRECTORY_SIZE_MAX_LOCATIONS),
});

type FileManagerOperation =
  | 'list'
  | 'copy'
  | 'move'
  | 'rename'
  | 'rename-batch'
  | 'create-directory'
  | 'sizes'
  | 'delete';

type FileManagerLogLocation = {
  root?: FileManagerLocation['root'];
  path?: string;
};

type FileManagerLogContext = {
  operation: FileManagerOperation;
  root?: FileManagerLocation['root'];
  path?: string;
  name?: string;
  source?: FileManagerLogLocation;
  destination?: FileManagerLogLocation;
  locations?: FileManagerLogLocation[];
};

export const fileManagerRoute = new Hono()
  .get(
    '/',
    sValidator(
      'query',
      listQuerySchema,
      createFileManagerValidationHook('list'),
    ),
    async (c) => {
      const { root, path } = c.req.valid('query');
      try {
        const data = await runFileManagerOperation(
          {
            operation: 'list',
            root,
            path: toLogicalPath(path),
          },
          () => new FileManagerService().list(root, path),
        );
        return c.json<ApiResponse<FileManagerListing>>({
          success: true,
          data,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .post(
    '/copy',
    sValidator('json', copyMoveSchema, createFileManagerValidationHook('copy')),
    async (c) => {
      const { source, destination } = c.req.valid('json');
      try {
        const entry = await runFileManagerOperation(
          {
            operation: 'copy',
            source: toLogicalLocation(source),
            destination: toLogicalLocation(destination),
          },
          () => new FileManagerService().copy(source, destination),
        );
        return c.json<ApiResponse<FileManagerEntry>>({
          success: true,
          data: entry,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .post(
    '/move',
    sValidator('json', copyMoveSchema, createFileManagerValidationHook('move')),
    async (c) => {
      const { source, destination } = c.req.valid('json');
      try {
        const entry = await runFileManagerOperation(
          {
            operation: 'move',
            source: toLogicalLocation(source),
            destination: toLogicalLocation(destination),
          },
          () => new FileManagerService().move(source, destination),
        );
        return c.json<ApiResponse<FileManagerEntry>>({
          success: true,
          data: entry,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .post(
    '/rename',
    sValidator('json', renameSchema, createFileManagerValidationHook('rename')),
    async (c) => {
      const { target, name } = c.req.valid('json');
      try {
        const entry = await runFileManagerOperation(
          {
            operation: 'rename',
            root: target.root,
            path: toLogicalPath(target.path),
            name: toLogicalName(name),
          },
          () => new FileManagerService().rename(target, name),
        );
        return c.json<ApiResponse<FileManagerEntry>>({
          success: true,
          data: entry,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .post(
    '/rename-batch',
    sValidator(
      'json',
      renameBatchSchema,
      createFileManagerValidationHook('rename-batch'),
    ),
    async (c) => {
      const { root, items } = c.req.valid('json');
      try {
        const entries = await runFileManagerOperation(
          {
            operation: 'rename-batch',
            root,
            locations: items.map((item: FileManagerBatchRenameItem) => ({
              root,
              path: toLogicalPath(item.path),
            })),
          },
          () => new FileManagerService().renameBatch(root, items),
        );
        return c.json<ApiResponse<FileManagerEntry[]>>({
          success: true,
          data: entries,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .post(
    '/directory',
    sValidator(
      'json',
      directorySchema,
      createFileManagerValidationHook('create-directory'),
    ),
    async (c) => {
      const { location, name } = c.req.valid('json');
      try {
        const entry = await runFileManagerOperation(
          {
            operation: 'create-directory',
            root: location.root,
            path: toLogicalPath(location.path),
            name: toLogicalName(name),
          },
          () => new FileManagerService().createDirectory(location, name),
        );
        return c.json<ApiResponse<FileManagerEntry>>({
          success: true,
          data: entry,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .post(
    '/sizes',
    sValidator(
      'json',
      directorySizesSchema,
      createFileManagerValidationHook('sizes'),
    ),
    async (c) => {
      const { locations } = c.req.valid('json');
      try {
        const data = await runFileManagerOperation(
          {
            operation: 'sizes',
            locations: locations.map(toLogicalLocation),
          },
          () => new FileManagerService().getDirectorySizes(locations),
        );
        return c.json<ApiResponse<typeof data>>({
          success: true,
          data,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  )
  .delete(
    '/',
    sValidator('json', deleteSchema, createFileManagerValidationHook('delete')),
    async (c) => {
      const { target } = c.req.valid('json');
      try {
        await runFileManagerOperation(
          {
            operation: 'delete',
            root: target.root,
            path: toLogicalPath(target.path),
          },
          () => new FileManagerService().delete(target),
        );
        return c.json<ApiResponse<null>>({
          success: true,
          message: 'Item deleted',
          data: null,
        });
      } catch (error) {
        return toErrorResponse(c, Object(error));
      }
    },
  );

type FileManagerErrorBody = ApiResponse<null> & {
  outcome?: FileManagerErrorOutcome;
};

type FileManagerErrorResponse = Response &
  TypedResponse<FileManagerErrorBody, FileManagerErrorStatus, 'json'>;

type FileManagerValidationResponse = Response &
  TypedResponse<ApiResponse<null>, 400, 'json'>;

type FileManagerValidationHook = StandardHook<
  object,
  Env,
  string,
  keyof ValidationTargets,
  FileManagerValidationResponse | void
>;

function createFileManagerValidationHook(
  operation: FileManagerOperation,
): FileManagerValidationHook {
  return (result, context) => {
    if (result.success) return;

    const issues = result.error.map((issue) => issue.message);
    const message = issues.join(', ');
    logger.warn(
      {
        ...getValidationLogContext(operation, result.data),
        phase: 'failure',
        status: 400,
        message,
        issues,
        durationMs: 0,
      },
      'File manager operation failed',
    );
    return context.json<ApiResponse<null>, 400>(
      {
        success: false,
        message,
        code: 400,
      },
      400,
    );
  };
}

async function runFileManagerOperation<T>(
  context: FileManagerLogContext,
  action: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logger.debug(
    { ...context, phase: 'start' },
    'File manager operation started',
  );

  try {
    const result = await action();
    logger.debug(
      {
        ...context,
        phase: 'success',
        durationMs: Date.now() - startedAt,
      },
      'File manager operation succeeded',
    );
    return result;
  } catch (error) {
    logFileManagerFailure(context, Date.now() - startedAt, Object(error));
    throw error;
  }
}

function logFileManagerFailure(
  context: FileManagerLogContext,
  durationMs: number,
  error: object,
): void {
  if (error instanceof FileManagerError) {
    logger.warn(
      {
        ...context,
        phase: 'failure',
        durationMs,
        status: error.status,
        message: error.message,
      },
      'File manager operation failed',
    );
    return;
  }

  const errorDetails =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) };
  logger.error(
    {
      ...context,
      phase: 'failure',
      durationMs,
      error: errorDetails,
    },
    'File manager operation failed',
  );
}

function toLogicalLocation(
  location: FileManagerLocation,
): FileManagerLogLocation {
  return {
    root: location.root,
    path: toLogicalPath(location.path),
  };
}

function getValidationLogContext(
  operation: FileManagerOperation,
  data: object,
): FileManagerLogContext {
  switch (operation) {
    case 'list':
      return {
        operation,
        root: toLogicalRoot(getStringField(data, 'root')),
        path: toOptionalLogicalPath(getStringField(data, 'path')),
      };
    case 'copy':
    case 'move':
      return {
        operation,
        source: toValidationLogicalLocation(getObjectField(data, 'source')),
        destination: toValidationLogicalLocation(
          getObjectField(data, 'destination'),
        ),
      };
    case 'rename':
      return {
        operation,
        ...getValidationTargetContext(data),
        name: toLogicalNameOrUndefined(getStringField(data, 'name')),
      };
    case 'rename-batch':
      return {
        operation,
        root: toLogicalRoot(getStringField(data, 'root')),
      };
    case 'create-directory':
      return {
        operation,
        ...getValidationLocationContext(data),
        name: toLogicalNameOrUndefined(getStringField(data, 'name')),
      };
    case 'sizes':
      return { operation };
    case 'delete':
      return {
        operation,
        ...getValidationTargetContext(data),
      };
  }
}

function getValidationTargetContext(
  data: object,
): Pick<FileManagerLogContext, 'root' | 'path'> {
  const target = getObjectField(data, 'target');
  return {
    root: toLogicalRoot(getStringField(target, 'root')),
    path: toOptionalLogicalPath(getStringField(target, 'path')),
  };
}

function getValidationLocationContext(
  data: object,
): Pick<FileManagerLogContext, 'root' | 'path'> {
  const location = getObjectField(data, 'location');
  return {
    root: toLogicalRoot(getStringField(location, 'root')),
    path: toOptionalLogicalPath(getStringField(location, 'path')),
  };
}

function toValidationLogicalLocation(
  location: object | undefined,
): FileManagerLogLocation | undefined {
  if (!location) return undefined;
  const root = toLogicalRoot(getStringField(location, 'root'));
  const path = toOptionalLogicalPath(getStringField(location, 'path'));
  if (!root && path === undefined) return undefined;
  return { root, path };
}

function toLogicalRoot(
  value: string | undefined,
): FileManagerLocation['root'] | undefined {
  return value === 'media' || value === 'downloads' ? value : undefined;
}

function toLogicalNameOrUndefined(
  value: string | undefined,
): string | undefined {
  return value === undefined ? undefined : toLogicalName(value);
}

function toOptionalLogicalPath(value: string | undefined): string | undefined {
  return value === undefined ? undefined : toLogicalPath(value);
}

function getStringField(
  value: object | undefined,
  key: string,
): string | undefined {
  if (!value) return undefined;
  const record = toObjectRecord(value);
  const field = record?.[key];
  return typeof field === 'string' ? field : undefined;
}

function getObjectField(value: object, key: string): object | undefined {
  const record = toObjectRecord(value);
  const field = record?.[key];
  return typeof field === 'object' && field !== null ? field : undefined;
}

function toObjectRecord(
  value: object,
): Record<string, string | object> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, string | object>;
}

function toLogicalPath(value: string): string {
  try {
    return normalizeRelativePath(value);
  } catch {
    return '[invalid path]';
  }
}

function toLogicalName(value: string): string {
  return isValidRenameName(value) ? value : '[invalid name]';
}

function toErrorResponse(
  context: Context,
  error: object,
): FileManagerErrorResponse {
  if (error instanceof FileManagerError) {
    const response: FileManagerErrorBody = {
      success: false,
      message: error.message,
      ...(error.outcome ? { outcome: error.outcome } : {}),
    };
    return context.json<FileManagerErrorBody, FileManagerErrorStatus>(
      response,
      error.status,
    );
  }

  return context.json<ApiResponse<null>, 500>(
    {
      success: false,
      message: 'Internal error',
    },
    500,
  );
}
