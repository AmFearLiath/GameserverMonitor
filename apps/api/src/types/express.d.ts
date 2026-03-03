declare namespace Express {
  export interface Request {
    requestId: string;
    authUser?: {
      id: string;
      username: string;
      roles: string[];
    };
  }
}
