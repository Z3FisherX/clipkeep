export class AppError extends Error {
  constructor(public code: string, message: string, public taskId?: string) { super(message); }
}
