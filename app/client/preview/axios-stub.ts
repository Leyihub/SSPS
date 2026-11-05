// 预览用：不带平台登录态和拦截器的 axios 实例（正式环境用平台提供的 axiosForBackend）。
import axios from 'axios';
export const axiosForBackend = axios.create();
