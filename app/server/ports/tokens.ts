// 依赖注入令牌：服务只依赖端口（接口），真实实现（Drizzle 应用库、飞书多维表格）建库后再接。
export const SNAPSHOT_PORT = Symbol('SNAPSHOT_PORT');
export const PREDICTION_STORE = Symbol('PREDICTION_STORE');
export const VOYAGE_STORE = Symbol('VOYAGE_STORE');
export const DIRECTORY_PORT = Symbol('DIRECTORY_PORT');
