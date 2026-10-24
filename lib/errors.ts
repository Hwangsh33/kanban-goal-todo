/** Error with an HTTP status and a user-facing (Korean) message, thrown by the repo layer. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new AppError(400, message, details);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string, details?: Record<string, unknown>) =>
  new AppError(409, message, details);
