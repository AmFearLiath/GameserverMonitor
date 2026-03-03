import { createDbConnection } from '@gm/db';
import { createLogger } from '@gm/logger';

type Logger = ReturnType<typeof createLogger>;

type DbConnection = Awaited<ReturnType<typeof createDbConnection>>;

export class SchedulerLock {
  private connection: DbConnection | null = null;

  public constructor(
    private readonly lockName: string,
    private readonly logger: Logger,
    private readonly jobId: string
  ) {}

  public async connect(): Promise<void> {
    if (this.connection) {
      return;
    }

    this.connection = await createDbConnection();
  }

  public async tryAcquire(): Promise<boolean> {
    if (!this.connection) {
      await this.connect();
    }

    const [rows] = await this.connection!.query(
      'SELECT GET_LOCK(?, 0) AS lock_state',
      [this.lockName]
    );

    const acquired = ((rows as Array<{ lock_state: number | null }>)[0]?.lock_state ?? 0) === 1;

    if (acquired) {
      this.logger.info('scheduler leadership acquired', { job_id: this.jobId }, { lock_name: this.lockName });
    }

    return acquired;
  }

  public async release(): Promise<void> {
    if (!this.connection) {
      return;
    }

    try {
      await this.connection.query('SELECT RELEASE_LOCK(?) AS lock_state', [this.lockName]);
      this.logger.info('scheduler leadership released', { job_id: this.jobId }, { lock_name: this.lockName });
    } finally {
      await this.connection.end();
      this.connection = null;
    }
  }
}
