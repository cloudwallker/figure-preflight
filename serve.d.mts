import type {ServerHandle} from './src/model.ts';
export function startServer(options?:{port?:number}):Promise<ServerHandle>;
