export type ApiResponse<T = unknown | null> = {
  message?: string;
  success: boolean;
  data?: T;
  code?: number;
};
